import {RuntimeBuilder,slot} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ValueListLayout as L} from './heap-layout.js';

// Proper tail calls in strict code. The calling function records the pending
// call here and returns this marker; the rt.invoke that called it performs the
// pending call from its own frame, so tail call chains use bounded stack.
export const TailCallTag=253;

export function emitTailCalls(b:RuntimeBuilder):void {
 // Pending callee, receiver and argument list (an internal Value). GC traces it.
 b.data('rt.tailPending',new Uint8Array(48),'.data');
 // RCX output Value*, RDX callee Value*, R8 argc, R9 argv; fifth: receiver Value*.
 rootedFn(b,'rt.prepareTailCall',104,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'range',register:'r9',count:'r8'},{kind:'locals',offset:64,count:1}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(80),'r9');
  a.load('rax',slot(frame+40));a.store(slot(88),'rax');
  a.lea('rcx',slot(64));a.load('rdx',slot(56));a.call('rt.newValueList');
  a.load('r8',slot(56));a.load('r9',slot(80));a.load('r10',slot(72));a.add('r10',L.values);
  const loop=a.unique('copy'),done=a.unique('copied');a.label(loop);a.test('r8','r8');a.jcc('e',done);
  for(const offset of [0,8]){a.load('rax',{base:'r9',disp:offset});a.store({base:'r10',disp:offset},'rax');}
  a.add('r9',16);a.add('r10',16);a.sub('r8',1);a.jmp(loop);a.label(done);
  a.load('r10',slot(48));for(const offset of [0,8]){a.load('rax',{base:'r10',disp:offset});a.store({rip:'rt.tailPending',addend:offset},'rax');}
  a.load('r10',slot(88));for(const offset of [0,8]){a.load('rax',{base:'r10',disp:offset});a.store({rip:'rt.tailPending',addend:16+offset},'rax');}
  for(const offset of [0,8]){a.load('rax',slot(64+offset));a.store({rip:'rt.tailPending',addend:32+offset},'rax');}
  a.load('rcx',slot(40));a.mov('rax',TailCallTag);a.store({base:'rcx'},'rax');a.mov('rax',0);a.store({base:'rcx',disp:8},'rax');
 });
 // RCX output Value* holding the marker. Repeats pending calls until a value.
 rootedFn(b,'rt.tailDispatch',120,[{kind:'output',register:'rcx'},{kind:'locals',offset:64,count:3}],a=>{
  a.store(slot(40),'rcx');
  const loop=a.unique('loop'),done=a.unique('done');a.label(loop);
  for(let offset=0;offset<48;offset+=8){a.load('rax',{rip:'rt.tailPending',addend:offset});a.store(slot(64+offset),'rax');}
  a.mov('rax',0);for(let offset=0;offset<48;offset+=8)a.store({rip:'rt.tailPending',addend:offset},'rax');
  a.lea('rax',slot(80));a.store(slot(32),'rax');
  a.load('rcx',slot(40));a.lea('rdx',slot(64));a.load('r9',slot(104));a.load('r8',{base:'r9',disp:L.count});a.add('r9',L.values);
  a.call('rt.invokeTailTarget');
  a.load('rcx',slot(40));a.load('rax',{base:'rcx'});a.cmp('rax',TailCallTag);a.jcc('e',loop);a.label(done);
 });
}
