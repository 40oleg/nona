import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O} from './object-layout.js';
import {DateKind,DateLayout} from './date.js';

export const dateHourSetters=['setHours','setUTCHours'] as const;

export function emitDateHourSetters(b:RuntimeBuilder):void {
 for(const name of dateHourSetters)rootedFn(b,'rt.Date.'+name+'.fn.code',184,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:1}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('r10',slot(frame+40));a.load('rax',{base:'r10'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.store(slot(80),'rax');a.load('r10',{base:'r10',disp:8});a.store(slot(88),'r10');a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',DateKind);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'r10',disp:DateLayout.time});a.store(slot(144),'rax');
  for(const [index,offset] of [[0,64],[1,96],[2,112],[3,128]] as const){
   a.load('rax',slot(48));a.cmp('rax',index+1);const absent=a.unique('absent'),next=a.unique('next');a.jcc('b',absent);
   a.load('rdx',slot(56));if(index)a.add('rdx',index*16);a.lea('rcx',slot(offset));a.call('rt.toNumber');a.jmp(next);
   a.label(absent);a.mov('rax',index===0?0x7ff8000000000000n:0n);a.store(slot(offset+8),'rax');a.label(next);
  }
  const invalid=a.unique('invalid'),invalidOriginal=a.unique('invalidOriginal'),ready=a.unique('ready'),done=a.unique('done');
  a.movsd('xmm0',slot(144));a.ucomisd('xmm0','xmm0');a.jcc('p',invalidOriginal);
  a.cvttsd2si('rax','xmm0');a.store(slot(152),'rax');a.signExtendRax();a.mov('r10',86400000);a.idiv('r10');
  a.test('rdx','rdx');const positive=a.unique('positive');a.jcc('ge',positive);a.add('rdx',86400000);a.label(positive);
  a.store(slot(160),'rdx');a.load('rax',slot(152));a.sub('rax','rdx');a.cvtsi2sd('xmm0','rax');a.storesd(slot(152),'xmm0');
  for(const [count,offset,modulus,scale] of [[2,104,3600000,60000],[3,120,60000,1000],[4,136,1000,1]] as const){
   a.load('r10',slot(48));a.cmp('r10',count);const supplied=a.unique('supplied');a.jcc('ae',supplied);
   a.load('rax',slot(160));a.xor('rdx','rdx');a.mov('r10',modulus);a.div('r10');a.mov('rax','rdx');
   if(scale!==1){a.xor('rdx','rdx');a.mov('r10',scale);a.div('r10');}
   a.cvtsi2sd('xmm0','rax');a.storesd(slot(offset),'xmm0');a.label(supplied);
  }
  for(const offset of [72,104,120,136]){
   a.movsd('xmm0',slot(offset));a.ucomisd('xmm0','xmm0');a.jcc('p',invalid);
   a.mov('rax',9223372036854775807n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',invalid);
   a.mov('rax',-9223372036854775807n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',invalid);
   a.cvttsd2si('rax','xmm0');a.cvtsi2sd('xmm0','rax');a.storesd(slot(offset),'xmm0');
  }
  a.movsd('xmm0',slot(152));
  for(const [offset,scale] of [[72,3600000],[104,60000],[120,1000],[136,1]] as const){
   a.movsd('xmm1',slot(offset));if(scale!==1){a.mov('rax',scale);a.cvtsi2sd('xmm2','rax');a.mulsd('xmm1','xmm2');}a.addsd('xmm0','xmm1');
  }
  a.mov('rax',8640000000000000n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('a',invalid);
  a.mov('rax',-8640000000000000n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('b',invalid);
  a.cvttsd2si('rax','xmm0');a.cvtsi2sd('xmm0','rax');a.storesd(slot(72),'xmm0');a.jmp(ready);
  a.label(invalid);a.mov('rax',0x7ff8000000000000n);a.store(slot(72),'rax');a.jmp(ready);
  a.label(invalidOriginal);a.mov('rax',0x7ff8000000000000n);a.store(slot(72),'rax');a.jmp(done);
  a.label(ready);a.load('r10',slot(88));a.load('rax',slot(72));a.store({base:'r10',disp:DateLayout.time},'rax');a.label(done);
  a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.load('rax',slot(72));a.store({base:'rcx',disp:8},'rax');
 });
}
