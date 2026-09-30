import {RuntimeBuilder,slot} from './abi.js';
import {rootedFn} from './root-scope.js';
import {DateLayout} from './date.js';

export const dateMonthSetters=['setMonth','setUTCMonth'] as const;

export function emitDateMonthSetters(b:RuntimeBuilder):void {
 for(const name of dateMonthSetters)rootedFn(b,'rt.Date.'+name+'.fn.code',312,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:1}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.load('rdx',slot(frame+40));a.load('rax',{base:'rdx'});a.store(slot(80),'rax');a.load('rax',{base:'rdx',disp:8});a.store(slot(88),'rax');
  a.lea('rcx',slot(96));a.call('rt.dateComponents');
  a.load('r10',slot(88));a.load('rax',{base:'r10',disp:DateLayout.time});a.store(slot(64),'rax');
  for(const [index,offset] of [[0,176],[1,192]] as const){
   a.load('rax',slot(48));a.cmp('rax',index+1);const absent=a.unique('absent'),next=a.unique('next');a.jcc('b',absent);
   a.load('rdx',slot(56));if(index)a.add('rdx',16);a.lea('rcx',slot(offset));a.call('rt.toNumber');a.jmp(next);
   a.label(absent);if(index===0){a.mov('rax',0x7ff8000000000000n);a.store(slot(184),'rax');}a.label(next);
  }
  const invalidOriginal=a.unique('invalidOriginal'),done=a.unique('done');a.load('rax',slot(96));a.test('rax','rax');a.jcc('e',invalidOriginal);
  a.load('rax',slot(104));a.cvtsi2sd('xmm0','rax');a.storesd(slot(168),'xmm0');
  a.load('rax',slot(48));a.cmp('rax',2);const suppliedDay=a.unique('suppliedDay');a.jcc('ae',suppliedDay);
  a.load('rax',slot(120));a.cvtsi2sd('xmm0','rax');a.storesd(slot(200),'xmm0');a.label(suppliedDay);
  a.movsd('xmm0',slot(64));a.cvttsd2si('rax','xmm0');a.emit([0x48,0x99]);a.mov('r10',86400000);a.idiv('r10');
  a.test('rdx','rdx');const positive=a.unique('positive');a.jcc('ge',positive);a.add('rdx',86400000);a.label(positive);a.store(slot(72),'rdx');
  for(const [offset,scale] of [[216,3600000],[232,60000],[248,1000]] as const){
   a.load('rax',slot(72));a.xor('rdx','rdx');a.mov('r10',scale);a.div('r10');a.cvtsi2sd('xmm0','rax');a.storesd(slot(offset),'xmm0');a.store(slot(72),'rdx');
  }
  a.load('rax',slot(72));a.cvtsi2sd('xmm0','rax');a.storesd(slot(264),'xmm0');
  a.lea('rcx',slot(136));a.lea('rdx',slot(160));a.mov('r8',0);a.call('rt.dateMakeTime');
  a.load('r10',slot(88));a.load('rax',slot(144));a.store({base:'r10',disp:DateLayout.time},'rax');a.jmp(done);
  a.label(invalidOriginal);a.mov('rax',0x7ff8000000000000n);a.store(slot(144),'rax');a.label(done);
  a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.load('rax',slot(144));a.store({base:'rcx',disp:8},'rax');
 });
}
