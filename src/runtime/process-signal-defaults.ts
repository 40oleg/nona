import {RuntimeBuilder,slot} from './abi.js';
import type {Target} from '../target.js';

/** Main-entry POSIX I/O dispositions, before any managed code or writes. */
export function emitProcessSignalDefaults(b:RuntimeBuilder,target:Target):void {
 if(target==='win32-arm64'){b.fn('rt.processSignalDefaults',40,()=>{});return}
 const foreign=target==='win32-x64',linux=foreign||target.startsWith('linux-'),arm=target.endsWith('arm64'),darwin=target.startsWith('darwin-');
 if(foreign&&!b.bundle.imports.some(item=>item.symbol==='GetCommandLineW'))b.bundle.imports.push({dll:'KERNEL32.dll',name:'GetCommandLineW',symbol:'GetCommandLineW'});
 const action=linux?(arm?134:13):target==='freebsd-x64'?416:darwin&&!arm?0x200002e:46;
 b.fn('rt.processSignalDefaults',88,a=>{
  a.store(slot(72),'rdi');a.store(slot(80),'rsi');const done=a.unique('done');
  if(foreign){a.callImport('GetCommandLineW');a.test('rax','rax');a.jcc('ne',done)}
  // SIG_IGN has no trampoline. All ABI-specific masks/flags remain zero;
  // the leading handler word is shared by the Linux, BSD and Darwin layouts.
  a.mov('rax',0);for(const offset of [40,48,56,64])a.store(slot(offset),'rax');a.mov('rax',1);a.store(slot(40),'rax');
  for(const signal of [13,25]){
   a.mov('rdi',signal);a.lea('rsi',slot(40));a.mov('rdx',0);a.mov('r10',8);a.syscall(action);
   const ok=a.unique('ok');if(linux){a.test('rax','rax');a.jcc('e',ok)}else a.jcc('ae',ok);
   a.call('rt.fail');a.label(ok);
  }
  a.label(done);a.load('rdi',slot(72));a.load('rsi',slot(80));
 });
}
