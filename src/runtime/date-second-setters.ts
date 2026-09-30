import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O} from './object-layout.js';
import {DateKind,DateLayout} from './date.js';

export const dateSecondSetters=['setSeconds','setUTCSeconds'] as const;

export function emitDateSecondSetters(b:RuntimeBuilder):void {
 for(const name of dateSecondSetters)rootedFn(b,'rt.Date.'+name+'.fn.code',136,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:1}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(112),'r8');
  a.load('r10',slot(frame+40));a.load('rax',{base:'r10'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.store(slot(80),'rax');a.load('r10',{base:'r10',disp:8});a.store(slot(88),'r10');a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',DateKind);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'r10',disp:DateLayout.time});a.store(slot(56),'rax');
  a.load('rdx',slot(112));a.lea('rcx',slot(64));a.load('rax',slot(48));const noSeconds=a.unique('noSeconds'),secondsDone=a.unique('secondsDone');
  a.test('rax','rax');a.jcc('e',noSeconds);a.call('rt.toNumber');a.jmp(secondsDone);
  a.label(noSeconds);a.mov('rax',0x7ff8000000000000n);a.store(slot(72),'rax');a.label(secondsDone);
  a.load('rax',slot(48));a.cmp('rax',2);const defaultMs=a.unique('defaultMs'),msDone=a.unique('msDone');a.jcc('b',defaultMs);
  a.load('rdx',slot(112));a.add('rdx',16);a.lea('rcx',slot(96));a.call('rt.toNumber');a.jmp(msDone);
  a.label(defaultMs);a.mov('rax',0);a.store(slot(104),'rax');a.label(msDone);
  const invalid=a.unique('invalid'),invalidOriginal=a.unique('invalidOriginal'),ready=a.unique('ready'),done=a.unique('done');
  a.movsd('xmm0',slot(56));a.ucomisd('xmm0','xmm0');a.jcc('p',invalidOriginal);
  a.cvttsd2si('rax','xmm0');a.store(slot(120),'rax');a.emit([0x48,0x99]);a.mov('r10',60000);a.idiv('r10');
  a.test('rdx','rdx');const positive=a.unique('positive');a.jcc('ge',positive);a.add('rdx',60000);a.label(positive);
  a.store(slot(128),'rdx');a.load('rax',slot(120));a.sub('rax','rdx');a.cvtsi2sd('xmm0','rax');a.storesd(slot(120),'xmm0');
  a.load('rax',slot(128));a.xor('rdx','rdx');a.mov('r10',1000);a.div('r10');
  a.load('r10',slot(48));a.cmp('r10',2);const suppliedMs=a.unique('suppliedMs');a.jcc('ae',suppliedMs);
  a.cvtsi2sd('xmm0','rdx');a.storesd(slot(104),'xmm0');a.label(suppliedMs);
  for(const off of [72,104]){
   a.movsd('xmm0',slot(off));a.ucomisd('xmm0','xmm0');a.jcc('p',invalid);
   a.mov('rax',9223372036854775807n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',invalid);
   a.mov('rax',-9223372036854775807n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',invalid);
   a.cvttsd2si('rax','xmm0');a.cvtsi2sd('xmm0','rax');a.storesd(slot(off),'xmm0');
  }
  a.movsd('xmm0',slot(72));a.mov('rax',1000);a.cvtsi2sd('xmm1','rax');a.mulsd('xmm0','xmm1');a.addsd('xmm0',slot(120));a.addsd('xmm0',slot(104));
  a.mov('rax',8640000000000000n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('a',invalid);
  a.mov('rax',-8640000000000000n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('b',invalid);
  a.cvttsd2si('rax','xmm0');a.cvtsi2sd('xmm0','rax');a.storesd(slot(72),'xmm0');a.jmp(ready);
  a.label(invalid);a.mov('rax',0x7ff8000000000000n);a.store(slot(72),'rax');a.jmp(ready);
  a.label(invalidOriginal);a.mov('rax',0x7ff8000000000000n);a.store(slot(72),'rax');a.jmp(done);
  a.label(ready);a.load('r10',slot(88));a.load('rax',slot(72));a.store({base:'r10',disp:DateLayout.time},'rax');a.label(done);
  a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.load('rax',slot(72));a.store({base:'rcx',disp:8},'rax');
 });
}
