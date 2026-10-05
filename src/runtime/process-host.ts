import {RuntimeBuilder} from './abi.js';
import type {Assembler} from '../backend/x64/assembler.js';
import type {Target} from '../target.js';
import {emitProcessMemory} from './process-memory.js';

/** Private, allocation-free native helpers for the process prelude. */
export function processNativeHelpers():RuntimeBuilder {
 const b=new RuntimeBuilder();
 emitProcessMemory(b);
 b.data('process.startupArgv',new Uint8Array(8),'.data');
 b.data('process.startupEnv',new Uint8Array(8),'.data');
 for(const name of ['startupArgv','startupEnv'])b.fn('process.'+name+'.code',40,a=>a.load('rax',{rip:'process.'+name}));
 b.fn('process.copy.code',40,a=>{
  const loop=a.unique('copy'),done=a.unique('done');
  a.mov('rax','rcx');a.label(loop);a.test('r8','r8');a.jcc('e',done);
  a.load('r10',{base:'rdx'},8);a.store({base:'rcx'},'r10',8);a.add('rcx',1);a.add('rdx',1);a.sub('r8',1);a.jmp(loop);a.label(done);
 });
 b.fn('process.length.code',40,a=>{
  const loop=a.unique('length'),done=a.unique('done');a.mov('rax',0);
  a.label(loop);a.load('r10',{base:'rcx'},8);a.test('r10','r10');a.jcc('e',done);a.add('rax',1);a.add('rcx',1);a.jmp(loop);a.label(done);
 });
 return b;
}

/** Save kernel-owned startup vectors before the runtime changes its stack. */
export function captureProcessStartup(a:Assembler,target:Target):void {
 if(target==='darwin-x64'){
  // The process adapter links native libSystem APIs and therefore uses LC_MAIN.
  // The system C entry supplies RDI=argc, RSI=argv, RDX=envp.
  a.store({rip:'process.startupArgv'},'rsi');a.store({rip:'process.startupEnv'},'rdx');return;
 }
 if(target==='darwin-arm64'){
  // LC_MAIN is a native C entry: x0=argc, x1=argv, x2=envp. Logical
  // RCX/RDX map to x1/x2; no native call has changed them yet.
  a.store({rip:'process.startupArgv'},'rcx');a.store({rip:'process.startupEnv'},'rdx');return;
 }
 if(target.startsWith('win32-')||target.startsWith('linux-'))return;
 // FreeBSD passes the vector base in RDI; its aligned RSP can precede argc.
 // OpenBSD places argc directly at RSP.
 a.lea('rax',{base:target==='freebsd-x64'?'rdi':'rsp',disp:8});a.store({rip:'process.startupArgv'},'rax');
 const scan=a.unique('startupEnv');a.label(scan);a.load('r10',{base:'rax'});a.add('rax',8);a.test('r10','r10');a.jcc('ne',scan);
 a.store({rip:'process.startupEnv'},'rax');
}
