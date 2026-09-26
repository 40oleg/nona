import { CompileError } from '../diagnostics.js';
import type { Token,TokenStream } from './token.js';
import type * as A from './ast.js';
import {boundNames} from './declarations.js';

const reserved = new Set(('break case catch continue debugger default delete do else finally for function if in instanceof new return switch this throw try typeof var void while with class const enum export extends import super implements interface let package private protected public static yield null true false').split(' '));
const precedence: Record<string,number> = { '??':1,'||':1,'&&':2,'|':3,'^':4,'&':5,'==':6,'!=':6,'===':6,'!==':6,'<':7,'<=':7,'>':7,'>=':7,'in':7,'instanceof':7,'<<':8,'>>':8,'>>>':8,'+':9,'-':9,'*':10,'/':10,'%':10 };
export function parse(tokens: TokenStream): A.Program { return new Parser(tokens).program(); }

class Parser {
  private index = 0;
  private generatorContext = false;
  private yieldIdentifierForbidden = false;
  private parenthesized = new WeakSet<A.Expression>();
  private computedMembers = new WeakSet<A.Member>();
  constructor(private tokens: TokenStream) {}
  private get token(): Token { return this.tokens[this.index]!; }
  private at(s: string): boolean { return this.token.text === s; }
  private take(): Token { return this.tokens[this.index++]!; }
  private match(s:string): boolean { if (!this.at(s)) return false; this.take(); return true; }
  private error(message:string, token=this.token): never { throw new CompileError([{ code:'E_SYNTAX',message,file:'',span:token.span }]); }
  private need(s:string): Token { if (!this.at(s)) this.error(`Expected '${s}', found '${this.token.text}'`); return this.take(); }
  private span(start:number): {start:number;end:number} { return {start,end:this.tokens[Math.max(0,this.index-1)]!.span.end}; }
  private reservedIdentifier(name:string):boolean {return reserved.has(name)&&!(name==='yield'&&!this.generatorContext&&!this.yieldIdentifierForbidden);}
  private id(): A.Identifier {
    const t = this.token,name=String(t.value??t.text); if (t.kind !== 'word' || this.reservedIdentifier(name)) this.error('Expected an identifier');
    this.take(); return {kind:'Identifier',name,span:t.span};
  }
  private functionIdentifier(generator:boolean):A.Identifier {
    const previous=this.generatorContext;this.generatorContext=generator;
    try{return this.id();}finally{this.generatorContext=previous;}
  }
  private bindingPattern():A.BindingPattern {
    if(this.at('{')){
      const start=this.take().span.start,properties:A.ObjectPattern['properties']=[];let rest:A.BindingPattern|null=null;
      while(!this.at('}')){
        if(this.match('...')){rest=this.bindingPattern();if(this.at(','))this.error('Rest binding must be last');break;}
        let key:A.Expression,computed=false,shorthand:A.Identifier|null=null;
        if(this.match('[')){computed=true;key=this.assignment();this.need(']');}
        else{
          const token=this.token;if(!['word','string','number'].includes(token.kind))this.error('Expected an object binding property');
          this.take();key={kind:'Literal',value:String(token.value??token.text),span:token.span};
          if(token.kind==='word'&&!this.reservedIdentifier(String(token.value??token.text)))shorthand={kind:'Identifier',name:String(token.value??token.text),span:token.span};
        }
        const id=this.match(':')?this.bindingPattern():shorthand;
        if(!id)this.error('Invalid shorthand binding property');
        const init=this.match('=')?this.assignment():null;
        properties.push({key,value:{id,init},computed});if(!this.match(','))break;
      }
      this.need('}');return {kind:'ObjectPattern',properties,rest,span:this.span(start)};
    }
    if(!this.at('['))return this.id();
    const start=this.take().span.start,elements:(A.BindingElement|null)[]=[];let rest:A.BindingPattern|null=null;
    while(!this.at(']')){
      if(this.token.kind==='eof')this.error('Unterminated array binding pattern');
      if(this.match(',')){elements.push(null);continue;}
      if(this.match('...')){rest=this.bindingPattern();if(this.at(','))this.error('Rest binding must be last');break;}
      const id=this.bindingPattern(),init=this.match('=')?this.assignment():null;
      elements.push({id,init});if(!this.match(','))break;
    }
    this.need(']');return {kind:'ArrayPattern',elements,rest,span:this.span(start)};
  }
  private formalParameters():{parameters:A.BindingPattern[];defaults:(A.Expression|null)[];rest:A.BindingPattern|null} {
    this.need('(');const parameters:A.BindingPattern[]=[],defaults:(A.Expression|null)[]=[];let rest:A.BindingPattern|null=null;
    while(!this.at(')')){
      if(this.match('...')){rest=this.bindingPattern();if(this.at('=')||this.at(','))this.error('Rest parameter must be last and cannot have a default');break;}
      parameters.push(this.bindingPattern());defaults.push(this.match('=')?this.assignment():null);if(!this.match(','))break;
    }
    this.need(')');return {parameters,defaults,rest};
  }
  private functionParameters(generator=false):ReturnType<Parser['formalParameters']> {
    const previous=this.generatorContext,previousYield=this.yieldIdentifierForbidden;this.generatorContext=false;this.yieldIdentifierForbidden=generator;
    try{return this.formalParameters();}finally{this.generatorContext=previous;this.yieldIdentifierForbidden=previousYield;}
  }
  private functionBody(generator:boolean):A.Block {
    const previous=this.generatorContext;this.generatorContext=generator;
    try{const body=this.block(true);body.strict=this.checkDirective(body.body);return body;}
    finally{this.generatorContext=previous;}
  }
  private classTail(start:number,id:A.Identifier|null):A.ClassExpression {
    const superClass=this.match('extends')?this.leftHandSide():null;
    this.need('{');const methods:A.ClassMethod[]=[];let constructorMethod:A.FunctionExpression|null=null;
    while(!this.at('}')){
      if(this.match(';'))continue;
      const methodStart=this.token.span.start;let isStatic=false,accessor:'get'|'set'|undefined,computed=false;
      if(this.at('static')&&this.tokens[this.index+1]?.text!=='('){this.take();isStatic=true;}
      if((this.at('get')||this.at('set'))&&this.tokens[this.index+1]?.text!=='('){accessor=this.take().text as 'get'|'set';}
      const generator=this.match('*');if(generator&&accessor)this.error('Generator method cannot be an accessor');
      let key:A.Expression;
      if(this.match('[')){computed=true;key=this.assignment();this.need(']');}
      else{const token=this.token;if(!['word','string','number'].includes(token.kind))this.error('Expected a class method name');this.take();key={kind:'Literal',value:String(token.value??token.text),span:token.span};}
      if(isStatic&&!computed&&key.kind==='Literal'&&key.value==='prototype')this.error('Static prototype method is not allowed');
      const {parameters,defaults,rest}=this.functionParameters(generator);
      if(accessor==='get'&&(parameters.length||rest))this.error('Getter requires no parameters');
      if(accessor==='set'&&(parameters.length!==1||rest))this.error('Setter requires one parameter');
      const body=this.functionBody(generator);
      const value:A.FunctionExpression={kind:'FunctionExpression',generator,method:true,classMethod:true,id:null,parameters,defaults,rest,body,span:this.span(methodStart)};
      const constructor=!isStatic&&!computed&&!accessor&&key.kind==='Literal'&&key.value==='constructor';
      if(constructor){if(generator)this.error('Class constructor cannot be a generator');if(constructorMethod)this.error('Duplicate constructor');value.classConstructor=true;constructorMethod=value;}
      else methods.push({key,computed,isStatic,...(accessor?{accessor}:{}),value});
    }
    this.need('}');
    const defaultClassConstructor=!constructorMethod;
    constructorMethod??={kind:'FunctionExpression',method:true,classMethod:true,classConstructor:true,id:null,parameters:[],defaults:[],rest:null,body:{kind:'Block',body:[],span:this.span(start)},span:this.span(start)};
    constructorMethod.derivedConstructor=!!superClass;constructorMethod.defaultClassConstructor=defaultClassConstructor;
    return {kind:'ClassExpression',id,superClass,methods,constructorMethod,span:this.span(start)};
  }
  private semi(): void {
    if (this.match(';') || this.at('}') || this.token.kind === 'eof' || this.token.lineBreakBefore) return;
    this.error('Expected semicolon or line terminator; unsupported syntax');
  }
  program(): A.Program {
    const body:A.Statement[]=[];
    while (this.token.kind !== 'eof') body.push(this.statement(true));
    const strict=this.checkDirective(body);
    return {kind:'Program',body,strict,span:{start:0,end:this.token.span.end},source:this.tokens.source};
  }
  private checkDirective(body:A.Statement[]): boolean {
    for (const s of body) {
      if (s.kind !== 'ExpressionStatement' || s.expression.kind !== 'Literal' || typeof s.expression.value !== 'string') break;
      const token = this.tokens.find(t => t.span.start === s.span.start);
      if (token?.kind !== 'string' || token.span.start !== s.expression.span.start) break;
      if (token.text === '"use strict"' || token.text === "'use strict'") return true;
    }
    return false;
  }
  private block(allowDeclarations=true): A.Block {
    const start=this.need('{').span.start, body:A.Statement[]=[];
    while (!this.at('}')) { if (this.token.kind==='eof') this.error('Unterminated block'); body.push(this.statement(allowDeclarations)); }
    this.need('}'); return {kind:'Block',body,span:this.span(start)};
  }
  private variable(semicolon:boolean,forHead=false): A.Var {
    const keyword=this.take(),start=keyword.span.start,declarationKind=keyword.text as A.Var['declarationKind'], declarations:A.Var['declarations']=[];
    do {
      const id=this.bindingPattern(), init=this.match('=')?this.assignment():null;
      if(declarationKind==='const'&&!init&&!forHead)this.error('Const declaration requires an initializer');
      if(id.kind!=='Identifier'&&!init&&!forHead)this.error('Destructuring declaration requires an initializer');
      declarations.push({id,init});
    } while(this.match(','));
    if(semicolon)this.semi(); return {kind:'Var',declarationKind,declarations,span:this.span(start)};
  }
  private statement(allowDeclaration:boolean,allowLexical=true): A.Statement {
    const start=this.token.span.start;
    if(this.at('{'))return this.block();
    if(this.match(';'))return {kind:'Empty',span:this.span(start)};
    if(this.match('throw')){if(this.token.lineBreakBefore)this.error('Line break after throw');const argument=this.expression();this.semi();return {kind:'Throw',argument,span:this.span(start)};}
    if(this.match('try')){
      const body=this.block();let parameter:A.Identifier|null=null,handler:A.Block|null=null,finalizer:A.Block|null=null;
      if(this.match('catch')){if(this.match('(')){parameter=this.id();this.need(')');}handler=this.block();}
      if(this.match('finally'))finalizer=this.block();
      if(!handler&&!finalizer)this.error('Expected catch or finally');
      return {kind:'Try',body,parameter,handler,finalizer,span:this.span(start)};
    }
    if(this.match('debugger')){this.semi();return {kind:'Debugger',span:this.span(start)};}
    if(this.token.kind==='word'&&this.tokens[this.index+1]?.text===':') {
      const label=this.id();this.need(':');const body=this.statement(false,false);
      return {kind:'Labeled',label,body,span:this.span(start)};
    }
    if(this.at('var')||this.at('let')||this.at('const')) {
      if(!allowLexical&&!this.at('var'))this.error('Lexical declaration requires a block');
      return this.variable(true);
    }
    if(this.match('function')) {
      if(!allowDeclaration)this.error('Function declaration requires a StatementList');
      const generator=this.match('*'),id=this.functionIdentifier(generator),{parameters,defaults,rest}=this.functionParameters(generator);
      const body=this.functionBody(generator);
      return {kind:'Function',generator,id,parameters,defaults,rest,body,span:this.span(start)};
    }
    if(this.match('class')){
      if(!allowDeclaration||!allowLexical)this.error('Class declaration requires a StatementList');
      const id=this.id(),node=this.classTail(start,id);
      return {...node,kind:'Class',id};
    }
    if(this.match('if')) {
      this.need('(');const test=this.expression();this.need(')');const consequent=this.statement(false,false);
      const alternate=this.match('else')?this.statement(false,false):null;
      return {kind:'If',test,consequent,alternate,span:this.span(start)};
    }
    if(this.match('while')) {
      this.need('(');const test=this.expression();this.need(')');const body=this.statement(false,false);
      return {kind:'While',test,body,span:this.span(start)};
    }
    if(this.match('do')) {
      const body=this.statement(false,false);this.need('while');this.need('(');
      const test=this.expression();this.need(')');
      // ASI specifically allows the final semicolon of do/while to be omitted
      // even when the next statement begins on the same line.
      this.match(';');return {kind:'DoWhile',body,test,span:this.span(start)};
    }
    if(this.match('switch')) {
      this.need('(');const discriminant=this.expression();this.need(')');this.need('{');
      const cases:A.Switch['cases']=[];let hasDefault=false;
      while(!this.at('}')) {
        let test:A.Expression|null;
        if(this.match('case'))test=this.expression();
        else if(this.at('default')) {
          if(hasDefault)this.error('Duplicate default clause');
          this.take();hasDefault=true;test=null;
        } else this.error('Expected case or default clause');
        this.need(':');const body:A.Statement[]=[];
        while(!this.at('case')&&!this.at('default')&&!this.at('}')) {
          if(this.token.kind==='eof')this.error('Unterminated switch');
          body.push(this.statement(true));
        }
        cases.push({test,body});
      }
      this.need('}');return {kind:'Switch',discriminant,cases,span:this.span(start)};
    }
    if(this.match('for')) {
      this.need('(');const init=this.at(';')?null:['var','let','const'].includes(this.token.text)?this.variable(false,true):this.expression();
      if(init?.kind==='Yield'&&init.argument?.kind==='Binary'&&init.argument.operator==='in'&&!this.parenthesized.has(init.argument))
        this.error('Unparenthesized in is not allowed in a for initializer');
      if(init?.kind==='Var'&&(this.at('in')||this.at('of'))){
        if(init.declarations.length!==1||init.declarations[0]!.init)this.error('Only a single binding without initializer is supported in for...in/of');
        const kind=this.take().text==='in'?'ForIn':'ForOf';const right=kind==='ForOf'?this.assignment():this.expression();this.need(')');const body=this.statement(false,false);
        return {kind,left:init,right,body,span:this.span(start)};
      }
      if(init?.kind==='Binary'&&init.operator==='in'&&(init.left.kind==='Identifier'||init.left.kind==='Member')&&this.at(')')){
        this.take();const body=this.statement(false,false);
        return {kind:'ForIn',left:init.left,right:init.right,body,span:this.span(start)};
      }
      if((init?.kind==='Identifier'||init?.kind==='Member')&&this.match('of')){
        if(init.kind==='Identifier'&&init.name==='async'&&this.tokens[this.index-2]?.text==='async')this.error('async is not allowed as a for...of assignment target');
        const right=this.assignment();this.need(')');const body=this.statement(false,false);
        return {kind:'ForOf',left:init,right,body,span:this.span(start)};
      }
      if(init?.kind==='Var'&&init.declarationKind==='const'&&init.declarations.some(d=>!d.init))this.error('Const declaration requires an initializer');
      this.need(';');
      const test=this.at(';')?null:this.expression();this.need(';');
      const update=this.at(')')?null:this.expression();this.need(')');const body=this.statement(false,false);
      return {kind:'For',init,test,update,body,span:this.span(start)};
    }
    if(this.match('return')) {
      const argument=this.token.lineBreakBefore||this.at(';')||this.at('}')||this.token.kind==='eof'?null:this.expression();
      this.semi();return {kind:'Return',argument,span:this.span(start)};
    }
    if(this.at('break')||this.at('continue')) {
      const kind=this.take().text==='break'?'Break':'Continue';
      const label=!this.token.lineBreakBefore&&this.token.kind==='word'&&!this.reservedIdentifier(this.token.text)?this.id():null;
      this.semi();return {kind,label,span:this.span(start)};
    }
    const expression=this.expression();this.semi();return {kind:'ExpressionStatement',expression,span:this.span(start)};
  }
  private expression(): A.Expression {
    let left=this.assignment();
    while(this.match(',')) {
      const right=this.assignment();
      left={kind:'Binary',operator:',',left,right,span:{start:left.span.start,end:right.span.end}};
    }
    return left;
  }
  private assignmentPattern(expression:A.Expression|A.BindingPattern):A.BindingPattern {
    if(expression.kind==='Identifier'||expression.kind==='Member')return expression;
    if(expression.kind==='ArrayPattern'||expression.kind==='ObjectPattern')return expression;
    if(expression.kind==='ArrayLiteral'){
      if(expression.trailingCommaAfterSpread)this.error('Rest assignment target cannot have a trailing comma');
      const elements:(A.BindingElement|null)[]=[],length=expression.elements.length;let rest:A.BindingPattern|null=null;
      for(const [index,item] of expression.elements.entries()){
        if(!item){elements.push(null);continue;}
        if(item.kind==='SpreadElement'){
          if(index!==length-1)this.error('Rest assignment target must be last');
          rest=this.assignmentPattern(item.argument);continue;
        }
        const target=item.kind==='Assignment'&&item.operator==='='?item.left:item;
        elements.push({id:this.assignmentPattern(target),init:item.kind==='Assignment'&&item.operator==='='?item.right:null});
      }
      return {kind:'ArrayPattern',elements,rest,span:expression.span};
    }
    if(expression.kind==='ObjectLiteral'){
      if(expression.trailingCommaAfterSpread)this.error('Rest assignment target cannot have a trailing comma');
      const properties:A.ObjectPattern['properties']=[];let rest:A.BindingPattern|null=null;
      for(const [index,property] of expression.properties.entries()){
        if('spread'in property){if(index!==expression.properties.length-1)this.error('Rest assignment target must be last');rest=this.assignmentPattern(property.spread);continue;}
        if(property.accessor||property.value.kind==='FunctionExpression'&&property.value.method)this.error('Invalid assignment pattern property');
        const target=property.value.kind==='Assignment'&&property.value.operator==='='?property.value.left:property.value;
        properties.push({key:property.key,computed:!!property.computed,value:{id:this.assignmentPattern(target),init:property.value.kind==='Assignment'&&property.value.operator==='='?property.value.right:null}});
      }
      return {kind:'ObjectPattern',properties,rest,span:expression.span};
    }
    this.error('Invalid destructuring assignment target');
  }
  private assignment(): A.Expression {
    if(this.generatorContext&&this.at('yield')){
      const start=this.take().span.start,delegate=!this.token.lineBreakBefore&&this.match('*');
      const argument=delegate||!this.token.lineBreakBefore&&![';',')',']','}',',',':','<eof>'].includes(this.token.text)?this.assignment():null;
      if(delegate&&!argument)this.error('yield* requires an expression');
      return {kind:'Yield',argument,delegate,span:this.span(start)};
    }
    const arrow=this.arrow();if(arrow)return arrow;
    const left=this.conditional();
    if(['=','+=','-=','*=','/=','%=','**=','&=','|=','^=','<<=','>>=','>>>='].includes(this.token.text)) {
      const opToken=this.take(), operator=opToken.text;
      if(left.kind!=='Identifier'&&left.kind!=='Member'&&!(operator==='='&&(left.kind==='ArrayLiteral'||left.kind==='ObjectLiteral')))this.error('Assignment requires a variable or property',opToken);
      const target=left.kind==='ArrayLiteral'||left.kind==='ObjectLiteral'?this.assignmentPattern(left):left;
      const right=this.assignment();return {kind:'Assignment',operator,left:target,right,span:{start:left.span.start,end:right.span.end}};
    }
    return left;
  }
  private arrow():A.FunctionExpression|null {
    const start=this.token.span.start;
    let end=-1;
    if(this.token.kind==='word'&&!this.reservedIdentifier(String(this.token.value??this.token.text))&&this.tokens[this.index+1]?.text==='=>')end=this.index+1;
    else if(this.at('(')){
      let cursor=this.index,depth=0;
      do {const token=this.tokens[cursor];if(!token||token.kind==='eof')break;
        if(token.text==='(')depth++;else if(token.text===')')depth--;cursor++;
      }while(depth>0);
      if(depth===0&&this.tokens[cursor]?.text==='=>')end=cursor;
    }
    if(end<0||this.tokens[end]!.lineBreakBefore)return null;
    let parameters:A.BindingPattern[]=[],defaults:(A.Expression|null)[]=[],rest:A.BindingPattern|null=null;
    if(this.at('(')){
      ({parameters,defaults,rest}=this.functionParameters());
    }else {parameters.push(this.id());defaults.push(null);}
    this.need('=>');
    let body:A.Block;
    if(this.at('{'))body=this.functionBody(false);
    else{
      const previous=this.generatorContext;this.generatorContext=false;
      let argument:A.Expression;try{argument=this.assignment();}finally{this.generatorContext=previous;}
      body={kind:'Block',body:[{kind:'Return',argument,span:argument.span}],span:argument.span};
    }
    return {kind:'FunctionExpression',arrow:true,id:null,parameters,defaults,rest,body,span:this.span(start)};
  }
  private conditional(): A.Expression {
    const test=this.binary(1);if(!this.match('?'))return test;
    const consequent=this.assignment();this.need(':');const alternate=this.assignment();
    return {kind:'Conditional',test,consequent,alternate,span:{start:test.span.start,end:alternate.span.end}};
  }
  private binary(min:number): A.Expression {
    let left=this.exponentiation();
    while((precedence[this.token.text]??0)>=min) {
      const token=this.take(),operator=token.text, right=this.binary(precedence[operator]!+1);
      for(const operand of [left,right])if(operand.kind==='Binary'&&!this.parenthesized.has(operand)) {
        if(operator==='??'&&['&&','||'].includes(operand.operator)||['&&','||'].includes(operator)&&operand.operator==='??')
          this.error('Nullish coalescing and logical operators require parentheses when mixed',token);
      }
      left={kind:'Binary',operator,left,right,span:{start:left.span.start,end:right.span.end}};
    }
    return left;
  }
  private exponentiation(): A.Expression {
    const left=this.unary();
    if(!this.at('**'))return left;
    const token=this.take();
    if(left.kind==='Unary'&&!this.parenthesized.has(left))
      this.error('Unary expression cannot be the left operand of exponentiation',token);
    const right=this.exponentiation();
    return {kind:'Binary',operator:'**',left,right,span:{start:left.span.start,end:right.span.end}};
  }
  private unary(): A.Expression {
    const start=this.token.span.start;
    if(['+','-','!','~','typeof','void','delete'].includes(this.token.text)) {
      const operator=this.take().text,argument=this.unary();return {kind:'Unary',operator,argument,span:this.span(start)};
    }
    if(this.at('++')||this.at('--')) {
      const opToken=this.take(),operator=opToken.text,argument=this.unary();if(argument.kind!=='Identifier'&&argument.kind!=='Member')this.error('Update requires a variable or property',opToken);
      return {kind:'Update',operator,argument,prefix:true,span:this.span(start)};
    }
    let expression=this.leftHandSide();
    if(!this.token.lineBreakBefore&&(this.at('++')||this.at('--'))) {
      if(expression.kind!=='Identifier'&&expression.kind!=='Member')this.error('Update requires a variable or property');
      const operator=this.take().text;expression={kind:'Update',operator,argument:expression,prefix:false,span:this.span(start)};
    }
    return expression;
  }
  private arguments():A.Argument[] {
    const args:A.Argument[]=[];this.need('(');
    if(!this.at(')'))do {
      if(this.at('...')){const spread=this.take(),argument=this.assignment();args.push({kind:'SpreadElement',argument,span:{start:spread.span.start,end:argument.span.end}});}
      else args.push(this.assignment());
    }while(this.match(',')&&!this.at(')'));
    this.need(')');return args;
  }
  private chainParts(expression:A.Expression):{base:A.Expression;links:A.OptionalLink[]} {
    if(this.parenthesized.has(expression))return {base:expression,links:[]};
    if(expression.kind==='Member'&&expression.object.kind!=='Super'){
      const prior=this.chainParts(expression.object);
      return {base:prior.base,links:[...prior.links,{kind:'property',property:expression.property,computed:this.computedMembers.has(expression),optional:false,span:expression.span}]};
    }
    if(expression.kind==='Call'){
      const prior=this.chainParts(expression.callee);
      return {base:prior.base,links:[...prior.links,{kind:'call',arguments:expression.arguments,optional:false,span:expression.span}]};
    }
    return {base:expression,links:[]};
  }
  private chain(expression:A.Expression,link:A.OptionalLink,start:number):A.OptionalChain {
    if(expression.kind==='OptionalChain'&&!this.parenthesized.has(expression))
      return {...expression,links:[...expression.links,link],span:this.span(start)};
    const parts=this.chainParts(expression);
    return {kind:'OptionalChain',base:parts.base,links:[...parts.links,link],span:this.span(start)};
  }
  private leftHandSide(allowCalls=true):A.Expression {
    const start=this.token.span.start;let expression:A.Expression;
    if(this.match('new')){
      if(this.match('.')){this.need('target');expression={kind:'NewTarget',span:this.span(start)};}else{
      const callee=this.leftHandSide(false);
      if(callee.kind==='OptionalChain'&&!this.parenthesized.has(callee))this.error('Optional chain cannot be a new target');
      const args=this.at('(')?this.arguments():[];
      expression={kind:'New',callee,arguments:args,span:this.span(start)};}
    }else expression=this.primary();
    while(true) {
      if(this.match('.')) {
        const t=this.token;if(t.kind!=='word')this.error('Expected a property name');this.take();
        const property:A.Literal={kind:'Literal',value:String(t.value??t.text),span:t.span};
        const member:A.Member={kind:'Member',object:expression,property,span:this.span(start)};
        if(expression.kind==='OptionalChain'&&!this.parenthesized.has(expression))
          expression=this.chain(expression,{kind:'property',property,computed:false,optional:false,span:member.span},start);
        else expression=member;
      }else if(this.match('[')) {
        const property=this.expression();this.need(']');const member:A.Member={kind:'Member',object:expression,property,span:this.span(start)};this.computedMembers.add(member);
        if(expression.kind==='OptionalChain'&&!this.parenthesized.has(expression))
          expression=this.chain(expression,{kind:'property',property,computed:true,optional:false,span:member.span},start);
        else expression=member;
      }else if(this.match('?.')) {
        if(expression.kind==='Super')this.error('Optional chaining is not allowed directly on super');
        if(this.at('(')){
          const args=this.arguments();expression=this.chain(expression,{kind:'call',arguments:args,optional:true,span:this.span(start)},start);
        }else if(this.match('[')){
          const property=this.expression();this.need(']');expression=this.chain(expression,{kind:'property',property,computed:true,optional:true,span:this.span(start)},start);
        }else{
          const t=this.token;if(t.kind!=='word')this.error('Expected an optional property or call');this.take();
          const property:A.Literal={kind:'Literal',value:String(t.value??t.text),span:t.span};
          expression=this.chain(expression,{kind:'property',property,computed:false,optional:true,span:this.span(start)},start);
        }
      }else if(allowCalls&&this.at('(')) {
        const args=this.arguments();
        if(expression.kind==='OptionalChain'&&!this.parenthesized.has(expression))
          expression=this.chain(expression,{kind:'call',arguments:args,optional:false,span:this.span(start)},start);
        else expression={kind:'Call',callee:expression,arguments:args,span:this.span(start)};
      }else if(this.token.kind==='templateNoSub'||this.token.kind==='templateHead'){
        if(expression.kind==='OptionalChain'&&!this.parenthesized.has(expression))this.error('Optional chain cannot be a template tag');
        expression=this.template(expression);
      }else break;
    }
    return expression;
  }
  private template(tag?:A.Expression):A.Expression {
    const first=this.token,start=tag?.span.start??first.span.start;
    const raw=(token:Token)=>{
      const text=token.text;
      const segment=token.kind==='templateNoSub'?text.slice(1,-1):token.kind==='templateHead'?text.slice(1,-2):token.kind==='templateTail'?text.slice(0,-1):text.slice(0,-2);
      return segment.replace(/\r\n?/g,'\n');
    };
    if(first.kind==='templateNoSub'){
      this.take();const value=first.value===undefined?undefined:String(first.value);
      if(tag)return {kind:'TaggedTemplate',tag,quasis:[value],rawQuasis:[raw(first)],expressions:[],span:this.span(start)};
      if(value===undefined)this.error('Invalid escape in untagged template',first);
      return {kind:'Literal',value,span:first.span};
    }
    if(first.kind!=='templateHead')this.error('Expected template literal');
    this.take();const quasis:(string|undefined)[]=[first.value===undefined?undefined:String(first.value)],rawQuasis=[raw(first)],expressions:A.Expression[]=[];
    while(true){
      expressions.push(this.expression());this.need('}');
      const segment=this.token;
      if(segment.kind!=='templateMiddle'&&segment.kind!=='templateTail')this.error('Expected template continuation');
      this.take();quasis.push(segment.value===undefined?undefined:String(segment.value));rawQuasis.push(raw(segment));
      if(segment.kind==='templateTail')break;
    }
    if(tag)return {kind:'TaggedTemplate',tag,quasis,rawQuasis,expressions,span:this.span(start)};
    if(quasis.some(value=>value===undefined))this.error('Invalid escape in untagged template',first);
    return {kind:'Template',quasis:quasis as string[],expressions,span:this.span(start)};
  }
  private primary(): A.Expression {
    const t=this.token;
    if(t.kind==='templateNoSub'||t.kind==='templateHead')return this.template();
    if(this.match('super')){if(!this.at('.')&&!this.at('[')&&!this.at('('))this.error('Expected super property or call');return {kind:'Super',span:t.span};}
    if(this.match('this'))return {kind:'This',span:t.span};
    if(this.match('function')){
      const generator=this.match('*'),id=this.at('(')?null:this.functionIdentifier(generator),{parameters,defaults,rest}=this.functionParameters(generator);
      const body=this.functionBody(generator);
      return {kind:'FunctionExpression',generator,id,parameters,defaults,rest,body,span:this.span(t.span.start)};
    }
    if(this.match('class')){
      const id=this.at('{')||this.at('extends')?null:this.id();return this.classTail(t.span.start,id);
    }
    if(this.match('[')) {
      const elements:A.ArrayLiteral['elements']=[];let trailingCommaAfterSpread=false;
      while(!this.at(']')) {
        if(this.match(',')){elements.push(null);continue;}
        if(this.at('...')){const spread=this.take(),argument=this.assignment();elements.push({kind:'SpreadElement',argument,span:{start:spread.span.start,end:argument.span.end}});}
        else elements.push(this.assignment());if(!this.match(','))break;
        if(this.at(']')&&elements.at(-1)?.kind==='SpreadElement')trailingCommaAfterSpread=true;
      }
      this.need(']');return {kind:'ArrayLiteral',elements,trailingCommaAfterSpread,span:this.span(t.span.start)};
    }
    if(this.match('{')) {
      const properties:A.ObjectLiteral['properties']=[];let hasPrototype=false,trailingCommaAfterSpread=false;
      while(!this.at('}')) {
        if(this.match('...')){properties.push({spread:this.assignment()});if(!this.match(','))break;if(this.at('}'))trailingCommaAfterSpread=true;continue;}
        const propertyStart=this.token.span.start;
        let key:A.Expression,value:A.Expression,prototype=false,coverInitialized=false,accessor:'get'|'set'|undefined;
        let shorthand:Token|undefined,computed=false;
        const generator=this.match('*');
        const readKey=():A.Expression=>{
          if(this.match('[')){computed=true;const key=this.assignment();this.need(']');return key;}
          const k=this.token;if(!['word','string','number'].includes(k.kind))this.error('Expected an object property');
          this.take();shorthand=k;return {kind:'Literal',value:String(k.value??k.text),span:k.span};
        };
        key=readKey();
        if(!computed&&shorthand?.kind==='word'&&(shorthand.text==='get'||shorthand.text==='set')&&(key.kind==='Literal'&&(key.value==='get'||key.value==='set'))&&!this.at('(')&&!this.at(':')&&!this.at(',')&&!this.at('}')){
          accessor=key.value;key=readKey();
        }
        if(this.at('(')){
          const {parameters,defaults,rest}=this.functionParameters(generator);
          const names=parameters.flatMap(p=>boundNames(p).map(id=>id.name));
          if(new Set(names).size!==names.length)this.error('Duplicate method parameter');
          if(accessor==='get'&&(parameters.length!==0||rest))this.error('Getter requires no parameters');
          if(accessor==='set'&&(parameters.length!==1||rest))this.error('Setter requires one parameter');
          if(generator&&accessor)this.error('Generator method cannot be an accessor');
          const body=this.functionBody(generator);
          value={kind:'FunctionExpression',generator,method:true,id:null,parameters,defaults,rest,body,span:this.span(propertyStart)};
        }else if(accessor)this.error('Expected accessor parameter list');
        else if(generator)this.error('Expected generator method parameter list');
        else if(this.match(':')){
          prototype=!computed&&key.kind==='Literal'&&key.value==='__proto__';
          if(prototype&&hasPrototype)this.error('Duplicate __proto__ property');hasPrototype ||= prototype;
          value=this.assignment();
        }else{
          if(computed||!shorthand||shorthand.kind!=='word'||this.reservedIdentifier(String(shorthand.value??shorthand.text)))this.error('Invalid shorthand property');
          value={kind:'Identifier',name:String(shorthand.value??shorthand.text),span:shorthand.span};
          if(this.match('=')){const left=value,right=this.assignment();value={kind:'Assignment',operator:'=',left,right,span:{start:left.span.start,end:right.span.end}};coverInitialized=true;}
        }
        properties.push({key,value,prototype,computed,coverInitialized,...(accessor?{accessor}:{})});if(!this.match(','))break;
      }
      this.need('}');return {kind:'ObjectLiteral',properties,trailingCommaAfterSpread,span:this.span(t.span.start)};
    }
    if(t.kind==='number'||t.kind==='string') {this.take();return {kind:'Literal',value:t.value!,span:t.span};}
    if(['true','false','null'].includes(t.text)) {this.take();return {kind:'Literal',value:t.text==='null'?null:t.text==='true',span:t.span};}
    if(this.match('(')) {const e=this.expression();this.need(')');this.parenthesized.add(e);return e;}
    if(t.kind==='word'&&!this.reservedIdentifier(t.text))return this.id();
    return this.error(`Unsupported or unexpected syntax '${t.text}'`);
  }
}
