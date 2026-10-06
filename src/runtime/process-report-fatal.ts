import {RuntimeBuilder,slot} from './abi.js';
import type {Target} from '../target.js';

/** Emergency diagnostics use static native storage, never managed allocation. */
export function emitProcessFatalReport(b:RuntimeBuilder,target:Target):void {
 const limit=32768;
 if(target.startsWith('win32-'))for(const name of ['GetCommandLineW','GetStdHandle','CreateFileW','WriteFile','CloseHandle'])if(!b.bundle.imports.some(item=>item.symbol===name))b.bundle.imports.push({dll:'KERNEL32.dll',name,symbol:name});
 for(const [name,size] of [['path',limit+8],['header',limit+8],['output',limit+1024],['digits',32],['snapshot',32],['pathLength',8],['headerLength',8],['busy',8]] as const)b.data('process.report.'+name,new Uint8Array(size),'.data');
 // Four logical arguments: native path bytes, their count, JSON prefix, its count.
 // Windows callers supply UTF-16 including its terminator; POSIX supply UTF-8.
 b.fn('process.reportConfigure.code',40,a=>{
  const invalid=a.unique('invalid'),disable=a.unique('disable'),done=a.unique('done'),busy=a.unique('busy');
  a.cmp('rdx',limit);a.jcc('a',invalid);a.cmp('r9',limit);a.jcc('a',invalid);a.test('rdx','rdx');a.jcc('e',disable);
  a.mov('rax',1);a.atomicExchange({rip:'process.report.busy'},'rax',64);a.test('rax','rax');a.jcc('ne',busy);
  a.store({rip:'process.report.pathLength'},'rdx');a.store({rip:'process.report.headerLength'},'r9');
  const copy=(pointer:'rcx'|'r8',count:'rdx'|'r9',dest:string)=>{a.lea('r10',{rip:dest});const loop=a.unique('copy'),end=a.unique('end');a.label(loop);a.test(count,count);a.jcc('e',end);a.load('r11',{base:pointer},8);a.store({base:'r10'},'r11',8);a.add(pointer,1);a.add('r10',1);a.sub(count,1);a.jmp(loop);a.label(end);a.mov('rax',0);a.store({base:'r10'},'rax');};
  copy('rcx','rdx','process.report.path');copy('r8','r9','process.report.header');a.lea('rax',{rip:'process.reportFatal.code'});a.store({rip:'rt.fatalReportHook'},'rax');a.mov('rax',0);a.store({rip:'process.report.busy'},'rax');a.jmp(done);
  a.label(disable);a.mov('rax',0);a.store({rip:'rt.fatalReportHook'},'rax');a.jmp(done);a.label(invalid);a.mov('rax',7);a.jmp(done);a.label(busy);a.mov('rax',16);a.label(done);
 });
 // RCX destination, RDX unsigned integer; return the first byte after digits.
 b.fn('process.reportDecimal',40,a=>{
  a.mov('rax','rdx');a.lea('r9',{rip:'process.report.digits'});a.add('r9',32);a.mov('r8',10);
  const next=a.unique('next'),copy=a.unique('copy'),done=a.unique('done');a.label(next);a.mov('rdx',0);a.div('r8');a.add('rdx',48);a.sub('r9',1);a.store({base:'r9'},'rdx',8);a.test('rax','rax');a.jcc('ne',next);
  a.lea('r8',{rip:'process.report.digits'});a.add('r8',32);a.label(copy);a.cmp('r9','r8');a.jcc('ae',done);a.load('r10',{base:'r9'},8);a.store({base:'rcx'},'r10',8);a.add('rcx',1);a.add('r9',1);a.jmp(copy);a.label(done);a.mov('rax','rcx');
 });
 b.fn('process.reportFatal.code',168,a=>{
  a.store(slot(96),'rdi');a.store(slot(104),'rsi');
  const done=a.unique('done'),posix=a.unique('posix'),opened=a.unique('opened'),failed=a.unique('failed'),write=a.unique('write'),close=a.unique('close'),posixWrite=a.unique('posixWrite'),posixClose=a.unique('posixClose'),file=a.unique('file'),console=a.unique('console'),consolePosix=a.unique('consolePosix');
  a.mov('rax',1);a.atomicExchange({rip:'process.report.busy'},'rax',64);a.test('rax','rax');a.jcc('ne',done);
  a.lea('rcx',{rip:'process.report.snapshot'});a.call('process.heapSnapshot.code');
  a.lea('r8',{rip:'process.report.output'});a.lea('rdx',{rip:'process.report.header'});a.load('r9',{rip:'process.report.headerLength'});
  const header=a.unique('header'),headerDone=a.unique('headerDone');a.label(header);a.test('r9','r9');a.jcc('e',headerDone);a.load('r10',{base:'rdx'},8);a.store({base:'r8'},'r10',8);a.add('rdx',1);a.add('r8',1);a.sub('r9',1);a.jmp(header);a.label(headerDone);a.store(slot(64),'r8');
  for(const [key,offset] of [['heapTotal',0],['heapUsed',8],['arrayBuffers',16],['managedBlocks',24]] as const){
   const bytes=new TextEncoder().encode('"'+key+'":'),name='process.report.key.'+key;b.data(name,bytes);a.load('rcx',slot(64));
   for(let i=0;i<bytes.length;i++){a.mov('rax',bytes[i]!);a.store({base:'rcx'},'rax',8);a.add('rcx',1)}
   a.load('rdx',{rip:'process.report.snapshot',disp:offset});a.call('process.reportDecimal');a.mov('r10',key==='managedBlocks'?125:44);a.store({base:'rax'},'r10',8);a.add('rax',1);a.store(slot(64),'rax');
  }
  a.load('rax',slot(64));a.mov('r10',125);a.store({base:'rax'},'r10',8);a.add('rax',1);a.mov('r10',10);a.store({base:'rax'},'r10',8);a.add('rax',1);a.lea('r10',{rip:'process.report.output'});a.sub('rax','r10');a.store(slot(72),'rax');a.store(slot(80),'r10');
  // Only the complete private two-byte [0,1] or [0,2] record is a console.
  // A UTF-16 filename may have a zero low byte. Borrowed descriptors stay open.
  a.mov('rax',0);a.store(slot(120),'rax');a.load('rax',{rip:'process.report.pathLength'});a.cmp('rax',2);a.jcc('ne',file);
  a.load('rax',{rip:'process.report.path'},16);a.cmp('rax',256);a.jcc('e',console);a.cmp('rax',512);a.jcc('ne',file);a.label(console);a.mov('rax',1);a.store(slot(120),'rax');
  if(target.startsWith('win32-')){a.callImport('GetCommandLineW');a.test('rax','rax');a.jcc('e',consolePosix);a.mov('rax',1);a.store(slot(88),'rax');a.load('rcx',{rip:'process.report.path',disp:1},8);a.add('rcx',10);a.neg('rcx');a.callImport('GetStdHandle');a.jmp(opened)}
  a.label(consolePosix);a.mov('rax',0);a.store(slot(88),'rax');a.load('rax',{rip:'process.report.path',disp:1},8);a.jmp(opened);a.label(file);
  if(target.startsWith('win32-')){
   a.callImport('GetCommandLineW');a.test('rax','rax');a.jcc('e',posix);a.mov('rax',1);a.store(slot(88),'rax');
   a.lea('rcx',{rip:'process.report.path'});a.mov('rdx',0x40000000);a.mov('r8',7);a.mov('r9',0);a.mov('rax',2);a.store(slot(32),'rax');a.mov('rax',128);a.store(slot(40),'rax');a.mov('rax',0);a.store(slot(48),'rax');a.callImport('CreateFileW');a.cmp('rax',-1);a.jcc('e',failed);a.jmp(opened);
  }
  a.label(posix);a.mov('rax',0);a.store(slot(88),'rax');
  if(target!=='win32-arm64'){
   const linux=target.startsWith('linux-')||target==='win32-x64',arm=target==='linux-arm64',darwin=target.startsWith('darwin-');
   if(arm){a.mov('rdi',-100);a.lea('rsi',{rip:'process.report.path'});a.mov('rdx',577);a.mov('r10',420)}else{a.lea('rdi',{rip:'process.report.path'});a.mov('rsi',linux?577:1537);a.mov('rdx',420)}
   a.syscall(linux?(arm?56:2):darwin?0x2000005:5);if(!linux)a.jcc('b',failed);a.test('rax','rax');a.jcc('s',failed);
  }else a.jmp(failed);
  a.label(opened);a.store(slot(56),'rax');a.label(write);a.load('rax',slot(72));a.test('rax','rax');a.jcc('e',close);a.load('rax',slot(88));a.test('rax','rax');a.jcc('e',posixWrite);
  if(target.startsWith('win32-')){a.load('rcx',slot(56));a.load('rdx',slot(80));a.load('r8',slot(72));a.lea('r9',slot(112));a.mov('rax',0);a.store(slot(32),'rax');a.callImport('WriteFile');a.test('rax','rax');a.jcc('e',close);a.load('rax',slot(112),32)}else a.jmp(close);
  const written=a.unique('written');a.jmp(written);a.label(posixWrite);
  if(target!=='win32-arm64'){
   const linux=target.startsWith('linux-')||target==='win32-x64',arm=target==='linux-arm64',darwin=target.startsWith('darwin-');a.load('rdi',slot(56));a.load('rsi',slot(80));a.load('rdx',slot(72));a.syscall(linux?(arm?64:1):darwin?0x2000004:4);
   if(!linux){const ok=a.unique('writeOk');a.jcc('ae',ok);a.cmp('rax',4);a.jcc('e',write);a.jmp(close);a.label(ok)}else{a.cmp('rax',-4);a.jcc('e',write)}
  }else a.jmp(close);
  a.label(written);a.test('rax','rax');a.jcc('le',close);a.load('r10',slot(72));a.cmp('rax','r10');a.jcc('a',close);a.sub('r10','rax');a.store(slot(72),'r10');a.load('r10',slot(80));a.add('r10','rax');a.store(slot(80),'r10');a.jmp(write);
  a.label(close);a.load('rax',slot(120));a.test('rax','rax');a.jcc('ne',failed);a.load('rax',slot(88));a.test('rax','rax');a.jcc('e',posixClose);if(target.startsWith('win32-')){a.load('rcx',slot(56));a.callImport('CloseHandle')}a.jmp(failed);a.label(posixClose);
  if(target!=='win32-arm64'){a.load('rdi',slot(56));a.syscall(target.startsWith('linux-')||target==='win32-x64'?(target==='linux-arm64'?57:3):target.startsWith('darwin-')?0x2000006:6)}
  a.label(failed);a.mov('rax',0);a.store({rip:'process.report.busy'},'rax');a.label(done);a.load('rdi',slot(96));a.load('rsi',slot(104));
 });
}
