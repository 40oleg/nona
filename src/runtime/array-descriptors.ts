import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {DescriptorLayout as D,DescriptorFields as F} from './descriptor-layout.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A,ObjectFlags as OF} from './object-layout.js';

export function emitArrayDescriptors(b:RuntimeBuilder):void {
 // ArraySetLength performs ToUint32 and then a separate ToNumber of the source.
 rootedFn(b,'rt.normalizeArrayLength',104,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'locals',offset:64,count:2}],a=>{
  a.store(slot(40),'rcx');for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(64+n),'rax');}
  a.lea('rcx',slot(64));a.call('rt.toInt32');a.shl('rax',32);a.shr('rax',32);a.store(slot(48),'rax');
  a.lea('rcx',slot(80));a.lea('rdx',slot(64));a.call('rt.toNumber');a.movsd('xmm0',slot(88));a.load('rax',slot(48));a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'p','rt.throwRangeError');failIf(a,'ne','rt.throwRangeError');
  a.load('rcx',slot(40));a.storesd({base:'rcx',disp:8},'xmm1');a.mov('rax',3);a.store({base:'rcx'},'rax');
 });
 // Raw array + validated complete length descriptor -> success Boolean.
 // Deletion invokes no JS. Two scans are equivalent to descending index order:
 // find the highest nonconfigurable barrier, then delete only indices above it.
 b.fn('rt.applyArrayLength',104,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.movsd('xmm0',{base:'rdx',disp:D.value+8});a.cvttsd2si('rax','xmm0');a.store(slot(56),'rax');a.mov('rax',0);a.store(slot(72),'rax');
  a.load('rax',{base:'rcx',disp:O.properties});a.store(slot(88),'rax');const scan=a.unique('scan'),next=a.unique('next'),apply=a.unique('apply');
  // Growing (or keeping) the length deletes nothing: every index key is below
  // the old length, so both list walks are skipped.
  a.mov('rax',0);a.store(slot(96),'rax');a.load('rax',slot(56));a.load('r10',{base:'rcx',disp:O.length});a.cmp('rax','r10');
  {const shrink=a.unique('shrink');a.jcc('b',shrink);a.mov('rax',1);a.store(slot(96),'rax');a.jmp(apply);a.label(shrink);}
  a.label(scan);a.load('rax',slot(88));a.test('rax','rax');a.jcc('e',apply);a.load('r10',{base:'rax',disp:P.attributes});a.and('r10',A.configurable);a.test('r10','r10');a.jcc('ne',next);
  a.load('rcx',{base:'rax',disp:P.key});a.call('rt.arrayIndex');a.cmp('rax',-1);a.jcc('e',next);a.load('r10',slot(56));a.cmp('rax','r10');a.jcc('b',next);a.add('rax',1);a.store(slot(56),'rax');a.mov('rax',1);a.store(slot(72),'rax');
  a.label(next);a.load('rax',slot(88));a.load('rax',{base:'rax',disp:P.next});a.store(slot(88),'rax');a.jmp(scan);
  a.label(apply);a.load('rcx',slot(40));a.load('rax',slot(56));a.store({base:'rcx',disp:O.length},'rax');a.load('rdx',slot(48));a.load('rax',{base:'rdx',disp:D.writable+8});a.test('rax','rax');
  const writable=a.unique('writable');a.jcc('ne',writable);a.load('rax',{base:'rcx',disp:O.flags});a.or('rax',OF.lengthReadonly);a.store({base:'rcx',disp:O.flags},'rax');a.label(writable);
  const loop=a.unique('loop'),keep=a.unique('keep'),done=a.unique('done');a.load('rax',slot(96));a.test('rax','rax');a.jcc('ne',done);
  a.add('rcx',O.properties);a.store(slot(80),'rcx');
  a.label(loop);a.load('r10',slot(80));a.load('rax',{base:'r10'});a.test('rax','rax');a.jcc('e',done);a.store(slot(88),'rax');
  a.load('rcx',{base:'rax',disp:P.key});a.call('rt.arrayIndex');a.cmp('rax',-1);a.jcc('e',keep);a.load('r10',slot(56));a.cmp('rax','r10');a.jcc('b',keep);
  a.load('r11',slot(88));a.load('rax',{base:'r11',disp:P.next});a.load('r10',slot(80));a.store({base:'r10'},'rax');a.load('rcx',slot(40));a.load('rdx',{base:'r11',disp:P.key});a.call('rt.propIndexDrop');a.load('r11',slot(88));a.mov('rax',0);for(const n of [P.next,P.key,P.value,P.value+8,P.getter,P.getter+8,P.setter,P.setter+8])a.store({base:'r11',disp:n},'rax');a.jmp(loop);
  a.label(keep);a.load('rax',slot(88));a.add('rax',P.next);a.store(slot(80),'rax');a.jmp(loop);a.label(done);a.load('rax',slot(72));a.xor('rax',1);
 });
 // Existing assignment/Array constructor entry. Failed sloppy shrink is ignored;
 // malformed lengths still fail in normalization. Assignment checks readonly
 // before entry, so it does not coerce an ignored RHS object.
 rootedFn(b,'rt.setArrayLength',184,[{kind:'pointer',register:'rcx'},{kind:'value',register:'rdx'},{kind:'locals',offset:64,count:7}],a=>{
  a.mov('rax',5);a.store(slot(64),'rax');a.store(slot(72),'rcx');for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(80+D.value+n),'rax');}a.mov('rax',F.value);a.store(slot(80+D.present),'rax');
  a.lea('rcx',slot(64));a.lea('rdx',{rip:'rt.key.length'});a.lea('r8',slot(80));a.call('rt.defineOwnProperty');
 });
}
