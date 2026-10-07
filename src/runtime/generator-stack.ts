import {currentNativeTarget} from '../backend/machine/context.js';
import {RuntimeBuilder,slot} from './abi.js';
import {minimumGcThreshold} from './gc.js';

export const GeneratorStack={bytes:1024*1024,get guard(){const target=currentNativeTarget();return target==='linux-arm64'?65536:target==='darwin-arm64'?16384:4096;}} as const;
const poolCapacity=16;

// The returned base includes a permanently inaccessible low page. The
// usable stack grows down from base+bytes; the caller owns the mapping.
export function emitGeneratorStack(b:RuntimeBuilder):void {
 for(const name of ['VirtualAlloc','VirtualProtect','VirtualFree'])
  if(!b.bundle.imports.some(i=>i.symbol===name))b.bundle.imports.push({dll:'KERNEL32.dll',name,symbol:name});
 b.data('rt.generatorStackBytes',new Uint8Array(8),'.data');
 // rt.gcThreshold - rt.generatorStackBytes: what rt.liveBytes is compared
 // with at safepoints (one load and one compare in generated code). The
 // collector recomputes it with the threshold; stack allocation and release
 // move it by the stack size.
 {const limit=new Uint8Array(8);new DataView(limit.buffer).setBigUint64(0,BigInt(minimumGcThreshold),true);b.data('rt.gcLimit',limit,'.data');}
 // Released stacks are kept for reuse (up to poolCapacity): mapping and
 // protecting a fresh megabyte for every async call cost two system calls
 // and fresh zero pages. Pooled stacks do not count as live memory.
 b.data('rt.generatorStackPool',new Uint8Array(8*poolCapacity),'.data');
 b.data('rt.generatorStackPoolCount',new Uint8Array(8),'.data');
 b.fn('rt.allocGeneratorStack',72,a=>{
  const pooled=a.unique('pooled');
  {const fresh=a.unique('fresh');a.load('rax',{rip:'rt.generatorStackPoolCount'});a.test('rax','rax');a.jcc('e',fresh);
   a.sub('rax',1);a.store({rip:'rt.generatorStackPoolCount'},'rax');a.shl('rax',3);a.lea('r10',{rip:'rt.generatorStackPool'});a.add('r10','rax');a.load('rax',{base:'r10'});
   a.load('r10',{rip:'rt.generatorStackBytes'});a.add('r10',GeneratorStack.bytes);a.store({rip:'rt.generatorStackBytes'},'r10');a.load('r10',{rip:'rt.gcLimit'});a.sub('r10',GeneratorStack.bytes);a.store({rip:'rt.gcLimit'},'r10');
   a.jmp(pooled);a.label(fresh);}
  a.mov('rcx',0);a.mov('rdx',GeneratorStack.bytes);a.mov('r8',0x3000);a.mov('r9',4);a.callImport('VirtualAlloc');
  const done=a.unique('done');a.test('rax','rax');a.jcc('e',done);a.store(slot(40),'rax');
  a.mov('rcx','rax');a.mov('rdx',GeneratorStack.guard);a.mov('r8',1);a.lea('r9',slot(48));a.callImport('VirtualProtect');
  a.test('rax','rax');const ready=a.unique('ready');a.jcc('ne',ready);
  a.load('rcx',slot(40));a.mov('rdx',0);a.mov('r8',0x8000);a.callImport('VirtualFree');a.mov('rax',0);a.jmp(done);
  // Committed coroutine stacks count towards the collection threshold (see
  // rt.safepoint), so abandoned coroutines, whose stacks the sweep releases,
  // bring the next collection closer.
  a.label(ready);a.load('r10',{rip:'rt.generatorStackBytes'});a.add('r10',GeneratorStack.bytes);a.store({rip:'rt.generatorStackBytes'},'r10');a.load('r10',{rip:'rt.gcLimit'});a.sub('r10',GeneratorStack.bytes);a.store({rip:'rt.gcLimit'},'r10');
  a.load('rax',slot(40));a.label(done);a.label(pooled);
 });
 b.fn('rt.freeGeneratorStack',40,a=>{
  const done=a.unique('done');a.test('rcx','rcx');a.jcc('e',done);
  a.load('r10',{rip:'rt.generatorStackBytes'});a.sub('r10',GeneratorStack.bytes);a.store({rip:'rt.generatorStackBytes'},'r10');a.load('r10',{rip:'rt.gcLimit'});a.add('r10',GeneratorStack.bytes);a.store({rip:'rt.gcLimit'},'r10');
  {const unmap=a.unique('unmap');a.load('rax',{rip:'rt.generatorStackPoolCount'});a.cmp('rax',poolCapacity);a.jcc('ae',unmap);
   a.mov('r10','rax');a.shl('r10',3);a.lea('r11',{rip:'rt.generatorStackPool'});a.add('r11','r10');a.store({base:'r11'},'rcx');
   a.add('rax',1);a.store({rip:'rt.generatorStackPoolCount'},'rax');a.jmp(done);a.label(unmap);}
  a.mov('rdx',0);a.mov('r8',0x8000);a.callImport('VirtualFree');a.label(done);
 });
}
