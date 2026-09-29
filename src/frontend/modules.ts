import {CompileError} from '../diagnostics.js';
import type * as A from './ast.js';
import {lex} from './lexer.js';
import {parse} from './parser.js';

/** A parsed module in the statically known graph. Index 0 is the entry. */
export interface ModuleRecord {
  index:number;
  path:string;
  ast:A.Program;
  /** Specifier text -> index of the resolved module, for static and literal dynamic requests. */
  requests:Map<string,number>;
  /** Modules this one imports statically, in source order (for evaluation). */
  staticRequests:number[];
}

/** Host hooks. Paths are canonical, '/'-separated strings chosen by the host. */
export interface ModuleHost {
  resolve(specifier:string,referrer:string):string|undefined;
  read(path:string):string|undefined;
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

export function moduleRequests(ast:Pick<A.Program,'body'>):{static:string[];dynamic:string[]} {
  const statics:string[]=[],dynamics:string[]=[];
  for(const statement of ast.body){
    if(statement.kind==='Import')statics.push(statement.source);
    if(statement.kind==='Export'&&statement.source!==undefined)statics.push(statement.source);
  }
  walk(ast.body,node=>{
    if(node.kind!=='ImportCall')return;
    const argument=(node as A.ImportCall).argument;
    if(argument.kind==='Literal'&&typeof argument.value==='string')dynamics.push(argument.value);
    if(argument.kind==='Template'&&argument.expressions.length===0)dynamics.push(argument.quasis[0]!);
  });
  return {static:statics,dynamic:dynamics};
}

/**
 * Load the module graph reachable from the entry through static imports and
 * string-literal dynamic imports. A missing static dependency is a compile error;
 * a missing dynamic one rejects at run time.
 */
export function loadModuleGraph(entryPath:string,entrySource:string|null,host:ModuleHost,scriptRequests:string[]=[]):ModuleRecord[] {
  const records:ModuleRecord[]=[],byPath=new Map<string,ModuleRecord>();
  const load=(path:string,source:string):ModuleRecord=>{
    let ast:A.Program;
    try{ast=parse(lex(source),{module:true});}
    catch(error){if(error instanceof CompileError)throw new CompileError(error.diagnostics.map(d=>({...d,file:path})));throw error;}
    const record:ModuleRecord={index:records.length,path,ast,requests:new Map(),staticRequests:[]};
    records.push(record);byPath.set(path,record);
    const requests=moduleRequests(ast);
    for(const [specifier,isStatic] of [...requests.static.map(s=>[s,true] as const),...requests.dynamic.map(s=>[s,false] as const)]){
      const resolved=host.resolve(specifier,path);
      if(resolved===undefined){if(isStatic)fail(`Cannot resolve module '${specifier}'`,path);continue;}
      let target=byPath.get(resolved);
      if(!target){
        const text=host.read(resolved);
        if(text===undefined){if(isStatic)fail(`Cannot read module '${specifier}' (${resolved})`,path);continue;}
        target=load(resolved,text);
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
    const text=host.read(resolved);if(text!==undefined)load(resolved,text);
  }
  return records;
}
