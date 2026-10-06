import {installProcessDependencies} from './helpers/process-prelude.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RuntimeBuilder} from '../src/runtime/abi.js';
import {emitPosixProcessAbort} from '../src/runtime/process-abort.js';
import {withNativeTarget} from '../src/backend/machine/context.js';
import type {Target} from '../src/target.js';
import {processAbortProbeSource} from '../src/backend/process-abort-probe.js';
import {compile,compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkDarwin} from '../src/backend/darwin/index.js';
import {supportedNativeTargets} from '../src/target.js';
import {createContext,runInContext} from 'node:vm';
import {processPreludeForTarget} from '../src/runtime/process-source.js';

const calls:Partial<Record<Target,number[]>>={
 'linux-x64':[13,14,39,186,234,62,231],
 'linux-arm64':[134,135,172,178,131,129,94],
 'freebsd-x64':[416,340,20,37,37,1],
 'openbsd-x64':[46,48,20,122,122,1],
};
for(const target of ['linux-x64','linux-arm64','freebsd-x64','openbsd-x64','darwin-x64','darwin-arm64'] as const)test(`abort emits actual terminal OS operations for ${target}`,()=>withNativeTarget(target,()=>{
 const b=new RuntimeBuilder();emitPosixProcessAbort(b,target);const fragment=b.bundle.fragments[0]!;
 assert.equal(fragment.name,'process.abort.code');
 assert.ok(!fragment.fixups.some(f=>/rt\.(alloc|gc|fail)|dispatchUncaught|exitCallback/.test(f.target)));
 if(target.startsWith('darwin-')){
  assert.deepEqual(b.bundle.imports,[{dll:'/usr/lib/libSystem.B.dylib',name:'abort',symbol:'process.abort.native'}]);
  assert.ok(fragment.fixups.some(f=>f.target==='libSystem.abort'));
 }else assert.deepEqual(fragment.syscalls?.map(call=>call.number),calls[target]);
}));
for(const target of supportedNativeTargets)test(`abrupt lifecycle child fixture compiles for ${target}`,()=>{
 const result=compile(processAbortProbeSource,{fileName:'process-abort.js',target});assert.ok(result.ok,result.ok?'':JSON.stringify(result.diagnostics));
});
test('public abort delegates directly to the terminal native boundary without JS exit dispatch',()=>{
 const trace:string[]=[],terminal={};
 const context=createContext({TextEncoder,TextDecoder,__nonaRegexpVm:{arrayBufferCopy:(source:ArrayBuffer,target:ArrayBuffer,start:number,count:number,offset:number)=>new Uint8Array(target,offset,count).set(new Uint8Array(source,start,count))},__nonaProcessNow:()=>0,__nonaPromiseDrainJobs(){},
  __nonaHost_GetCommandLineW:()=>0,__nonaHost_sys_open:()=>-2,__nonaHost_sys_readlink:()=>0,__nonaHost_sys_getpid:()=>123,__nonaHost_sys_getppid:()=>1,__nonaHost_replaceEnvironment:()=>{},__nonaHost_environmentVector:()=>0,
  __nonaHost_abort:()=>{trace.push('native');throw terminal},console:{log:(...args:unknown[])=>trace.push(args.join(' '))}});
 installProcessDependencies(context);runInContext(processPreludeForTarget('linux-x64'),context);
 runInContext('process.on("exit",()=>console.log("unexpected exit"));process.on("beforeExit",()=>console.log("unexpected beforeExit"));process.setUncaughtExceptionCaptureCallback(()=>console.log("unexpected capture"));process.nextTick(()=>console.log("unexpected tick"))',context);
 assert.equal(runInContext('process.abort.name+":"+process.abort.length',context),'abort:0');
 assert.throws(()=>runInContext('process.abort()',context),error=>error===terminal);assert.deepEqual(trace,['native']);
});
test('Darwin repeated native abort declarations share one native import cell',()=>{
 for(const target of ['darwin-x64','darwin-arm64'] as const){
  withNativeTarget(target,()=>{const program=generate(compileToIR('process.abort()',undefined,undefined,target));program.imports.push({dll:'/usr/lib/libSystem.B.dylib',name:'abort',symbol:'abort.test.duplicate'});assert.ok(linkDarwin(program,target==='darwin-x64'?'x64':'arm64').length>0)});
 }
});

test('Windows abort uses abrupt native ExitProcess134 without lifecycle dispatch',()=>{
 const trace:unknown[]=[],terminal={},context=createContext({windows:true,host:{ExitProcess:(code:number)=>{trace.push(code);throw terminal}},value:(_name:string,fn:()=>void)=>{(context as Record<string,unknown>).abort=fn}});
 const source=processPreludeForTarget('win32-arm64'),start=source.indexOf("value('abort',function abort()"),end=source.indexOf('});',start)+2;
 assert.ok(start>=0);runInContext(source.slice(start,end+1),context);assert.throws(()=>runInContext('abort()',context),error=>error===terminal);assert.deepEqual(trace,[134]);assert.equal(runInContext('abort.name+":"+abort.length',context),'abort:0');
});
