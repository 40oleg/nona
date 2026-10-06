import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {EventEmitter} from 'node:events';
import {processSignalsSource} from '../src/runtime/process-signals-source.js';
import {emitProcessSignals,processSignalHostDeclarations} from '../src/runtime/process-signals.js';
import {RuntimeBuilder} from '../src/runtime/abi.js';
import {withNativeTarget} from '../src/backend/machine/context.js';
import {supportedNativeTargets} from '../src/target.js';

function fixture(platform='linux'){
 const process=new EventEmitter(),calls:unknown[][]=[],pending:number[]=[],vm:{pumpSignals?:()=>void;hasSignalWatches?:()=>boolean}={};
 const host={signalAcknowledge:(number:number)=>calls.push(['ack',number]),signalHandlerAddress:()=>4096,consoleHandlerAddress:()=>4096,signalRestorerAddress:()=>8192,signalEnable:(...args:unknown[])=>calls.push(['enable',...args]),signalPoll:()=>pending.shift()??0,signalAction:(number:number,action:Uint32Array,previous:Uint32Array|null)=>{calls.push(['action',number,...Array.from(action)]);if(previous){previous[0]=1234;previous[1]=5678}return 0},signalQueue:()=>7,signalFcntl:()=>0,signalEvent:(...args:unknown[])=>{calls.push(['event',...args]);return 0},sys_close:(fd:number)=>calls.push(['close',fd]),SetConsoleCtrlHandler:(...args:unknown[])=>{calls.push(['console',...args]);return true}};
 const context={processMain:true,signalListenerCount:process.listenerCount,signalEmit:process.emit,apply:Reflect.apply,finalizationPush:Array.prototype.push,process,host,platform,windows:platform==='win32',signals:{SIGABRT:6,SIGINT:2,SIGTERM:15,SIGCHLD:20,SIGTTIN:21},__nonaRegexpVm:vm,hostError:(op:string,code:number)=>Object.assign(new Error(op),{code}),Uint32Array};
 const hooks=runInNewContext(processSignalsSource+'({change:signalListenerChanged,prepare:signalPrepareExec,restore:signalRestoreExec})',context);
 process.on('newListener',(name:string)=>hooks.change(name,true));process.on('removeListener',(name:string)=>hooks.change(name,false));
 return {process,calls,pending,vm,hooks,host,context};
}
test('first/last listener transitions install once, drain real numbers and remove once watches',()=>{
 const f=fixture();let fired=0;const callback=(name:string)=>{assert.equal(name,'SIGTERM');fired++};
 f.hooks.change('SIGTERM',true);f.process.once('SIGTERM',callback);f.hooks.change('SIGTERM',true);
 assert.equal(f.calls.filter(c=>c[0]==='action').length,1);assert.equal(f.vm.hasSignalWatches!(),true);
 f.pending.push(15);f.vm.pumpSignals!();assert.equal(fired,1);f.hooks.change('SIGTERM',false);
 assert.equal(f.vm.hasSignalWatches!(),false);assert.deepEqual(f.calls.filter(c=>c[0]==='action')[1]!.slice(0,4),['action',15,1234,5678]);
});
test('Linux action uses checked native handler/restorer and avoids mask changes',()=>{
 const f=fixture();f.hooks.change('SIGINT',true);const action=f.calls.find(c=>c[0]==='action')!;assert.deepEqual(action.slice(2,8),[4096,0,0x14000000,0,8192,0]);f.hooks.prepare();f.hooks.restore();assert.equal(f.calls.filter(c=>c[0]==='action').length,1);
});
test('Linux ARM signals use a separate native stack instead of overwriting the logical JS stack',()=>{
 const f=fixture();Object.assign(f.host,{signalStackAddress:()=>0x123456789,signalStack:(stack:Uint32Array)=>{f.calls.push(['stack',...Array.from(stack)]);return 0}});
 f.hooks.change('SIGINT',true);f.hooks.change('SIGTERM',true);
 assert.deepEqual(f.calls[0],['stack',0x23456789,1,0,0,65536,0]);
 assert.equal(f.calls.filter(c=>c[0]==='stack').length,1);
 assert.equal(f.calls.find(c=>c[0]==='action')![4],0x1c000000);
});
test('BSD exec preparation restores exact action and failed exec reinstalls watcher',()=>{
 const f=fixture('freebsd');f.hooks.change('SIGTERM',true);f.process.on('SIGTERM',()=>{});f.hooks.prepare();assert.equal(f.calls.filter(c=>c[0]==='action')[1]![2],1234);f.hooks.restore();assert.equal(f.calls.filter(c=>c[0]==='action')[2]![2],1);f.process.removeAllListeners();f.hooks.change('SIGTERM',false);assert.equal(f.calls.at(-1)![0],'close');
});
test('Windows console registration is shared and ordinary unsupported listeners do not keep alive',()=>{
 const f=fixture('win32');f.hooks.change('SIGTERM',true);assert.equal(f.vm.hasSignalWatches!(),false);f.hooks.change('SIGINT',true);f.process.on('SIGINT',()=>{});f.hooks.change('SIGBREAK',true);f.process.on('SIGBREAK',()=>{});assert.equal(f.calls.filter(c=>c[0]==='console').length,1);f.process.removeAllListeners('SIGINT');f.hooks.change('SIGINT',false);f.process.removeAllListeners('SIGBREAK');f.hooks.change('SIGBREAK',false);assert.equal(f.calls.filter(c=>c[0]==='console').length,2);
});
test('Windows callback number21 uses SIGBREAK despite the initial BSD-style table',()=>{
 const f=fixture('win32');let received='';f.hooks.change('SIGBREAK',true);f.process.on('SIGBREAK',(name:string)=>received=name);f.pending.push(21);f.vm.pumpSignals!();assert.equal(received,'SIGBREAK');
});
test('native enabled flag is armed before action installation',()=>{
 const f=fixture();f.hooks.change('SIGTERM',true);assert.deepEqual(f.calls[0],['enable',15,1]);assert.equal(f.calls[1]![0],'action');assert.equal(f.calls.filter(c=>c[0]==='enable').length,1);
});
test('failed native sigaction rolls back enabled state and registration',()=>{
 const f=fixture();f.host.signalAction=()=>-22;assert.throws(()=>f.process.on('SIGTERM',()=>{}),{code:22});assert.equal(f.process.listenerCount('SIGTERM'),0);assert.equal(f.vm.hasSignalWatches!(),false);assert.deepEqual(f.calls,[['enable',15,1],['enable',15,0]]);
});
test('aliases share the native watch and dispatch their registered names',()=>{
 const f=fixture(),received:string[]=[];f.process.once('SIGIOT',(name:string)=>received.push(name));const callback=(name:string)=>received.push(name);f.process.on('SIGABRT',callback);assert.equal(f.calls.filter(c=>c[0]==='action').length,1);f.pending.push(6);f.vm.pumpSignals!();assert.deepEqual(received,['SIGABRT','SIGIOT']);assert.equal(f.vm.hasSignalWatches!(),true);f.process.off('SIGABRT',callback);assert.equal(f.vm.hasSignalWatches!(),false);
});
test('console close acknowledgement follows JS dispatch even when callback throws',()=>{
 const f=fixture('win32');f.process.on('SIGHUP',()=>{f.calls.push(['callback']);throw new Error('callback')});f.pending.push(1);assert.throws(()=>f.vm.pumpSignals!(),/callback/);assert.deepEqual(f.calls.slice(-2),[['callback'],['ack',1]]);
});
test('agent listeners remain manual events without replacing process-wide disposition',()=>{
 const f=fixture();f.context.processMain=false;let hits=0;f.process.on('SIGTERM',()=>hits++);assert.equal(f.calls.length,0);f.process.emit('SIGTERM');assert.equal(hits,1);
});
for(const target of supportedNativeTargets)test('signal leaf emission and OS declarations '+target,()=>withNativeTarget(target,()=>{
 const builder=new RuntimeBuilder();emitProcessSignals(builder,target);assert.ok(builder.bundle.fragments.some(f=>f.name==='process.signalHandler'));assert.ok(builder.bundle.fragments.some(f=>f.name==='process.signalPoll.code'));assert.ok(processSignalHostDeclarations(target).some(d=>d[0]==='signalPoll'));
 const handler=builder.bundle.fragments.find(f=>f.name==='process.signalHandler')!;if(target.endsWith('arm64'))assert.deepEqual(Array.from(handler.bytes.slice(-4)),[0xc0,0x03,0x5f,0xd6]);if(target.startsWith('linux-'))assert.ok(builder.bundle.fragments.some(f=>f.name==='process.signalRestorer'));
 if(target==='win32-x64'){assert.ok(builder.bundle.fragments.some(f=>f.name==='process.consoleHandler'));assert.ok(builder.bundle.fragments.some(f=>f.name==='process.signalRestorer'));assert.ok(processSignalHostDeclarations(target).some(d=>d[0]==='signalAction'&&d[2]==='13'));assert.deepEqual(Array.from(handler.bytes.slice(0,3)),[0x49,0x89,0xfa]);const console=builder.bundle.fragments.find(f=>f.name==='process.consoleHandler')!;assert.deepEqual(Array.from(console.bytes.slice(4,7)),[0x49,0x89,0xca])}
}));
