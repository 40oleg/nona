import {RuntimeBuilder,slot} from './abi.js';

/** Heapsort paired Value and uint64 ordering arrays without callbacks/GC.
 * Numeric indices use their value; other keys use 2^32 + creation ordinal. */
export function emitKeySort(b:RuntimeBuilder):void {
 b.fn('rt.swapOwnKeys',40,a=>{
  a.mov('r10','r8');a.shl('r10',3);a.add('r10','rdx');a.mov('r11','r9');a.shl('r11',3);a.add('r11','rdx');a.load('rax',{base:'r10'});a.load('rdx',{base:'r11'});a.store({base:'r10'},'rdx');a.store({base:'r11'},'rax');
  a.mov('r10','r8');a.shl('r10',4);a.add('r10','rcx');a.mov('r11','r9');a.shl('r11',4);a.add('r11','rcx');
  for(const n of [0,8]){a.load('rax',{base:'r10',disp:n});a.load('rdx',{base:'r11',disp:n});a.store({base:'r10',disp:n},'rdx');a.store({base:'r11',disp:n},'rax');}
 });
 b.fn('rt.siftOwnKeys',88,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.store(slot(64),'r9');const loop=a.unique('loop'),chosen=a.unique('chosen'),done=a.unique('done');
  a.label(loop);a.load('rax',slot(56));a.shl('rax',1);a.add('rax',1);a.load('r10',slot(64));a.cmp('rax','r10');a.jcc('ae',done);a.store(slot(72),'rax');a.add('rax',1);a.cmp('rax','r10');a.jcc('ae',chosen);
  a.shl('rax',3);a.load('rdx',slot(48));a.add('rax','rdx');a.load('r10',{base:'rax'});a.load('r11',{base:'rax',disp:-8});a.cmp('r10','r11');a.jcc('be',chosen);a.load('rax',slot(72));a.add('rax',1);a.store(slot(72),'rax');
  a.label(chosen);a.load('rdx',slot(48));a.load('rax',slot(56));a.shl('rax',3);a.add('rax','rdx');a.load('r10',{base:'rax'});a.load('rax',slot(72));a.shl('rax',3);a.add('rax','rdx');a.load('r11',{base:'rax'});a.cmp('r10','r11');a.jcc('ae',done);
  a.load('rcx',slot(40));a.load('r8',slot(56));a.load('r9',slot(72));a.call('rt.swapOwnKeys');a.load('rax',slot(72));a.store(slot(56),'rax');a.jmp(loop);a.label(done);
 });
 b.fn('rt.sortOwnKeys',88,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.mov('rax','r8');a.shr('rax',1);a.store(slot(64),'rax');
  const build=a.unique('build'),extract=a.unique('extract'),loop=a.unique('loop'),done=a.unique('done');
  a.label(build);a.load('rax',slot(64));a.test('rax','rax');a.jcc('e',extract);a.sub('rax',1);a.store(slot(64),'rax');a.mov('r8','rax');a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r9',slot(56));a.call('rt.siftOwnKeys');a.jmp(build);
  a.label(extract);a.load('rax',slot(56));a.store(slot(64),'rax');a.label(loop);a.load('rax',slot(64));a.cmp('rax',1);a.jcc('be',done);a.sub('rax',1);a.store(slot(64),'rax');
  a.load('rcx',slot(40));a.load('rdx',slot(48));a.mov('r8',0);a.mov('r9','rax');a.call('rt.swapOwnKeys');
  a.load('rcx',slot(40));a.load('rdx',slot(48));a.mov('r8',0);a.load('r9',slot(64));a.call('rt.siftOwnKeys');a.jmp(loop);a.label(done);
 });
}
