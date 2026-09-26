import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O,PropertyAttributes as A} from './object-layout.js';
import {ValueListLayout as L} from './heap-layout.js';

/** Snapshot enumerable string keys across the prototype chain. */
export function emitForIn(b:RuntimeBuilder):void {
 b.fn('rt.requireIterable',40,a=>{
  const done=a.unique('done');a.load('rax',{base:'rcx'});a.cmp('rax',4);a.jcc('e',done);a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'rcx',disp:8});a.load('rax',{base:'rax',disp:O.kind});a.cmp('rax',1);failIf(a,'ne','rt.throwTypeError');a.label(done);
 });
 rootedFn(b,'rt.forOfValue',152,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'value',register:'r8'},{kind:'locals',offset:64,count:2}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  const array=a.unique('array'),advance=a.unique('advance'),single=a.unique('single'),copy=a.unique('copy');
  a.load('rax',{base:'rdx'});a.cmp('rax',5);a.jcc('e',array);
  a.load('r10',{base:'rdx',disp:8});a.store(slot(104),'r10');
  a.load('r11',{base:'r8',disp:8});a.movqToXmm('xmm0','r11');a.cvttsd2si('rax','xmm0');a.store(slot(112),'rax');
  a.mov('r11','rax');a.shl('r11',1);a.add('r11','r10');a.load('r11',{base:'r11',disp:8},16);a.store(slot(120),'r11');
  a.mov('rax',1);a.store(slot(128),'rax');
  a.cmp('r11',0xd800);a.jcc('b',single);a.cmp('r11',0xdbff);a.jcc('a',single);
  a.load('rax',slot(112));a.add('rax',1);a.load('r10',slot(104));a.load('r11',{base:'r10'});a.cmp('rax','r11');a.jcc('ae',single);
  a.shl('rax',1);a.add('rax','r10');a.load('r11',{base:'rax',disp:8},16);a.cmp('r11',0xdc00);a.jcc('b',single);a.cmp('r11',0xdfff);a.jcc('a',single);
  a.store(slot(136),'r11');a.mov('rax',2);a.store(slot(128),'rax');
  a.label(single);a.load('rax',slot(128));a.shl('rax',1);a.add('rax',8);a.mov('rcx','rax');a.call('rt.alloc');
  a.load('r10',slot(128));a.store({base:'rax'},'r10');a.load('r10',slot(120));a.store({base:'rax',disp:8},'r10',16);
  a.load('r10',slot(128));a.cmp('r10',2);a.jcc('ne',copy);a.load('r10',slot(136));a.store({base:'rax',disp:10},'r10',16);a.label(copy);
  a.load('rcx',slot(40));a.mov('r10',4);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');a.jmp(advance);
  a.label(array);a.load('rcx',slot(40));a.load('rdx',slot(48));a.load('r8',slot(56));a.call('rt.getProperty');a.mov('rax',1);a.store(slot(128),'rax');
  a.label(advance);a.load('r10',slot(56));a.movsd('xmm0',{base:'r10',disp:8});a.load('rax',slot(128));a.cvtsi2sd('xmm1','rax');a.addsd('xmm0','xmm1');a.storesd({base:'r10',disp:8},'xmm0');
 });
 rootedFn(b,'rt.forInHas',104,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'value',register:'r8'},{kind:'locals',offset:64,count:1}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.lea('rcx',slot(64));a.load('rdx',slot(48));a.call('rt.toObject');
  a.load('rcx',slot(40));a.lea('rdx',slot(64));a.load('r8',slot(56));a.call('rt.hasProperty');
 });
 rootedFn(b,'rt.forInKeys',184,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'locals',offset:64,count:5}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');
  a.lea('rcx',slot(64));a.mov('rdx',1);a.mov('r8',0);a.call('rt.newObject');
  const done=a.unique('done');a.load('rdx',slot(48));a.load('rax',{base:'rdx'});a.cmp('rax',1);a.jcc('be',done);
  a.lea('rcx',slot(80));a.mov('rdx',0);a.mov('r8',0);a.call('rt.newObject');
  a.lea('rcx',slot(96));a.load('rdx',slot(48));a.call('rt.toObject');
  const outer=a.unique('outer'),inner=a.unique('inner'),next=a.unique('next'),advance=a.unique('advance'),append=a.unique('append');
  a.label(outer);a.lea('rcx',slot(112));a.lea('rdx',slot(96));a.call('rt.ownKeys');
  a.mov('rax',0);a.store(slot(144),'rax');
  a.label(inner);a.load('rax',slot(144));a.load('r10',slot(120));a.load('r11',{base:'r10',disp:L.count});a.cmp('rax','r11');a.jcc('ae',next);
  a.shl('rax',4);a.add('r10',L.values);a.add('r10','rax');
  for(const offset of [0,8]){a.load('rax',{base:'r10',disp:offset});a.store(slot(128+offset),'rax');}
  a.load('rax',slot(128));a.cmp('rax',6);a.jcc('e',advance);
  a.load('rcx',slot(88));a.load('rdx',slot(136));a.call('rt.findOwnProperty');a.test('rax','rax');a.jcc('ne',advance);
  a.lea('rcx',slot(80));a.lea('rdx',slot(128));a.lea('r8',{rip:'rt.undefinedValue'});a.mov('r9',1);a.call('rt.setProperty');
  a.lea('rcx',slot(96));a.load('rdx',slot(136));a.call('rt.ownAttributes');a.and('rax',A.enumerable);a.test('rax','rax');a.jcc('ne',append);a.jmp(advance);
  a.label(append);a.lea('rcx',slot(64));a.lea('rdx',slot(128));a.call('rt.appendArrayValue');
  a.label(advance);a.load('rax',slot(144));a.add('rax',1);a.store(slot(144),'rax');a.jmp(inner);
  a.label(next);a.load('r10',slot(104));a.load('rax',{base:'r10',disp:O.prototype});a.test('rax','rax');a.jcc('e',done);
  a.store(slot(104),'rax');a.mov('rax',5);a.store(slot(96),'rax');a.jmp(outer);
  a.label(done);a.load('rcx',slot(40));for(const offset of [0,8]){a.load('rax',slot(64+offset));a.store({base:'rcx',disp:offset},'rax');}
 });
}
