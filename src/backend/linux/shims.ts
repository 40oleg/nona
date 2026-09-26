import {RuntimeBuilder,slot} from '../../runtime/abi.js';
import {GeneratorStack} from '../../runtime/generator-stack.js';
import type {NamedFragment,NativeProgram} from '../pe/model.js';

/** Linux syscall implementations of the small Win64-style native ABI used by
 * the existing runtime. They let semantic runtime code remain target-neutral.
 */
export function linuxShims(imports:NativeProgram['imports']):NamedFragment[] {
 const b=new RuntimeBuilder();
 for(const {symbol} of imports){
  b.bundle.fragments.push({name:symbol,section:'.rdata',alignment:8,bytes:new Uint8Array(8),symbols:{},fixups:[
   {offset:0,kind:'va64',target:'linux.'+symbol+'.code',addend:0},
  ]});
 }
 b.fn('linux.GetProcessHeap.code',40,a=>a.mov('rax',1));
 b.fn('linux.HeapAlloc.code',72,a=>{
  a.store(slot(48),'rsi');a.store(slot(56),'rdi');
  a.mov('rsi','r8');a.add('rsi',16);const bad=a.unique('bad'),done=a.unique('done');a.jcc('b',bad);
  a.store(slot(40),'rsi');a.mov('rdi',0);a.mov('rdx',3);a.mov('r10',0x22);a.mov('r8',-1);a.mov('r9',0);a.mov('rax',9);a.emit([0x0f,0x05]);
  a.cmp('rax',-4095);a.jcc('ae',bad);a.load('r10',slot(40));a.store({base:'rax'},'r10');a.add('rax',16);a.jmp(done);
  a.label(bad);a.mov('rax',0);a.label(done);a.load('rsi',slot(48));a.load('rdi',slot(56));
 });
 b.fn('linux.HeapFree.code',56,a=>{
  a.store(slot(40),'rsi');a.store(slot(48),'rdi');
  const no=a.unique('no'),done=a.unique('done');a.test('r8','r8');a.jcc('e',no);
  a.mov('rdi','r8');a.sub('rdi',16);a.load('rsi',{base:'rdi'});a.mov('rax',11);a.emit([0x0f,0x05]);
  a.test('rax','rax');a.jcc('ne',no);a.mov('rax',1);a.jmp(done);
  a.label(no);a.mov('rax',0);a.label(done);a.load('rsi',slot(40));a.load('rdi',slot(48));
 });
 // These three imports currently serve only the fixed-size guarded generator
 // stack. Keep that contract explicit until a general virtual memory shim is
 // needed by another runtime feature.
 b.fn('linux.VirtualAlloc.code',72,a=>{
  a.store(slot(40),'rsi');a.store(slot(48),'rdi');
  const bad=a.unique('bad'),done=a.unique('done');
  a.test('rcx','rcx');a.jcc('ne',bad);a.cmp('rdx',GeneratorStack.bytes);a.jcc('ne',bad);
  a.cmp('r8',0x3000);a.jcc('ne',bad);a.cmp('r9',4);a.jcc('ne',bad);
  a.mov('rdi',0);a.mov('rsi',GeneratorStack.bytes);a.mov('rdx',3);a.mov('r10',0x22);a.mov('r8',-1);a.mov('r9',0);a.mov('rax',9);a.emit([0x0f,0x05]);
  a.cmp('rax',-4095);a.jcc('b',done);
  a.label(bad);a.mov('rax',0);a.label(done);a.load('rsi',slot(40));a.load('rdi',slot(48));
 });
 b.fn('linux.VirtualProtect.code',72,a=>{
  a.store(slot(40),'rsi');a.store(slot(48),'rdi');
  const bad=a.unique('bad'),done=a.unique('done');
  a.cmp('rdx',GeneratorStack.guard);a.jcc('ne',bad);a.cmp('r8',1);a.jcc('ne',bad);
  a.mov('rax',4);a.store({base:'r9'},'rax',32);
  a.mov('rdi','rcx');a.mov('rsi','rdx');a.mov('rdx',0);a.mov('rax',10);a.emit([0x0f,0x05]);
  a.test('rax','rax');a.jcc('ne',bad);a.mov('rax',1);a.jmp(done);
  a.label(bad);a.mov('rax',0);a.label(done);a.load('rsi',slot(40));a.load('rdi',slot(48));
 });
 b.fn('linux.VirtualFree.code',72,a=>{
  a.store(slot(40),'rsi');a.store(slot(48),'rdi');
  const bad=a.unique('bad'),done=a.unique('done');
  a.test('rdx','rdx');a.jcc('ne',bad);a.cmp('r8',0x8000);a.jcc('ne',bad);
  a.mov('rdi','rcx');a.mov('rsi',GeneratorStack.bytes);a.mov('rax',11);a.emit([0x0f,0x05]);
  a.test('rax','rax');a.jcc('ne',bad);a.mov('rax',1);a.jmp(done);
  a.label(bad);a.mov('rax',0);a.label(done);a.load('rsi',slot(40));a.load('rdi',slot(48));
 });
 b.fn('linux.GetStdHandle.code',40,a=>{
  const stdout=a.unique('stdout'),done=a.unique('done');a.cmp('rcx',-12);a.jcc('ne',stdout);a.mov('rax',2);a.jmp(done);
  a.label(stdout);a.mov('rax',1);a.label(done);
 });
 b.fn('linux.GetConsoleMode.code',40,a=>a.mov('rax',0));
 b.fn('linux.WriteConsoleW.code',40,a=>a.mov('rax',0));
 b.fn('linux.WriteFile.code',72,a=>{
  a.store(slot(40),'r9');a.store(slot(48),'rsi');a.store(slot(56),'rdi');a.mov('rdi','rcx');a.mov('rsi','rdx');a.mov('rdx','r8');a.mov('rax',1);a.emit([0x0f,0x05]);
  const failed=a.unique('failed'),done=a.unique('done');a.cmp('rax',-4095);a.jcc('ae',failed);
  a.load('r10',slot(40));a.store({base:'r10'},'rax',32);a.mov('rax',1);a.jmp(done);
  a.label(failed);a.mov('rax',0);a.label(done);a.load('rsi',slot(48));a.load('rdi',slot(56));
 });
 b.fn('linux.ExitProcess.code',40,a=>{a.mov('rdi','rcx');a.mov('rax',60);a.emit([0x0f,0x05]);});
 b.fn('linux.WideCharToMultiByte.code',120,a=>{
  a.store(slot(40),'r8');a.store(slot(48),'r9');a.load('rax',slot(160));a.store(slot(56),'rax');a.load('rax',slot(168));a.store(slot(64),'rax');a.mov('rax',0);a.store(slot(72),'rax');
  const loop=a.unique('loop'),done=a.unique('done'),invalid=a.unique('invalid'),encoded=a.unique('encoded');
  const lowCheck=a.unique('lowCheck'),pair=a.unique('pair'),size2=a.unique('size2'),size3=a.unique('size3'),size4=a.unique('size4'),sized=a.unique('sized');
  const write=a.unique('write'),next=a.unique('next'),one=a.unique('one'),two=a.unique('two'),three=a.unique('three'),four=a.unique('four'),bad=a.unique('bad');
  a.label(loop);a.load('r10',slot(48));a.test('r10','r10');a.jcc('e',done);
  a.load('r11',slot(40));a.load('rax',{base:'r11'},16);a.add('r11',2);a.store(slot(40),'r11');a.sub('r10',1);a.store(slot(48),'r10');
  a.cmp('rax',0xd800);a.jcc('b',encoded);a.cmp('rax',0xdbff);a.jcc('a',lowCheck);
  a.test('r10','r10');a.jcc('e',invalid);a.load('r11',{base:'r11'},16);a.cmp('r11',0xdc00);a.jcc('b',invalid);a.cmp('r11',0xdfff);a.jcc('a',invalid);
  a.sub('rax',0xd800);a.shl('rax',10);a.sub('r11',0xdc00);a.add('rax','r11');a.add('rax',0x10000);
  a.load('r11',slot(40));a.add('r11',2);a.store(slot(40),'r11');a.load('r10',slot(48));a.sub('r10',1);a.store(slot(48),'r10');a.jmp(encoded);
  a.label(lowCheck);a.cmp('rax',0xdc00);a.jcc('b',encoded);a.cmp('rax',0xdfff);a.jcc('a',encoded);
  a.label(invalid);a.mov('rax',0xfffd);
  a.label(encoded);a.mov('r8',1);a.cmp('rax',0x80);a.jcc('b',sized);a.mov('r8',2);a.cmp('rax',0x800);a.jcc('b',sized);a.mov('r8',3);a.cmp('rax',0x10000);a.jcc('b',sized);a.mov('r8',4);
  a.label(sized);a.load('r10',slot(72));a.load('r11',slot(56));a.test('r11','r11');a.jcc('e',next);
  a.mov('rdx','r10');a.add('rdx','r8');a.load('rcx',slot(64));a.cmp('rdx','rcx');a.jcc('a',bad);a.add('r11','r10');
  a.cmp('r8',1);a.jcc('e',one);a.cmp('r8',2);a.jcc('e',two);a.cmp('r8',3);a.jcc('e',three);a.jmp(four);
  a.label(one);a.store({base:'r11'},'rax',8);a.jmp(next);
  a.label(two);a.mov('rdx','rax');a.shr('rdx',6);a.or('rdx',0xc0);a.store({base:'r11'},'rdx',8);
  a.mov('rdx','rax');a.and('rdx',0x3f);a.or('rdx',0x80);a.store({base:'r11',disp:1},'rdx',8);a.jmp(next);
  a.label(three);a.mov('rdx','rax');a.shr('rdx',12);a.or('rdx',0xe0);a.store({base:'r11'},'rdx',8);
  a.mov('rdx','rax');a.shr('rdx',6);a.and('rdx',0x3f);a.or('rdx',0x80);a.store({base:'r11',disp:1},'rdx',8);
  a.mov('rdx','rax');a.and('rdx',0x3f);a.or('rdx',0x80);a.store({base:'r11',disp:2},'rdx',8);a.jmp(next);
  a.label(four);a.mov('rdx','rax');a.shr('rdx',18);a.or('rdx',0xf0);a.store({base:'r11'},'rdx',8);
  a.mov('rdx','rax');a.shr('rdx',12);a.and('rdx',0x3f);a.or('rdx',0x80);a.store({base:'r11',disp:1},'rdx',8);
  a.mov('rdx','rax');a.shr('rdx',6);a.and('rdx',0x3f);a.or('rdx',0x80);a.store({base:'r11',disp:2},'rdx',8);
  a.mov('rdx','rax');a.and('rdx',0x3f);a.or('rdx',0x80);a.store({base:'r11',disp:3},'rdx',8);
  a.label(next);a.add('r10','r8');a.store(slot(72),'r10');a.jmp(loop);
  a.label(bad);a.mov('rax',0);a.jmp(write);
  a.label(done);a.load('rax',slot(72));a.label(write);
 });
 return b.bundle.fragments;
}
