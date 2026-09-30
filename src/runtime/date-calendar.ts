import {RuntimeBuilder,slot} from './abi.js';
import {rootedFn} from './root-scope.js';

// The host local-time policy is UTC. Calendar arithmetic is integer Gregorian
// arithmetic, independent of the Windows and Linux C runtimes.
export function emitDateCalendar(b:RuntimeBuilder):void {
 // RCX Number Value output; RDX pointer to seven Number Values: year, month,
 // day, hour, minute, second, millisecond. Every element is already ToNumber.
 // R8=1 requests the Date.UTC/constructor 0..99 year adjustment; R8=2
 // leaves the result unclipped so Date.parse can apply a timezone first.
 b.fn('rt.dateMakeTime',248,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(184),'r8');
  const invalid=a.unique('invalid'),finish=a.unique('finish');
  for(let i=0;i<7;i++){
   a.load('r10',slot(48));a.movsd('xmm0',{base:'r10',disp:i*16+8});a.ucomisd('xmm0','xmm0');a.jcc('p',invalid);
   if(i<3){a.mov('rax',1000000000000n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('a',invalid);
    a.mov('rax',-1000000000000n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('b',invalid);}
   a.cvttsd2si('rax','xmm0');a.store(slot(64+8*i),'rax');
  }
  // MakeFullYear: years 0..99 denote 1900..1999.
  a.load('rax',slot(64));const yearReady=a.unique('yearReady');a.load('r10',slot(184));a.cmp('r10',1);a.jcc('ne',yearReady);a.test('rax','rax');a.jcc('l',yearReady);a.cmp('rax',99);a.jcc('g',yearReady);a.add('rax',1900);a.store(slot(64),'rax');a.label(yearReady);
  // Normalize month to [0, 11] using floor division.
  a.load('rax',slot(72));a.emit([0x48,0x99]);a.mov('r10',12);a.idiv('r10');
  const monthPositive=a.unique('monthPositive');a.test('rdx','rdx');a.jcc('ge',monthPositive);a.add('rdx',12);a.sub('rax',1);a.label(monthPositive);
  a.store(slot(120),'rdx');a.load('r10',slot(64));a.add('r10','rax');a.store(slot(64),'r10');
  // days_from_civil: shift March to month zero, then split into 400-year eras.
  a.load('rax',slot(120));a.add('rax',1);a.store(slot(128),'rax');
  a.load('r10',slot(64));a.cmp('rax',2);const march=a.unique('march');a.jcc('a',march);a.sub('r10',1);a.label(march);a.store(slot(136),'r10');
  a.mov('rax','r10');a.emit([0x48,0x99]);a.mov('r11',400);a.idiv('r11');
  const eraPositive=a.unique('eraPositive');a.test('rdx','rdx');a.jcc('ge',eraPositive);a.sub('rax',1);a.label(eraPositive);a.store(slot(144),'rax');
  a.mov('r11',400);a.imul('rax','r11');a.load('r10',slot(136));a.sub('r10','rax');a.store(slot(152),'r10');
  a.load('rax',slot(128));a.cmp('rax',2);const winter=a.unique('winter'),monthDone=a.unique('monthDone');a.jcc('be',winter);a.sub('rax',3);a.jmp(monthDone);a.label(winter);a.add('rax',9);a.label(monthDone);
  a.mov('r10',153);a.imul('rax','r10');a.add('rax',2);a.xor('rdx','rdx');a.mov('r10',5);a.div('r10');
  a.load('r10',slot(80));a.add('rax','r10');a.sub('rax',1);a.store(slot(160),'rax');
  a.load('rax',slot(152));a.mov('r10',365);a.imul('rax','r10');a.store(slot(168),'rax');
  a.load('rax',slot(152));a.xor('rdx','rdx');a.mov('r10',4);a.div('r10');a.load('r11',slot(168));a.add('r11','rax');a.store(slot(168),'r11');
  a.load('rax',slot(152));a.xor('rdx','rdx');a.mov('r10',100);a.div('r10');a.load('r11',slot(168));a.sub('r11','rax');a.load('rax',slot(160));a.add('r11','rax');
  a.load('rax',slot(144));a.mov('r10',146097);a.imul('rax','r10');a.add('rax','r11');a.sub('rax',719468);
  a.store(slot(176),'rax');
  // MakeTime and MakeDate use IEEE-754 operations in their specified order.
  // Truncate finite component inputs before multiplication, preserving values
  // larger than int64 (which are already integral at binary64 precision).
  for(let i=3;i<7;i++){
   a.load('r10',slot(48));a.movsd('xmm0',{base:'r10',disp:i*16+8});
   a.mov('rax',0x7ff0000000000000n);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('e',invalid);
   a.mov('rax',0xfff0000000000000n);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('e',invalid);
   const large=a.unique('large');a.mov('rax',9223372036854775807n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',large);
   a.mov('rax',-9223372036854775807n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',large);
   a.cvttsd2si('rax','xmm0');a.cvtsi2sd('xmm0','rax');a.label(large);a.storesd(slot(192+8*(i-3)),'xmm0');
  }
  a.movsd('xmm0',slot(192));a.mov('rax',3600000);a.cvtsi2sd('xmm1','rax');a.mulsd('xmm0','xmm1');
  for(const [offset,scale] of [[200,60000],[208,1000],[216,1]] as const){a.movsd('xmm1',slot(offset));if(scale!==1){a.mov('rax',scale);a.cvtsi2sd('xmm2','rax');a.mulsd('xmm1','xmm2');}a.addsd('xmm0','xmm1');}
  a.storesd(slot(224),'xmm0');a.load('rax',slot(176));a.cvtsi2sd('xmm0','rax');a.mov('rax',86400000);a.cvtsi2sd('xmm1','rax');a.mulsd('xmm0','xmm1');a.addsd('xmm0',slot(224));
  const storeResult=a.unique('storeResult');a.load('r10',slot(184));a.cmp('r10',2);a.jcc('e',storeResult);
  a.mov('rax',8640000000000000n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('a',invalid);
  a.mov('rax',-8640000000000000n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('b',invalid);
  a.cvttsd2si('rax','xmm0');a.cvtsi2sd('xmm0','rax');a.label(storeResult);a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');a.jmp(finish);
  a.label(invalid);a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.mov('rax',0x7ff8000000000000n);a.store({base:'rcx',disp:8},'rax');a.label(finish);
 });
 // Gather arguments in observable left-to-right order before calendar math.
 rootedFn(b,'rt.dateArgumentsMs',232,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:7}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  for(let i=0;i<7;i++){
   a.mov('rax',3);a.store(slot(80+16*i),'rax');
   a.mov('rax',0);if(i===2){a.mov('rax',1);a.cvtsi2sd('xmm0','rax');a.storesd(slot(80+16*i+8),'xmm0');}
   else a.store(slot(80+16*i+8),'rax');
  }
  a.mov('rax',0);a.store(slot(64),'rax');const loop=a.unique('loop'),done=a.unique('done');a.label(loop);
  a.load('rax',slot(64));a.load('r10',slot(48));a.cmp('rax','r10');a.jcc('ae',done);a.cmp('rax',7);a.jcc('ae',done);
  a.shl('rax',4);a.load('rdx',slot(56));a.add('rdx','rax');a.lea('rcx',slot(80));a.add('rcx','rax');a.call('rt.toNumber');
  a.load('rax',slot(64));a.add('rax',1);a.store(slot(64),'rax');a.jmp(loop);
  a.label(done);a.load('rcx',slot(40));a.lea('rdx',slot(80));a.mov('r8',1);a.call('rt.dateMakeTime');
 });
}
