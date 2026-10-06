import {compileModuleToIR,compileToIR} from '../compiler.js';
import {collectSourceUsage} from '../frontend/lexer.js';
import {getTarget,type Target} from '../target.js';
import {generate} from './x64/codegen.js';
import {withNativeTarget} from './machine/context.js';
import {linkPe} from './pe/writer.js';
import {linkWindowsArm64} from './arm64/windows.js';
import {linkLinux} from './linux/index.js';
import {linkDarwin} from './darwin/index.js';
import {linkBsd} from './bsd/index.js';
import {processSignalDeliveryProbe,processSignalUnreferencedProbe,processSignalRestorationProbe,processConsoleSignalProbe} from '../runtime/process-signals-probe.js';

/** Independent OS delivery and lifetime checks; multiplicity is recorded by Node CI. */
export function processSignalPlatformProbes(target:Target):{name:string;image:Uint8Array;expected:string;status?:number;signal?:string;minimalEnvironment:boolean}[]{
 const windows=target.startsWith('win32-');
 const cases=windows?[
  {name:'process-signals-console',source:processConsoleSignalProbe,expected:'SIGBREAK\n',module:true,status:0,signal:undefined},
  {name:'process-signals-unreferenced',source:processSignalUnreferencedProbe,expected:'registered\n',module:false,status:0,signal:undefined},
 ]:[
  {name:'process-signals-delivery',source:processSignalDeliveryProbe,expected:'SIGTERM 1 0\ndone 1\n',module:false,status:0,signal:undefined},
  {name:'process-signals-unreferenced',source:processSignalUnreferencedProbe,expected:'registered\n',module:false,status:0,signal:undefined},
  {name:'process-signals-restoration',source:processSignalRestorationProbe,expected:'',module:false,status:143,signal:'SIGTERM'},
 ];
 return cases.map(probe=>{
  const {result:ir,usage}=collectSourceUsage(()=>probe.module?compileModuleToIR(probe.source,probe.name+'.mjs',undefined,'',target):compileToIR(probe.source,probe.name+'.js',undefined,target));
  const program=withNativeTarget(target,()=>generate(ir,{gcStress:true,link:usage})),descriptor=getTarget(target)!;
  const image=descriptor.os==='win32'?(target==='win32-arm64'?linkWindowsArm64(program):linkPe(program)):descriptor.os==='linux'?linkLinux(program,descriptor.arch):descriptor.os==='darwin'?linkDarwin(program,descriptor.arch):linkBsd(program,descriptor.os);
  return {name:probe.name,image,expected:probe.expected,status:probe.status,...(probe.signal?{signal:probe.signal}:{}),minimalEnvironment:true};
 });
}
