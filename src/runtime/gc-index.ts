import {RuntimeBuilder,slot,failIf} from './abi.js';
import {HeapLayout as H} from './heap-layout.js';

/** Collection-owned sorted allocation index. Heap membership is O(log n),
 * including interior pointers. Workspace is outside the managed heap. */
export function emitGcIndex(b:RuntimeBuilder):void {
 for(const name of ['gcIndex','gcIndexCount'])b.data('rt.'+name,new Uint8Array(8),'.data');
 // Max-heap sift: RCX root index, RDX exclusive end. No calls or allocations.
 b.fn('rt.gcSift',40,a=>{
  const loop=a.unique('loop'),chosen=a.unique('chosen'),done=a.unique('done');
  a.load('r8',{rip:'rt.gcIndex'});a.mov('rax','rcx');a.shl('rax',3);a.add('rax','r8');a.load('r9',{base:'rax'});
  a.label(loop);a.mov('r10','rcx');a.shl('r10',1);a.add('r10',1);a.cmp('r10','rdx');a.jcc('ae',done);
  a.mov('rax','r10');a.shl('rax',3);a.add('rax','r8');a.load('r11',{base:'rax'});
  a.mov('rax','r10');a.add('rax',1);a.cmp('rax','rdx');a.jcc('ae',chosen);
  a.shl('rax',3);a.add('rax','r8');a.load('rax',{base:'rax'});a.cmp('rax','r11');a.jcc('be',chosen);
  a.mov('r11','rax');a.add('r10',1);a.label(chosen);a.cmp('r9','r11');a.jcc('ae',done);
  a.mov('rax','rcx');a.shl('rax',3);a.add('rax','r8');a.store({base:'rax'},'r11');a.mov('rcx','r10');a.jmp(loop);
  a.label(done);a.mov('rax','rcx');a.shl('rax',3);a.add('rax','r8');a.store({base:'rax'},'r9');
 });
 b.fn('rt.gcBuildIndex',72,a=>{
  const count=a.unique('count'),allocate=a.unique('allocate'),fill=a.unique('fill'),heap=a.unique('heap'),sort=a.unique('sort'),sortLoop=a.unique('sortLoop'),done=a.unique('done');
  a.load('rax',{rip:'rt.blocks'});a.mov('r10',0);a.label(count);a.test('rax','rax');a.jcc('e',allocate);
  a.add('r10',1);a.load('rax',{base:'rax',disp:H.next});a.jmp(count);
  a.label(allocate);a.store({rip:'rt.gcIndexCount'},'r10');a.test('r10','r10');a.jcc('e',done);
  a.mov('r8','r10');a.shl('r8',3);a.load('rcx',{rip:'rt.heap'});a.mov('rdx',0);a.callImport('HeapAlloc');
  a.test('rax','rax');failIf(a,'e');a.store({rip:'rt.gcIndex'},'rax');a.mov('r10','rax');a.load('rax',{rip:'rt.blocks'});
  a.label(fill);a.test('rax','rax');a.jcc('e',heap);a.store({base:'r10'},'rax');a.add('r10',8);a.load('rax',{base:'rax',disp:H.next});a.jmp(fill);
  a.label(heap);a.load('rax',{rip:'rt.gcIndexCount'});a.shr('rax',1);a.store(slot(40),'rax');
  const heapLoop=a.unique('heapLoop');a.label(heapLoop);a.load('rcx',slot(40));a.test('rcx','rcx');a.jcc('e',sort);
  a.sub('rcx',1);a.store(slot(40),'rcx');a.load('rdx',{rip:'rt.gcIndexCount'});a.call('rt.gcSift');a.jmp(heapLoop);
  a.label(sort);a.load('rax',{rip:'rt.gcIndexCount'});a.sub('rax',1);a.store(slot(40),'rax');
  a.label(sortLoop);a.load('rdx',slot(40));a.test('rdx','rdx');a.jcc('e',done);
  a.load('r8',{rip:'rt.gcIndex'});a.mov('r10','rdx');a.shl('r10',3);a.add('r10','r8');
  a.load('rax',{base:'r8'});a.load('r11',{base:'r10'});a.store({base:'r8'},'r11');a.store({base:'r10'},'rax');
  a.mov('rcx',0);a.call('rt.gcSift');a.load('rax',slot(40));a.sub('rax',1);a.store(slot(40),'rax');a.jmp(sortLoop);
  a.label(done);
 });
 b.fn('rt.gcFreeIndex',40,a=>{
  const done=a.unique('done');a.load('r8',{rip:'rt.gcIndex'});a.test('r8','r8');a.jcc('e',done);
  a.load('rcx',{rip:'rt.heap'});a.mov('rdx',0);a.callImport('HeapFree');
  a.mov('rax',0);a.store({rip:'rt.gcIndex'},'rax');a.store({rip:'rt.gcIndexCount'},'rax');a.label(done);
 });
}
