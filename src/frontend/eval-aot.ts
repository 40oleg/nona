import type * as A from './ast.js';
import type {Span} from '../source.js';
import {lex} from './lexer.js';
import {parse} from './parser.js';
import {bind} from './binder.js';
import {boundNames,collectDeclarations} from './declarations.js';
import {lowerDynamicFunctions,dynamicFactoryPrefix} from './dynamic-functions.js';

/**
 * Ahead-of-time `eval` of literal source text (ECMA-262 18.2.1 PerformEval).
 *
 * Nona has no run-time compiler. When the argument of a direct `eval(...)`, or
 * of an indirect call such as `(0, eval)(...)`, is a string literal, the source
 * is known at compile time: it is parsed here and compiled into the program.
 * A run-time identity check keeps the ordinary call when the callee is not the
 * intrinsic %eval% (eval was replaced or shadowed).
 *
 * Direct eval runs as an arrow function at the call site, so `this`,
 * `arguments`, `new.target`, `super` and the caller's bindings resolve as in
 * the caller. Its lexical declarations are local to the arrow. In sloppy code
 * its var and function declarations belong to the caller's variable
 * environment (EvalDeclarationInstantiation): inside a function they live in a
 * hidden object environment of that function, which identifiers of those
 * names consult before the outer scopes (binder `EvalScope`); at global level
 * they become configurable global object properties. Indirect eval runs as a
 * dynamic function in global scope with the global object as `this`.
 *
 * The arrow returns the completion value of the code (UpdateEmpty rules).
 * Source that fails to parse or has early errors throws SyntaxError when the
 * call is evaluated, as would happen at run time.
 */
export const hiddenPrefix='\u0000',helperPrefix='\u0001';

type Fn=A.FunctionDeclaration|A.FunctionExpression;
interface FunctionInfo {
  node:Fn|null; // null: global code
  strict:boolean;
  arrow:boolean;
  /** Names that already have a binding in the function's variable environment. */
  varNames:Set<string>;
  /** Names declared by sloppy eval calls in this function (EvalScope). */
  evalNames:Set<string>;
  /** Function-body lexical names (conflict with eval var declarations). */
  topLexicals:Set<string>;
}
interface Context {fn:FunctionInfo;strict:boolean;blocks:Set<string>[];newTarget:boolean;superProperty:boolean;superCall:boolean;
  /** Lexical names of the global code (conflict with eval var declarations at global level). */
  globalLexicals:Set<string>;
  /** Inside parameter initializers: eval vars stay local, and `arguments` may not be declared. */
  parameters?:boolean}

const id=(name:string,span:Span):A.Identifier=>({kind:'Identifier',name,span});
const literal=(value:string|undefined|boolean,span:Span):A.Literal=>({kind:'Literal',value,span});
const call=(callee:A.Expression,args:A.Argument[],span:Span):A.Call=>({kind:'Call',callee,arguments:args,span});
const helper=(name:string,args:A.Argument[],span:Span):A.Call=>call(id(helperPrefix+name,span),args,span);
const assign=(left:A.Identifier|A.ArrayPattern|A.ObjectPattern|A.Member,right:A.Expression,span:Span):A.Assignment=>({kind:'Assignment',operator:'=',left,right,span});
const statement=(expression:A.Expression,span:Span):A.ExpressionStatement=>({kind:'ExpressionStatement',expression,span});
const array=(elements:A.Expression[],span:Span):A.ArrayLiteral=>({kind:'ArrayLiteral',elements,span});
const throwSyntax=(message:string,span:Span):A.Expression=>call({kind:'FunctionExpression',arrow:true,id:null,parameters:[],
  body:{kind:'Block',body:[{kind:'Throw',argument:{kind:'New',callee:id('SyntaxError',span),arguments:[literal(message,span)],span},span}],span},span} as A.FunctionExpression,[],span);

function stringArgument(argument:A.Argument|undefined):string|undefined {
  if(!argument)return undefined;
  if(argument.kind==='Literal'&&typeof argument.value==='string')return argument.value;
  if(argument.kind==='Template'&&argument.expressions.length===0&&typeof argument.quasis[0]==='string')return argument.quasis[0];
  // 'a' + 'b': concatenation of string literals.
  if(argument.kind==='Binary'&&argument.operator==='+'){
    const left=stringArgument(argument.left),right=stringArgument(argument.right);
    return left===undefined||right===undefined?undefined:left+right;
  }
  return undefined;
}

/** Var-scoped names of a function body or program: parameters, vars, functions, `arguments`. */
function staticVarNames(node:Fn|A.Program):Set<string> {
  const body=node.kind==='Program'?node.body:node.body.body,names=new Set<string>();
  if(node.kind!=='Program'){
    for(const p of node.parameters)for(const n of boundNames(p))names.add(n.name);
    if(node.rest)for(const n of boundNames(node.rest))names.add(n.name);
    if(!(node.kind==='FunctionExpression'&&node.arrow))names.add('arguments');
  }
  const info=collectDeclarations(body,'var');
  for(const v of info.vars)names.add(v.name);
  for(const f of info.bodyFunctions)names.add(f.id.name);
  for(const f of info.blockFunctions)names.add(f.id.name);
  return names;
}
function lexicalNames(statements:readonly A.Statement[],functions:boolean):Set<string> {
  const names=new Set<string>();
  for(const s of statements){
    if(s.kind==='Var'&&s.declarationKind!=='var')for(const d of s.declarations)for(const n of boundNames(d.id))names.add(n.name);
    if(s.kind==='Class')names.add(s.id.name);
    if(functions&&s.kind==='Function')names.add(s.id.name);
  }
  return names;
}

