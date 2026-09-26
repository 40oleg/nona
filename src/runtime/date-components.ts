import {RuntimeBuilder,slot,failIf} from './abi.js';
import {ObjectLayout as O} from './object-layout.js';
import {DateKind,DateLayout} from './date.js';

// Convert TimeClip milliseconds to Gregorian UTC fields. The same fields are
// used for local getters while the documented local-time policy is UTC.
export const dateFields=[
 ['getFullYear',8],['getUTCFullYear',8],
 ['getYear',8],
 ['getMonth',16],['getUTCMonth',16],
 ['getDate',24],['getUTCDate',24],
 ['getDay',32],['getUTCDay',32],
] as const;

export function emitDateComponents(b:RuntimeBuilder):void {
 // Output: valid, year, zero-based month, date, weekday (Sunday = 0).
 b.fn('rt.dateComponents',184,a=>{
  a.store(slot(40),'rcx');a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',{base:'rdx',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',DateKind);failIf(a,'ne','rt.throwTypeError');
  a.movsd('xmm0',{base:'r10',disp:DateLayout.time});a.ucomisd('xmm0','xmm0');
  const invalid=a.unique('invalid'),done=a.unique('done');a.jcc('p',invalid);
  a.cvttsd2si('rax','xmm0');a.emit([0x48,0x99]);a.mov('r10',86400000);a.idiv('r10');
  const nonnegative=a.unique('nonnegative');a.test('rdx','rdx');a.jcc('ge',nonnegative);a.sub('rax',1);a.label(nonnegative);a.store(slot(48),'rax');
  // 1970-01-01 was Thursday.
  a.add('rax',4);a.emit([0x48,0x99]);a.mov('r10',7);a.idiv('r10');a.test('rdx','rdx');const weekdayPositive=a.unique('weekdayPositive');a.jcc('ge',weekdayPositive);a.add('rdx',7);a.label(weekdayPositive);a.store(slot(128),'rdx');
  // civil_from_days, inverse of days_from_civil used by Date.UTC.
  a.load('rax',slot(48));a.add('rax',719468);a.store(slot(56),'rax');
  a.emit([0x48,0x99]);a.mov('r10',146097);a.idiv('r10');
  const eraPositive=a.unique('eraPositive');a.test('rdx','rdx');a.jcc('ge',eraPositive);a.sub('rax',1);a.add('rdx',146097);a.label(eraPositive);
  a.store(slot(64),'rax');a.store(slot(72),'rdx');
  // yoe = (doe - doe/1460 + doe/36524 - doe/146096) / 365.
  a.mov('rax','rdx');a.xor('rdx','rdx');a.mov('r10',1460);a.div('r10');a.store(slot(80),'rax');
  a.load('rax',slot(72));a.xor('rdx','rdx');a.mov('r10',36524);a.div('r10');a.store(slot(88),'rax');
  a.load('rax',slot(72));a.xor('rdx','rdx');a.mov('r10',146096);a.div('r10');
  a.load('r11',slot(72));a.load('r10',slot(80));a.sub('r11','r10');a.load('r10',slot(88));a.add('r11','r10');a.sub('r11','rax');
  a.mov('rax','r11');a.xor('rdx','rdx');a.mov('r10',365);a.div('r10');a.store(slot(96),'rax');
  a.load('r11',slot(64));a.mov('r10',400);a.imul('r11','r10');a.add('r11','rax');a.store(slot(104),'r11');
  // doy = doe - (365*yoe + yoe/4 - yoe/100).
  a.load('rax',slot(96));a.mov('r10',365);a.imul('rax','r10');a.store(slot(112),'rax');
  a.load('rax',slot(96));a.xor('rdx','rdx');a.mov('r10',4);a.div('r10');a.load('r11',slot(112));a.add('r11','rax');a.store(slot(112),'r11');
  a.load('rax',slot(96));a.xor('rdx','rdx');a.mov('r10',100);a.div('r10');a.load('r11',slot(112));a.sub('r11','rax');
  a.load('rax',slot(72));a.sub('rax','r11');a.store(slot(120),'rax');
  // mp = (5*doy+2)/153; day = doy-(153*mp+2)/5+1.
  a.mov('r10',5);a.imul('rax','r10');a.add('rax',2);a.xor('rdx','rdx');a.mov('r10',153);a.div('r10');a.store(slot(136),'rax');
  a.mov('r10',153);a.imul('rax','r10');a.add('rax',2);a.xor('rdx','rdx');a.mov('r10',5);a.div('r10');
  a.load('r11',slot(120));a.sub('r11','rax');a.add('r11',1);a.store(slot(144),'r11');
  a.load('rax',slot(136));a.cmp('rax',10);const late=a.unique('late'),monthReady=a.unique('monthReady');a.jcc('ae',late);a.add('rax',3);a.jmp(monthReady);a.label(late);a.sub('rax',9);a.label(monthReady);
  a.mov('r10','rax');a.sub('rax',1);a.store(slot(152),'rax');
  a.load('rax',slot(104));a.cmp('r10',2);const yearReady=a.unique('yearReady');a.jcc('a',yearReady);a.add('rax',1);a.label(yearReady);
  a.load('rcx',slot(40));a.mov('r11',1);a.store({base:'rcx'},'r11');a.store({base:'rcx',disp:8},'rax');
  a.load('rax',slot(152));a.store({base:'rcx',disp:16},'rax');a.load('rax',slot(144));a.store({base:'rcx',disp:24},'rax');
  a.load('rax',slot(128));a.store({base:'rcx',disp:32},'rax');a.jmp(done);
  a.label(invalid);a.load('rcx',slot(40));a.mov('rax',0);a.store({base:'rcx'},'rax');a.label(done);
 });
 for(const [name,field] of dateFields)b.fn('rt.Date.'+name+'.fn.code',136,a=>{
  a.store(slot(40),'rcx');a.lea('rcx',slot(64));a.load('rdx',slot(176));a.call('rt.dateComponents');
  a.load('rax',slot(64));const invalid=a.unique('invalid'),done=a.unique('done');a.test('rax','rax');a.jcc('e',invalid);
  a.load('rax',slot(64+field));if(name==='getYear')a.sub('rax',1900);a.cvtsi2sd('xmm0','rax');a.jmp(done);
  a.label(invalid);a.mov('rax',0x7ff8000000000000n);a.movqToXmm('xmm0','rax');a.label(done);
  a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
 });
}
