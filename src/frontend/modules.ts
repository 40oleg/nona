import {lowerDynamicFunctions} from './dynamic-functions.js';
import {lowerLiteralEval} from './eval-aot.js';
import {boundNames} from './declarations.js';
import {CompileError} from '../diagnostics.js';
import type * as A from './ast.js';
import {lex,requireRuntimePrelude} from './lexer.js';
import {parse} from './parser.js';

/** A parsed module in the statically known graph. Index 0 is the entry. */
export interface ModuleRecord {
  index:number;
  path:string;
  ast:A.Program;
  /** Parse error of a module loaded for import(); reported when that import runs. */
  loadError?:string;
  /** Specifier text -> index of the resolved module, for static and literal dynamic requests. */
  requests:Map<string,number>;
  /** Modules this one imports statically, in source order (for evaluation). */
  staticRequests:number[];
  /** Exact registry names for an implemented builtin; absent for user modules. */
  builtinAliases?:string[];
}

/** Host hooks. Paths are canonical, '/'-separated strings chosen by the host. */
export interface ModuleHost {
  resolve(specifier:string,referrer:string):string|undefined;
  read(path:string):string|undefined;
  /** Specifiers a computed import() in the referrer may name; these modules are compiled in. */
  candidates?(referrer:string):string[];
  builtinAliases?(path:string):string[]|undefined;
  builtinCandidates?():string[];
}

function fail(message:string,path:string,node?:A.Node):never {
  throw new CompileError([{code:'E_MODULE',message,file:path,span:node?.span??{start:0,end:0}}]);
}

/** Relative specifier resolution over canonical '/'-rooted paths; the runtime mirrors it. */
export function resolveRelative(specifier:string,referrer:string):string|undefined {
  if(!specifier.startsWith('./')&&!specifier.startsWith('../')&&!specifier.startsWith('/'))return undefined;
  const parts=specifier.startsWith('/')?[]:referrer.split('/').slice(1,-1);
  for(const segment of specifier.split('/')){
    if(segment===''||segment==='.')continue;
    if(segment==='..')parts.pop();else parts.push(segment);
  }
  return '/'+parts.join('/');
}

function walk(node:unknown,visit:(node:A.Node,parent?:A.Node)=>void,parent?:A.Node):void {
  if(Array.isArray(node)){for(const item of node)walk(item,visit,parent);return;}
  if(!node||typeof node!=='object')return;
  const record=node as Record<string,unknown>;
  const current=typeof record.kind==='string'&&typeof record.span==='object'?record as unknown as A.Node:parent;
  if(current!==parent)visit(current!,parent);
  for(const [key,value] of Object.entries(record))if(key!=='span'&&key!=='source')walk(value,visit,current);
}

