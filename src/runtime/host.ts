import {RuntimeBuilder,slot} from './abi.js';

/** Host primitives used by the timer/event-loop prelude. They are leaf
 * functions with the builtin ABI (RCX out Value*, RDX argc, R8 argv): they
 * never call JavaScript, never allocate and never throw. Linux provides the
 * same imports through syscall shims. */
export function emitHost(b:RuntimeBuilder):void {
 for(const name of ['QueryPerformanceCounter','QueryPerformanceFrequency'])b.bundle.imports.push({dll:'KERNEL32.dll',name,symbol:name});
 // __nonaHostNow(): monotonic milliseconds (fractional) since an arbitrary origin.
 b.fn('rt.hostNow.code',72,a=>{
  a.store(slot(40),'rcx');
  a.lea('rcx',slot(48));a.callImport('QueryPerformanceCounter');
  a.lea('rcx',slot(56));a.callImport('QueryPerformanceFrequency');
  // ms = (counter / frequency) * 1000 + (counter % frequency) * 1000 / frequency
  a.load('rax',slot(48));a.xor('rdx','rdx');a.load('r10',slot(56));a.div('r10');
  a.cvtsi2sd('xmm0','rax');a.mov('rax',1000);a.cvtsi2sd('xmm1','rax');a.mulsd('xmm0','xmm1');
  a.cvtsi2sd('xmm2','rdx');a.mulsd('xmm2','xmm1');a.cvtsi2sd('xmm1','r10');a.divsd('xmm2','xmm1');a.addsd('xmm0','xmm2');
  a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
 });
}
