import {RuntimeBuilder,slot} from './abi.js';
import type {Target} from '../target.js';

/** Original terminal OS operation: stack-only signal state, no JavaScript unwind. */
export function emitPosixProcessAbort(b:RuntimeBuilder,target:Target):void {
 if(target.startsWith('win32-'))throw new Error('Windows abort requires its native termination oracle');
 if(target.startsWith('darwin-')){
  b.bundle.imports.push({dll:'/usr/lib/libSystem.B.dylib',name:'abort',symbol:'process.abort.native'});
  b.fn('process.abort.code',40,a=>{const retry=a.unique('abortRetry');a.label(retry);a.callImport('libSystem.abort',[]);a.jmp(retry)});return;
 }
 const linux=target.startsWith('linux-'),arm=target==='linux-arm64',openbsd=target==='openbsd-x64';
 // Linux v6.12 UAPI; FreeBSD releng/14.3; OpenBSD OPENBSD_7_8 signal.h1.29.
 // A zeroed action means SIG_DFL on all three ABIs. Their sigset sizes differ.
 const action=linux?(arm?134:13):(openbsd?46:416),mask=linux?(arm?135:14):(openbsd?48:340);
 const pid=linux?(arm?172:39):20,kill=linux?(arm?129:62):(openbsd?122:37),exit=linux?(arm?94:231):1;
 b.fn('process.abort.code',104,a=>{
  a.mov('rax',0);for(const offset of [40,48,56,64,72,80])a.store(slot(offset),'rax');
  a.mov('rdi',6);a.lea('rsi',slot(40));a.mov('rdx',0);a.mov('r10',8);a.syscall(action);
  a.mov('rax',32);a.store(slot(72),'rax');a.mov('rdi',linux?1:2);
  if(openbsd)a.mov('rsi',32);else a.lea('rsi',slot(72));
  a.mov('rdx',0);a.mov('r10',8);a.syscall(mask);
  a.syscall(pid);a.store(slot(88),'rax');
  if(linux){a.syscall(arm?178:186);a.mov('rsi','rax');a.load('rdi',slot(88));a.mov('rdx',6);a.syscall(arm?131:234)}
  else{a.load('rdi',slot(88));a.mov('rsi',6);a.syscall(kill)}
  // If the OS cannot deliver SIGABRT, terminate without returning to JS.
  a.load('rdi',slot(88));a.mov('rsi',9);a.syscall(kill);
  const retry=a.unique('abortExitRetry');a.label(retry);a.mov('rdi',134);a.syscall(exit);a.jmp(retry);
 });
}
