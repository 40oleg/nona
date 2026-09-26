import { CompileError } from '../diagnostics.js';
import type { Token,TokenStream } from './token.js';
import type * as A from './ast.js';

const reserved = new Set(('break case catch continue debugger default delete do else finally for function if in instanceof new return switch this throw try typeof var void while with class const enum export extends import super implements interface let package private protected public static yield null true false').split(' '));
const precedence: Record<string,number> = { '??':1,'||':1,'&&':2,'|':3,'^':4,'&':5,'==':6,'!=':6,'===':6,'!==':6,'<':7,'<=':7,'>':7,'>=':7,'in':7,'instanceof':7,'<<':8,'>>':8,'>>>':8,'+':9,'-':9,'*':10,'/':10,'%':10 };
export function parse(tokens: TokenStream): A.Program { return new Parser(tokens).program(); }

class Parser {
  private index = 0;
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
  private id(): A.Identifier {
    const t = this.token,name=String(t.value??t.text); if (t.kind !== 'word' || reserved.has(name)) this.error('Expected an identifier');
    this.take(); return {kind:'Identifier',name,span:t.span};
  }
  private formalParameters():{parameters:A.Identifier[];rest:A.Identifier|null} {
    this.need('(');const parameters:A.Identifier[]=[];let rest:A.Identifier|null=null;
    while(!this.at(')')){
      if(this.match('...')){rest=this.id();if(this.at(','))this.error('Rest parameter must be last');break;}
      parameters.push(this.id());if(!this.match(','))break;
    }
    this.need(')');return {parameters,rest};
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
      const id=this.id(), init=this.match('=')?this.assignment():null;
      if(declarationKind==='const'&&!init&&!forHead)this.error('Const declaration requires an initializer');
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
      const id=this.id(),{parameters,rest}=this.formalParameters();
      const body=this.block(true);body.strict=this.checkDirective(body.body);
      return {kind:'Function',id,parameters,rest,body,span:this.span(start)};
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
      const label=!this.token.lineBreakBefore&&this.token.kind==='word'&&!reserved.has(this.token.text)?this.id():null;
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
  private assignment(): A.Expression {
    const arrow=this.arrow();if(arrow)return arrow;
    const left=this.conditional();
    if(['=','+=','-=','*=','/=','%=','**=','&=','|=','^=','<<=','>>=','>>>='].includes(this.token.text)) {
      const opToken=this.take(), operator=opToken.text;if(left.kind!=='Identifier'&&left.kind!=='Member')this.error('Assignment requires a variable or property',opToken);
      const right=this.assignment();return {kind:'Assignment',operator,left,right,span:{start:left.span.start,end:right.span.end}};
    }
    return left;
  }
  private arrow():A.FunctionExpression|null {
    const start=this.token.span.start;
    let end=-1;
    if(this.token.kind==='word'&&!reserved.has(String(this.token.value??this.token.text))&&this.tokens[this.index+1]?.text==='=>')end=this.index+1;
    else if(this.at('(')){
      let cursor=this.index+1,valid=true;
      while(this.tokens[cursor]?.text!==')'){
        const token=this.tokens[cursor];
        if(token?.text==='...'){
          cursor++;const rest=this.tokens[cursor];
          if(!rest||rest.kind!=='word'||reserved.has(String(rest.value??rest.text))){valid=false;break;}
          cursor++;if(this.tokens[cursor]?.text!==')')valid=false;break;
        }
        if(!token||token.kind!=='word'||reserved.has(String(token.value??token.text))){valid=false;break;}
        cursor++;
        if(this.tokens[cursor]?.text===')')break;
        if(this.tokens[cursor]?.text!==','){valid=false;break;}
        cursor++;
      }
      if(valid&&this.tokens[cursor]?.text===')'&&this.tokens[cursor+1]?.text==='=>')end=cursor+1;
    }
    if(end<0||this.tokens[end]!.lineBreakBefore)return null;
    let parameters:A.Identifier[]=[],rest:A.Identifier|null=null;
    if(this.at('(')){
      ({parameters,rest}=this.formalParameters());
    }else parameters.push(this.id());
    this.need('=>');
    let body:A.Block;
    if(this.at('{')){body=this.block(true);body.strict=this.checkDirective(body.body);}
    else{
      const argument=this.assignment();
      body={kind:'Block',body:[{kind:'Return',argument,span:argument.span}],span:argument.span};
    }
    return {kind:'FunctionExpression',arrow:true,id:null,parameters,rest,body,span:this.span(start)};
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
  private arguments():A.Expression[] {
    const args:A.Expression[]=[];this.need('(');
    if(!this.at(')'))do {args.push(this.assignment());}while(this.match(',')&&!this.at(')'));
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
      }else break;
    }
    return expression;
  }
  private primary(): A.Expression {
    const t=this.token;
    if(t.kind==='templateNoSub'){this.take();return {kind:'Literal',value:String(t.value),span:t.span};}
    if(t.kind==='templateHead'){
      this.take();const quasis=[String(t.value)],expressions:A.Expression[]=[];
      while(true){
        expressions.push(this.expression());this.need('}');
        const segment=this.token;
        if(segment.kind!=='templateMiddle'&&segment.kind!=='templateTail')this.error('Expected template continuation');
        this.take();quasis.push(String(segment.value));
        if(segment.kind==='templateTail')break;
      }
      return {kind:'Template',quasis,expressions,span:this.span(t.span.start)};
    }
    if(this.match('super')){if(!this.at('.')&&!this.at('['))this.error('Expected super property');return {kind:'Super',span:t.span};}
    if(this.match('this'))return {kind:'This',span:t.span};
    if(this.match('function')){
      const id=this.at('(')?null:this.id(),{parameters,rest}=this.formalParameters();
      const body=this.block(true);body.strict=this.checkDirective(body.body);
      return {kind:'FunctionExpression',id,parameters,rest,body,span:this.span(t.span.start)};
    }
    if(this.match('[')) {
      const elements:A.ArrayLiteral['elements']=[];
      while(!this.at(']')) {
        if(this.match(',')){elements.push(null);continue;}
        elements.push(this.assignment());if(!this.match(','))break;
      }
      this.need(']');return {kind:'ArrayLiteral',elements,span:this.span(t.span.start)};
    }
    if(this.match('{')) {
      const properties:A.ObjectLiteral['properties']=[];let hasPrototype=false;
      while(!this.at('}')) {
        const propertyStart=this.token.span.start;
        let key:A.Expression,value:A.Expression,prototype=false,accessor:'get'|'set'|undefined;
        let shorthand:Token|undefined,computed=false;
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
          const {parameters,rest}=this.formalParameters();
          if(new Set(parameters.map(p=>p.name)).size!==parameters.length)this.error('Duplicate method parameter');
          if(accessor==='get'&&(parameters.length!==0||rest))this.error('Getter requires no parameters');
          if(accessor==='set'&&(parameters.length!==1||rest))this.error('Setter requires one parameter');
          const body=this.block(true);body.strict=this.checkDirective(body.body);
          value={kind:'FunctionExpression',method:true,id:null,parameters,rest,body,span:this.span(propertyStart)};
        }else if(accessor)this.error('Expected accessor parameter list');
        else if(this.match(':')){
          prototype=!computed&&key.kind==='Literal'&&key.value==='__proto__';
          if(prototype&&hasPrototype)this.error('Duplicate __proto__ property');hasPrototype ||= prototype;
          value=this.assignment();
        }else{
          if(computed||!shorthand||shorthand.kind!=='word'||reserved.has(String(shorthand.value??shorthand.text)))this.error('Invalid shorthand property');
          value={kind:'Identifier',name:String(shorthand.value??shorthand.text),span:shorthand.span};
        }
        properties.push({key,value,prototype,...(accessor?{accessor}:{})});if(!this.match(','))break;
      }
      this.need('}');return {kind:'ObjectLiteral',properties,span:this.span(t.span.start)};
    }
    if(t.kind==='number'||t.kind==='string') {this.take();return {kind:'Literal',value:t.value!,span:t.span};}
    if(['true','false','null'].includes(t.text)) {this.take();return {kind:'Literal',value:t.text==='null'?null:t.text==='true',span:t.span};}
    if(this.match('(')) {const e=this.expression();this.need(')');this.parenthesized.add(e);return e;}
    if(t.kind==='word'&&!reserved.has(t.text))return this.id();
    return this.error(`Unsupported or unexpected syntax '${t.text}'`);
  }
}
