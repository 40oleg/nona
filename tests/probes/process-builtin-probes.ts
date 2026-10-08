import {compileModuleToIR,compileToIR} from '../../src/compiler.js';
import {collectSourceUsage} from '../../src/frontend/lexer.js';
import {getTarget,type Target} from '../../src/target.js';
import {generate} from '../../src/backend/x64/codegen.js';
import {withNativeTarget} from '../../src/backend/machine/context.js';
import {linkPe} from '../../src/backend/pe/writer.js';
import {linkWindowsArm64} from '../../src/backend/arm64/windows.js';
import {linkLinux} from '../../src/backend/linux/index.js';
import {linkDarwin} from '../../src/backend/darwin/index.js';
import {linkBsd} from '../../src/backend/bsd/index.js';
import {resolveRelative,type ModuleHost} from '../../src/frontend/modules.js';

/** Real provider defaults and namespace identity through the public process API. */
export function processBuiltinProbeCases(target:Target):{name:string;source:string;module:boolean;expected:string;fileName?:string;host?:ModuleHost}[] {
 const os=getTarget(target)!.os,filesystem=true;
 const literal=String.raw`
import p,{getBuiltinModule as get} from 'node:process';
import * as nodeProcess from 'node:process';
import * as nonaProcess from 'nona:process';
console.log('process',get('process')===p,get('node:process')===nodeProcess.default,nodeProcess===nonaProcess,get===p.getBuiltinModule);
`+(filesystem?String.raw`
import * as fs from 'node:fs';
import * as nonaFs from 'nona:fs';
console.log('fs',get('fs')===fs.default,get('node:fs')===fs.default,fs===nonaFs,get('fs').readFileSync===fs.readFileSync);
`:"console.log('fs',typeof get('fs'));\n")+String.raw`
console.log('unknown',get('node:missing')===undefined,get('NODE:process')===undefined,get('constructor')===undefined);
`;
 const dynamic=String.raw`
const get=process.getBuiltinModule;
console.log('dynamic',get('process')===process,get('node:process')===process,typeof get('fs'));
const ffi=get('nona:ffi');console.log('namespace',ffi===get('nona:ffi'),typeof ffi.define,typeof ffi.lastError);
let count=0;for(const id of [undefined,null,1,true,{},new String('process'),Symbol('process')])try{get(id)}catch(e){if(e instanceof TypeError&&e.code==='ERR_INVALID_ARG_TYPE')count++}
console.log('validation',count,get('toString')===undefined,get('__proto__')===undefined);
`+(os==='win32'?"console.log('win32',get('nona:win32').GetCurrentProcessId()===process.pid);\n":"console.log('win32',get('nona:win32')===undefined);\n");
 const escaped=String.raw`
function lookup(p,key){return p[key]('process')}
const key='getBuiltinModule',rootKey='pro'+'cess';
console.log('escaped',lookup(process,key)===process,lookup(globalThis[rootKey],key)===process);
const box={p:process},roots=[globalThis];
console.log('aggregate',box.p[key]('process')===process,roots[0][rootKey][key]('process')===process);
console.log('reflected',Reflect.get(globalThis,rootKey)[key]('process')===process);
`;
 return [
  {name:"process-builtin-00-startup",source:'console.log("startup platform",process.platform);',module:false,expected:"startup platform "+os+"\n"},
  {name:"process-builtin-01-inventory",source:'const lookup=process.getBuiltinModule;console.log("inventory identity",lookup("process")===process);',module:false,expected:"inventory identity true\n"},
  {name:'process-builtin-literal',source:literal,module:true,expected:'process true true true true\n'+(filesystem?'fs true true true true\n':'fs undefined\n')+'unknown true true true\n'},
  {name:'process-builtin-dynamic',source:dynamic,module:false,expected:'dynamic true true '+(filesystem?'object':'undefined')+'\nnamespace true function function\nvalidation 7 true true\nwin32 true\n'},
 {name:'process-builtin-escaped',source:escaped,module:false,expected:'escaped true true\naggregate true true\nreflected true\n'},
  {name:'process-builtin-folded',source:"console.log('folded',typeof globalThis['pro'+'cess']['get'+'BuiltinModule']('fs'),globalThis['pro'+'cess']['get'+'BuiltinModule']('fs')===globalThis['pro'+'cess']['get'+'BuiltinModule']('fs'));",module:false,expected:'folded '+(filesystem?'object':'undefined')+' true\n'},
  {name:'process-builtin-cycle',source:'import {seen,seenValue} from "./b.mjs";import * as c from "./c.mjs";export * as sibling from "./c.mjs";console.log("cycle",seen===c,seenValue===1);',module:true,expected:'cycle true true\n',fileName:'/process-cycle/a.mjs',host:{resolve:resolveRelative,read(path){return path.replaceAll('\\','/').endsWith('/process-cycle/b.mjs')?'import * as a from "./a.mjs";export const seen=a.sibling,seenValue=a.sibling.value();':path.replaceAll('\\','/').endsWith('/process-cycle/c.mjs')?'export function value(){return 1}':undefined}}},
 ];
}

export function processBuiltinProbes(target:Target):{name:string;image:Uint8Array;expected:string;minimalEnvironment:boolean;timeoutMs:number}[] {
 return processBuiltinProbeCases(target).map(probe=>{
  const {result:ir,usage}=collectSourceUsage(()=>probe.module?compileModuleToIR(probe.source,probe.fileName??probe.name+'.mjs',probe.host,'',target):compileToIR(probe.source,probe.name+'.js',undefined,target));
  const program=withNativeTarget(target,()=>generate(ir,{gcStress:true,link:usage})),descriptor=getTarget(target)!;
  const image=descriptor.os==='win32'?(target==='win32-arm64'?linkWindowsArm64(program):linkPe(program)):descriptor.os==='linux'?linkLinux(program,descriptor.arch):descriptor.os==='darwin'?linkDarwin(program,descriptor.arch):linkBsd(program,descriptor.os);
  return {name:probe.name,image,expected:probe.expected,minimalEnvironment:true,timeoutMs:60000};
 });
}
