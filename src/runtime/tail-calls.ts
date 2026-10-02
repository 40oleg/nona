import {RuntimeBuilder,slot} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ValueListLayout as L} from './heap-layout.js';

// Proper tail calls in strict code. The calling function records the pending
// call here and returns this marker; the rt.invoke that called it performs the
// pending call from its own frame, so tail call chains use bounded stack.
export const TailCallTag=253;
/** Pending tail-call arguments kept in rt.tailStaging rather than a managed list. */
export const tailStagingCapacity=16;

export function emitTailCalls(b:RuntimeBuilder):void {
 // Pending callee, receiver and argument list (an internal Value, or
 // undefined when the arguments are in the staging area). GC traces both.
 b.data('rt.tailPending',new Uint8Array(48),'.data');
 // Up to tailStagingCapacity pending arguments are staged here rather than
 // in a fresh managed list: the function that prepared the call returns
 // its marker at once and the dispatcher copies the staged arguments into
 // its own frame before anything else runs, so the area is never in use
 // by two calls at a time. A tail call allocated a block per call before,
 // which made the continuation-passing regular expression matcher spend
 // much of its time in the collector.
 b.data('rt.tailStaging',new Uint8Array(16*tailStagingCapacity),'.data');
 b.data('rt.tailStagingCount',new Uint8Array(8),'.data');
 // RCX output Value*, RDX callee Value*, R8 argc, R9 argv; fifth: receiver Value*.
 rootedFn(b,'rt.prepareTailCall',104,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'range',register:'r9',count:'r8'},{kind:'locals',offset:64,count:1}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(80),'r9');
  a.load('rax',slot(frame+40));a.store(slot(88),'rax');
  const heap=a.unique('heapList'),copy=a.unique('copy'),staged=a.unique('staged');
  a.cmp('r8',tailStagingCapacity);a.jcc('a',heap);
  a.store({rip:'rt.tailStagingCount'},'r8');a.lea('r10',{rip:'rt.tailStaging'});a.mov('rax',0);a.store(slot(64),'rax');a.store(slot(72),'rax');a.jmp(copy);
  a.label(heap);a.lea('rcx',slot(64));a.load('rdx',slot(56));a.call('rt.newValueList');
  a.load('r8',slot(56));a.load('r9',slot(80));a.load('r10',slot(72));a.add('r10',L.values);
  a.label(copy);
  const loop=a.unique('copyLoop'),done=a.unique('copied');a.label(loop);a.test('r8','r8');a.jcc('e',done);
  for(const offset of [0,8]){a.load('rax',{base:'r9',disp:offset});a.store({base:'r10',disp:offset},'rax');}
  a.add('r9',16);a.add('r10',16);a.sub('r8',1);a.jmp(loop);a.label(done);a.label(staged);
  a.load('r10',slot(48));for(const offset of [0,8]){a.load('rax',{base:'r10',disp:offset});a.store({rip:'rt.tailPending',addend:offset},'rax');}
  a.load('r10',slot(88));for(const offset of [0,8]){a.load('rax',{base:'r10',disp:offset});a.store({rip:'rt.tailPending',addend:16+offset},'rax');}
  for(const offset of [0,8]){a.load('rax',slot(64+offset));a.store({rip:'rt.tailPending',addend:32+offset},'rax');}
  a.load('rcx',slot(40));a.mov('rax',TailCallTag);a.store({base:'rcx'},'rax');a.mov('rax',0);a.store({base:'rcx',disp:8},'rax');
 });
 // RCX output Value* holding the marker. Repeats pending calls until a value.
 // The frame holds the pending record and a copy of the staged arguments.
 rootedFn(b,'rt.tailDispatch',120+16*tailStagingCapacity,[{kind:'output',register:'rcx'},{kind:'locals',offset:64,count:3},{kind:'locals',offset:112,count:tailStagingCapacity}],a=>{
  a.store(slot(40),'rcx');
  const loop=a.unique('loop'),done=a.unique('done'),heap=a.unique('heapList'),ready=a.unique('argumentsReady');a.label(loop);
  for(let offset=0;offset<48;offset+=8){a.load('rax',{rip:'rt.tailPending',addend:offset});a.store(slot(64+offset),'rax');}
  a.mov('rax',0);for(let offset=0;offset<48;offset+=8)a.store({rip:'rt.tailPending',addend:offset},'rax');
  a.lea('rax',slot(80));a.store(slot(32),'rax');
  a.load('rax',slot(96));a.test('rax','rax');a.jcc('ne',heap);
  // Staged: move the arguments into this frame and clear the staging area.
  a.load('r8',{rip:'rt.tailStagingCount'});a.mov('r9','r8');a.lea('r10',{rip:'rt.tailStaging'});a.lea('r11',slot(112));
  {const move=a.unique('move'),moved=a.unique('moved');a.label(move);a.test('r9','r9');a.jcc('e',moved);
   for(const offset of [0,8]){a.load('rax',{base:'r10',disp:offset});a.store({base:'r11',disp:offset},'rax');}
   a.mov('rax',0);a.store({base:'r10'},'rax');a.store({base:'r10',disp:8},'rax');
   a.add('r10',16);a.add('r11',16);a.sub('r9',1);a.jmp(move);a.label(moved);}
  a.lea('r9',slot(112));a.jmp(ready);
  a.label(heap);a.load('r9',slot(104));a.load('r8',{base:'r9',disp:L.count});a.add('r9',L.values);
  a.label(ready);a.load('rcx',slot(40));a.lea('rdx',slot(64));
  a.call('rt.invokeTailTarget');
  a.load('rcx',slot(40));a.load('rax',{base:'rcx'});a.cmp('rax',TailCallTag);a.jcc('e',loop);a.label(done);
 });
}
