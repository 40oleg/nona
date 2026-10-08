import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O} from './object-layout.js';
import {HeapKind,HeapLayout as H} from './heap-layout.js';
import {ArrayBufferLayout} from './array-buffer.js';
import {SharedArrayBufferKind} from './shared-array-buffer.js';
import type {Assembler} from '../backend/x64/assembler.js';

/*
 * Test262 agents run as threads. Every agent is a separately compiled program
 * with its own heap and runtime copy; only the "agent." data below is shared
 * by all of them (see backend/agents.ts), together with SharedArrayBuffer
 * backing stores, which live outside every GC heap.
 *
 * agent.lock        spin lock for the waiter list, reports and the mailbox
 * agent.waiters     FIFO list of Atomics.wait records {next, address, woken}
 * agent.reports     FIFO list of report blocks {next, length, UTF-16 chars}
 * agent.mailbox     broadcast {sequence, bytes, byteLength, number(f64)}
 * agent.started     number of started agents; agent.acks: received broadcasts
 */
export const agentSharedData=['agent.lock','agent.waiters','agent.reports','agent.mailbox','agent.started','agent.acks'];
export const agentRoots:string[]=[];

export function agentLock(a:Assembler):void {
 const spin=a.unique('agentLock');a.label(spin);
 a.mov('rax',1);a.lea('r11',{rip:'agent.lock'});a.atomicExchange({base:'r11'},'rax',64);a.test('rax','rax');a.jcc('ne',spin);
}
export function agentUnlock(a:Assembler):void {
 a.mov('rax',0);a.lea('r11',{rip:'agent.lock'});a.atomicExchange({base:'r11'},'rax',64);
}

