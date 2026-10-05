import {RuntimeBuilder,slot} from './abi.js';

/** Own a UTF-8 envp vector independently of immutable kernel startup storage. */
export function emitProcessEnvironment(b:RuntimeBuilder):void {
 b.data('process.environmentVector',new Uint8Array(8),'.data');
 b.data('process.environmentBytes',new Uint8Array(8),'.data');
 b.fn('process.environmentVector.code',40,a=>a.load('rax',{rip:'process.environmentVector'}));
 b.fn('process.environmentContains.code',40,a=>{
  a.load('r8',{rip:'process.environmentVector'});const next=a.unique('envNext'),compare=a.unique('envCompare'),miss=a.unique('envMiss'),yes=a.unique('envYes'),done=a.unique('envHasDone');
  a.mov('rax',0);a.test('r8','r8');a.jcc('e',done);a.label(next);a.load('rdx',{base:'r8'});a.test('rdx','rdx');a.jcc('e',done);a.mov('r9','rcx');
  a.label(compare);a.load('r10',{base:'rdx'},8);a.load('r11',{base:'r9'},8);a.cmp('r10','r11');a.jcc('ne',miss);a.test('r10','r10');a.jcc('e',yes);a.add('rdx',1);a.add('r9',1);a.jmp(compare);
  a.label(miss);a.add('r8',8);a.jmp(next);a.label(yes);a.mov('rax',1);a.label(done);
 });
 // RCX packed NUL-terminated entries, RDX byte count, R8 entry count.
 // OS page allocation never enters the JavaScript allocator or collects roots.
 b.fn('process.replaceEnvironment.code',104,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.mov('rax','r8');a.add('rax',1);a.shl('rax',3);a.store(slot(56),'rax');a.add('rax','rdx');a.store(slot(64),'rax');a.mov('rcx','rax');a.call('rt.mapPages');a.store(slot(72),'rax');
  a.mov('r9','rax');a.load('r10',slot(56));a.add('rax','r10');a.mov('r8','rax');
  a.load('rdx',slot(40));a.load('rcx',slot(48));
  const loop=a.unique('envCopy'),done=a.unique('envDone'),notEnd=a.unique('envNotEnd');
  a.test('rcx','rcx');a.jcc('e',done);
  a.store({base:'r9'},'r8');a.add('r9',8);
  a.label(loop);a.test('rcx','rcx');a.jcc('e',done);a.load('r10',{base:'rdx'},8);a.store({base:'r8'},'r10',8);a.add('r8',1);a.add('rdx',1);a.sub('rcx',1);
  a.test('r10','r10');a.jcc('ne',notEnd);a.test('rcx','rcx');a.jcc('e',notEnd);a.store({base:'r9'},'r8');a.add('r9',8);a.label(notEnd);a.jmp(loop);
  a.label(done);a.mov('rax',0);a.store({base:'r9'},'rax');
  a.load('rcx',{rip:'process.environmentVector'});a.test('rcx','rcx');const empty=a.unique('envEmpty');a.jcc('e',empty);a.load('rdx',{rip:'process.environmentBytes'});a.call('rt.unmapPages');a.label(empty);
  a.load('rax',slot(72));a.store({rip:'process.environmentVector'},'rax');a.load('r10',slot(64));a.store({rip:'process.environmentBytes'},'r10');
 });
}