/** Parse eval source in its context. Returns the statements and strictness, or a SyntaxError message. */
function parseEval(source:string,ctx:Context,indirect:boolean):{body:A.Statement[];strict:boolean;text:string;factories:A.Statement[]}|{error:string} {
  const strictPrefix=!indirect&&ctx.strict?'"use strict";':'';
  const wrappers:[string,string,(p:A.Program)=>A.Block][]=[];
  const fnBody=(p:A.Program)=>((p.body[0] as A.ExpressionStatement).expression as A.FunctionExpression).body;
  if(!indirect&&ctx.superCall)wrappers.push(['(class extends Object{constructor(){'+strictPrefix+'\n','\n}})',p=>((p.body[0] as A.ExpressionStatement).expression as A.ClassExpression).constructorMethod.body]);
  else if(!indirect&&ctx.superProperty)wrappers.push(['({m(){'+strictPrefix+'\n','\n}})',p=>(((p.body[0] as A.ExpressionStatement).expression as A.ObjectLiteral).properties[0] as {value:A.FunctionExpression}).value.body]);
  else if(!indirect&&ctx.newTarget)wrappers.push(['(function(){'+strictPrefix+'\n','\n})',fnBody]);
  else wrappers.push(['(function(){'+strictPrefix+'\n','\n})',fnBody]);
  const [prefix,suffix,extract]=wrappers[0]!;
  const text=prefix+source+suffix;
  try{
    // Function(...) with literal sources inside eval code: compiled like the program's.
    const lowered=lowerDynamicFunctions({...parse(lex(text)),source:text});
    const factories=lowered.body.slice(0,-1),program={...lowered,body:lowered.body.slice(-1)};
    if(program.body.length!==1||program.body[0]!.kind!=='ExpressionStatement')return {error:'Invalid eval source'};
    const block=extract(program);
    // The wrapper only supplies context: eval code is a Script (no return, no
    // new.target or super outside the contexts that allow them).
    let invalid:string|undefined;
    // Return needs an enclosing function; new.target a non-arrow one (or the eval's context).
    const check=(node:unknown,inFunction:boolean,inOrdinary:boolean):void=>{
      if(!node||typeof node!=='object'||invalid)return;
      if(Array.isArray(node)){for(const n of node)check(n,inFunction,inOrdinary);return;}
      const n=node as A.Node;
      if(n.kind==='FunctionExpression'||n.kind==='Function'){
        const ordinary=inOrdinary||!(n.kind==='FunctionExpression'&&(n as A.FunctionExpression).arrow);
        check((n as Fn).parameters,true,ordinary);check((n as Fn).defaults,true,ordinary);check((n as Fn).body,true,ordinary);return;
      }
      if(n.kind==='ClassExpression'||n.kind==='Class'){check((n as A.ClassExpression).superClass,inFunction,inOrdinary);return;}
      if(!inFunction&&n.kind==='Return')invalid='Illegal return statement';
      if(n.kind==='ImportMeta')invalid='Cannot use import.meta outside a module';
      if(!inOrdinary&&n.kind==='NewTarget'&&(indirect||!ctx.newTarget))invalid='new.target expression is not allowed here';
      for(const [key,value] of Object.entries(n))if(key!=='span'&&key!=='sourceSpan')check(value,inFunction,inOrdinary);
    };
    check(block.body,false,false);
    if(invalid)return {error:invalid};
    const strict=!!block.strict||ctx.strict&&!indirect;
    // Early errors (duplicate lexical declarations, strict-mode rules, ...).
    bind({...program,source:text});
    return {body:block.body,strict,text,factories};
  }catch(error){
    return {error:error instanceof Error?(error.message.split('\n')[0]||'Invalid eval source'):'Invalid eval source'};
  }
}

/** Source text for functions and classes compiled from eval code. */
function attachSourceText(node:unknown,text:string):void {
  if(!node||typeof node!=='object')return;
  if(Array.isArray(node)){for(const n of node)attachSourceText(n,text);return;}
  const n=node as A.Node&{sourceText?:string;sourceSpan?:Span};
  if((n.kind==='FunctionExpression'||n.kind==='Function')&&n.sourceText===undefined){const span=n.sourceSpan??n.span;n.sourceText=text.slice(span.start,span.end);}
  for(const [key,value] of Object.entries(n))if(key!=='span'&&key!=='sourceSpan')attachSourceText(value,text);
}

