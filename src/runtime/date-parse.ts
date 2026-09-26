import {RuntimeBuilder,slot} from './abi.js';
import {rootedFn} from './root-scope.js';

// ES date-time string format subset with UTC as the host local-time policy.
// The legacy implementation-defined input forms are handled separately.
export function emitDateParse(b:RuntimeBuilder):void {
 b.fn('rt.parseIsoDate',312,a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.load('rax',{base:'rdx'});a.store(slot(64),'rax');a.mov('rax',0);a.store(slot(56),'rax');a.store(slot(72),'rax');
  const invalid=a.unique('invalid'),finish=a.unique('finish');
  const peek=()=>{a.load('r10',slot(56));a.load('r11',slot(64));a.cmp('r10','r11');a.jcc('ae',invalid);a.shl('r10',1);a.load('r11',slot(48));a.add('r11','r10');a.load('r11',{base:'r11',disp:8},16);};
  const consume=(code:number)=>{peek();a.cmp('r11',code);a.jcc('ne',invalid);a.load('r10',slot(56));a.add('r10',1);a.store(slot(56),'r10');};
  const digits=(count:number,offset:number)=>{
   a.load('r10',slot(56));a.add('r10',count);a.load('r11',slot(64));a.cmp('r10','r11');a.jcc('a',invalid);
   a.mov('rax',0);for(let i=0;i<count;i++){
    a.load('r10',slot(56));a.shl('r10',1);a.load('r11',slot(48));a.add('r11','r10');a.load('r11',{base:'r11',disp:8},16);
    a.cmp('r11',48);a.jcc('b',invalid);a.cmp('r11',57);a.jcc('a',invalid);
    a.mov('r10',10);a.imul('rax','r10');a.sub('r11',48);a.add('rax','r11');a.load('r10',slot(56));a.add('r10',1);a.store(slot(56),'r10');
   }
   a.store(slot(offset),'rax');
  };
  const maybeEnd=(label:string)=>{a.load('r10',slot(56));a.load('r11',slot(64));a.cmp('r10','r11');a.jcc('e',label);};
  // Integer fields before the final MakeDate call.
  a.mov('rax',0);a.store(slot(88),'rax');a.mov('rax',1);a.store(slot(96),'rax');
  for(const offset of [104,112,120,128,136,144,152,160,168]){a.mov('rax',0);a.store(slot(offset),'rax');}
  peek();const unsigned=a.unique('unsigned'),signedDone=a.unique('signedDone');a.cmp('r11',43);a.jcc('e',signedDone);a.cmp('r11',45);a.jcc('ne',unsigned);a.mov('rax',1);a.store(slot(72),'rax');a.label(signedDone);
  a.load('r10',slot(56));a.add('r10',1);a.store(slot(56),'r10');digits(6,80);a.jmp('rt.parseIsoDate.afterYear');
  a.label(unsigned);digits(4,80);a.label('rt.parseIsoDate.afterYear');
  a.load('rax',slot(72));a.test('rax','rax');const yearSignDone=a.unique('yearSignDone');a.jcc('e',yearSignDone);a.load('rax',slot(80));a.test('rax','rax');a.jcc('e',invalid);a.neg('rax');a.store(slot(80),'rax');a.label(yearSignDone);
  maybeEnd(finish);consume(45);digits(2,88);a.load('rax',slot(88));a.cmp('rax',1);a.jcc('b',invalid);a.cmp('rax',12);a.jcc('a',invalid);a.sub('rax',1);a.store(slot(88),'rax');
  maybeEnd(finish);consume(45);digits(2,96);a.load('rax',slot(96));a.cmp('rax',1);a.jcc('b',invalid);a.cmp('rax',31);a.jcc('a',invalid);
  maybeEnd(finish);consume(84);digits(2,104);consume(58);digits(2,112);
  a.load('rax',slot(104));a.cmp('rax',24);a.jcc('a',invalid);a.load('rax',slot(112));a.cmp('rax',59);a.jcc('a',invalid);
  maybeEnd(finish);peek();const afterSeconds=a.unique('afterSeconds');a.cmp('r11',58);a.jcc('ne',afterSeconds);consume(58);digits(2,120);a.load('rax',slot(120));a.cmp('rax',59);a.jcc('a',invalid);
  maybeEnd(finish);peek();a.cmp('r11',46);a.jcc('ne',afterSeconds);consume(46);
  // Fractional seconds: 1..3 digits are scaled to milliseconds.
  digits(1,128);a.load('rax',slot(128));a.mov('r10',100);a.imul('rax','r10');a.store(slot(128),'rax');
  maybeEnd(finish);peek();a.cmp('r11',48);const fractionDone=a.unique('fractionDone');a.jcc('b',fractionDone);a.cmp('r11',57);a.jcc('a',fractionDone);
  digits(1,136);a.load('rax',slot(136));a.mov('r10',10);a.imul('rax','r10');a.load('r11',slot(128));a.add('rax','r11');a.store(slot(128),'rax');
  maybeEnd(finish);peek();a.cmp('r11',48);a.jcc('b',fractionDone);a.cmp('r11',57);a.jcc('a',fractionDone);digits(1,136);a.load('rax',slot(136));a.load('r11',slot(128));a.add('rax','r11');a.store(slot(128),'rax');
  a.label(fractionDone);a.label(afterSeconds);
  // A UTC marker or a signed HH:mm offset may follow the time.
  maybeEnd(finish);peek();const zoneDone=a.unique('zoneDone'),signedZone=a.unique('signedZone');a.cmp('r11',90);a.jcc('ne',signedZone);consume(90);a.jmp(zoneDone);
  a.label(signedZone);a.cmp('r11',43);const negativeZone=a.unique('negativeZone');a.jcc('ne',negativeZone);a.mov('rax',1);a.store(slot(152),'rax');a.jmp('rt.parseIsoDate.zoneDigits');
  a.label(negativeZone);a.cmp('r11',45);a.jcc('ne',invalid);a.mov('rax',-1);a.store(slot(152),'rax');a.label('rt.parseIsoDate.zoneDigits');
  a.load('r10',slot(56));a.add('r10',1);a.store(slot(56),'r10');digits(2,160);consume(58);digits(2,168);
  a.load('rax',slot(160));a.cmp('rax',23);a.jcc('a',invalid);a.load('rax',slot(168));a.cmp('rax',59);a.jcc('a',invalid);
  a.label(zoneDone);
  a.label(finish);a.load('r10',slot(56));a.load('r11',slot(64));a.cmp('r10','r11');a.jcc('ne',invalid);
  a.load('rax',slot(104));a.cmp('rax',24);const hourReady=a.unique('hourReady');a.jcc('ne',hourReady);
  for(const offset of [112,120,128]){a.load('rax',slot(offset));a.test('rax','rax');a.jcc('ne',invalid);}a.label(hourReady);
  // Convert seven integer components to Number Values for MakeDate.
  for(let i=0;i<7;i++){a.load('rax',slot(80+8*i));a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store(slot(192+16*i),'rax');a.storesd(slot(200+16*i),'xmm0');}
  a.load('rcx',slot(40));a.lea('rdx',slot(192));a.mov('r8',0);a.call('rt.dateMakeTime');
  a.load('rax',slot(152));a.test('rax','rax');const noOffset=a.unique('noOffset');a.jcc('e',noOffset);
  a.load('r10',slot(160));a.mov('r11',60);a.imul('r10','r11');a.load('r11',slot(168));a.add('r10','r11');a.mov('r11',60000);a.imul('r10','r11');a.imul('r10','rax');
  a.load('rcx',slot(40));a.movsd('xmm0',{base:'rcx',disp:8});a.cvtsi2sd('xmm1','r10');a.subsd('xmm0','xmm1');a.storesd({base:'rcx',disp:8},'xmm0');
  a.label(noOffset);a.jmp('rt.parseIsoDate.done');
  a.label(invalid);a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.mov('rax',0x7ff8000000000000n);a.store({base:'rcx',disp:8},'rax');a.label('rt.parseIsoDate.done');
 });
 rootedFn(b,'rt.Date.parse.fn.code',120,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:1}],a=>{
  a.store(slot(40),'rcx');a.test('rdx','rdx');const missing=a.unique('missing'),done=a.unique('done');a.jcc('e',missing);
  a.lea('rcx',slot(64));a.mov('rdx','r8');a.call('rt.toString');a.load('rcx',slot(40));a.load('rdx',slot(72));a.call('rt.parseIsoDate');a.jmp(done);
  a.label(missing);a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.mov('rax',0x7ff8000000000000n);a.store({base:'rcx',disp:8},'rax');a.label(done);
 });
}
