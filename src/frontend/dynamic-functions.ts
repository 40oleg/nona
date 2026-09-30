import type * as A from './ast.js';
import {lex} from './lexer.js';
import {parse} from './parser.js';
import {bind} from './binder.js';

/**
 * Ahead-of-time `Function(...)` / `new Function(...)`.
 *
 * Nona has no runtime compiler, so `Function` with source text is normally an
 * EvalError. When every argument is a string literal the source is known at
 * compile time: the call becomes a call of a hidden top-level factory that
 * returns a fresh `anonymous` function created in global scope (CreateDynamicFunction,
 * ECMA-262 20.2.1.1.1). Sources that fail to parse throw SyntaxError when the
 * call is evaluated, as they would at run time. Programs that declare their
 * own `Function` binding are left unchanged.
 */
export const dynamicFactoryPrefix='__nonaDynamicFunction$';
const kinds:Record<string,string>={GeneratorFunction:'function*',AsyncFunction:'async function',AsyncGeneratorFunction:'async function*'};

const stringValue=(argument:A.Argument):string|undefined=>{
  if(argument.kind==='Literal'&&typeof argument.value==='string')return argument.value;
  if(argument.kind==='Template'&&argument.expressions.length===0&&typeof argument.quasis[0]==='string')return argument.quasis[0];
  // Other primitive literals have a fixed ToString.
  if(argument.kind==='Literal'&&(argument.value===null||typeof argument.value==='number'||typeof argument.value==='boolean'||typeof argument.value==='bigint'))return String(argument.value);
  // void <literal> is undefined.
  if(argument.kind==='Unary'&&argument.operator==='void'&&argument.argument.kind==='Literal')return 'undefined';
  return undefined;
};

function walk(node:unknown,visit:(node:A.Node,replace:(next:A.Node)=>void)=>void):void {
  if(!node||typeof node!=='object')return;
  if(Array.isArray(node)){for(let i=0;i<node.length;i++){const item=node[i];if(item&&typeof item==='object'&&'kind'in item)visit(item,next=>{node[i]=next;});walk(node[i],visit);}return;}
  for(const [key,value] of Object.entries(node)){
    if(key==='span'||key==='sourceSpan')continue;
    if(value&&typeof value==='object'&&!Array.isArray(value)&&'kind'in value)visit(value as A.Node,next=>{(node as Record<string,unknown>)[key]=next;});
    walk((node as Record<string,unknown>)[key],visit);
  }
}

/** Whether the program binds its own `Function` (then calls may not reach %Function%). */
function declaresFunction(program:A.Program):boolean {
  let found=false;
  const named=(value:unknown)=>JSON.stringify(value,(key,item)=>key==='span'||key==='body'||key==='defaults'?undefined:item)?.includes('"name":"Function"')??false;
  walk(program.body,node=>{
    if(found)return;
    if(node.kind==='Var')found=(node as A.Var).declarations.some(d=>named(d.id));
    else if(node.kind==='Function'||node.kind==='Class')found=(node as A.FunctionDeclaration).id?.name==='Function'||node.kind==='Function'&&named([(node as A.FunctionDeclaration).parameters,(node as A.FunctionDeclaration).rest??null]);
    else if(node.kind==='FunctionExpression')found=named([(node as A.FunctionExpression).parameters,(node as A.FunctionExpression).rest??null]);
    else if(node.kind==='Import')found=(node as A.ImportDeclaration).specifiers.some(specifier=>specifier.local.name==='Function');
    else if(node.kind==='Try')found=named((node as A.Try).parameter);
  });
  return found;
}

/** Parse CreateDynamicFunction source; undefined when it is not valid. */
function compileSource(parameters:string,body:string,prefix='function'):{expression:A.FunctionExpression}|{error:string} {
  const sourceText=`${prefix} anonymous(${parameters}\n) {\n${body}\n}`;
  try{
    // Parameters and body must each parse on their own (no `){` injection).
    parse(lex(`(${prefix} anonymous(${parameters}\n) {\n})`));
    parse(lex(`(${prefix} anonymous(\n) {\n${body}\n})`));
    const program=parse(lex(`(${sourceText})`));
    const statement=program.body[0];
    if(program.body.length!==1||statement?.kind!=='ExpressionStatement'||statement.expression.kind!=='FunctionExpression')return {error:'Invalid function source'};
    bind(program); // early errors (duplicate strict parameters, bad directives, ...)
    const expression=statement.expression;
    // Generator and async parameters may not contain yield/await (ES2020 14.4.1, 14.7.1).
    const forbidden=(node:unknown):boolean=>{
      if(!node||typeof node!=='object')return false;
      if(Array.isArray(node))return node.some(forbidden);
      const n=node as A.Node;
      if(n.kind==='Yield'||n.kind==='Await')return true;
      if(n.kind==='Identifier'&&((expression.generator&&(n as A.Identifier).name==='yield')||(expression.async&&(n as A.Identifier).name==='await')))return true;
      if(n.kind==='FunctionExpression'||n.kind==='Function')return false;
      return Object.entries(n).some(([key,value])=>key!=='span'&&forbidden(value));
    };
    if((expression.generator||expression.async)&&forbidden([expression.parameters,expression.defaults,expression.rest]))return {error:'Invalid parameters'};
    expression.id=null;expression.dynamic=true;expression.nameOverride='anonymous';expression.sourceText=sourceText;
    return {expression};
  }catch(error){
    return {error:error instanceof Error?error.message.split('\n')[0]!:'Invalid function source'};
  }
}