/** Completion value: `\0cv` holds the value of the last value-producing statement (ES2020 UpdateEmpty). */
function completion(statements:A.Statement[],cv:()=>A.Identifier,span:Span):A.Statement[] {
  const reset=():A.Statement=>statement(assign(cv(),literal(undefined,span),span),span);
  const one=(s:A.Statement):A.Statement=>{const list=visit(s);return list.length===1?list[0]!:{kind:'Block',body:list,span};};
  const visit=(s:A.Statement):A.Statement[]=>{
    switch(s.kind){
      case 'ExpressionStatement':{
        if(noCompletion.has(s))return [s];
        // (0, f): the completion value keeps an anonymous function's empty name.
        const anonymous=(s.expression.kind==='FunctionExpression'||s.expression.kind==='ClassExpression')&&!s.expression.id;
        const value:A.Expression=anonymous?{kind:'Binary',operator:',',left:literal(undefined,s.span),right:s.expression,span:s.span} as A.Expression:s.expression;
        return [statement(assign(cv(),value,s.span),s.span)];
      }
      case 'Block':return [{...s,body:s.body.flatMap(visit)}];
      case 'If':return [reset(),{...s,consequent:one(s.consequent),alternate:s.alternate?one(s.alternate):null}];
      case 'While':case 'DoWhile':case 'For':case 'ForIn':case 'ForOf':return [reset(),{...s,body:one(s.body)} as A.Statement];
      case 'Switch':return [reset(),{...s,cases:s.cases.map(c=>({...c,body:c.body.flatMap(visit)}))}];
      case 'Try':{
        const tried={...s,body:{...s.body,body:s.body.body.flatMap(visit)},handler:s.handler?{...s.handler,body:s.handler.body.flatMap(visit)}:null};
        if(!s.finalizer)return [reset(),tried];
        // A normal finally keeps the try/catch value; break or continue out of
        // the finally block completes with the finally block's own value.
        const fvName=hiddenPrefix+'fv'+(finallyCounter++),fv=()=>id(fvName,span);
        const body=exits(completion(s.finalizer.body,fv,span),new Set(),false,false,b=>({kind:'Block',body:[statement(assign(cv(),fv(),span),span),b],span}));
        return [reset(),{...tried,finalizer:{...s.finalizer,body:[{kind:'Var',declarationKind:'var',declarations:[{id:fv(),init:literal(undefined,span)}],span},...body]}}];
      }
      case 'With':return [reset(),{...s,body:one(s.body)}];
      case 'Labeled':{
        // A labelled function declaration stays a declaration.
        if(s.body.kind==='Function')return [s];
        // Keep the label on the statement itself (continue label needs the loop).
        const list=visit(s.body);
        return [...list.slice(0,-1),{...s,body:list.at(-1)!}];
      }
      default:return [s];
    }
  };
  return statements.flatMap(visit);
}

/** Sloppy eval: var declarations become assignments to the caller's variable environment. */
let finallyCounter=0;
/** Rewrite break/continue statements that leave the given statements. */
function exits(statements:A.Statement[],labels:Set<string>,inLoop:boolean,inSwitch:boolean,wrap:(s:A.Statement)=>A.Statement):A.Statement[] {
  const visit=(s:A.Statement,labels:Set<string>,inLoop:boolean,inSwitch:boolean):A.Statement=>{
    switch(s.kind){
      case 'Break':return (s.label?labels.has(s.label.name):inLoop||inSwitch)?s:wrap(s);
      case 'Continue':return (s.label?labels.has(s.label.name):inLoop)?s:wrap(s);
      case 'Block':return {...s,body:s.body.map(x=>visit(x,labels,inLoop,inSwitch))};
      case 'If':return {...s,consequent:visit(s.consequent,labels,inLoop,inSwitch),alternate:s.alternate?visit(s.alternate,labels,inLoop,inSwitch):null};
      case 'While':case 'DoWhile':case 'For':case 'ForIn':case 'ForOf':return {...s,body:visit(s.body,labels,true,inSwitch)} as A.Statement;
      case 'With':return {...s,body:visit(s.body,labels,inLoop,inSwitch)};
      case 'Labeled':return {...s,body:visit(s.body,new Set([...labels,s.label.name]),inLoop,inSwitch)};
      case 'Switch':return {...s,cases:s.cases.map(c=>({...c,body:c.body.map(x=>visit(x,labels,inLoop,true))}))};
      case 'Try':return {...s,body:{...s.body,body:s.body.body.map(x=>visit(x,labels,inLoop,inSwitch))},handler:s.handler?{...s.handler,body:s.handler.body.map(x=>visit(x,labels,inLoop,inSwitch))}:null,finalizer:s.finalizer?{...s.finalizer,body:s.finalizer.body.map(x=>visit(x,labels,inLoop,inSwitch))}:null};
      default:return s;
    }
  };
  return statements.map(x=>visit(x,labels,inLoop,inSwitch));
}
/** Statements from var declarations: their completion is empty. */
const noCompletion=new WeakSet<A.Statement>();
function stripVars(statements:A.Statement[]):A.Statement[] {
  const target=(p:A.BindingPattern):A.Identifier|A.ArrayPattern|A.ObjectPattern=>p as A.Identifier|A.ArrayPattern|A.ObjectPattern;
  const varExpression=(v:A.Var):A.Expression|null=>{
    const parts=v.declarations.filter(d=>d.init).map(d=>assign(target(d.id),d.init!,v.span) as A.Expression);
    if(!parts.length)return null;
    return parts.reduce((left,right)=>({kind:'Binary',operator:',',left,right,span:v.span}) as A.Expression);
  };
  const forTarget=(v:A.Var):A.Assignable|A.ArrayPattern|A.ObjectPattern=>{
    const p=v.declarations[0]!.id;
    return (p.kind==='ArrayPattern'||p.kind==='ObjectPattern'||p.kind==='Identifier'?p:p) as A.Assignable|A.ArrayPattern|A.ObjectPattern;
  };
  const visit=(s:A.Statement):A.Statement=>{
    switch(s.kind){
      case 'Var':{
        if(s.declarationKind!=='var')return s;
        const e=varExpression(s);if(!e)return {kind:'Empty',span:s.span};
        const result=statement(e,s.span);noCompletion.add(result);return result;
      }
      case 'Block':return {...s,body:s.body.map(visit)};
      case 'If':return {...s,consequent:visit(s.consequent),alternate:s.alternate?visit(s.alternate):null};
      case 'While':case 'DoWhile':case 'Labeled':case 'With':return {...s,body:visit(s.body)} as A.Statement;
      case 'For':{
        const init=s.init?.kind==='Var'&&s.init.declarationKind==='var'?varExpression(s.init):s.init;
        return {...s,init,body:visit(s.body)};
      }
      case 'ForIn':case 'ForOf':{
        if(s.left.kind==='Var'&&s.left.declarationKind==='var'){
          const left=forTarget(s.left);
          // Annex B for (var x = init in o): the initializer runs first.
          const init=s.left.annexBInitializer?s.left.declarations[0]!.init:null;
          const loop={...s,left,body:visit(s.body)} as A.Statement;
          if(!init)return loop;
          const first=statement(assign(left as A.Identifier,init,s.span),s.span);noCompletion.add(first);
          return {kind:'Block',body:[first,loop],span:s.span};
        }
        return {...s,body:visit(s.body)} as A.Statement;
      }
      case 'Switch':return {...s,cases:s.cases.map(c=>({...c,body:c.body.map(visit)}))};
      case 'Try':return {...s,body:{...s.body,body:s.body.body.map(visit)},handler:s.handler?{...s.handler,body:s.handler.body.map(visit)}:null,finalizer:s.finalizer?{...s.finalizer,body:s.finalizer.body.map(visit)}:null};
      default:return s;
    }
  };
  return statements.map(visit);
}

