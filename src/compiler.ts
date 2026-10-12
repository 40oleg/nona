import type { Diagnostic } from './diagnostics.js';
import {lowerDynamicFunctions} from './frontend/dynamic-functions.js';
import {lowerLiteralEval} from './frontend/eval-aot.js';
import { CompileError,inPhase,internalError } from './diagnostics.js';
import { lex } from './frontend/lexer.js';
import { parse } from './frontend/parser.js';
import { bind } from './frontend/binder.js';
import { lower } from './ir/lower.js';
import type {ModuleIR} from './ir/model.js';
import type {Program} from './frontend/ast.js';
import { generate } from './backend/x64/codegen.js';
import type { BaseImageCache } from './backend/x64/base-image.js';
import { linkPe } from './backend/pe/writer.js';
import {iconResources,manifestResource,versionResource,defaultManifest,type VersionInfo,type PeResource} from './backend/pe/resources.js';
import {linkWindowsArm64} from './backend/arm64/windows.js';
import {linkDarwin} from './backend/darwin/index.js';
import { linkLinux } from './backend/linux/index.js';
import {linkBsd} from './backend/bsd/index.js';
import {loadModuleGraph,moduleRequests,builtinModuleRequests,resolveRelative,type ModuleHost} from './frontend/modules.js';
import {readFileSync,statSync,realpathSync} from 'node:fs';
import {NodeModuleHost,hostFileSystem,hasModuleSyntax} from './frontend/commonjs.js';
import {withBuiltinModules,builtinSpecifiers} from './frontend/builtin-modules.js';
import {resolve as resolvePath} from 'node:path';
import {collectSourceUsage,setRegExpValidator} from './frontend/lexer.js';
import {validateRegExp} from './regexp-validator.js';
import {fullRuntimeLink} from './link.js';
import {detectHostTarget,getTarget,supportedNativeTargets,requireHostTarget,type Target} from './target.js';
import {withNativeTarget} from './backend/machine/context.js';
// RegExp literals are checked with the runtime's pattern compiler.
setRegExpValidator(validateRegExp);
/** A module path as a coverage URL: absolute paths become file:// URLs, others are kept (built-in modules). */
function scriptUrl(path:string):string|undefined {
  if(path.startsWith('/'))return 'file://'+encodeURI(path);
  if(/^[A-Za-z]:[\\/]/.test(path))return 'file:///'+encodeURI(path.replace(/\\/g,'/'));
  return undefined;
}

