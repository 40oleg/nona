import {lowerDynamicFunctions} from './dynamic-functions.js';
import {lowerLiteralEval} from './eval-aot.js';
import {boundNames} from './declarations.js';
import {CompileError} from '../diagnostics.js';
import type * as A from './ast.js';
import {lex} from './lexer.js';
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
}

/** Host hooks. Paths are canonical, '/'-separated strings chosen by the host. */
export interface ModuleHost {
  resolve(specifier:string,referrer:string):string|undefined;
  read(path:string):string|undefined;
  /** Specifiers a computed import() in the referrer may name; these modules are compiled in. */
  candidates?(referrer:string):string[];
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

function walk(node:unknown,visit:(node:A.Node)=>void):void {
  if(Array.isArray(node)){for(const item of node)walk(item,visit);return;}
  if(!node||typeof node!=='object')return;
  const record=node as Record<string,unknown>;
  if(typeof record.kind==='string'&&typeof record.span==='object')visit(record as unknown as A.Node);
  for(const [key,value] of Object.entries(record))if(key!=='span'&&key!=='source')walk(value,visit);
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
 * string-literal dynamic imports. A missing static dependency is a compile error;
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
    const record:ModuleRecord={index:records.length,path,ast,requests:new Map(),staticRequests:[],...(loadError===undefined?{}:{loadError})};
    records.push(record);byPath.set(path,record);
    const requests=moduleRequests(ast);
    const dynamics=[...requests.dynamic,...(requests.computed?host.candidates?.(path)??[]:[])].filter((s,i,all)=>all.indexOf(s)===i);
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
  if(entrySource!==null){load(entryPath,entrySource);return records;}
  // A classic script entry: only its string-literal import() targets are loaded.
  for(const specifier of scriptRequests){
    const resolved=host.resolve(specifier,entryPath);if(resolved===undefined||byPath.has(resolved))continue;
    const text=host.read(resolved);if(text!==undefined)load(resolved,text,true);
  }
  return records;
}