/** Annex B.3.3.3: block functions of sloppy eval code that also get a var binding. */
function annexBNames(body:A.Statement[],evalLexicals:Set<string>,outer:Set<string>):A.FunctionDeclaration[] {
  return collectDeclarations(body,'var').blockFunctions.filter(f=>!evalLexicals.has(f.id.name)&&!outer.has(f.id.name));
}
/** After each Annex B block function declaration, copy its value to the variable environment. */
function annexBCopies(statements:A.Statement[],functions:Set<A.FunctionDeclaration>,setter:(name:string,span:Span)=>A.Statement):A.Statement[] {
  const list=(items:A.Statement[]):A.Statement[]=>items.flatMap(s=>s.kind==='Function'&&functions.has(s)?[s,setter(s.id.name,s.span)]:[visit(s)]);
  const visit=(s:A.Statement):A.Statement=>{
    switch(s.kind){
      case 'Block':return {...s,body:list(s.body)};
      case 'If':return {...s,consequent:wrap(s.consequent),alternate:s.alternate?wrap(s.alternate):null};
      case 'While':case 'DoWhile':case 'For':case 'ForIn':case 'ForOf':case 'With':return {...s,body:wrap(s.body)} as A.Statement;
      case 'Labeled':return s.body.kind==='Function'&&functions.has(s.body)?s:{...s,body:wrap(s.body)};
      case 'Switch':return {...s,cases:s.cases.map(c=>({...c,body:list(c.body)}))};
      case 'Try':return {...s,body:{...s.body,body:list(s.body.body)},handler:s.handler?{...s.handler,body:list(s.handler.body)}:null,finalizer:s.finalizer?{...s.finalizer,body:list(s.finalizer.body)}:null};
      default:return s;
    }
  };
  // if (x) function f(){} (B.3.4) is a block holding the function.
  const wrap=(s:A.Statement):A.Statement=>s.kind==='Function'&&functions.has(s)?{kind:'Block',body:[s,setter(s.id.name,s.span)],span:s.span}:visit(s);
  return list(statements);
}

