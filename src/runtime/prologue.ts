import {RuntimeBuilder} from './abi.js';
import {RootLayout as R} from './heap-layout.js';
import {JsFrame as F,FrameDescriptor as D} from './frame-layout.js';

/**
 * rt.enterFrame: the prologue shared by every compiled JS function. A function
 * starts with `lea r10,[rip+descriptor]; call rt.enterFrame`; the stub builds
 * the frame described by the descriptor (frame-layout.ts) below the function's
 * return address and returns into the function with the frame in place.
 * Inlined, the same code was about 275 bytes per function.
 *
 * On entry RCX, RDX, R8 and R9 carry the function's arguments (result
 * pointer, argument count, argument vector, function object) and the fifth and
 * sixth arguments (this and new.target pointers) are on the stack above the
 * function's return address. The stub checks the stack limit, probes the
 * pages of a large frame, moves its own return address to the bottom of the
 * new frame (so that `ret` lands in the function with RSP at the frame and the
 * return predictor stays paired), saves RBP and sets it up, stores the
 * argument registers, clears the value slots, copies this, new.target and the
 * arguments the caller passed into their slots, and links the frame's root
 * record. It uses RAX, R11, XMM0, XMM1 and, once they are saved, RCX, R8, R9.
 */
export function emitPrologue(b:RuntimeBuilder):void {
 b.raw('rt.enterFrame',a=>{
  const overflow=a.unique('overflow'),noProbe=a.unique('noProbe'),probe=a.unique('probe'),lastPage=a.unique('lastPage');
  const cleared=a.unique('cleared'),clear=a.unique('clear'),even=a.unique('even'),copied=a.unique('copied'),copy=a.unique('copy'),counted=a.unique('counted');
  const frame=(disp:number)=>({base:'rbp' as const,disp:disp-F.bias});
  // RAX: the frame's stack pointer (the function's entry RSP less the allocation).
  a.lea('rax',{base:'rsp',disp:8});a.subMemory('rax',{base:'r10',disp:D.allocation});
  // Stack overflow becomes a RangeError instead of a crash (rt.stackLimit).
  a.cmpMemory('rax',{rip:'rt.stackLimit'});a.jcc('b',overflow);
  // Touch every page of a frame of 4 KiB or more, top down, as Windows guard
  // pages require; the return address goes one slot below the frame.
  a.load('r11',{base:'r10',disp:D.allocation});a.cmp('r11',4096);a.jcc('b',noProbe);
  a.lea('r11',{base:'rsp',disp:8});
  a.label(probe);a.sub('r11',4096);a.cmp('r11','rax');a.jcc('b',lastPage);a.cmpByte({base:'r11'},0);a.jmp(probe);
  a.label(lastPage);a.cmpByte({base:'rax',disp:-8},0);
  a.label(noProbe);a.load('r11',{base:'rsp'});a.lea('rsp',{base:'rax',disp:-8});a.store({base:'rsp'},'r11');
  // RBP is preserved: saved in the frame, restored by the function's return.
  a.store({base:'rax',disp:F.savedFrame},'rbp');a.lea('rbp',{base:'rax',disp:F.bias});
  a.store(frame(F.result),'rcx');a.store(frame(F.argc),'rdx');a.store(frame(F.argv),'r8');a.store(frame(F.callee),'r9');
  // The first min(argc, parameters) arguments go to the parameter slots
  // (locations 0..n-1): R11 counts them, RCX the slots left to clear.
  a.load('r11',{base:'r10',disp:D.parameters});a.cmp('r11','rdx');a.jcc('be',counted);a.mov('r11','rdx');
  a.label(counted);a.load('rcx',{base:'r10',disp:D.slots});a.sub('rcx','r11');a.lea('r9',frame(F.values));a.test('r11','r11');a.jcc('e',copied);
  // Values are copied in two 8-byte halves: the caller stored them that way,
  // and a 16-byte load of two fresh 8-byte stores stalls on forwarding.
  a.label(copy);a.movsd('xmm1',{base:'r8'});a.storesd({base:'r9'},'xmm1');a.movsd('xmm1',{base:'r8',disp:8});a.storesd({base:'r9',disp:8},'xmm1');a.add('r8',16);a.add('r9',16);a.sub('r11',1);a.jcc('ne',copy);
  a.label(copied);
  // The remaining value slots start cleared (the collector scans them all):
  // an odd slot first, then two per turn.
  a.test('rcx','rcx');a.jcc('e',cleared);a.mov('r8',0);a.movqToXmm('xmm0','r8');
  a.mov('r8','rcx');a.and('r8',1);a.jcc('e',even);a.storeXmm128({base:'r9'},'xmm0');a.add('r9',16);
  a.label(even);a.shr('rcx',1);a.test('rcx','rcx');a.jcc('e',cleared);
  a.label(clear);a.storeXmm128({base:'r9'},'xmm0');a.storeXmm128({base:'r9',disp:16},'xmm0');a.add('r9',32);a.sub('rcx',1);a.jcc('ne',clear);
  // R9 is now the this slot; new.target and the super receiver follow it.
  a.label(cleared);a.load('r11',{base:'r10',disp:D.allocation});a.add('r11','rax');
  a.load('rcx',{base:'r11',disp:F.incomingThis});a.load('r8',{base:'rcx'});a.load('rcx',{base:'rcx',disp:8});a.store({base:'r9'},'r8');a.store({base:'r9',disp:8},'rcx');a.store({base:'r9',disp:32},'r8');a.store({base:'r9',disp:40},'rcx');
  a.load('rcx',{base:'r11',disp:F.incomingNewTarget});a.load('r8',{base:'rcx'});a.load('rcx',{base:'rcx',disp:8});a.store({base:'r9',disp:16},'r8');a.store({base:'r9',disp:24},'rcx');
  // The frame's precise root record: the value slots, this, new.target and
  // the super receiver. The count is negative: the collector scans the
  // slots the stack map of the current call lists (gc.ts, stack-maps.ts).
  a.load('r11',{rip:'rt.gcRoots'});a.store({base:'rax',disp:F.roots+R.next},'r11');
  a.lea('r11',frame(F.values));a.store({base:'rax',disp:F.roots+R.values},'r11');
  a.load('r11',{base:'r10',disp:D.slots});a.add('r11',3);a.neg('r11');a.store({base:'rax',disp:F.roots+R.count},'r11');
  a.load('r11',{base:'r10',disp:D.maps});a.store({base:'rax',disp:F.maps},'r11');
  a.lea('r11',{base:'rax',disp:F.roots});a.store({rip:'rt.gcRoots'},'r11');
  a.ret();
  // The frame was not allocated: the throw runs on the caller's aligned stack.
  a.label(overflow);a.call('rt.throwStackOverflow');
 });
}
