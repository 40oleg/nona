import { CompileError } from '../diagnostics.js';
import type { Token,TokenStream } from './token.js';
import type * as A from './ast.js';
import {boundNames} from './declarations.js';

const reserved = new Set(('break case catch continue debugger default delete do else finally for function if in instanceof new return switch this throw try typeof var void while with class const enum export extends import super yield null true false').split(' '));
/** Reserved only in strict mode code; the binder rejects them there. */
export const strictReserved=new Set(['implements','interface','package','private','protected','public','static']);
const precedence: Record<string,number> = { '??':1,'||':1,'&&':2,'|':3,'^':4,'&':5,'==':6,'!=':6,'===':6,'!==':6,'<':7,'<=':7,'>':7,'>=':7,'in':7,'instanceof':7,'<<':8,'>>':8,'>>>':8,'+':9,'-':9,'*':10,'/':10,'%':10 };
export function parse(tokens: TokenStream,options:{module?:boolean}={}): A.Program { return new Parser(tokens,!!options.module).program(); }

class Parser {
  private index = 0;
  private generatorContext = false;
  private yieldIdentifierForbidden = false;
  private asyncContext = false;
  private awaitIdentifierForbidden = false;
  private parenthesized = new WeakSet<A.Expression>();
  private computedMembers = new WeakSet<A.Member>();
  constructor(private tokens: TokenStream,private module=false) {}
  private get token(): Token { return this.tokens[this.index]!; }
  private at(s: string): boolean { return this.token.text === s; }
  private take(): Token {
    const t=this.tokens[this.index++]!;
    // Bracket depth lets the for-initializer [~In] restriction end inside nested brackets.
    // Each head/middle includes the next ${; its explicit } token closes it.
    if(t.kind==='punct'&&(t.text==='('||t.text==='['||t.text==='{')||t.kind==='templateHead'||t.kind==='templateMiddle')this.depth++;
    else if(t.kind==='punct'&&(t.text===')'||t.text===']'||t.text==='}'))this.depth--;
    return t;
  }
  private depth=0;
  /** Bracket depth at which `in` is not a relational operator (for-statement initializers), or -1. */
  private noInDepth=-1;
  private match(s:string): boolean { if (!this.at(s)) return false; this.take(); return true; }
  private error(message:string, token=this.token): never { throw new CompileError([{ code:'E_SYNTAX',message,file:'',span:token.span }]); }
  private need(s:string): Token { if (!this.at(s)) this.error(`Expected '${s}', found '${this.token.text}'`); return this.take(); }
  private span(start:number): {start:number;end:number} { return {start,end:this.tokens[Math.max(0,this.index-1)]!.span.end}; }
  private reservedIdentifier(name:string):boolean {
    if(name==='await')return this.module||this.asyncContext||this.awaitIdentifierForbidden;
    if(this.module&&(strictReserved.has(name)||name==='let'))return true;
    return reserved.has(name)&&!(name==='yield'&&!this.generatorContext&&!this.yieldIdentifierForbidden);
  }
  /** `async` followed, without a line terminator, by `function`. */
  private atAsyncFunction():boolean {
    const next=this.tokens[this.index+1];
    return this.at('async')&&this.token.kind==='word'&&next?.text==='function'&&!next.lineBreakBefore;
  }
  /** `async` introducing a method name (not a property named async). */
  private atAsyncMethod():boolean {
    const next=this.tokens[this.index+1];
    return this.at('async')&&this.token.kind==='word'&&!!next&&!next.lineBreakBefore&&!['(',':',',','}','=',';'].includes(next.text)&&next.kind!=='eof';
  }
  private id(): A.Identifier {
    const t = this.token,name=String(t.value??t.text); if (t.kind !== 'word' || this.reservedIdentifier(name)) this.error('Expected an identifier');
    this.take(); return {kind:'Identifier',name,span:t.span};
  }
  private functionIdentifier(generator:boolean,isAsync=false,expression=false):A.Identifier {
    // Declarations take their name from the enclosing context; expressions
    // bind the name inside their own generator/async context.
    const previous=this.generatorContext,previousAsync=this.asyncContext,previousAwait=this.awaitIdentifierForbidden;
    // (a static block's restriction on await does not reach a function expression's name)
    if(expression){this.generatorContext=generator;this.asyncContext=isAsync;this.awaitIdentifierForbidden=false;}
    try{return this.id();}finally{this.generatorContext=previous;this.asyncContext=previousAsync;this.awaitIdentifierForbidden=previousAwait;}
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
  private functionParameters(generator=false,isAsync=false):ReturnType<Parser['formalParameters']> {
    const previous=this.generatorContext,previousYield=this.yieldIdentifierForbidden,previousAsync=this.asyncContext,previousAwait=this.awaitIdentifierForbidden;
    this.generatorContext=false;this.yieldIdentifierForbidden=generator;this.asyncContext=false;this.awaitIdentifierForbidden=isAsync;
    try{return this.formalParameters();}finally{this.generatorContext=previous;this.yieldIdentifierForbidden=previousYield;this.asyncContext=previousAsync;this.awaitIdentifierForbidden=previousAwait;}
  }
  private functionBody(generator:boolean,isAsync=false):A.Block {
    const previous=this.generatorContext,previousAsync=this.asyncContext,previousAwait=this.awaitIdentifierForbidden;
    this.generatorContext=generator;this.asyncContext=isAsync;this.awaitIdentifierForbidden=false;
    try{const body=this.block(true);body.strict=this.checkDirective(body.body);return body;}
    finally{this.generatorContext=previous;this.asyncContext=previousAsync;this.awaitIdentifierForbidden=previousAwait;}
  }
  /** A token that can start a class element name (after a modifier). */
  private elementNameStart(token:Token|undefined):boolean {
    return !!token&&(token.kind==='word'||token.kind==='string'||token.kind==='number'||token.kind==='private'||token.text==='[');
  }
  private privateName(token:Token):A.PrivateName {
    return {kind:'PrivateName',name:String(token.value),id:{kind:'Identifier',name:'\u0002'+String(token.value),span:token.span},span:token.span};
  }
  private classTail(start:number,id:A.Identifier|null):A.ClassExpression {
    const superClass=this.match('extends')?this.leftHandSide():null;
    this.need('{');const methods:A.ClassMethod[]=[];let constructorMethod:A.FunctionExpression|null=null;
    const privateNames=new Map<string,A.ClassPrivateName&{getter?:boolean;setter?:boolean}>();
    const declarePrivate=(key:A.PrivateName,kind:'field'|'method'|'accessor',isStatic:boolean,accessor?:'get'|'set'):void=>{
      if(key.name==='#constructor')this.error('#constructor is not a valid private name');
      const existing=privateNames.get(key.name);
      // A getter and a setter (both static or both not) may share a name.
      if(existing){
        if(kind==='accessor'&&existing.kind==='accessor'&&existing.isStatic===isStatic&&!(accessor==='get'?existing.getter:existing.setter)){existing[accessor==='get'?'getter':'setter']=true;return;}
        this.error(`Duplicate private name ${key.name}`);
      }
      privateNames.set(key.name,{name:key.name,id:key.id,kind,isStatic,...(accessor?{[accessor==='get'?'getter':'setter']:true}:{})});
    };
    // The instance initializer: brands of private methods, then fields in order.
    const brands:A.ClassFieldDefinition[]=[],definitions:A.ClassFieldDefinition[]=[];let computedKeys=0;
    while(!this.at('}')){
      if(this.match(';'))continue;
      let methodStart=this.token.span.start;let isStatic=false,accessor:'get'|'set'|undefined,computed=false;
      const next=this.tokens[this.index+1];
      if(this.at('static')&&this.token.kind==='word'&&next?.text==='{'){
        // ClassStaticBlock: its body runs once, with the class as this.
        this.take();const blockStart=this.token.span.start;
        const previous=this.generatorContext,previousAsync=this.asyncContext,previousAwait=this.awaitIdentifierForbidden;
        this.generatorContext=false;this.asyncContext=false;this.awaitIdentifierForbidden=true;
        let body:A.Block;try{body=this.block(true);}finally{this.generatorContext=previous;this.asyncContext=previousAsync;this.awaitIdentifierForbidden=previousAwait;}
        const value:A.FunctionExpression={kind:'FunctionExpression',method:true,classMethod:true,staticBlock:true,id:null,parameters:[],defaults:[],rest:null,body,span:this.span(blockStart)};
        methods.push({key:{kind:'Literal',value:'',span:body.span},computed:false,isStatic:true,element:'staticBlock',value});continue;
      }
      if(this.at('static')&&this.token.kind==='word'&&(this.elementNameStart(next)||next?.text==='*')){this.take();isStatic=true;methodStart=this.token.span.start;}
      const isAsync=this.atAsyncMethod()&&!!this.take();
      const afterModifier=this.tokens[this.index+1],afterName=this.tokens[this.index+2];
      // get/set before a name start an accessor; on another line only when a method follows (`get\n x(){}`).
      if(!isAsync&&(this.at('get')||this.at('set'))&&this.token.kind==='word'&&this.elementNameStart(afterModifier)&&(!afterModifier!.lineBreakBefore||afterModifier!.text==='['||afterName?.text==='('))accessor=this.take().text as 'get'|'set';
      const generator=this.match('*');if(generator&&accessor)this.error('Generator method cannot be an accessor');
      let key:A.Expression;const keyToken=this.token;
      if(this.match('[')){computed=true;key=this.assignment();this.need(']');}
      else if(keyToken.kind==='private'){this.take();key=this.privateName(keyToken);}
      else{if(!['word','string','number'].includes(keyToken.kind))this.error('Expected a class element name');this.take();key={kind:'Literal',value:String(keyToken.value??keyToken.text),span:keyToken.span};}
      const name=!computed&&key.kind==='Literal'?key.value:undefined;
      if(!this.at('(')){
        // FieldDefinition: name, optional initializer, then ; (or ASI).
        if(generator||isAsync||accessor)this.error('Expected a method');
        if(name==='constructor'||isStatic&&name==='prototype')this.error(`Classes may not have a${isStatic?' static':''} field named '${name}'`);
        if(key.kind==='PrivateName')declarePrivate(key,'field',isStatic);
        let initializer:A.Expression|null=null;const initStart=this.token.span.start;
        if(this.match('=')){
          const previous=this.generatorContext,previousAsync=this.asyncContext,previousYield=this.yieldIdentifierForbidden;
          this.generatorContext=false;this.asyncContext=false;this.yieldIdentifierForbidden=false;
          try{initializer=this.assignment();}finally{this.generatorContext=previous;this.asyncContext=previousAsync;this.yieldIdentifierForbidden=previousYield;}
        }
        this.semi();
        if(!isStatic){
          // Instance fields are defined by the class's instance initializer;
          // a computed key is evaluated now and kept in a class-scope binding.
          let keyBinding:A.Identifier|undefined,definitionKey=key as A.Literal|A.Identifier|A.PrivateName;
          if(computed){const name='\u0002key'+computedKeys++;keyBinding={kind:'Identifier',name,span:key.span};definitionKey={kind:'Identifier',name,span:key.span};}
          definitions.push({kind:'ClassFieldDefinition',key:definitionKey,computed,value:initializer,span:this.span(methodStart)});
          methods.push({key,computed,isStatic,element:'field',value:null,...(keyBinding?{keyBinding}:{})});continue;
        }
        // A static field initializer is a method run with the class as this;
        // its parameter is the field name, for NamedEvaluation.
        let value:A.FunctionExpression|null=null;
        if(initializer){
          const span=this.span(initStart),parameter:A.Identifier={kind:'Identifier',name:'\u0002key',span};
          value={kind:'FunctionExpression',method:true,classMethod:true,fieldInitializer:true,id:null,parameters:[parameter],defaults:[null],rest:null,body:{kind:'Block',body:[{kind:'Return',argument:initializer,span}],span},span};
        }
        methods.push({key,computed,isStatic,element:'field',value});continue;
      }
      if(isStatic&&!computed&&name==='prototype')this.error('Static prototype method is not allowed');
      if(!isStatic&&!computed&&accessor&&name==='constructor')this.error('Class constructor cannot be an accessor');
      const {parameters,defaults,rest}=this.functionParameters(generator,isAsync);
      if(accessor==='get'&&(parameters.length||rest))this.error('Getter requires no parameters');
      if(accessor==='set'&&(parameters.length!==1||rest))this.error('Setter requires one parameter');
      const body=this.functionBody(generator,isAsync);
      const value:A.FunctionExpression={kind:'FunctionExpression',generator,...(isAsync?{async:true}:{}),method:true,classMethod:true,id:null,parameters,defaults,rest,body,span:this.span(methodStart)};
      const constructor=!isStatic&&!accessor&&name==='constructor'&&key.kind==='Literal'&&!computed;
      if(constructor){if(generator)this.error('Class constructor cannot be a generator');if(isAsync)this.error('Class constructor cannot be async');if(constructorMethod)this.error('Duplicate constructor');value.classConstructor=true;constructorMethod=value;}
      else{
        if(key.kind==='PrivateName'){
          declarePrivate(key,accessor?'accessor':'method',isStatic,accessor);
          if(!isStatic&&!brands.some(brand=>(brand.key as A.PrivateName).name===key.name))
            brands.push({kind:'ClassFieldDefinition',key:{kind:'PrivateName',name:key.name,id:{kind:'Identifier',name:key.id.name,span:key.span},span:key.span},computed:false,value:null,brand:true,span:key.span});
        }
        methods.push({key,computed,isStatic,...(accessor?{accessor}:{}),value});
      }
    }
    this.need('}');
    const defaultClassConstructor=!constructorMethod;
    constructorMethod??={kind:'FunctionExpression',method:true,classMethod:true,classConstructor:true,id:null,parameters:[],defaults:[],rest:null,body:{kind:'Block',body:[],span:this.span(start)},span:this.span(start)};
    constructorMethod.derivedConstructor=!!superClass;constructorMethod.defaultClassConstructor=defaultClassConstructor;constructorMethod.sourceSpan=this.span(start);
    const result:A.ClassExpression={kind:'ClassExpression',id,superClass,methods,constructorMethod,span:this.span(start)};
    if(privateNames.size)result.privateNames=[...privateNames.values()].map(({name,id,kind,isStatic})=>({name,id,kind,isStatic}));
    if(brands.length||definitions.length){
      const span=this.span(start);
      result.instanceInitializer={kind:'FunctionExpression',method:true,classMethod:true,fieldInitializer:true,id:null,parameters:[],defaults:[],rest:null,
        body:{kind:'Block',body:[...brands,...definitions].map(expression=>({kind:'ExpressionStatement',expression,span:expression.span})),span},span};
      result.instanceFields={kind:'Identifier',name:'\u0002fields',span};
      constructorMethod.instanceFields={kind:'Identifier',name:'\u0002fields',span};
    }
    return result;
  }
  private semi(): void {
    if (this.match(';') || this.at('}') || this.token.kind === 'eof' || this.token.lineBreakBefore) return;
    this.error('Expected semicolon or line terminator; unsupported syntax');
  }
  program(): A.Program {
    const body:A.Statement[]=[];
    while (this.token.kind !== 'eof') body.push(this.module?this.moduleItem():this.statement(true));
    const strict=this.module||this.checkDirective(body);
    return {kind:'Program',body,strict,...(this.module?{module:true}:{}),span:{start:0,end:this.token.span.end},source:this.tokens.source};
  }
  private moduleSpecifier():string {
    const token=this.token;if(token.kind!=='string')this.error('Expected a module specifier string');
    this.take();return String(token.value);
  }
  /** ModuleExportName: IdentifierName or (later editions) a string literal. */
  private exportName():string {
    const token=this.token;
    if(token.kind==='string'){this.take();const value=String(token.value);if(/[\uD800-\uDFFF]/.test(value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g,'')))this.error('Export name must be well-formed Unicode',token);return value;}
    if(token.kind!=='word')this.error('Expected an export name');
    this.take();return String(token.value??token.text);
  }
  private moduleItem():A.Statement {
    const start=this.token.span.start,next=this.tokens[this.index+1]?.text;
    if(this.at('import')&&next!=='('&&next!=='.'){
      this.take();
      if(this.token.kind==='string'){const source=this.moduleSpecifier();this.semi();return {kind:'Import',source,specifiers:[],span:this.span(start)};}
      const specifiers:A.ImportSpecifier[]=[];
      if(this.token.kind==='word'&&!this.at('{')){
        specifiers.push({kind:'default',local:this.id()});
        if(!this.match(','))return this.importFrom(start,specifiers);
      }
      if(this.match('*')){
        if(!this.at('as'))this.error("Expected 'as'");this.take();specifiers.push({kind:'namespace',local:this.id()});
      }else{
        this.need('{');
        while(!this.at('}')){
          const nameToken=this.token,imported=this.exportName();
          if(this.at('as')){this.take();specifiers.push({kind:'named',imported,local:this.id()});}
          else{
            if(nameToken.kind!=='word'||this.reservedIdentifier(imported))this.error('Imported binding must be an identifier',nameToken);
            specifiers.push({kind:'named',imported,local:{kind:'Identifier',name:imported,span:nameToken.span}});
          }
          if(!this.match(','))break;
        }
        this.need('}');
      }
      return this.importFrom(start,specifiers);
    }
    if(this.match('export')){
      if(this.match('*')){
        let namespace:string|undefined;
        if(this.at('as')){this.take();namespace=this.exportName();}
        if(!this.at('from'))this.error("Expected 'from'");this.take();const source=this.moduleSpecifier();this.semi();
        return {kind:'Export',star:true,...(namespace===undefined?{}:{namespace}),source,span:this.span(start)};
      }
      if(this.match('default')){
        const defaultId:A.Identifier={kind:'Identifier',name:'*default*',span:this.token.span};
        if(this.atAsyncFunction()||this.at('function')){
          const declarationStart=this.token.span.start,isAsync=this.atAsyncFunction();if(isAsync)this.take();this.need('function');
          const generator=this.match('*'),id=this.at('(')?null:this.functionIdentifier(generator);
          const {parameters,defaults,rest}=this.functionParameters(generator,isAsync),body=this.functionBody(generator,isAsync);
          const declaration:A.FunctionDeclaration={kind:'Function',generator,...(isAsync?{async:true}:{}),id:id??defaultId,parameters,defaults,rest,body,span:this.span(declarationStart)};
          return {kind:'Export',declaration,isDefault:true,span:this.span(start)};
        }
        if(this.at('class')){
          const declarationStart=this.take().span.start;
          const id=this.at('{')||this.at('extends')?null:this.id(),node=this.classTail(declarationStart,id);
          const declaration:A.ClassDeclaration={...node,kind:'Class',id:id??defaultId};
          return {kind:'Export',declaration,isDefault:true,span:this.span(start)};
        }
        const defaultExpression=this.assignment();this.semi();
        return {kind:'Export',defaultExpression,defaultId,span:this.span(start)};
      }
      if(this.at('{')){
        this.take();const specifiers:A.ExportSpecifier[]=[];const localTokens:Token[]=[];
        while(!this.at('}')){
          const localToken=this.token,local=this.exportName(),exported=this.at('as')?(this.take(),this.exportName()):local;
          specifiers.push({local,exported,...(localToken.kind==='word'?{localId:{kind:'Identifier' as const,name:local,span:localToken.span}}:{})});localTokens.push(localToken);
          if(!this.match(','))break;
        }
        this.need('}');
        let source:string|undefined;
        if(this.at('from')){this.take();source=this.moduleSpecifier();}
        else localTokens.forEach(token=>{if(token.kind!=='word'||reserved.has(String(token.value??token.text))||String(token.value??token.text)==='await')this.error('Exported local binding must be an identifier',token);});
        this.semi();
        return {kind:'Export',specifiers:source===undefined?specifiers:specifiers.map(({local,exported})=>({local,exported})),...(source===undefined?{}:{source}),span:this.span(start)};
      }
      if(this.at('var')||this.at('let')||this.at('const')){const declaration=this.variable(true);return {kind:'Export',declaration,span:this.span(start)};}
      if(this.atAsyncFunction()||this.at('function')||this.at('class')){
        const declaration=this.statement(true) as A.FunctionDeclaration|A.ClassDeclaration;
        return {kind:'Export',declaration,span:this.span(start)};
      }
      this.error('Unsupported export declaration');
    }
    return this.statement(true);
  }
  private importFrom(start:number,specifiers:A.ImportSpecifier[]):A.ImportDeclaration {
    if(!this.at('from'))this.error("Expected 'from'");this.take();
    const source=this.moduleSpecifier();this.semi();
    return {kind:'Import',source,specifiers,span:this.span(start)};
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
      if(declarationKind!=='var'&&JSON.stringify(id,(key,value)=>key==='span'?undefined:value).includes('"name":"let"'))this.error('let is not allowed as a lexically bound name',keyword);
      if(declarationKind==='const'&&!init&&!forHead)this.error('Const declaration requires an initializer');
      if(id.kind!=='Identifier'&&!init&&!forHead)this.error('Destructuring declaration requires an initializer');
      declarations.push({id,init});
    } while(this.match(','));
    if(semicolon)this.semi(); return {kind:'Var',declarationKind,declarations,span:this.span(start)};
  }
  /** Annex B.3.4: `if (x) function f(){}` behaves like a block around the declaration (sloppy only). */
  private ifBody():A.Statement {
    if(this.at('function')&&this.tokens[this.index+1]?.text!=='*'){
      const start=this.token.span.start,declaration=this.statement(true,true);
      return {kind:'Block',body:[declaration],annexBIf:true,span:this.span(start)} as A.Block;
    }
    return this.statement(false,false);
  }
  private statement(allowDeclaration:boolean,allowLexical=true): A.Statement {
    const start=this.token.span.start;
    if(this.at('{'))return this.block();
    if(this.match(';'))return {kind:'Empty',span:this.span(start)};
    if(this.match('throw')){if(this.token.lineBreakBefore)this.error('Line break after throw');const argument=this.expression();this.semi();return {kind:'Throw',argument,span:this.span(start)};}
    if(this.match('try')){
      const body=this.block();let parameter:A.BindingPattern|null=null,handler:A.Block|null=null,finalizer:A.Block|null=null;
      if(this.match('catch')){if(this.match('(')){parameter=this.bindingPattern();this.need(')');}handler=this.block();}
      if(this.match('finally'))finalizer=this.block();
      if(!handler&&!finalizer)this.error('Expected catch or finally');
      return {kind:'Try',body,parameter,handler,finalizer,span:this.span(start)};
    }
    if(this.match('debugger')){this.semi();return {kind:'Debugger',span:this.span(start)};}
    if(this.match('with')){
      this.need('(');const object=this.expression();this.need(')');const body=this.statement(false,false);
      return {kind:'With',object,body,span:this.span(start)};
    }
    if(this.token.kind==='word'&&this.tokens[this.index+1]?.text===':') {
      const label=this.id();this.need(':');
      // Annex B.3.2: a labelled plain function declaration (sloppy only; the binder checks strictness).
      const body=allowDeclaration&&this.at('function')&&this.tokens[this.index+1]?.text!=='*'?this.statement(true,true):this.token.kind==='word'&&this.tokens[this.index+1]?.text===':'?this.statement(allowDeclaration,false):this.statement(false,false);
      return {kind:'Labeled',label,body,span:this.span(start)};
    }
    // In a single-statement position `let` is an identifier unless it starts `let [`.
    const afterLet=this.tokens[this.index+1];
    // In a declaration position `let` declares only before a binding identifier or pattern.
    const letExpression=allowLexical&&this.at('let')&&!!afterLet&&!(afterLet.text==='['||afterLet.text==='{'||afterLet.kind==='word'&&!['in','instanceof'].includes(afterLet.text));
    const letIdentifier=letExpression||!allowLexical&&this.at('let')&&this.tokens[this.index+1]?.text!=='['&&(this.tokens[this.index+1]?.lineBreakBefore||!['word','punct'].includes(this.tokens[this.index+1]?.kind??'')||this.tokens[this.index+1]?.text!=='{'&&this.tokens[this.index+1]?.kind!=='word');
    if(!letIdentifier&&(this.at('var')||this.at('let')||this.at('const'))) {
      if(!allowLexical&&!this.at('var'))this.error('Lexical declaration requires a block');
      return this.variable(true);
    }
    if(this.atAsyncFunction()||this.at('function')) {
      const isAsync=this.atAsyncFunction();if(isAsync)this.take();this.need('function');
      if(!allowDeclaration)this.error('Function declaration requires a StatementList');
      const generator=this.match('*'),id=this.functionIdentifier(generator),{parameters,defaults,rest}=this.functionParameters(generator,isAsync);
      const body=this.functionBody(generator,isAsync);
      return {kind:'Function',generator,...(isAsync?{async:true}:{}),id,parameters,defaults,rest,body,span:this.span(start)};
    }
    if(this.match('class')){
      if(!allowDeclaration||!allowLexical)this.error('Class declaration requires a StatementList');
      const id=this.id(),node=this.classTail(start,id);
      return {...node,kind:'Class',id};
    }
    if(this.match('if')) {
      this.need('(');const test=this.expression();this.need(')');const consequent=this.ifBody();
      const alternate=this.match('else')?this.ifBody():null;
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
      const isAwait=this.asyncContext&&this.match('await');
      this.need('(');const headStart=this.index;
      // `let` starts a declaration only before a binding (ES2020 13.7: for ( [lookahead ≠ let [] ...).
      const next=this.tokens[this.index+1];
      const letDeclaration=this.at('let')&&!!next&&(next.text==='['||next.text==='{'||next.kind==='word'&&next.text!=='in'&&next.text!=='of');
      const savedNoIn=this.noInDepth;this.noInDepth=this.depth;
      let init:A.Var|A.Expression|null;
      try{init=this.at(';')?null:this.at('var')||this.at('const')||letDeclaration?this.variable(false,true):this.expression();}
      finally{this.noInDepth=savedNoIn;}
      if(init?.kind==='Yield'&&init.argument?.kind==='Binary'&&init.argument.operator==='in'&&!this.parenthesized.has(init.argument))
        this.error('Unparenthesized in is not allowed in a for initializer');
      // Annex B.3.6: for (var x = init in obj) — the initializer swallowed the `in`.
      const annexInit=init?.kind==='Var'&&init.declarationKind==='var'&&init.declarations.length===1&&init.declarations[0]!.id.kind==='Identifier'
        &&init.declarations[0]!.init?.kind==='Binary'&&init.declarations[0]!.init.operator==='in'&&!this.parenthesized.has(init.declarations[0]!.init)&&this.at(')')?init.declarations[0]!.init as A.Binary:null;
      if(init?.kind==='Var'&&annexInit){
        this.take();const body=this.statement(false,false);
        const left:A.Var={...init,declarations:[{id:init.declarations[0]!.id,init:annexInit.left}],annexBInitializer:true};
        return {kind:'ForIn',left,right:annexInit.right,body,span:this.span(start)};
      }
      if(init?.kind==='Var'&&this.at('in')&&init.declarationKind==='var'&&init.declarations.length===1&&init.declarations[0]!.id.kind==='Identifier'&&init.declarations[0]!.init){
        // Annex B.3.6: for (var x = init in obj) (sloppy only; the binder rejects it in strict code).
        this.take();const right=this.expression();this.need(')');const body=this.statement(false,false);
        return {kind:'ForIn',left:{...init,annexBInitializer:true},right,body,span:this.span(start)};
      }
      if(init?.kind==='Var'&&(this.at('in')||this.at('of'))){
        if(init.declarations.length!==1||init.declarations[0]!.init)this.error('Only a single binding without initializer is supported in for...in/of');
        const kind=this.take().text==='in'?'ForIn':'ForOf';if(isAwait&&kind!=='ForOf')this.error('for await requires of');
        const right=kind==='ForOf'?this.assignment():this.expression();this.need(')');const body=this.statement(false,false);
        return {kind,left:init,right,body,...(isAwait?{await:true}:{}),span:this.span(start)};
      }
      if(init&&init.kind!=='Var'&&this.at('in')){
        const lhs=init;
        if(!(lhs.kind==='Identifier'||lhs.kind==='Member'||lhs.kind==='Call'||(lhs.kind==='ArrayLiteral'||lhs.kind==='ObjectLiteral')&&!this.parenthesized.has(lhs)))this.error('Invalid for-in target');
        this.take();const right=this.expression();this.need(')');const body=this.statement(false,false);
        const left=lhs.kind==='ArrayLiteral'||lhs.kind==='ObjectLiteral'?this.assignmentPattern(lhs) as A.ArrayPattern|A.ObjectPattern:lhs as A.Assignable;
        return {kind:'ForIn',left,right,body,span:this.span(start)};
      }
      // for ( LHS in Expression ): the expression may be a comma sequence.
      let first:A.Expression|null=init&&init.kind!=='Var'?init:null;
      while(first&&first.kind==='Binary'&&first.operator===','&&!this.parenthesized.has(first))first=first.left;
      if(first?.kind==='Binary'&&first.operator==='in'&&!this.parenthesized.has(first)&&(first.left.kind==='Identifier'||first.left.kind==='Member'||first.left.kind==='Call'||(first.left.kind==='ArrayLiteral'||first.left.kind==='ObjectLiteral')&&!this.parenthesized.has(first.left))&&this.at(')')){
        this.take();const body=this.statement(false,false);
        const replace=(e:A.Expression):A.Expression=>e===first?(first as A.Binary).right:{...(e as A.Binary),left:replace((e as A.Binary).left)};
        const inLeft=first.left.kind==='ArrayLiteral'||first.left.kind==='ObjectLiteral'?this.assignmentPattern(first.left) as A.ArrayPattern|A.ObjectPattern:first.left as A.Assignable;
        return {kind:'ForIn',left:inLeft,right:replace(init as A.Expression),body,span:this.span(start)};
      }
      if(this.at(';')&&init&&(init.kind==='Var'?init.declarations.some(d=>d.init&&this.topLevelIn(d.init)):this.topLevelIn(init)))this.error('in is not allowed in a for statement initializer');
      if((init?.kind==='Identifier'||init?.kind==='Member'||init?.kind==='Call'||(init?.kind==='ArrayLiteral'||init?.kind==='ObjectLiteral')&&!this.parenthesized.has(init))&&this.match('of')){
        // for ( [lookahead ∉ {let, async of}] LeftHandSideExpression of ...
        if(this.tokens[headStart]?.text==='let')this.error('let cannot start a for...of target');
        if(!isAwait&&init.kind==='Identifier'&&init.name==='async'&&this.tokens[this.index-2]?.text==='async')this.error('async is not allowed as a for...of assignment target');
        const left=init.kind==='ArrayLiteral'||init.kind==='ObjectLiteral'?this.assignmentPattern(init) as A.ArrayPattern|A.ObjectPattern:init;
        const right=this.assignment();this.need(')');const body=this.statement(false,false);
        return {kind:'ForOf',left:left as A.Assignable|A.ArrayPattern|A.ObjectPattern,right,body,...(isAwait?{await:true}:{}),span:this.span(start)};
      }
      if(isAwait)this.error('for await requires of');
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
  /** Whether an unparenthesized `in` appears where [~In] forbids it (for initializers). */
  private topLevelIn(e:A.Expression):boolean {
    if(this.parenthesized.has(e))return false;
    switch(e.kind){
      case 'Binary':return e.operator==='in'||this.topLevelIn(e.left)||this.topLevelIn(e.right);
      case 'Assignment':return this.topLevelIn(e.right);
      case 'Conditional':return this.topLevelIn(e.test)||this.topLevelIn(e.alternate);
      case 'Unary':case 'Await':return this.topLevelIn(e.argument);
      case 'Yield':return !!e.argument&&this.topLevelIn(e.argument);
      default:return false;
    }
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
    if(['=','+=','-=','*=','/=','%=','**=','&=','|=','^=','<<=','>>=','>>>=','&&=','||=','??='].includes(this.token.text)) {
      const opToken=this.take(), operator=opToken.text;
      // Annex B.3.8 (web compatibility): a call expression target is a runtime
      // ReferenceError in sloppy code; the binder rejects it in strict code.
      if(left.kind!=='Identifier'&&left.kind!=='Member'&&left.kind!=='Call'&&!(operator==='='&&(left.kind==='ArrayLiteral'||left.kind==='ObjectLiteral')&&!this.parenthesized.has(left)))this.error('Assignment requires a variable or property',opToken);
      const target=left.kind==='ArrayLiteral'||left.kind==='ObjectLiteral'?this.assignmentPattern(left):left;
      const right=this.assignment();return {kind:'Assignment',operator,left:target as A.Assignable|A.ArrayPattern|A.ObjectPattern,right,...(this.parenthesized.has(left)?{parenthesizedTarget:true}:{}),span:{start:left.span.start,end:right.span.end}};
    }
    return left;
  }
  private arrow():A.FunctionExpression|null {
    const start=this.token.span.start;
    // async ArrowParameters: no line terminator between async and the parameters.
    const next=this.tokens[this.index+1];
    const isAsync=this.at('async')&&this.token.kind==='word'&&!!next&&!next.lineBreakBefore&&(next.text==='('||next.kind==='word'&&this.tokens[this.index+2]?.text==='=>');
    if(isAsync){
      const saved=this.index,savedDepth=this.depth;this.index++;
      const result=this.arrowTail(start,true);
      if(result)return result;
      this.index=saved;this.depth=savedDepth;
    }
    return this.arrowTail(start,false);
  }
  private arrowTail(start:number,isAsync:boolean):A.FunctionExpression|null {
    let end=-1;
    if(this.token.kind==='word'&&this.tokens[this.index+1]?.text==='=>'&&!this.reservedIdentifier(String(this.token.value??this.token.text))&&!(isAsync&&this.token.text==='await'))end=this.index+1;
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
      // Arrow parameters keep the enclosing yield/await restrictions.
      const inGenerator=this.generatorContext;
      ({parameters,defaults,rest}=this.functionParameters(false,isAsync||this.asyncContext||this.awaitIdentifierForbidden));
      // ArrowFormalParameters may not contain YieldExpression or AwaitExpression (ES2020 14.2.1, 14.8.1).
      const found=(node:unknown):boolean=>{
        if(!node||typeof node!=='object')return false;
        if(Array.isArray(node))return node.some(found);
        const kind=(node as A.Node).kind;
        if(kind==='Yield'||kind==='Await'||inGenerator&&kind==='Identifier'&&(node as A.Identifier).name==='yield')return true;
        if(kind==='FunctionExpression'||kind==='Function'||kind==='Class'||kind==='ClassExpression')return false;
        return Object.entries(node).some(([key,value])=>key!=='span'&&found(value));
      };
      if(found([parameters,defaults,rest]))this.error('Arrow parameters cannot contain yield or await expressions');
    }else {parameters.push(this.id());defaults.push(null);}
    this.need('=>');
    let body:A.Block;
    if(this.at('{'))body=this.functionBody(false,isAsync);
    else{
      const previous=this.generatorContext,previousAsync=this.asyncContext,previousAwait=this.awaitIdentifierForbidden;
      this.generatorContext=false;this.asyncContext=isAsync;this.awaitIdentifierForbidden=false;
      let argument:A.Expression;try{argument=this.assignment();}finally{this.generatorContext=previous;this.asyncContext=previousAsync;this.awaitIdentifierForbidden=previousAwait;}
      body={kind:'Block',body:[{kind:'Return',argument,span:argument.span}],span:argument.span};
    }
    return {kind:'FunctionExpression',arrow:true,...(isAsync?{async:true}:{}),id:null,parameters,defaults,rest,body,span:this.span(start)};
  }
  private conditional(): A.Expression {
    const test=this.binary(1);if(!this.match('?'))return test;
    // ConditionalExpression[In]: the consequent is always AssignmentExpression[+In].
    const savedNoIn=this.noInDepth;this.noInDepth=-1;let consequent:A.Expression;
    try{consequent=this.assignment();}finally{this.noInDepth=savedNoIn;}
    this.need(':');const alternate=this.assignment();
    return {kind:'Conditional',test,consequent,alternate,span:{start:test.span.start,end:alternate.span.end}};
  }
  private binary(min:number): A.Expression {
    let left=this.exponentiation();
    while((precedence[this.token.text]??0)>=min&&!(this.token.text==='in'&&this.noInDepth===this.depth)) {
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
    if(this.asyncContext&&this.at('await')){
      this.take();const argument=this.unary();return {kind:'Await',argument,span:this.span(start)};
    }
    if(['+','-','!','~','typeof','void','delete'].includes(this.token.text)) {
      const operator=this.take().text,argument=this.unary();return {kind:'Unary',operator,argument,span:this.span(start)};
    }
    if(this.at('++')||this.at('--')) {
      const opToken=this.take(),operator=opToken.text,argument=this.unary();if(argument.kind!=='Identifier'&&argument.kind!=='Member'&&argument.kind!=='Call')this.error('Update requires a variable or property',opToken);
      return {kind:'Update',operator,argument:argument as A.Assignable,prefix:true,span:this.span(start)};
    }
    let expression=this.leftHandSide();
    if(!this.token.lineBreakBefore&&(this.at('++')||this.at('--'))) {
      if(expression.kind!=='Identifier'&&expression.kind!=='Member'&&expression.kind!=='Call')this.error('Update requires a variable or property');
      const operator=this.take().text;expression={kind:'Update',operator,argument:expression as A.Assignable,prefix:false,span:this.span(start)};
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
    if(expression.kind==='Call'&&expression.callee.kind!=='Super'){
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
      if(this.at('import')&&this.tokens[this.index+1]?.text!=='.')this.error('import() cannot be a new target');
      const callee=this.leftHandSide(false);
      if(callee.kind==='OptionalChain'&&!this.parenthesized.has(callee))this.error('Optional chain cannot be a new target');
      const args=this.at('(')?this.arguments():[];
      expression={kind:'New',callee,arguments:args,span:this.span(start)};}
    }else expression=this.primary();
    while(true) {
      if(this.match('.')) {
        const t=this.token;if(t.kind!=='word'&&t.kind!=='private')this.error('Expected a property name');
        if(t.kind==='private'&&expression.kind==='Super')this.error('Unexpected private name after super');
        this.take();
        const property:A.Literal|A.PrivateName=t.kind==='private'?this.privateName(t):{kind:'Literal',value:String(t.value??t.text),span:t.span};
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
          const t=this.token;if(t.kind!=='word'&&t.kind!=='private')this.error('Expected an optional property or call');this.take();
          const property:A.Literal|A.PrivateName=t.kind==='private'?this.privateName(t):{kind:'Literal',value:String(t.value??t.text),span:t.span};
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
    // `#x in obj` (ES2022): the binder checks that the name is only the left operand of in.
    if(t.kind==='private'&&this.tokens[this.index+1]?.text==='in'){this.take();return this.privateName(t);}
    if(this.at('import')){
      this.take();
      if(this.match('.')){
        const property=this.token;if(property.text!=='meta'||property.kind!=='word'||property.value!=='meta'&&property.text!=='meta')this.error('Expected import.meta');this.take();
        if(!this.module)this.error('import.meta is only valid in module code',property);
        return {kind:'ImportMeta',span:this.span(t.span.start)};
      }
      this.need('(');const argument=this.assignment();this.need(')');
      return {kind:'ImportCall',argument,span:this.span(t.span.start)};
    }
    if(this.atAsyncFunction()||this.at('function')){
      const isAsync=this.atAsyncFunction();if(isAsync)this.take();this.need('function');
      const generator=this.match('*'),id=this.at('(')?null:this.functionIdentifier(generator,isAsync,true),{parameters,defaults,rest}=this.functionParameters(generator,isAsync);
      const body=this.functionBody(generator,isAsync);
      return {kind:'FunctionExpression',generator,...(isAsync?{async:true}:{}),id,parameters,defaults,rest,body,span:this.span(t.span.start)};
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
      const properties:A.ObjectLiteral['properties']=[];let hasPrototype=false,trailingCommaAfterSpread=false,duplicateProto=false;
      while(!this.at('}')) {
        if(this.match('...')){properties.push({spread:this.assignment()});if(!this.match(','))break;if(this.at('}'))trailingCommaAfterSpread=true;continue;}
        const propertyStart=this.token.span.start;
        let key:A.Expression,value:A.Expression,prototype=false,coverInitialized=false,accessor:'get'|'set'|undefined;
        let shorthand:Token|undefined,computed=false;
        const isAsync=this.atAsyncMethod()&&!!this.take();
        const generator=this.match('*');
        const readKey=():A.Expression=>{
          if(this.match('[')){computed=true;const key=this.assignment();this.need(']');return key;}
          const k=this.token;if(!['word','string','number'].includes(k.kind))this.error('Expected an object property');
          this.take();shorthand=k;return {kind:'Literal',value:String(k.value??k.text),span:k.span};
        };
        key=readKey();
        if(!computed&&shorthand?.kind==='word'&&(shorthand.text==='get'||shorthand.text==='set')&&(key.kind==='Literal'&&(key.value==='get'||key.value==='set'))&&!this.at('(')&&!this.at(':')&&!this.at(',')&&!this.at('}')){
          if(isAsync)this.error('Accessor cannot be async');
          accessor=key.value;key=readKey();
        }
        if(this.at('(')){
          const {parameters,defaults,rest}=this.functionParameters(generator,isAsync);
          const names=parameters.flatMap(p=>boundNames(p).map(id=>id.name));
          if(new Set(names).size!==names.length)this.error('Duplicate method parameter');
          if(accessor==='get'&&(parameters.length!==0||rest))this.error('Getter requires no parameters');
          if(accessor==='set'&&(parameters.length!==1||rest))this.error('Setter requires one parameter');
          if(generator&&accessor)this.error('Generator method cannot be an accessor');
          const body=this.functionBody(generator,isAsync);
          value={kind:'FunctionExpression',generator,...(isAsync?{async:true}:{}),method:true,id:null,parameters,defaults,rest,body,span:this.span(propertyStart)};
        }else if(accessor||isAsync)this.error('Expected method parameter list');
        else if(generator)this.error('Expected generator method parameter list');
        else if(this.match(':')){
          prototype=!computed&&key.kind==='Literal'&&key.value==='__proto__';
          if(prototype&&hasPrototype)duplicateProto=true;hasPrototype ||= prototype;
          value=this.assignment();
        }else{
          if(computed||!shorthand||shorthand.kind!=='word'||this.reservedIdentifier(String(shorthand.value??shorthand.text)))this.error('Invalid shorthand property');
          value={kind:'Identifier',name:String(shorthand.value??shorthand.text),span:shorthand.span};
          if(this.match('=')){const left=value,right=this.assignment();value={kind:'Assignment',operator:'=',left,right,span:{start:left.span.start,end:right.span.end}};coverInitialized=true;}
        }
        properties.push({key,value,prototype,computed,coverInitialized,...(accessor?{accessor}:{})});if(!this.match(','))break;
      }
      this.need('}');return {kind:'ObjectLiteral',properties,trailingCommaAfterSpread,...(duplicateProto?{duplicateProto:true}:{}),span:this.span(t.span.start)};
    }
    if(t.kind==='number'||t.kind==='string') {this.take();return {kind:'Literal',value:t.value!,span:t.span,...(t.legacyOctal?{legacyOctal:true}:{})};}
    if(t.kind==='regexp'){this.take();return {kind:'RegExpLiteral',pattern:t.pattern!,flags:t.flags!,span:t.span};}
    if(['true','false','null'].includes(t.text)) {this.take();return {kind:'Literal',value:t.text==='null'?null:t.text==='true',span:t.span};}
    if(this.match('(')) {const e=this.expression();this.need(')');this.parenthesized.add(e);return e;}
    if(t.kind==='word'&&t.text==='let'&&!this.module){this.take();return {kind:'Identifier',name:'let',span:t.span};}
    if(t.kind==='word'&&!this.reservedIdentifier(t.text))return this.id();
    return this.error(`Unsupported or unexpected syntax '${t.text}'`);
  }
}
