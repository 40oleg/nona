import type { Diagnostic } from './diagnostics.js';
import {lowerDynamicFunctions} from './frontend/dynamic-functions.js';
import { CompileError } from './diagnostics.js';
import { lex } from './frontend/lexer.js';
import { parse } from './frontend/parser.js';
import { bind } from './frontend/binder.js';
import { lower } from './ir/lower.js';
import type {ModuleIR} from './ir/model.js';
import type {Program} from './frontend/ast.js';
import { generate } from './backend/x64/codegen.js';
import { linkPe } from './backend/pe/writer.js';
import { linkLinux } from './backend/linux/index.js';
import {loadModuleGraph,moduleRequests,resolveRelative,type ModuleHost} from './frontend/modules.js';
import {readFileSync} from 'node:fs';
import {withBuiltinModules} from './frontend/builtin-modules.js';
import {resolve as resolvePath} from 'node:path';
export type Target='win32-x64'|'linux-x64';
/** The native target of the machine running the compiler (used by tests that compile to IR only). */
export const hostTarget:Target=process.platform==='linux'?'linux-x64':'win32-x64';
export interface CompileOptions {fileName:string;target:'win32-x64'|'linux-x64';unhandledRejections?:'throw'|'ignore';module?:boolean;moduleHost?:ModuleHost;scriptPrelude?:string;realms?:number;agents?:string[]}
/** $262 inside an agent thread (Test262 host API subset). */
const agentHarness='var $262={agent:{receiveBroadcast:function(callback){__nonaAgentReceiveBroadcast(callback)},report:function(value){__nonaAgentReport(String(value))},leaving:function(){},sleep:function(ms){__nonaAgentSleep(ms)},monotonicNow:function(){return Date.now()}}};\n';
/** Canonical '/'-rooted module path for a host file name. */
export function modulePath(fileName:string):string {
  const absolute=resolvePath(fileName).replaceAll('\\','/');
  return absolute.startsWith('/')?absolute:'/'+absolute;
}
/** Default host: relative specifiers resolve to files next to the referrer. */
export const fileModuleHost:ModuleHost={
  resolve:(specifier,referrer)=>resolveRelative(specifier,referrer),
  read:path=>{try{return readFileSync(/^\/[A-Za-z]:\//.test(path)?path.slice(1):path,'utf8');}catch{return undefined;}},
};
/** Frontend and lowering for a module graph rooted at the entry source. */
export function compileModuleToIR(source:string,fileName:string,host:ModuleHost=fileModuleHost,scriptPrelude='',target:Target=hostTarget):ModuleIR {
  host=withBuiltinModules(host,target);
  const records=loadModuleGraph(modulePath(fileName),source,host);
  // An optional classic script (such as a test harness) runs before the graph.
  const script=lowerDynamicFunctions(parse(lex(scriptPrelude)));
  const main:Program={...script,module:true,source:scriptPrelude};
  return {...lower(bind(main,records)),runtimePrelude:true};
}
export type CompileResult = {ok:true;image:Uint8Array;imports:string[]}|{ok:false;diagnostics:Diagnostic[]};
/** Target-independent ECMAScript frontend and IR lowering. Native targets share this path. */
export function compileToIR(source:string,fileName?:string,host:ModuleHost=fileModuleHost,target:Target=hostTarget):ModuleIR {
  host=withBuiltinModules(host,target);
  const script=lowerDynamicFunctions(parse(lex(source)));
  const requests=fileName===undefined?undefined:moduleRequests(script);
  const dynamic=requests===undefined?[]:[...requests.dynamic,...(requests.computed?host.candidates?.(modulePath(fileName!))??[]:[])].filter((s,i,all)=>all.indexOf(s)===i);
  if(!dynamic.length)return {...lower(bind(script)),runtimePrelude:true};
  // Scripts may import() modules; the statically named targets are compiled in.
  const path=modulePath(fileName!),records=loadModuleGraph(path,null,host,dynamic);
  const scriptRequests=dynamic.flatMap(specifier=>{
    const resolved=host.resolve(specifier,path),index=records.findIndex(record=>record.path===resolved);
    return index<0?[]:[[specifier,index] as [string,number]];
  });
  return {...lower(bind({...script,scriptPath:path,scriptRequests},records)),runtimePrelude:true};
}
export function compile(source:string, options:CompileOptions):CompileResult {
  try {
    if(options.target!=='win32-x64'&&options.target!=='linux-x64')throw new CompileError([{code:'E_TARGET',file:options.fileName,span:{start:0,end:0},message:'Unsupported native target'}]);
    // Test262 agents: each source becomes its own thread program in the image.
    const agentPrograms=(options.agents??[]).map(agent=>generate(compileToIR(agentHarness+agent),{agent:true,unhandledRejections:options.unhandledRejections}));
    const ir=options.module?compileModuleToIR(source,options.fileName,options.moduleHost,options.scriptPrelude,options.target):compileToIR(source,options.fileName,options.moduleHost,options.target);
    const ffi=ir.ffi??[];
    // DLL imports exist only in PE images; raw system calls ('syscall') only in ELF images.
    const foreign=ffi.filter(d=>(d.dll==='syscall')!==(options.target==='linux-x64'));
    if(foreign.length)throw new CompileError(foreign.map(d=>({code:'E_FFI_TARGET',file:options.fileName,span:d.span,message:d.dll==='syscall'?`System call declaration ${d.name} is only supported for the linux-x64 target`:`FFI declaration ${d.dll}!${d.name} is only supported for the win32-x64 target`})));
    const program=generate(ir,{unhandledRejections:options.unhandledRejections,realms:options.realms,agentPrograms});
    return {ok:true,image:options.target==='linux-x64'?linkLinux(program):linkPe(program),imports:options.target==='linux-x64'?[]:program.imports.map(i=>i.dll+'!'+i.name)};
  } catch(error) {
    if(error instanceof CompileError)return {ok:false,diagnostics:error.diagnostics.map(d=>({...d,file:options.fileName}))};
    throw error;
  }
}