/** Plan only user AST requests; provider exports must not recursively select inventory. */
export function builtinModuleRequests(ast:Pick<A.Program,'body'>,host:ModuleHost):string[] {
 const literals=new Set<string>(),processNames=new Set(['process']),globalNames=new Set(['globalThis']),getterNames=new Set<string>();let computed=false,lookup=false;
 const text=(expression:A.Expression):string|undefined=>{
  if(expression.kind==='Literal'&&typeof expression.value==='string')return expression.value;
  if(expression.kind==='Template'&&!expression.expressions.length)return expression.quasis[0];
  if(expression.kind==='Binary'&&expression.operator==='+'){const left=text(expression.left),right=text(expression.right);if(left!==undefined&&right!==undefined)return left+right}
  return undefined;
 };
 for(const statement of ast.body)if(statement.kind==='Import'&&['process','node:process','nona:process'].includes(statement.source))for(const specifier of statement.specifiers){
  if(specifier.kind==='named'&&specifier.imported==='getBuiltinModule')getterNames.add(specifier.local.name);
  else if(specifier.kind==='default'||specifier.kind==='namespace')processNames.add(specifier.local.name);
 }
 const globalObject=(expression:A.Expression)=>expression.kind==='Identifier'&&globalNames.has(expression.name);
 const processObject=(expression:A.Expression):boolean=>{
  if(expression.kind==='Identifier')return processNames.has(expression.name);
  if(expression.kind==='Member')return globalObject(expression.object)&&text(expression.property)==='process';
  if(expression.kind==='Call'){
   const first=expression.arguments[0],key=expression.arguments[1],callee=expression.callee;
   if(callee.kind==='Member'&&text(callee.property)==='get'&&first?.kind!=='SpreadElement'&&first&&globalObject(first)&&key?.kind!=='SpreadElement'&&key&&text(key)==='process')return true;
   if(first?.kind!=='SpreadElement'&&first&&['process','node:process','nona:process'].includes(text(first)??''))return callee.kind==='Member'&&text(callee.property)==='getBuiltinModule'||callee.kind==='Identifier'&&getterNames.has(callee.name);
  }
  return false;
 };
 // Follow simple object aliases so computed access through them is conservative.
 let changed=true;
 while(changed){changed=false;walk(ast.body,node=>{
  const add=(id:A.Expression,init:A.Expression|null)=>{if(id.kind!=='Identifier'||!init)return;
   for(const [matches,names] of [[processObject(init),processNames],[globalObject(init),globalNames]] as const)if(matches&&!names.has(id.name)){names.add(id.name);changed=true}
  };
  if(node.kind==='Var'){for(const declaration of (node as A.Var).declarations)if(declaration.id.kind==='Identifier')add(declaration.id,declaration.init)}
  else if(node.kind==='Assignment'){const assignment=node as A.Assignment;if(assignment.operator==='='&&assignment.left.kind==='Identifier')add(assignment.left,assignment.right)}
 })}
 const ioNames=new Set(['stdin','stdout','stderr','openStdin','emitWarning']);
 const selectIO=(object:A.Expression,key:string|undefined)=>{if(processObject(object)&&key!==undefined&&ioNames.has(key))requireRuntimePrelude('stream')};
 const request=(arguments_:A.Argument[])=>{
  lookup=true;
  const first=arguments_[0];
  if(!first)return;
  const literal=first.kind==='SpreadElement'?undefined:text(first);
  if(literal!==undefined)literals.add(literal);
  else if(first.kind!=='Literal')computed=true;
 };
 walk(ast.body,(node,parent)=>{
  if(['Identifier','Member','Call'].includes(node.kind)&&processObject(node as A.Expression))requireRuntimePrelude('process');
  if(['Identifier','Member','Call'].includes(node.kind)&&(processObject(node as A.Expression)||globalObject(node as A.Expression))){
   // Simple local aliases are tracked; other object escapes may invoke the API
   // through unknown parameters, returned objects or aggregate contents.
   const receiver=parent?.kind==='Member'&&(parent as A.Member).object===node||parent?.kind==='OptionalChain'&&(parent as A.OptionalChain).base===node;
   const local=parent?.kind==='Var'&&(parent as A.Var).declarations.some(d=>d.id===node||d.id.kind==='Identifier'&&d.init===node)||parent?.kind==='Assignment'&&(parent as A.Assignment).left.kind==='Identifier';
   const declaration=parent?.kind==='Import'||parent?.kind==='Function'||parent?.kind==='FunctionExpression';
   const scalar=parent?.kind==='ExpressionStatement'||parent?.kind==='Unary'||parent?.kind==='Binary'&&!['&&','||','??',','].includes((parent as A.Binary).operator);
   const call=parent?.kind==='Call'?parent as A.Call:undefined,callee=call?.callee;
   const reflected=globalObject(node as A.Expression)&&call?.arguments[0]===node&&callee?.kind==='Member'&&callee.object.kind==='Identifier'&&['Reflect','Object'].includes(callee.object.name)&&['get','getOwnPropertyDescriptor'].includes(text(callee.property)??'');
   if(!receiver&&!local&&!declaration&&!scalar&&!reflected)computed=true;
  }
  if(node.kind==='Member'){
   const member=node as A.Member,key=text(member.property);selectIO(member.object,key);
   if(key==='getBuiltinModule'){
    lookup=true;
    if(parent?.kind==='Call'&&(parent as A.Call).callee===member)request((parent as A.Call).arguments);
    else computed=true;
   }else if(key===undefined&&(processObject(member.object)||globalObject(member.object))){
    // A scalar global read or constructor call cannot use the process object.
    // Keep inventory selection for escaping values and nested API lookups.
    const scalarGlobal=globalObject(member.object)&&(parent?.kind==='Unary'||parent?.kind==='New'&&(parent as A.New).callee===member);
    if(!scalarGlobal)computed=true;
   }
  }else if(node.kind==='Identifier'&&getterNames.has((node as A.Identifier).name)&&parent?.kind!=='Import'){
   lookup=true;
   if(parent?.kind==='Call'&&(parent as A.Call).callee===node)request((parent as A.Call).arguments);else computed=true;
  }else if(node.kind==='ObjectPattern'){
   if((node as A.ObjectPattern).properties.some(property=>text(property.key)==='getBuiltinModule'))computed=lookup=true;
  }else if(node.kind==='Call'){
   const call=node as A.Call,object=call.arguments[0];
   if(call.callee.kind==='Member'&&['get','getOwnPropertyDescriptor'].includes(text(call.callee.property)??'')&&object?.kind!=='SpreadElement'&&object){
    const key=call.arguments[1],unknown=!key||key.kind==='SpreadElement'||text(key)===undefined;
    selectIO(object,unknown?undefined:text(key as A.Expression));
    if(processObject(object)&&(unknown||text(key as A.Expression)==='getBuiltinModule'))computed=true;
    if(globalObject(object)&&(unknown||text(call.callee.property)==='getOwnPropertyDescriptor'&&text(key as A.Expression)==='process'))computed=true;
   }
  }else if(node.kind==='OptionalChain'){
   const chain=node as A.OptionalChain;
   for(let i=0;i<chain.links.length;i++){const link=chain.links[i]!;
    if(i===0&&link.kind==='property')selectIO(chain.base,text(link.property));
    if(link.kind==='property'&&text(link.property)==='getBuiltinModule'){
     lookup=true;
     const next=chain.links[i+1];if(next?.kind==='call')request(next.arguments);else computed=true;
    }else if(link.kind==='property'&&text(link.property)===undefined&&(processObject(chain.base)||globalObject(chain.base)))computed=true;
   }
  }
 });
 if(lookup||computed)requireRuntimePrelude('process');
 const candidates=host.builtinCandidates?.()??[];
 if(computed)return candidates;
 return candidates.filter(path=>(host.builtinAliases?.(path)??[]).some(alias=>literals.has(alias)));
}

