import {RuntimeBuilder,slot,failIf} from './abi.js';
import {HandlerLayout as H,preservedGp,preservedXmm} from './exception-layout.js';
import {ObjectLayout as O} from './object-layout.js';

export function emitExceptions(b:RuntimeBuilder):void {
 b.data('rt.exceptionHandler',new Uint8Array(8),'.data');
 b.data('rt.cleanupHead',new Uint8Array(8),'.data');
 // Explicit JS throw only. All work before the transfer is callback/GC-free.
 b.fn('rt.throw',40,a=>{
  a.load('r11',{rip:'rt.exceptionHandler'});a.test('r11','r11');failIf(a,'e');
  a.load('r8',{base:'r11',disp:H.value});for(const n of [0,8]){a.load('rax',{base:'rcx',disp:n});a.store({base:'r8',disp:n},'rax');}
  a.load('r10',{rip:'rt.cleanupHead'});a.load('r9',{base:'r11',disp:H.cleanup});
  const cleanup=a.unique('cleanup'),restored=a.unique('restored');a.label(cleanup);a.cmp('r10','r9');a.jcc('e',restored);
  a.load('r8',{base:'r10',disp:8});a.mov('rax',0);a.store({base:'r8',disp:O.stringifying},'rax');a.load('r10',{base:'r10'});a.jmp(cleanup);
  a.label(restored);a.store({rip:'rt.cleanupHead'},'r9');a.load('rax',{base:'r11',disp:H.next});a.store({rip:'rt.exceptionHandler'},'rax');
  a.load('rax',{base:'r11',disp:H.roots});a.store({rip:'rt.gcRoots'},'rax');
  preservedGp.forEach((reg,i)=>a.load(reg,{base:'r11',disp:H.gp+8*i}));
  preservedXmm.forEach((reg,i)=>a.loadXmm128(reg,{base:'r11',disp:H.xmm+16*i}));
  a.load('r10',{base:'r11',disp:H.target});a.load('rax',{base:'r11',disp:H.stack});a.mov('rsp','rax');a.jumpRegister('r10');
 });
}