/**
 * Names bound to `<function expression>.constructor` or
 * `Object.getPrototypeOf(<function expression>).constructor`: the dynamic
 * constructor of that function kind, used through a variable.
 */
function constructorAliases(program:A.Program):Map<string,string> {
  const aliases=new Map<string,string>(),declared=new Map<string,A.FunctionDeclaration>();
  walk(program.body,node=>{if(node.kind==='Function'&&(node as A.FunctionDeclaration).id&&!declared.has((node as A.FunctionDeclaration).id!.name))declared.set((node as A.FunctionDeclaration).id!.name,node as A.FunctionDeclaration);});
  const kindOf=(fn:{async?:boolean;generator?:boolean})=>fn.async?(fn.generator?'async function*':'async function'):fn.generator?'function*':'function';
  walk(program.body,node=>{
    if(node.kind!=='Var')return;
    for(const d of (node as A.Var).declarations){
      if(d.id.kind!=='Identifier'||!d.init||d.init.kind!=='Member')continue;
      const m=d.init as A.Member;
      if(m.property.kind!=='Literal'||m.property.value!=='constructor')continue;
      let source=m.object;
      if(source.kind==='Call'&&source.callee.kind==='Member'&&source.callee.object.kind==='Identifier'&&source.callee.object.name==='Object'
        &&source.callee.property.kind==='Literal'&&source.callee.property.value==='getPrototypeOf'&&source.arguments.length===1)source=source.arguments[0] as A.Expression;
      // A function declaration named by an identifier (the run-time guard
      // covers a reassigned binding).
      if(source.kind==='Identifier'&&declared.has(source.name)){aliases.set(d.id.name,kindOf(declared.get(source.name)!));continue;}
      if(source.kind!=='FunctionExpression'||source.arrow||source.method)continue;
      aliases.set(d.id.name,kindOf(source as A.FunctionExpression));
    }
  });
  return aliases;
}

export function lowerDynamicFunctions(program:A.Program):A.Program {
  if(!program.source||!/Function\b|\.constructor\b/.test(program.source)||declaresFunction(program))return program;
  const aliases=constructorAliases(program);
  const factories:A.Statement[]=[];
  walk(program.body,(node,replace)=>{
    if(node.kind!=='Call'&&node.kind!=='New')return;
    const call=node as A.Call|A.New;
    // Function(...), new Function(...) and Function.call(thisArg, ...): thisArg is evaluated and ignored.
    const isFunction=(e:A.Expression)=>e.kind==='Identifier'&&e.name==='Function';
    let args=call.arguments,thisArg:A.Expression|undefined;
    if(call.kind==='Call'&&call.callee.kind==='Member'&&isFunction(call.callee.object)&&call.callee.property.kind==='Literal'&&call.callee.property.value==='call'&&!args.some(a=>a.kind==='SpreadElement')){
      thisArg=(args[0] as A.Expression|undefined)??{kind:'Identifier',name:'undefined',span:call.span};args=args.slice(1);
    }
    else if(!isFunction(call.callee)&&!(call.callee.kind==='Identifier'&&(Object.hasOwn(kinds,call.callee.name)||aliases.has(call.callee.name))))return;
    const alias=call.callee.kind==='Identifier'&&!Object.hasOwn(kinds,call.callee.name)?aliases.get(call.callee.name):undefined;
    const kindPrefix=alias??(call.callee.kind==='Identifier'&&Object.hasOwn(kinds,call.callee.name)?kinds[call.callee.name]!:'function');
    const values=args.map(stringValue);
    if(values.some(value=>value===undefined))return;
    const strings=values as string[];
    const parameters=strings.slice(0,-1).join(','),body=strings.at(-1)??'';
    const result=compileSource(parameters,body,kindPrefix),span=call.span;
    const name=dynamicFactoryPrefix+factories.length;
    const returned:A.Statement='expression'in result
      ?{kind:'Return',argument:result.expression,span}
      :{kind:'Throw',argument:{kind:'New',callee:{kind:'Identifier',name:'SyntaxError',span},arguments:[{kind:'Literal',value:result.error,span}],span},span};
    factories.push({kind:'Function',id:{kind:'Identifier',name,span},parameters:[],body:{kind:'Block',body:[returned],span},span} as A.FunctionDeclaration);
    if(kindPrefix!=='function'||alias!==undefined){
      // A variable named like a dynamic constructor: use the compiled function only
      // when it holds that intrinsic; otherwise call it as written.
      const guard=parse(lex(`(function(ctor,args){if(ctor!==Object.getPrototypeOf(${kindPrefix}(){}).constructor)return ${call.kind==='New'?'new ':''}ctor(...args)})`)).body[0] as A.ExpressionStatement;
      const guardFn=guard.expression as A.FunctionExpression;
      factories.pop();
      factories.push({kind:'Function',id:{kind:'Identifier',name,span},parameters:guardFn.parameters,defaults:guardFn.defaults,rest:guardFn.rest,body:{kind:'Block',body:[...guardFn.body.body,returned],span},span} as A.FunctionDeclaration);
      replace({kind:'Call',callee:{kind:'Identifier',name,span},arguments:[call.callee,{kind:'ArrayLiteral',elements:args.map(a=>a as A.Expression),span}],span} as A.Call);
      return;
    }
    const created:A.Call={kind:'Call',callee:{kind:'Identifier',name,span},arguments:[],span};
    replace(thisArg?{kind:'Binary',operator:',',left:thisArg,right:created,span} as A.Binary:created);
  });
  if(!factories.length)return program;
  return {...program,body:[...factories,...program.body]};
}