/**
 * Module early errors on top-level names (ECMA-262 16.2.1.1): function and
 * class declarations are lexical in module code, so they may not repeat or
 * collide with var-declared names.
 */
function checkModuleNames(ast:A.Program,path:string):void {
  const lexical=new Map<string,A.Node>(),vars=new Map<string,A.Node>();
  const addLexical=(id:A.Identifier)=>{if(lexical.has(id.name)||vars.has(id.name))fail(`Duplicate declaration '${id.name}' in module`,path,id);lexical.set(id.name,id);};
  const collectVars=(statement:A.Statement|null|undefined):void=>{
    if(!statement)return;
    switch(statement.kind){
      case 'Var':if(statement.declarationKind==='var')for(const d of statement.declarations)for(const id of boundNames(d.id))vars.set(id.name,id);break;
      case 'Block':statement.body.forEach(collectVars);break;
      case 'If':collectVars(statement.consequent);collectVars(statement.alternate);break;
      case 'While':case 'DoWhile':case 'Labeled':collectVars(statement.body);break;
      case 'For':if(statement.init?.kind==='Var')collectVars(statement.init);collectVars(statement.body);break;
      case 'ForIn':case 'ForOf':if(statement.left.kind==='Var')collectVars(statement.left);collectVars(statement.body);break;
      case 'Switch':for(const c of statement.cases)c.body.forEach(collectVars);break;
      case 'Try':collectVars(statement.body);collectVars(statement.handler);collectVars(statement.finalizer);break;
      case 'Export':if(statement.declaration)collectVars(statement.declaration);break;
    }
  };
  ast.body.forEach(collectVars);
  const exported=new Set<string>();
  const addExport=(name:string,node:A.Node)=>{if(exported.has(name))fail(`Duplicate export '${name}'`,path,node);exported.add(name);};
  for(const statement of ast.body)if(statement.kind==='Export'){
    if(statement.isDefault||statement.defaultExpression)addExport('default',statement);
    else if(statement.declaration?.kind==='Var')for(const d of statement.declaration.declarations)for(const id of boundNames(d.id))addExport(id.name,id);
    else if(statement.declaration)addExport(statement.declaration.id.name,statement.declaration);
    for(const specifier of statement.specifiers??[])addExport(specifier.exported,statement);
    if(statement.namespace!==undefined)addExport(statement.namespace,statement);
  }
  for(const statement of ast.body){
    const declaration=statement.kind==='Export'?statement.declaration:statement;
    if(!declaration)continue;
    if(declaration.kind==='Function'||declaration.kind==='Class')addLexical(declaration.id);
    else if(declaration.kind==='Var'&&declaration.declarationKind!=='var')for(const d of declaration.declarations)for(const id of boundNames(d.id))addLexical(id);
    else if(declaration.kind==='Import')for(const specifier of declaration.specifiers)addLexical(specifier.local);
  }
}

