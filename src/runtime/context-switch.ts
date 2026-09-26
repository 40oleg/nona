import {RuntimeBuilder} from './abi.js';
import {preservedGp,preservedXmm} from './exception-layout.js';

// A suspended native frame cannot be traced through the active root chain.
// The saved root head travels with its stack and is restored on every switch.
export const ContextLayout={stack:0,roots:8,handler:16,cleanup:24,gp:32,xmm:96,parent:256,generator:264,size:272} as const;

export function emitContextSwitch(b:RuntimeBuilder):void {
 b.data('rt.contextChain',new Uint8Array(8),'.data');
 b.data('rt.currentGenerator',new Uint8Array(8),'.data');
 b.fn('rt.switchContext',40,a=>{
  a.store({base:'rcx',disp:ContextLayout.stack},'rsp');
  a.load('rax',{rip:'rt.gcRoots'});a.store({base:'rcx',disp:ContextLayout.roots},'rax');
  a.load('rax',{rip:'rt.exceptionHandler'});a.store({base:'rcx',disp:ContextLayout.handler},'rax');
  a.load('rax',{rip:'rt.cleanupHead'});a.store({base:'rcx',disp:ContextLayout.cleanup},'rax');
  a.load('rax',{rip:'rt.contextChain'});a.store({base:'rcx',disp:ContextLayout.parent},'rax');
  a.load('rax',{rip:'rt.currentGenerator'});a.store({base:'rcx',disp:ContextLayout.generator},'rax');
  preservedGp.forEach((reg,i)=>a.store({base:'rcx',disp:ContextLayout.gp+8*i},reg));
  preservedXmm.forEach((reg,i)=>a.storeXmm128({base:'rcx',disp:ContextLayout.xmm+16*i},reg));
  a.load('rax',{base:'rdx',disp:ContextLayout.roots});a.store({rip:'rt.gcRoots'},'rax');
  a.load('rax',{base:'rdx',disp:ContextLayout.handler});a.store({rip:'rt.exceptionHandler'},'rax');
  a.load('rax',{base:'rdx',disp:ContextLayout.cleanup});a.store({rip:'rt.cleanupHead'},'rax');
  a.load('rax',{base:'rdx',disp:ContextLayout.parent});a.store({rip:'rt.contextChain'},'rax');
  a.load('rax',{base:'rdx',disp:ContextLayout.generator});a.store({rip:'rt.currentGenerator'},'rax');
  preservedGp.forEach((reg,i)=>a.load(reg,{base:'rdx',disp:ContextLayout.gp+8*i}));
  preservedXmm.forEach((reg,i)=>a.loadXmm128(reg,{base:'rdx',disp:ContextLayout.xmm+16*i}));
  a.load('rsp',{base:'rdx',disp:ContextLayout.stack});
 });
}
