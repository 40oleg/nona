import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createContext,runInContext} from 'node:vm';
import {processPreludeForTarget,processHostDeclarations} from '../src/runtime/process-source.js';
import {timersPreludeSource} from '../src/runtime/timers-source.js';
import {compile,compileToIR} from '../src/compiler.js';
import {supportedNativeTargets} from '../src/target.js';
import {processSignalDeliveryProbe,processSignalUnreferencedProbe,processSignalRestorationProbe} from '../src/runtime/process-signals-probe.js';
import {withNativeTarget} from '../src/backend/machine/context.js';
import {generate} from '../src/backend/x64/codegen.js';
import {linkLinux} from '../src/backend/linux/index.js';

function signalRuntime(){
 let clock=0;const actions:number[]=[],pending:number[]=[],output:string[]=[],host:Record<string,unknown>={};
 for(const {name} of processHostDeclarations('linux-x64'))host['__nonaHost_'+name]=()=>0;
 Object.assign(host,{__nonaHost_sys_open:()=>-2,__nonaHost_sys_getpid:()=>123,__nonaHost_sys_getppid:()=>1,__nonaHost_signalHandlerAddress:()=>4096,__nonaHost_signalRestorerAddress:()=>8192,__nonaHost_signalAction:(number:number,action:Uint32Array)=>{actions.push(action[0]?number:-number);return 0},__nonaHost_signalPoll:()=>pending.shift()??0});
 const context=createContext({...host,TextEncoder,TextDecoder,console:{log:(...args:unknown[])=>output.push(args.join(' '))},__nonaProcessNow:()=>clock,__nonaHostNow:()=>clock,__nonaHostWait:(delay:number)=>{clock+=delay},__nonaPromiseDrainJobs(){},__nonaRegexpVm:{arrayBufferCopy:(source:ArrayBuffer,target:ArrayBuffer,start:number,count:number,offset:number)=>new Uint8Array(target,offset,count).set(new Uint8Array(source,start,count))}});
 runInContext(timersPreludeSource,context);runInContext(processPreludeForTarget('linux-x64'),context);return {context,actions,pending,output};
}
test('actual process listeners install, consume once and restore native signal disposition',()=>{
 const f=signalRuntime();runInContext('process.once("SIGTERM",name=>console.log(name,process.listenerCount(name)))',f.context);assert.deepEqual(f.actions,[15]);f.pending.push(15);runInContext('__nonaRegexpVm.pumpSignals()',f.context);assert.deepEqual(f.actions,[15,-15]);assert.deepEqual(f.output,['SIGTERM 0']);assert.equal(runInContext('__nonaRegexpVm.hasSignalWatches()',f.context),false);
});
test('signal polling observes a live timer but signal listeners do not keep the loop alive',()=>{
 const f=signalRuntime();runInContext('process.on("SIGTERM",name=>console.log(name));setTimeout(()=>console.log("timer"),20)',f.context);f.pending.push(15);runInContext('__nonaPromiseDrainJobs()',f.context);assert.deepEqual(f.output,['SIGTERM','timer']);
 const idle=signalRuntime();runInContext('process.on("SIGTERM",()=>console.log("unexpected"));__nonaPromiseDrainJobs()',idle.context);assert.deepEqual(idle.output,[]);
});
test('native dispatch uses captured process methods after public replacements',()=>{
 const f=signalRuntime();runInContext('process.once("SIGTERM",name=>console.log(name));process.listenerCount=function(){throw Error("public count")};process.emit=function(){throw Error("public emit")}',f.context);f.pending.push(15);runInContext('__nonaRegexpVm.pumpSignals()',f.context);assert.deepEqual(f.output,['SIGTERM']);assert.deepEqual(f.actions,[15,-15]);
});
test('report signal watch shares native registration and survives listener removal',()=>{
 const f=signalRuntime();runInContext('process.report.reportOnSignal=true;process.on("SIGUSR2",()=>{});process.removeAllListeners("SIGUSR2")',f.context);assert.deepEqual(f.actions,[12]);assert.equal(runInContext('__nonaRegexpVm.hasSignalWatches()',f.context),true);
 runInContext('process.report.reportOnSignal=false',f.context);assert.deepEqual(f.actions,[12,-12]);assert.equal(runInContext('__nonaRegexpVm.hasSignalWatches()',f.context),false);
});
test('changing a report signal preserves an existing public watch and disabling restores defaults',()=>{
 const f=signalRuntime();runInContext('process.on("SIGUSR2",()=>{});process.report.reportOnSignal=true;process.report.signal="SIGTERM"',f.context);assert.deepEqual(f.actions,[12,15]);
 runInContext('process.report.reportOnSignal=false;process.removeAllListeners("SIGUSR2")',f.context);assert.deepEqual(f.actions,[12,15,-15,-12]);
});
for(const target of supportedNativeTargets)test(`signal callbacks and lifecycle probes compile for ${target}`,()=>{
 for(const source of [processSignalDeliveryProbe,processSignalUnreferencedProbe,processSignalRestorationProbe]){const result=compile(source,{fileName:'process-signals.js',target});assert.ok(result.ok,result.ok?'':JSON.stringify(result.diagnostics))}
});
test('Windows-produced process signal image retains genuine Linux handler and links ELF',()=>withNativeTarget('win32-x64',()=>{
 const program=generate(compileToIR(processSignalDeliveryProbe,undefined,undefined,'win32-x64'));assert.ok(linkLinux(program).length>0);
}));