export function lowerLiteralEval(program:A.Program):A.Program {
  if(!program.source||!/\beval\b/.test(program.source))return program;
  let counter=0,factoryCounter=0;
  // Variables assigned the eval function (`var e = eval`): calls through them are indirect eval.
  const aliases=new Set<string>();
  const scan=(node:unknown):void=>{
    if(!node||typeof node!=='object')return;
    if(Array.isArray(node)){for(const n of node)scan(n);return;}
    const n=node as Record<string,unknown>&{kind?:string};
    const isEval=(e:unknown)=>!!e&&(e as A.Node).kind==='Identifier'&&(e as A.Identifier).name==='eval';
    if(n.id&&(n.id as A.Node).kind==='Identifier'&&'init'in n&&isEval(n.init))aliases.add((n.id as A.Identifier).name);
    if(n.kind==='Assignment'&&(n.left as A.Node).kind==='Identifier'&&isEval(n.right))aliases.add((n.left as A.Identifier).name);
    for(const [key,value] of Object.entries(n))if(key!=='span'&&key!=='sourceSpan')scan(value);
  };
  scan(program.body);aliases.delete('eval');
  // Variables assigned only string constants (at most four distinct values).
  const constants=new Map<string,Set<string>>(),poisoned=new Set<string>();
  const constantScan=(node:unknown):void=>{
    if(!node||typeof node!=='object')return;
    if(Array.isArray(node)){for(const n of node)constantScan(n);return;}
    const n=node as Record<string,unknown>&{kind?:string};
    const note=(name:string,value:A.Expression|null|undefined)=>{
      const text=value?stringArgument(value):undefined;
      if(text===undefined)poisoned.add(name);else{const set=constants.get(name)??new Set();set.add(text);constants.set(name,set);}
    };
    if(n.id&&(n.id as A.Node).kind==='Identifier'&&'init'in n&&n.init)note((n.id as A.Identifier).name,n.init as A.Expression);
    if(n.kind==='Assignment'&&(n.left as A.Node).kind==='Identifier')n.operator==='='?note((n.left as A.Identifier).name,n.right as A.Expression):poisoned.add((n.left as A.Identifier).name);
    if(n.kind==='Update'&&(n.argument as A.Node).kind==='Identifier')poisoned.add((n.argument as A.Identifier).name);
    if((n.kind==='ForIn'||n.kind==='ForOf')&&(n.left as A.Node).kind==='Identifier')poisoned.add((n.left as A.Identifier).name);
    for(const [key,value] of Object.entries(n))if(key!=='span'&&key!=='sourceSpan')constantScan(value);
  };
  constantScan(program.body);
  for(const [name,values] of constants)if(poisoned.has(name)||values.size>4)constants.delete(name);
  const factories:A.Statement[]=[];
  const globalInfo:FunctionInfo={node:null,strict:!!program.strict||!!program.module,arrow:false,varNames:staticVarNames(program),evalNames:new Set(),topLexicals:lexicalNames(program.body,false)};
  const touched=new Set<FunctionInfo>();

  /** Compile one literal eval. Returns the replacement for the compiled branch. */
  const compileEval=(source:string,ctx:Context,indirect:boolean,span:Span):A.Expression=>{
    const parsed=parseEval(source,ctx,indirect);
    if('error'in parsed)return throwSyntax(parsed.error,span);
    attachSourceText(parsed.body,parsed.text);
    if(parsed.factories.length){
      // Give the eval's dynamic function factories program-unique names.
      const tag=dynamicFactoryPrefix+'eval'+(factoryCounter++)+'$';
      const rename=(node:unknown):void=>{
        if(!node||typeof node!=='object')return;
        if(Array.isArray(node)){for(const n of node)rename(n);return;}
        const n=node as {kind?:string;name?:string};
        if(n.kind==='Identifier'&&n.name?.startsWith(dynamicFactoryPrefix))n.name=n.name.replace(dynamicFactoryPrefix,tag);
        for(const [key,value] of Object.entries(n))if(key!=='span'&&key!=='sourceSpan')rename(value);
      };
      rename(parsed.factories);rename(parsed.body);
      factories.push(...parsed.factories);
    }
    // Eval code may itself call eval: it runs in the context of this code.
    {
      const nested:Context=indirect?{fn:globalInfo,strict:parsed.strict,blocks:[],newTarget:false,superProperty:false,superCall:false,globalLexicals:ctx.globalLexicals}:{...ctx,strict:parsed.strict};
      const nestedBlocks=[...nested.blocks,lexicalNames(parsed.body,parsed.strict)];
      scan(parsed.body);aliases.delete('eval');
      statements(parsed.body,{...nested,blocks:nestedBlocks});
    }
    const strict=parsed.strict,n=counter++;
    const cvName=hiddenPrefix+'cv'+n,cv=()=>id(cvName,span);
    const info=collectDeclarations(parsed.body,'var');
    const evalLexicals=lexicalNames(parsed.body,false);
    const prologue:A.Statement[]=[{kind:'Var',declarationKind:'var',declarations:[{id:id(cvName,span),init:null}],span}];
    let body=parsed.body;
    const global=indirect||ctx.fn.node===null;
    // Eval in a parameter initializer may not redeclare a parameter, or
    // `arguments` in a non-arrow function.
    if(!strict&&!indirect&&ctx.parameters){
      const fn=ctx.fn.node!,names=new Set([...fn.parameters,...(fn.rest?[fn.rest]:[])].flatMap(p=>boundNames(p).map(n=>n.name)));
      if(!ctx.fn.arrow)names.add('arguments');
      const clash=[...info.vars.map(v=>v.name),...info.bodyFunctions.map(f=>f.id.name)].find(name=>names.has(name));
      if(clash!==undefined)return throwSyntax(`Identifier '${clash}' has already been declared`,span);
    }
    if(!strict){
      // EvalDeclarationInstantiation: var names may not clash with lexical
      // bindings between the eval and its variable environment.
      const varNames=[...new Set([...info.vars.map(v=>v.name),...info.bodyFunctions.map(f=>f.id.name)])];
      const between=global?(indirect?new Set(ctx.globalLexicals):new Set([...ctx.globalLexicals,...ctx.blocks.flatMap(b=>[...b])])):new Set([...(ctx.parameters?[]:ctx.fn.topLexicals),...ctx.blocks.flatMap(b=>[...b])]);
      const clash=varNames.find(name=>between.has(name));
      if(clash!==undefined)return throwSyntax(`Identifier '${clash}' has already been declared`,span);
      const annexB=annexBNames(body,evalLexicals,between);
      const annexBSet=new Set(annexB);
      const declared=[...new Set([...varNames,...annexB.map(f=>f.id.name)])];
      const functions=info.bodyFunctions;
      // Function declarations are hoisted as function expressions assigned in the prologue.
      const functionNames=new Set(functions.map(f=>f.id.name));
      const fnExpr=(f:A.FunctionDeclaration):A.FunctionExpression=>({kind:'FunctionExpression',id:null,nameOverride:f.id.name,generator:f.generator,async:f.async,
        parameters:f.parameters,...(f.defaults?{defaults:f.defaults}:{}),rest:f.rest??null,body:f.body,span:f.span,sourceSpan:f.span,sourceText:(f as {sourceText?:string}).sourceText} as A.FunctionExpression);
      // Last declaration of each function name wins.
      const lastFunction=new Map<string,A.FunctionDeclaration>();for(const f of functions)lastFunction.set(f.id.name,f);
      body=body.filter(s=>!(s.kind==='Function'&&functions.includes(s))).map(s=>s.kind==='Labeled'&&functions.includes(s.body as A.FunctionDeclaration)?{kind:'Empty',span:s.span} as A.Statement:s);
      if(global){
        // Global variable environment: configurable properties of the global
        // object. Names the script declares itself keep their static binding.
        const dynamicFunctions=[...lastFunction.values()].filter(f=>!globalInfo.varNames.has(f.id.name));
        prologue.push(statement(helper('evalGlobalDeclarations',[
          array(dynamicFunctions.map(f=>literal(f.id.name,span)),span),
          array(dynamicFunctions.map(fnExpr),span),
          array(declared.filter(name=>!functionNames.has(name)&&!globalInfo.varNames.has(name)).map(name=>literal(name,span)),span)],span),span));
        for(const f of lastFunction.values())if(globalInfo.varNames.has(f.id.name))prologue.push(statement(assign(id(f.id.name,span),fnExpr(f),span),span));
      }else{
        const fn=ctx.fn,dynamic=ctx.parameters?declared:declared.filter(name=>!fn.varNames.has(name));
        for(const name of dynamic)fn.evalNames.add(name);
        if(dynamic.length){touched.add(fn);prologue.push(statement(assign(id(hiddenPrefix+'evalEnv',span),helper('evalDeclareVars',[id(hiddenPrefix+'evalEnv',span),array(dynamic.map(name=>literal(name,span)),span)],span),span),span));}
        for(const f of lastFunction.values())prologue.push(statement(assign(id(f.id.name,span),fnExpr(f),span),span));
      }
      body=stripVars(body);
      if(annexBSet.size){
        // The setter is defined outside the eval's blocks, so its target resolves
        // to the variable environment, not to the block-scoped function.
        const setters=new Map<string,string>();
        for(const name of new Set(annexB.map(f=>f.id.name))){
          const setter=hiddenPrefix+'set'+n+'_'+name,value=id(hiddenPrefix+'v',span);
          setters.set(name,setter);
          prologue.push({kind:'Var',declarationKind:'var',declarations:[{id:id(setter,span),init:{kind:'FunctionExpression',arrow:true,id:null,parameters:[value],
            body:{kind:'Block',body:[statement(assign(id(name,span),id(hiddenPrefix+'v',span),span),span)],span},span} as A.FunctionExpression}],span});
        }
        body=annexBCopies(body,annexBSet,(name,s)=>statement(call(id(setters.get(name)!,s),[id(name,s)],s),s));
      }
    }
    const thunkBody:A.Block={kind:'Block',body:[...prologue,...completion(body,cv,span),{kind:'Return',argument:cv(),span}],span,...(strict?{strict:true}:{})};
    if(indirect){
      // Global code: a dynamic function (own strictness, global scope) called with the global object as this.
      const name=hiddenPrefix+'indirectEval'+n;
      const factory:A.FunctionExpression={kind:'FunctionExpression',id:null,dynamic:true,nameOverride:'',parameters:[],body:thunkBody,span,noAnnexB:true} as A.FunctionExpression;
      factories.push({kind:'Var',declarationKind:'var',declarations:[{id:id(name,span),init:factory}],span});
      return helper('callWithGlobalThis',[id(name,span)],span);
    }
    const thunk:A.FunctionExpression={kind:'FunctionExpression',arrow:true,id:null,parameters:[],body:thunkBody,span,noAnnexB:true} as A.FunctionExpression;
    return call(thunk,[],span);
  };

  /** eval(...) and indirect forms with a literal first argument. */
  const rewriteCall=(e:A.Call,ctx:Context):A.Expression|undefined=>{
    if(e.arguments.some(a=>a.kind==='SpreadElement'))return undefined;
    const source=stringArgument(e.arguments[0]);
    // A variable that is only ever assigned string constants: each candidate is
    // compiled and selected by comparing the value at run time.
    const argument=e.arguments[0];
    const candidates=source===undefined&&argument?.kind==='Identifier'?constants.get(argument.name):undefined;
    if(source===undefined&&!candidates)return undefined;
    const callee=e.callee;
    const direct=callee.kind==='Identifier'&&callee.name==='eval';
    const indirect=!direct&&(callee.kind==='Identifier'&&aliases.has(callee.name)||
      callee.kind==='Binary'&&callee.operator===','&&callee.right.kind==='Identifier'&&callee.right.name==='eval'&&(callee.left.kind==='Literal'||callee.left.kind==='Identifier')||
      callee.kind==='Member'&&callee.property.kind==='Literal'&&callee.property.value==='eval'&&(callee.object.kind==='Identifier'&&callee.object.name==='globalThis'||callee.object.kind==='This'));
    if(!direct&&!indirect)return undefined;
    const span=e.span;
    const rest=e.arguments.slice(1) as A.Expression[];
    const run=(compiled:A.Expression)=>rest.length?[...rest,compiled].reduce((left,right)=>({kind:'Binary',operator:',',left,right,span}) as A.Expression):compiled;
    if(source!==undefined)return {kind:'Conditional',test:helper('isEval',[callee],span),consequent:run(compileEval(source,ctx,indirect,span)),alternate:e,span} as A.Conditional;
    let chosen:A.Expression={...e};
    for(const value of [...candidates!].reverse())
      chosen={kind:'Conditional',test:{kind:'Binary',operator:'===',left:argument as A.Identifier,right:literal(value,span),span} as A.Expression,consequent:run(compileEval(value,ctx,indirect,span)),alternate:chosen,span} as A.Conditional;
    return {kind:'Conditional',test:helper('isEval',[callee],span),consequent:chosen,alternate:e,span} as A.Conditional;
  };


  // Scope-aware traversal.
  const visitFunction=(node:Fn,outer:Context):void=>{
    const arrow=node.kind==='FunctionExpression'&&!!node.arrow;
    const strict=outer.strict||!!node.body.strict||node.kind==='FunctionExpression'&&(!!node.classMethod||!!node.classConstructor)||node.kind==='FunctionExpression'&&!!node.dynamic&&!!node.body.strict;
    const info:FunctionInfo={node,strict,arrow,varNames:staticVarNames(node),evalNames:new Set(),topLexicals:lexicalNames(node.body.body,false)};
    const method=node.kind==='FunctionExpression'&&(!!node.method||!!node.classMethod||!!node.classConstructor);
    const ctx:Context={fn:info,strict,blocks:[],globalLexicals:outer.globalLexicals,
      newTarget:arrow?outer.newTarget:true,superProperty:arrow?outer.superProperty:method,
      superCall:arrow?outer.superCall:node.kind==='FunctionExpression'&&!!node.derivedConstructor};
    const parameterCtx={...ctx,parameters:true};
    for(const p of node.parameters)pattern(p,parameterCtx);if(node.rest)pattern(node.rest,parameterCtx);
    for(const d of node.defaults??[])if(d)expression(d,parameterCtx,x=>{(node.defaults as (A.Expression|null)[])[node.defaults!.indexOf(d)]=x;});
    statements(node.body.body,ctx);
    if(info.evalNames.size){
      (node as Fn&{evalVarNames?:string[]}).evalVarNames=[...info.evalNames];
      node.body.body.unshift({kind:'Var',declarationKind:'var',declarations:[{id:id(hiddenPrefix+'evalEnv',node.span),init:null}],span:node.span});
    }
  };
  const statements=(list:A.Statement[],ctx:Context):void=>{for(let i=0;i<list.length;i++)statementNode(list[i]!,ctx,s=>{list[i]=s;});};
  const block=(list:A.Statement[],ctx:Context,extra:Set<string>=new Set()):void=>{
    const scope=new Set([...lexicalNames(list,true),...extra]);
    statements(list,{...ctx,blocks:[...ctx.blocks,scope]});
  };
  const statementNode=(s:A.Statement,ctx:Context,replace:(s:A.Statement)=>void):void=>{
    const expr=(e:A.Expression|null|undefined,set:(x:A.Expression)=>void)=>{if(e)expression(e,ctx,set);};
    switch(s.kind){
      case 'ExpressionStatement':expr(s.expression,x=>{s.expression=x;});break;
      case 'Var':for(const d of s.declarations){pattern(d.id,ctx);expr(d.init,x=>{d.init=x;});}break;
      case 'Function':visitFunction(s,ctx);break;
      case 'Class':classNode(s,ctx);break;
      case 'Return':expr(s.argument,x=>{s.argument=x;});break;
      case 'Throw':expr(s.argument,x=>{s.argument=x;});break;
      case 'If':expr(s.test,x=>{s.test=x;});statementNode(s.consequent,ctx,x=>{s.consequent=x;});if(s.alternate)statementNode(s.alternate,ctx,x=>{s.alternate=x;});break;
      case 'Block':block(s.body,ctx);break;
      case 'While':case 'DoWhile':expr(s.test,x=>{s.test=x;});statementNode(s.body,ctx,x=>{s.body=x;});break;
      case 'Labeled':statementNode(s.body,ctx,x=>{s.body=x;});break;
      case 'With':expr(s.object,x=>{s.object=x;});statementNode(s.body,ctx,x=>{s.body=x;});break;
      case 'For':{
        const names=s.init?.kind==='Var'&&s.init.declarationKind!=='var'?new Set(s.init.declarations.flatMap(d=>boundNames(d.id).map(n=>n.name))):new Set<string>();
        const inner={...ctx,blocks:[...ctx.blocks,names]};
        if(s.init){if(s.init.kind==='Var')statementNode(s.init,inner,()=>{});else expression(s.init,inner,x=>{s.init=x;});}
        if(s.test)expression(s.test,inner,x=>{s.test=x;});if(s.update)expression(s.update,inner,x=>{s.update=x;});
        statementNode(s.body,inner,x=>{s.body=x;});break;
      }
      case 'ForIn':case 'ForOf':{
        const names=s.left.kind==='Var'&&s.left.declarationKind!=='var'?new Set(s.left.declarations.flatMap(d=>boundNames(d.id).map(n=>n.name))):new Set<string>();
        const inner={...ctx,blocks:[...ctx.blocks,names]};
        if(s.left.kind==='Var')statementNode(s.left,inner,()=>{});else pattern(s.left as A.BindingPattern,inner);
        expression(s.right,inner,x=>{s.right=x;});statementNode(s.body,inner,x=>{s.body=x;});break;
      }
      case 'Switch':{
        expr(s.discriminant,x=>{s.discriminant=x;});
        const scope=lexicalNames(s.cases.flatMap(c=>c.body),true),inner={...ctx,blocks:[...ctx.blocks,scope]};
        for(const c of s.cases){if(c.test)expression(c.test,inner,x=>{c.test=x;});statements(c.body,inner);}break;
      }
      case 'Try':{
        block(s.body.body,ctx);
        if(s.handler){
          // A simple catch parameter may be redeclared by var (B.3.5); a pattern may not.
          const names=s.parameter&&s.parameter.kind!=='Identifier'?new Set(boundNames(s.parameter).map(n=>n.name)):new Set<string>();
          if(s.parameter)pattern(s.parameter,ctx);
          block(s.handler.body,ctx,names);
        }
        if(s.finalizer)block(s.finalizer.body,ctx);break;
      }
      case 'Export':if(s.declaration)statementNode(s.declaration,ctx,x=>{s.declaration=x as A.Var;});if(s.defaultExpression)expr(s.defaultExpression,x=>{s.defaultExpression=x;});break;
      default:break;
    }
    void replace;
  };
  const pattern=(p:A.BindingPattern,ctx:Context):void=>{
    if(p.kind==='ArrayPattern'){for(const el of p.elements)if(el){pattern(el.id,ctx);if(el.init)expression(el.init,ctx,x=>{el.init=x;});}if(p.rest)pattern(p.rest,ctx);}
    else if(p.kind==='ObjectPattern'){for(const prop of p.properties){if(prop.computed)expression(prop.key,ctx,x=>{prop.key=x;});pattern(prop.value.id,ctx);if(prop.value.init)expression(prop.value.init,ctx,x=>{prop.value.init=x;});}if(p.rest)pattern(p.rest,ctx);}
    else if(p.kind==='Member')expression(p,ctx,()=>{});
  };
  const classNode=(c:A.ClassDeclaration|A.ClassExpression,ctx:Context):void=>{
    const strict={...ctx,strict:true};
    if(c.superClass)expression(c.superClass,strict,x=>{c.superClass=x;});
    for(const m of c.methods){if(m.computed)expression(m.key,strict,x=>{m.key=x;});visitFunction(m.value,strict);}
    visitFunction(c.constructorMethod,strict);
  };
  const expression=(e:A.Expression,ctx:Context,replace:(e:A.Expression)=>void):void=>{
    switch(e.kind){
      case 'FunctionExpression':visitFunction(e,ctx);return;
      case 'ClassExpression':classNode(e,ctx);return;
      case 'Call':{
        expression(e.callee,ctx,x=>{e.callee=x;});
        e.arguments.forEach((a,i)=>{if(a.kind==='SpreadElement')expression(a.argument,ctx,x=>{a.argument=x;});else expression(a,ctx,x=>{e.arguments[i]=x;});});
        const rewritten=rewriteCall(e,ctx);if(rewritten)replace(rewritten);return;
      }
      default:break;
    }
    for(const [key,value] of Object.entries(e)){
      if(key==='span'||key==='sourceSpan'||!value||typeof value!=='object')continue;
      if(Array.isArray(value)){value.forEach((item,i)=>{
        if(item&&typeof item==='object'&&'kind'in item&&typeof item.kind==='string'){
          if(item.kind==='SpreadElement')expression((item as A.SpreadElement).argument,ctx,x=>{(item as A.SpreadElement).argument=x;});
          else if(isExpression(item))expression(item as A.Expression,ctx,x=>{value[i]=x;});
        }else if(item&&typeof item==='object'){
          // Object literal properties, optional links, template parts.
          for(const [k,v] of Object.entries(item))if(k!=='span'&&v&&typeof v==='object'&&'kind'in v&&isExpression(v))expression(v as A.Expression,ctx,x=>{(item as Record<string,unknown>)[k]=x;});
          else if(k!=='span'&&Array.isArray(v))v.forEach((w,j)=>{if(w&&typeof w==='object'&&'kind'in w&&isExpression(w))expression(w as A.Expression,ctx,x=>{v[j]=x;});});
        }
      });}
      else if('kind'in value){
        if(isExpression(value))expression(value as A.Expression,ctx,x=>{(e as unknown as Record<string,unknown>)[key]=x;});
        else if((value as A.Node).kind==='ArrayPattern'||(value as A.Node).kind==='ObjectPattern')pattern(value as A.BindingPattern,ctx);
      }
    }
    // eval?.(source) is an indirect eval (the call is not a direct eval form).
    if(e.kind==='OptionalChain'&&e.links.length===1&&e.links[0]!.kind==='call'&&e.base.kind==='Identifier'&&(e.base.name==='eval'||aliases.has(e.base.name))){
      const link=e.links[0]! as {arguments:A.Argument[]};
      const source=link.arguments.some(a=>a.kind==='SpreadElement')?undefined:stringArgument(link.arguments[0]);
      if(source!==undefined){
        const rest=link.arguments.slice(1) as A.Expression[],compiled=compileEval(source,ctx,true,e.span);
        const run=[...rest,compiled].reduce((left,right)=>({kind:'Binary',operator:',',left,right,span:e.span}) as A.Expression);
        replace({kind:'Conditional',test:helper('isEval',[e.base],e.span),consequent:run,alternate:e,span:e.span} as A.Conditional);
      }
    }
  };
  const ctx:Context={fn:globalInfo,strict:!!program.strict||!!program.module,blocks:[],newTarget:false,superProperty:false,superCall:false,globalLexicals:globalInfo.topLexicals};
  statements(program.body,ctx);
  void touched;
  if(!factories.length&&counter===0)return program;
  return {...program,body:[...factories,...program.body]};
}

const expressionKinds=new Set(['NewTarget','Super','This','Identifier','Literal','RegExpLiteral','Unary','Update','Binary','Assignment','Conditional','Call','New','Member','OptionalChain','ObjectLiteral','ArrayLiteral','Template','TaggedTemplate','Yield','Await','ImportMeta','ImportCall','FunctionExpression','ClassExpression']);
function isExpression(node:unknown):boolean {return !!node&&typeof node==='object'&&expressionKinds.has((node as A.Node).kind);}