export function emitAgents(b:RuntimeBuilder):void {
 for(const name of ['agent.lock','agent.waiters','agent.reports','agent.started','agent.acks'])b.data(name,new Uint8Array(8),'.data');
 b.data('agent.mailbox',new Uint8Array(32),'.data');
 b.bundle.imports.push({dll:'KERNELBASE.dll',name:'WakeByAddressSingle',symbol:'WakeByAddressSingle'});
 b.bundle.imports.push({dll:'KERNEL32.dll',name:'CreateThread',symbol:'CreateThread'});
 b.bundle.imports.push({dll:'KERNEL32.dll',name:'Sleep',symbol:'Sleep'});
 // This agent's receiveBroadcast callback (a GC root of this program).
 b.data('rt.agentCallback',new Uint8Array(16),'.data');
 // The two bindings of the JS runtime prelude, kept apart from user globals,
 // then this realm's intrinsic %Promise.prototype% (function-source.ts).
 b.data('rt.preludeGlobals',new Uint8Array(48),'.data');
 // RCX output; argv[0] callback.
 b.fn('rt.agentReceiveBroadcast.code',40,a=>{
  a.test('rdx','rdx');failIf(a,'e','rt.throwTypeError');
  for(const offset of [0,8]){a.load('rax',{base:'r8',disp:offset});a.store({rip:'rt.agentCallback',addend:offset},'rax');}
  a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');
 });
 // argv[0]: a string. Copies it into a shared report block.
 b.fn('rt.agentReport.code',56,a=>{
  a.store(slot(40),'rcx');a.test('rdx','rdx');failIf(a,'e','rt.throwTypeError');
  a.load('rax',{base:'r8'});a.cmp('rax',4);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',{base:'r8',disp:8});a.store(slot(48),'r10');
  a.load('r8',{base:'r10'});a.shl('r8',1);a.add('r8',16);a.load('rcx',{rip:'rt.heap'});a.mov('rdx',0);a.callImport('HeapAlloc');a.test('rax','rax');failIf(a,'e');
  a.mov('r10',0);a.store({base:'rax'},'r10');a.load('r10',slot(48));a.load('r8',{base:'r10'});a.store({base:'rax',disp:8},'r8');
  a.lea('r9',{base:'r10',disp:8});a.lea('r11',{base:'rax',disp:16});
  const copy=a.unique('copy'),copied=a.unique('copied');a.label(copy);a.test('r8','r8');a.jcc('e',copied);
  a.load('rdx',{base:'r9'},16);a.store({base:'r11'},'rdx',16);a.add('r9',2);a.add('r11',2);a.sub('r8',1);a.jmp(copy);a.label(copied);
  a.mov('rcx','rax');agentLock(a);
  a.lea('r10',{rip:'agent.reports'});const walk=a.unique('walk'),append=a.unique('append');
  a.label(walk);a.load('rax',{base:'r10'});a.test('rax','rax');a.jcc('e',append);a.mov('r10','rax');a.jmp(walk);
  a.label(append);a.store({base:'r10'},'rcx');agentUnlock(a);
  a.load('rcx',slot(40));a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');
 });
 // Returns the next report as a string, or null.
 b.fn('rt.agentGetReport.code',56,a=>{
  a.store(slot(40),'rcx');agentLock(a);
  a.load('rax',{rip:'agent.reports'});const none=a.unique('none'),done=a.unique('done');a.test('rax','rax');a.jcc('e',none);
  a.load('r10',{base:'rax'});a.store({rip:'agent.reports'},'r10');a.store(slot(48),'rax');agentUnlock(a);
  a.load('r10',slot(48));a.load('rcx',{base:'r10',disp:8});a.shl('rcx',1);a.add('rcx',8);a.call('rt.alloc');
  a.load('r10',slot(48));a.load('r8',{base:'r10',disp:8});a.store({base:'rax'},'r8');
  a.lea('r9',{base:'r10',disp:16});a.lea('r11',{base:'rax',disp:8});
  const copy=a.unique('copy'),copied=a.unique('copied');a.label(copy);a.test('r8','r8');a.jcc('e',copied);
  a.load('rdx',{base:'r9'},16);a.store({base:'r11'},'rdx',16);a.add('r9',2);a.add('r11',2);a.sub('r8',1);a.jmp(copy);a.label(copied);
  a.load('rcx',slot(40));a.mov('r10',4);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');a.jmp(done);
  a.label(none);agentUnlock(a);a.load('rcx',slot(40));a.mov('rax',1);a.store({base:'rcx'},'rax');a.mov('rax',0);a.store({base:'rcx',disp:8},'rax');
  a.label(done);
 });
 // argv[0]: milliseconds (a Number).
 b.fn('rt.agentSleep.code',56,a=>{
  a.store(slot(40),'rcx');a.mov('rcx',0);a.test('rdx','rdx');const call=a.unique('call');a.jcc('e',call);
  a.load('rax',{base:'r8'});a.cmp('rax',3);a.jcc('ne',call);a.movsd('xmm0',{base:'r8',disp:8});a.cvttsd2si('rcx','xmm0');
  a.test('rcx','rcx');a.jcc('ns',call);a.mov('rcx',0);a.label(call);a.callImport('Sleep');
  a.load('rcx',slot(40));a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');
 });
 // argv[0]: source string index (Number) of a compiled agent; the codegen
 // supplies agent.entries, a table of thread entry points.
 b.fn('rt.agentStart.code',88,a=>{
  a.store(slot(80),'rcx');a.test('rdx','rdx');failIf(a,'e','rt.throwTypeError');
  a.load('rax',{base:'r8'});a.cmp('rax',3);failIf(a,'ne','rt.throwTypeError');a.movsd('xmm0',{base:'r8',disp:8});a.cvttsd2si('rax','xmm0');
  a.load('r10',{rip:'agent.entryCount'});a.cmp('rax','r10');failIf(a,'ae','rt.throwRangeError');
  a.shl('rax',3);a.lea('r10',{rip:'agent.entries'});a.add('r10','rax');a.load('r8',{base:'r10'});
  a.lea('r11',{rip:'agent.started'});a.mov('rax',1);a.atomicXadd({base:'r11'},'rax',64);
  a.mov('rax',0);a.store(slot(32),'rax');a.store(slot(40),'rax');
  a.mov('rcx',0);a.mov('rdx',64*1024*1024);a.mov('r9',0);a.mov('rax',0x10000);a.store(slot(32),'rax');a.callImport('CreateThread');
  a.test('rax','rax');failIf(a,'e');
  a.load('rcx',slot(80));a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');
 });
 // argv[0]: SharedArrayBuffer, argv[1]: Number. Waits for every agent's receipt.
 b.fn('rt.agentBroadcast.code',56,a=>{
  a.store(slot(40),'rcx');a.test('rdx','rdx');failIf(a,'e','rt.throwTypeError');
  a.load('rax',{base:'r8'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',{base:'r8',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',SharedArrayBufferKind);failIf(a,'ne','rt.throwTypeError');
  a.mov('r9',0);a.cmp('rdx',2);const noNumber=a.unique('noNumber');a.jcc('b',noNumber);a.load('rax',{base:'r8',disp:16});a.cmp('rax',3);a.jcc('ne',noNumber);a.load('r9',{base:'r8',disp:24});a.label(noNumber);
  agentLock(a);
  a.mov('rax',0);a.store({rip:'agent.acks'},'rax');
  a.load('rax',{base:'r10',disp:ArrayBufferLayout.bytes});a.store({rip:'agent.mailbox',addend:8},'rax');
  a.load('rax',{base:'r10',disp:ArrayBufferLayout.byteLength});a.store({rip:'agent.mailbox',addend:16},'rax');
  a.store({rip:'agent.mailbox',addend:24},'r9');
  a.load('rax',{rip:'agent.mailbox'});a.add('rax',1);a.store({rip:'agent.mailbox'},'rax');
  agentUnlock(a);
  const wait=a.unique('wait'),done=a.unique('done');a.label(wait);
  a.load('rax',{rip:'agent.acks'});a.load('r10',{rip:'agent.started'});a.cmp('rax','r10');a.jcc('ae',done);
  a.mov('rcx',1);a.callImport('Sleep');a.jmp(wait);a.label(done);
  a.load('rcx',slot(40));a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');
 });
 // Agent side, after its script: wait for a broadcast, wrap the shared block
 // in a SharedArrayBuffer of this agent's heap and call the callback.
 rootedFn(b,'rt.agentAwaitBroadcast',136,[{kind:'locals',offset:48,count:4}],a=>{
  const wait=a.unique('wait'),ready=a.unique('ready');a.label(wait);
  a.load('rax',{rip:'agent.mailbox'});a.test('rax','rax');a.jcc('ne',ready);a.mov('rcx',1);a.callImport('Sleep');a.jmp(wait);a.label(ready);
  a.mov('rcx',ArrayBufferLayout.size);a.call('rt.alloc');
  a.mov('r10',HeapKind.object);a.store({base:'rax',disp:H.kind-H.size},'r10');
  a.mov('r10',SharedArrayBufferKind);a.store({base:'rax',disp:O.kind},'r10');a.mov('r10',0);
  for(const offset of [O.properties,O.length,O.shape,O.flags,ArrayBufferLayout.detached])a.store({base:'rax',disp:offset},'r10');
  a.lea('r10',{rip:'rt.sharedarraybufferPrototype'});a.store({base:'rax',disp:O.prototype},'r10');
  a.load('r10',{rip:'agent.mailbox',addend:8});a.store({base:'rax',disp:ArrayBufferLayout.bytes},'r10');
  a.load('r10',{rip:'agent.mailbox',addend:16});a.store({base:'rax',disp:ArrayBufferLayout.byteLength},'r10');
  a.mov('r10',5);a.store(slot(64),'r10');a.store(slot(72),'rax');
  a.mov('r10',3);a.store(slot(80),'r10');a.load('r10',{rip:'agent.mailbox',addend:24});a.store(slot(88),'r10');
  a.lea('r11',{rip:'agent.acks'});a.mov('rax',1);a.atomicXadd({base:'r11'},'rax',64);
  a.load('rax',{rip:'rt.agentCallback'});a.cmp('rax',5);const skip=a.unique('skip');a.jcc('ne',skip);
  for(const offset of [0,8]){a.load('rax',{rip:'rt.agentCallback',addend:offset});a.store(slot(48+offset),'rax');}
  a.lea('rax',{rip:'rt.undefinedValue'});a.store(slot(32),'rax');
  a.lea('rcx',slot(96));a.lea('rdx',slot(48));a.mov('r8',2);a.lea('r9',slot(64));a.call('rt.invoke');
  a.label(skip);
 });
}
