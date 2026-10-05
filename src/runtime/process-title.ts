import {RuntimeBuilder} from './abi.js';

/** Original writable process argument storage; never touches startup environ. */
export function emitProcessTitle(b:RuntimeBuilder):void {
 b.data('process.titleBuffer',new Uint8Array(2048),'.data');
 b.data('process.titleActive',new Uint8Array(8),'.data');
 b.bundle.fragments.push({name:'process.titleVector',section:'.data',alignment:8,bytes:new Uint8Array(16),symbols:{},fixups:[{offset:0,kind:'va64',target:'process.titleBuffer',addend:0}]});
 b.fn('process.titleAddress.code',40,a=>{
  const done=a.unique('done');a.load('rax',{rip:'process.titleActive'});a.test('rax','rax');a.jcc('ne',done);
  a.load('rax',{rip:'process.startupArgv'});a.test('rax','rax');a.jcc('e',done);a.load('rax',{base:'rax'});a.label(done);
 });
 b.fn('process.titleCapacity.code',40,a=>{
  const next=a.unique('next'),scan=a.unique('scan'),done=a.unique('done');a.mov('rax',0);a.load('r8',{rip:'process.startupArgv'});a.test('r8','r8');a.jcc('e',done);
  a.load('rdx',{base:'r8'});a.test('rdx','rdx');a.jcc('e',done);a.mov('r9','rdx');a.label(next);
  a.load('r10',{base:'r8'});a.cmp('r10','r9');a.jcc('ne',done);a.label(scan);a.load('r10',{base:'r9'},8);a.add('r9',1);a.test('r10','r10');a.jcc('ne',scan);
  a.mov('rax','r9');a.sub('rax','rdx');a.sub('rax',1);a.add('r8',8);a.jmp(next);a.label(done);
 });
 // RCX UTF-8 input, RDX byte count, R8 previously measured capacity.
 b.fn('process.writeArgumentTitle.code',40,a=>{
  const copy=a.unique('copy'),fill=a.unique('fill'),done=a.unique('done');a.load('r9',{rip:'process.startupArgv'});a.test('r9','r9');a.jcc('e',done);a.load('r9',{base:'r9'});
  a.label(copy);a.test('r8','r8');a.jcc('e',fill);a.test('rdx','rdx');a.jcc('e',fill);a.load('r10',{base:'rcx'},8);a.store({base:'r9'},'r10',8);a.add('rcx',1);a.add('r9',1);a.sub('rdx',1);a.sub('r8',1);a.jmp(copy);
  a.label(fill);a.mov('r10',0);a.store({base:'r9'},'r10',8);a.add('r9',1);a.test('r8','r8');a.jcc('e',done);a.sub('r8',1);a.jmp(fill);a.label(done);
 });
 // RCX valid ps_strings pointer, RDX UTF-8 input, R8 length <=2047.
 b.fn('process.writePsTitle.code',40,a=>{
  const copy=a.unique('copy'),done=a.unique('done');a.lea('r9',{rip:'process.titleBuffer'});a.store({rip:'process.titleActive'},'r9');a.label(copy);a.test('r8','r8');a.jcc('e',done);
  a.load('r10',{base:'rdx'},8);a.store({base:'r9'},'r10',8);a.add('rdx',1);a.add('r9',1);a.sub('r8',1);a.jmp(copy);a.label(done);a.mov('r10',0);a.store({base:'r9'},'r10',8);
  a.lea('r10',{rip:'process.titleVector'});a.store({base:'rcx'},'r10');a.mov('r10',1);a.store({base:'rcx',disp:8},'r10',32);
 });
}