export type {Target} from './target.js';
/** The native target of the machine running the compiler (used by tests that compile to IR only). */
export const hostTarget=detectHostTarget();
export interface CompileOptions {fileName:string;target:Target|undefined;/** PE subsystem (win32-x64 only). */subsystem?:'console'|'windows';/** Win32 resources (win32-x64 only): .ico bytes, manifest XML, version information. */icon?:Uint8Array;manifest?:string;versionInfo?:VersionInfo;unhandledRejections?:'throw'|'ignore';module?:boolean;moduleHost?:ModuleHost;scriptPrelude?:string;realms?:number;agents?:string[];/** Link the whole runtime, including parts the program does not appear to use (the RegExp engine, Unicode tables). */fullRuntime?:boolean;/** A store that keeps the compiled runtime and preludes between processes (see fileBaseImageCache in src/cache.ts). */baseCache?:BaseImageCache;/** Count every call by target and print the counts to stderr when the program ends. */callStats?:boolean;/** Write V8-format per-function coverage to `directory` when the program ends; `url` names the program's script (file:// URL). */coverage?:{directory:string;url:string};/** Return the x86-64 assembly of the program's own functions (not the runtime) as `assembly`; x86-64 targets only. */printAsm?:boolean;
  /** Extra package.json `exports`/`imports` conditions, tried before Nona's own ("nona", "node", "import"/"require", "default"). */
  conditions?:readonly string[];
}
/** $262 inside an agent thread (Test262 host API subset). */
const agentHarness='var $262={agent:{receiveBroadcast:function(callback){__nonaAgentReceiveBroadcast(callback)},report:function(value){__nonaAgentReport(String(value))},leaving:function(){},sleep:function(ms){__nonaAgentSleep(ms)},monotonicNow:function(){return Date.now()}}};\n';
/** Canonical '/'-rooted module path for a host file name. */
export function modulePath(fileName:string):string {
  const absolute=resolvePath(fileName).replaceAll('\\','/');
  return absolute.startsWith('/')?absolute:'/'+absolute;
}
/** Whether script source uses import/export declarations or import.meta (then it is compiled as an ES module). */
function entryHasModuleSyntax(source:string):boolean {
  if(!/\b(import|export)\b/.test(source))return false;
  try{return hasModuleSyntax(parse(lex(source,{module:true}),{module:true}));}catch{return false;}
}
/** A host with relative specifiers only: files next to the referrer, read as ES modules. */
export const fileModuleHost:ModuleHost={
  resolve:(specifier,referrer)=>resolveRelative(specifier,referrer),
  read:path=>{try{return readFileSync(/^\/[A-Za-z]:\//.test(path)?path.slice(1):path,'utf8');}catch{return undefined;}},
};
/**
 * The default host: Node.js resolution over the real file system (node_modules,
 * package.json exports/imports/main/type), CommonJS and JSON modules
 * (src/frontend/commonjs.ts). The entry's own text may differ from the file
 * on disk (or the file may not exist), so it is passed in.
 */
export function nodeModuleHost(target:Target,entry?:{fileName:string;source:string},conditions?:readonly string[]):NodeModuleHost {
  const builtins=builtinSpecifiers(target);
  return new NodeModuleHost(hostFileSystem({readFileSync,statSync,realpathSync}),{
    isBuiltin:specifier=>builtins.has(specifier),
    ...(entry?{overrides:new Map([[modulePath(entry.fileName),entry.source]])}:{}),
    ...(conditions?.length?{conditions}:{}),
  });
}
/** Frontend and lowering for a module graph rooted at the entry source. */
export function compileModuleToIR(source:string,fileName:string,host?:ModuleHost,scriptPrelude='',target:Target=requireHostTarget()):ModuleIR {
  host=withBuiltinModules(host??nodeModuleHost(target,{fileName,source}),target);
  // An optional classic script (such as a test harness) runs before the graph.
  const script=inPhase('dynamic-functions',()=>lowerDynamicFunctions(inPhase('parse',()=>parse(lex(scriptPrelude)))));
  const records=inPhase('module-graph',()=>loadModuleGraph(modulePath(fileName),source,host,builtinModuleRequests(script,host)));
  const main:Program={...script,module:true,source:scriptPrelude};
  const bound=inPhase('bind',()=>bind(main,records));
  return {...inPhase('lower',()=>lower(bound)),runtimePrelude:true};
}
export type CompileResult = {ok:true;image:Uint8Array;imports:string[];/** With printAsm: the program's functions as assembly text. */assembly?:string}|{ok:false;diagnostics:Diagnostic[]};
/** Target-independent ECMAScript frontend and IR lowering. Native targets share this path. */
export function compileToIR(source:string,fileName?:string,host?:ModuleHost,target:Target=requireHostTarget()):ModuleIR {
  // A script entry that is CommonJS (or an ES module by its syntax) is
  // compiled as the module graph it starts.
  if(fileName!==undefined&&(host===undefined||host instanceof NodeModuleHost)){
    const node=host??nodeModuleHost(target,{fileName,source}),path=modulePath(fileName);
    const format=node.format(path);
    if(format==='commonjs'||format==='json')return compileModuleToIR(node.mainSource(path),fileName,node,'',target);
    if(format==='module'&&(fileName.endsWith('.mjs')||entryHasModuleSyntax(source)))return compileModuleToIR(source,fileName,node,'',target);
    host=node;
  }
  host=withBuiltinModules(host??fileModuleHost,target);
  const parsed=inPhase('parse',()=>parse(lex(source)));
  const script=inPhase('eval',()=>lowerLiteralEval(inPhase('dynamic-functions',()=>lowerDynamicFunctions(parsed))));
  const requests=fileName===undefined?undefined:inPhase('module-requests',()=>moduleRequests(script));
  const dynamic=[...(requests===undefined?[]:[...requests.dynamic,...(requests.computed?host.candidates?.(modulePath(fileName!))??[]:[])]),...builtinModuleRequests(script,host)].filter((s,i,all)=>all.indexOf(s)===i);
  if(!dynamic.length){const bound=inPhase('bind',()=>bind(script));return {...inPhase('lower',()=>lower(bound)),runtimePrelude:true};}
  // Scripts may import() modules; the statically named targets are compiled in.
  const path=modulePath(fileName??'builtin-script.js'),records=inPhase('module-graph',()=>loadModuleGraph(path,null,host,dynamic));
  const scriptRequests=dynamic.flatMap(specifier=>{
    const resolved=host.resolve(specifier,path),index=records.findIndex(record=>record.path===resolved);
    return index<0?[]:[[specifier,index] as [string,number]];
  });
  const bound=inPhase('bind',()=>bind({...script,scriptPath:path,scriptRequests},records));
  return {...inPhase('lower',()=>lower(bound)),runtimePrelude:true};
}
/** PE resources from compile options; a GUI program gets a default manifest. */
function peResources(options:CompileOptions):PeResource[] {
  const fail=(message:string):never=>{throw new CompileError([{code:'E_RESOURCE',file:options.fileName,span:{start:0,end:0},message}]);};
  const wanted=options.icon!==undefined||options.manifest!==undefined||options.versionInfo!==undefined;
  if(wanted&&options.target!=='win32-x64')fail('Icons, manifests and version information require --target win32-x64');
  if(options.target!=='win32-x64')return [];
  const resources:PeResource[]=[];
  try{
    if(options.icon!==undefined)resources.push(...iconResources(options.icon));
    const manifest=options.manifest??(options.subsystem==='windows'?defaultManifest:undefined);
    if(manifest!==undefined)resources.push(manifestResource(manifest));
    if(options.versionInfo!==undefined)resources.push(versionResource(options.versionInfo));
  }catch(error){fail((error as Error).message);}
  return resources;
}
export function compile(source:string, options:CompileOptions):CompileResult {
  return options.target&&getTarget(options.target)?withNativeTarget(options.target,()=>compileOnTarget(source,options)):compileOnTarget(source,options);
}
function compileOnTarget(source:string,options:CompileOptions):CompileResult {
  try {
    if(options.target===undefined||!getTarget(options.target)||!supportedNativeTargets.includes(options.target))throw new CompileError([{code:'E_TARGET',file:options.fileName,span:{start:0,end:0},message:'Unsupported native target'}]);
    const descriptor=getTarget(options.target)!;
    if(options.subsystem!==undefined&&(options.subsystem!=='console'&&options.subsystem!=='windows'||options.target!=='win32-x64'))throw new CompileError([{code:'E_TARGET',file:options.fileName,span:{start:0,end:0},message:'The subsystem option requires --target win32-x64 and is console or windows'}]);
    // Test262 agents: each source becomes its own thread program in the image.
    // Every source lexed by the frontend (the program, its modules, agents and
    // compile-time eval/Function sources) decides which optional runtime
    // parts are linked; agents share one runtime with the main program.
    const moduleHost=options.moduleHost??(options.conditions?.length?nodeModuleHost(options.target,{fileName:options.fileName,source},options.conditions):undefined);
    const {result:{ir,agentIRs},usage}=collectSourceUsage(()=>({
      agentIRs:(options.agents??[]).map(agent=>compileToIR(agentHarness+agent,undefined,undefined,options.target)),
      ir:options.module?compileModuleToIR(source,options.fileName,moduleHost,options.scriptPrelude,options.target):compileToIR(source,options.fileName,moduleHost,options.target),
    }));
    const link=options.fullRuntime?fullRuntimeLink:usage;
    const agentPrograms=agentIRs.map(agentIR=>inPhase('codegen',()=>generate(agentIR,{agent:true,unhandledRejections:options.unhandledRejections,link,...(options.baseCache?{baseCache:options.baseCache}:{})})));
    const ffi=ir.ffi??[];
    // DLL imports exist in Windows images; other OS targets use raw kernel calls.
    const foreign=ffi.filter(d=>(d.dll==='syscall')!==(descriptor.os!=='win32'));
    if(foreign.length)throw new CompileError(foreign.map(d=>({code:'E_FFI_TARGET',file:options.fileName,span:d.span,message:d.dll==='syscall'?`System call declaration ${d.name} requires a Linux, Darwin or BSD target`:`FFI declaration ${d.dll}!${d.name} requires a Windows target`})));
    const resources=peResources(options);
    if(options.printAsm&&descriptor.arch!=='x64')throw new CompileError([{code:'E_TARGET',file:options.fileName,span:{start:0,end:0},message:'Assembly listings (--print-asm) require an x86-64 target'}]);
    const program=inPhase('codegen',()=>generate(ir,{unhandledRejections:options.unhandledRejections,realms:options.realms,agentPrograms,link,...(options.callStats?{callStats:true}:{}),...(options.printAsm?{listing:true}:{}),...(options.coverage?{coverage:{directory:options.coverage.directory,urls:[options.coverage.url,...(ir.scripts??[]).slice(1).map(scriptUrl)]}}:{}),...(options.baseCache?{baseCache:options.baseCache}:{})}));
    const image=inPhase('link',()=>descriptor.os==='freebsd'||descriptor.os==='openbsd'?linkBsd(program,descriptor.os):descriptor.os==='linux'?linkLinux(program,descriptor.arch):descriptor.os==='darwin'?linkDarwin(program,descriptor.arch):options.target==='win32-arm64'?linkWindowsArm64(program,{subsystem:options.subsystem,resources}):linkPe(program,{subsystem:options.subsystem,resources}));
    return {ok:true,image,imports:descriptor.format==='pe'?program.imports.filter(i=>i.dll!=='syscall').map(i=>i.dll+'!'+i.name):[],...(program.assembly!==undefined?{assembly:program.assembly}:{})};
  } catch(caught) {
    // A failure outside the named phases is a compiler bug too (E_INTERNAL).
    const error=caught instanceof CompileError?caught:internalError('compile',caught instanceof Error?caught.message:String(caught));
    // A diagnostic from an imported module keeps that module's path: the
    // file name as given for the entry, a host path for the default host
    // (canonical '/C:/x' is C:\x on Windows), the host's own path otherwise.
    const entry=options.module?modulePath(options.fileName):undefined;
    const file=(path:string)=>!path||path===entry?options.fileName:!options.moduleHost&&/^\/[A-Za-z]:\//.test(path)?path.slice(1).replaceAll('/','\\'):path;
    return {ok:false,diagnostics:error.diagnostics.map(d=>({...d,file:file(d.file)}))};
  }
}