export function moduleRequests(ast:Pick<A.Program,'body'>):{static:string[];dynamic:string[];computed:boolean} {
  const statics:string[]=[],dynamics:string[]=[];let computed=false;
  for(const statement of ast.body){
    if(statement.kind==='Import')statics.push(statement.source);
    if(statement.kind==='Export'&&statement.source!==undefined)statics.push(statement.source);
  }
  walk(ast.body,node=>{
    if(node.kind!=='ImportCall')return;
    const argument=(node as A.ImportCall).argument;
    if(argument.kind==='Literal'&&typeof argument.value==='string')dynamics.push(argument.value);
    else if(argument.kind==='Template'&&argument.expressions.length===0)dynamics.push(argument.quasis[0]!);
    else if(!(argument.kind==='Literal'&&typeof argument.value==='string'))computed=true;
  });
  return {static:statics,dynamic:dynamics,computed};
}

/**
 * Load the module graph reachable from the entry through static imports and
 * string-literal dynamic imports and planned builtin lookups. A missing static dependency is a compile error;
 * a missing dynamic one rejects at run time.
 */
export function loadModuleGraph(entryPath:string,entrySource:string|null,host:ModuleHost,scriptRequests:string[]=[]):ModuleRecord[] {
  const records:ModuleRecord[]=[],byPath=new Map<string,ModuleRecord>();
  const load=(path:string,source:string,dynamic=false):ModuleRecord=>{
    let ast:A.Program,loadError:string|undefined;
    try{ast=lowerLiteralEval(lowerDynamicFunctions(parse(lex(source,{module:true}),{module:true})));checkModuleNames(ast,path);}
    catch(error){
      if(!(error instanceof CompileError))throw error;
      // A module first reached through import() fails when that import runs.
      if(!dynamic)throw new CompileError(error.diagnostics.map(d=>({...d,file:path})));
      ast={kind:'Program',body:[],module:true,source:'',span:{start:0,end:0}};loadError=error.diagnostics[0]?.message??'Invalid module';
    }
    const builtinAliases=host.builtinAliases?.(path);
    const record:ModuleRecord={index:records.length,path,ast,requests:new Map(),staticRequests:[],...(builtinAliases?{builtinAliases}:{}),...(loadError===undefined?{}:{loadError})};
    records.push(record);byPath.set(path,record);
    const requests=moduleRequests(ast);
    const dynamics=[...requests.dynamic,...(requests.computed?host.candidates?.(path)??[]:[]),...(builtinAliases?[]:builtinModuleRequests(ast,host))].filter((s,i,all)=>all.indexOf(s)===i);
    for(const [specifier,isStatic] of [...requests.static.map(s=>[s,true] as const),...dynamics.map(s=>[s,false] as const)]){
      const resolved=host.resolve(specifier,path);
      if(resolved===undefined){if(isStatic)fail(`Cannot resolve module '${specifier}'`,path);continue;}
      let target=byPath.get(resolved);
      if(!target){
        const text=host.read(resolved);
        if(text===undefined){if(isStatic)fail(`Cannot read module '${specifier}' (${resolved})`,path);continue;}
        target=load(resolved,text,!isStatic);
      }
      record.requests.set(specifier,target.index);
      if(isStatic&&!record.staticRequests.includes(target.index))record.staticRequests.push(target.index);
    }
    return record;
  };
  if(entrySource!==null)load(entryPath,entrySource);
  // Supplemental targets for a classic script or module harness stay lazy.
  for(const specifier of scriptRequests){
    const resolved=host.resolve(specifier,entryPath);if(resolved===undefined||byPath.has(resolved))continue;
    const text=host.read(resolved);if(text!==undefined)load(resolved,text,true);
  }
  return records;
}
