import {RuntimeBuilder,slot} from './abi.js';
import {rootedFn} from './root-scope.js';
import {DateLayout} from './date.js';

export const dateDaySetters=['setDate','setUTCDate'] as const;

export function emitDateDaySetters(b:RuntimeBuilder):void {
 for(const name of dateDaySetters)rootedFn(b,'rt.Date.'+name+'.fn.code',168,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:1}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(56),'rdx');a.store(slot(64),'r8');
  a.load('rdx',slot(frame+40));a.load('rax',{base:'rdx'});a.store(slot(80),'rax');a.load('rax',{base:'rdx',disp:8});a.store(slot(88),'rax');
  a.lea('rcx',slot(96));a.call('rt.dateComponents');
  a.load('r10',slot(88));a.load('rax',{base:'r10',disp:DateLayout.time});a.store(slot(48),'rax');
  a.load('rax',slot(56));const missing=a.unique('missing'),converted=a.unique('converted');a.test('rax','rax');a.jcc('e',missing);
  a.lea('rcx',slot(136));a.load('rdx',slot(64));a.call('rt.toNumber');a.jmp(converted);
  a.label(missing);a.mov('rax',0x7ff8000000000000n);a.store(slot(144),'rax');a.label(converted);
  const invalid=a.unique('invalid'),invalidOriginal=a.unique('invalidOriginal'),ready=a.unique('ready'),done=a.unique('done');
  a.load('rax',slot(96));a.test('rax','rax');a.jcc('e',invalidOriginal);
  a.movsd('xmm0',slot(144));a.ucomisd('xmm0','xmm0');a.jcc('p',invalid);
  a.mov('rax',9223372036854775807n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',invalid);
  a.mov('rax',-9223372036854775807n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',invalid);
  a.cvttsd2si('rax','xmm0');a.load('r10',slot(120));a.sub('rax','r10');a.cvtsi2sd('xmm0','rax');
  a.mov('rax',86400000);a.cvtsi2sd('xmm1','rax');a.mulsd('xmm0','xmm1');a.addsd('xmm0',slot(48));
  a.mov('rax',8640000000000000n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('a',invalid);
  a.mov('rax',-8640000000000000n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('b',invalid);
  a.cvttsd2si('rax','xmm0');a.cvtsi2sd('xmm0','rax');a.storesd(slot(144),'xmm0');a.jmp(ready);
  a.label(invalid);a.mov('rax',0x7ff8000000000000n);a.store(slot(144),'rax');a.jmp(ready);
  a.label(invalidOriginal);a.mov('rax',0x7ff8000000000000n);a.store(slot(144),'rax');a.jmp(done);
  a.label(ready);a.load('r10',slot(88));a.load('rax',slot(144));a.store({base:'r10',disp:DateLayout.time},'rax');a.label(done);
  a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.load('rax',slot(144));a.store({base:'rcx',disp:8},'rax');
 });
}
