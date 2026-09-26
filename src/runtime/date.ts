import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {HeapKind,HeapLayout as H} from './heap-layout.js';
import {ObjectLayout as O} from './object-layout.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import {dateFields} from './date-components.js';
import {dateSecondSetters} from './date-second-setters.js';
import {dateMinuteSetters} from './date-minute-setters.js';

export const DateKind=7;
export const DateLayout={time:O.size,size:O.size+8} as const;
const timeParts=[
 ['getMilliseconds',1,1000],['getUTCMilliseconds',1,1000],
 ['getSeconds',1000,60],['getUTCSeconds',1000,60],
 ['getMinutes',60000,60],['getUTCMinutes',60000,60],
 ['getHours',3600000,24],['getUTCHours',3600000,24],
] as const;
export const dateRoots=['rt.dateValueOf.fn','rt.dateGetTime.fn','rt.dateSetTime.fn','rt.dateGetTimezoneOffset.fn','rt.Date.now.fn','rt.Date.UTC.fn',...['setMilliseconds','setUTCMilliseconds',...dateSecondSetters,...dateMinuteSetters].map(name=>'rt.Date.'+name+'.fn'),...timeParts.map(([name])=>'rt.Date.'+name+'.fn'),...dateFields.map(([name])=>'rt.Date.'+name+'.fn')];
export const datePropertyRoots=[
 ...builtinPropertyRoots('rt.dateValueOf.fn','valueOf','rt.datePrototype'),
 ...builtinPropertyRoots('rt.dateGetTime.fn','getTime','rt.datePrototype'),
 ...builtinPropertyRoots('rt.dateSetTime.fn','setTime','rt.datePrototype'),
 ...builtinPropertyRoots('rt.dateGetTimezoneOffset.fn','getTimezoneOffset','rt.datePrototype'),
 ...['setMilliseconds','setUTCMilliseconds'].flatMap(name=>builtinPropertyRoots('rt.Date.'+name+'.fn',name,'rt.datePrototype')),
 ...dateSecondSetters.flatMap(name=>builtinPropertyRoots('rt.Date.'+name+'.fn',name,'rt.datePrototype')),
 ...dateMinuteSetters.flatMap(name=>builtinPropertyRoots('rt.Date.'+name+'.fn',name,'rt.datePrototype')),
 ...builtinPropertyRoots('rt.Date.now.fn','now','rt.Date'),
 ...builtinPropertyRoots('rt.Date.UTC.fn','UTC','rt.Date'),
 ...timeParts.flatMap(([name])=>builtinPropertyRoots('rt.Date.'+name+'.fn',name,'rt.datePrototype')),
 ...dateFields.flatMap(([name])=>builtinPropertyRoots('rt.Date.'+name+'.fn',name,'rt.datePrototype')),
];

export function emitDatePrototype(b:RuntimeBuilder):void {
 const bytes=new Uint8Array(O.size);
 b.bundle.fragments.push({name:'rt.datePrototype',section:'.data',alignment:8,bytes,symbols:{},fixups:[
  {offset:O.prototype,kind:'va64',target:'rt.objectPrototype',addend:0},
 ]});
 prependFunctionBuiltin(b,'rt.dateValueOf.fn','valueOf',0,'rt.datePrototype');
 prependFunctionBuiltin(b,'rt.dateGetTime.fn','getTime',0,'rt.datePrototype');
 prependFunctionBuiltin(b,'rt.dateSetTime.fn','setTime',1,'rt.datePrototype');
 prependFunctionBuiltin(b,'rt.dateGetTimezoneOffset.fn','getTimezoneOffset',0,'rt.datePrototype');
 for(const name of ['setMilliseconds','setUTCMilliseconds'])prependFunctionBuiltin(b,'rt.Date.'+name+'.fn',name,1,'rt.datePrototype');
 for(const name of dateSecondSetters)prependFunctionBuiltin(b,'rt.Date.'+name+'.fn',name,2,'rt.datePrototype');
 for(const name of dateMinuteSetters)prependFunctionBuiltin(b,'rt.Date.'+name+'.fn',name,3,'rt.datePrototype');
 for(const [name] of timeParts)prependFunctionBuiltin(b,'rt.Date.'+name+'.fn',name,0,'rt.datePrototype');
 for(const [name] of dateFields)prependFunctionBuiltin(b,'rt.Date.'+name+'.fn',name,0,'rt.datePrototype');
}

export function emitDate(b:RuntimeBuilder):void {
 prependFunctionBuiltin(b,'rt.Date.now.fn','now',0,'rt.Date');
 prependFunctionBuiltin(b,'rt.Date.UTC.fn','UTC',7,'rt.Date');
 rootedFn(b,'rt.Date.UTC.fn.code',72,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'}],a=>{
  a.test('rdx','rdx');const supplied=a.unique('supplied');a.jcc('ne',supplied);
  a.mov('rax',3);a.store({base:'rcx'},'rax');a.mov('rax',0x7ff8000000000000n);a.store({base:'rcx',disp:8},'rax');const done=a.unique('done');a.jmp(done);
  a.label(supplied);a.call('rt.dateArgumentsMs');a.label(done);
 });
 b.fn('rt.Date.now.fn.code',40,a=>{
  a.store(slot(32),'rcx');a.call('rt.currentTimeMs');a.cvtsi2sd('xmm0','rax');
  a.load('rcx',slot(32));a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
 });
 for(const name of ['dateValueOf','dateGetTime'])b.fn('rt.'+name+'.fn.code',40,a=>{
  a.load('rdx',slot(80));a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',{base:'rdx',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',DateKind);failIf(a,'ne','rt.throwTypeError');
  a.mov('rax',3);a.store({base:'rcx'},'rax');a.load('rax',{base:'r10',disp:DateLayout.time});a.store({base:'rcx',disp:8},'rax');
 });
 b.fn('rt.dateGetTimezoneOffset.fn.code',40,a=>{
  a.load('rdx',slot(80));a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',{base:'rdx',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',DateKind);failIf(a,'ne','rt.throwTypeError');
  a.movsd('xmm0',{base:'r10',disp:DateLayout.time});a.ucomisd('xmm0','xmm0');
  const invalid=a.unique('invalid'),done=a.unique('done');a.jcc('p',invalid);
  a.mov('rax',0);a.jmp(done);a.label(invalid);a.mov('rax',0x7ff8000000000000n);a.label(done);
  a.mov('r10',3);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
 });
 rootedFn(b,'rt.dateSetTime.fn.code',120,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:1}],(a,frame)=>{
  a.store(slot(40),'rcx');a.load('r10',slot(frame+40));a.load('rax',{base:'r10'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.store(slot(80),'rax');a.load('r10',{base:'r10',disp:8});a.store(slot(88),'r10');a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',DateKind);failIf(a,'ne','rt.throwTypeError');
  a.test('rdx','rdx');const missing=a.unique('missing'),converted=a.unique('converted');a.jcc('e',missing);
  a.lea('rcx',slot(64));a.mov('rdx','r8');a.call('rt.toNumber');a.jmp(converted);
  a.label(missing);a.mov('rax',3);a.store(slot(64),'rax');a.mov('rax',0x7ff8000000000000n);a.store(slot(72),'rax');
  a.label(converted);a.movsd('xmm0',slot(72));a.mov('rax',8640000000000000n);a.cvtsi2sd('xmm1','rax');
  a.ucomisd('xmm0','xmm0');const invalid=a.unique('invalid'),ready=a.unique('ready');a.jcc('p',invalid);
  a.ucomisd('xmm0','xmm1');a.jcc('a',invalid);
  a.mov('rax',-8640000000000000n);a.cvtsi2sd('xmm2','rax');a.ucomisd('xmm0','xmm2');a.jcc('b',invalid);
  a.cvttsd2si('rax','xmm0');a.cvtsi2sd('xmm0','rax');a.storesd(slot(72),'xmm0');a.jmp(ready);
  a.label(invalid);a.mov('rax',0x7ff8000000000000n);a.store(slot(72),'rax');
  a.label(ready);a.load('r10',slot(88));a.load('rax',slot(72));a.store({base:'r10',disp:DateLayout.time},'rax');
  a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.load('rax',slot(72));a.store({base:'rcx',disp:8},'rax');
 });
 for(const name of ['setMilliseconds','setUTCMilliseconds'])rootedFn(b,'rt.Date.'+name+'.fn.code',120,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:1}],(a,frame)=>{
  a.store(slot(40),'rcx');a.load('r10',slot(frame+40));a.load('rax',{base:'r10'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.store(slot(80),'rax');a.load('r10',{base:'r10',disp:8});a.store(slot(88),'r10');a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',DateKind);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'r10',disp:DateLayout.time});a.store(slot(56),'rax');
  a.test('rdx','rdx');const missing=a.unique('missing'),converted=a.unique('converted');a.jcc('e',missing);
  a.lea('rcx',slot(64));a.mov('rdx','r8');a.call('rt.toNumber');a.jmp(converted);
  a.label(missing);a.mov('rax',0x7ff8000000000000n);a.store(slot(72),'rax');
  a.label(converted);const invalid=a.unique('invalid'),invalidOriginal=a.unique('invalidOriginal'),ready=a.unique('ready'),done=a.unique('done');
  a.movsd('xmm0',slot(72));a.ucomisd('xmm0','xmm0');a.jcc('p',invalid);
  a.mov('rax',9223372036854775807n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',invalid);
  a.mov('rax',-9223372036854775807n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',invalid);
  a.cvttsd2si('rax','xmm0');a.cvtsi2sd('xmm0','rax');a.storesd(slot(72),'xmm0');
  a.movsd('xmm0',slot(56));a.ucomisd('xmm0','xmm0');a.jcc('p',invalidOriginal);
  a.cvttsd2si('rax','xmm0');a.store(slot(48),'rax');a.emit([0x48,0x99]);a.mov('r10',1000);a.idiv('r10');
  a.test('rdx','rdx');const positive=a.unique('positive');a.jcc('ge',positive);a.add('rdx',1000);a.label(positive);
  a.load('rax',slot(48));a.sub('rax','rdx');a.cvtsi2sd('xmm0','rax');a.addsd('xmm0',slot(72));
  a.mov('rax',8640000000000000n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('a',invalid);
  a.mov('rax',-8640000000000000n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('b',invalid);
  a.cvttsd2si('rax','xmm0');a.cvtsi2sd('xmm0','rax');a.storesd(slot(72),'xmm0');a.jmp(ready);
  a.label(invalid);a.mov('rax',0x7ff8000000000000n);a.store(slot(72),'rax');a.jmp(ready);
  a.label(invalidOriginal);a.mov('rax',0x7ff8000000000000n);a.store(slot(72),'rax');a.jmp(done);
  a.label(ready);a.load('r10',slot(88));a.load('rax',slot(72));a.store({base:'r10',disp:DateLayout.time},'rax');a.label(done);
  a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.load('rax',slot(72));a.store({base:'rcx',disp:8},'rax');
 });
 for(const [name,divisor,modulus] of timeParts)b.fn('rt.Date.'+name+'.fn.code',88,a=>{
  a.store(slot(40),'rcx');a.load('rdx',slot(128));
  a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',{base:'rdx',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',DateKind);failIf(a,'ne','rt.throwTypeError');
  a.movsd('xmm0',{base:'r10',disp:DateLayout.time});a.ucomisd('xmm0','xmm0');
  const invalid=a.unique('invalid'),save=a.unique('save'),positive=a.unique('positive');a.jcc('p',invalid);
  a.cvttsd2si('rax','xmm0');a.emit([0x48,0x99]);a.mov('r10',86400000);a.idiv('r10');
  a.mov('rax','rdx');a.test('rax','rax');a.jcc('ge',positive);a.add('rax',86400000);a.label(positive);
  if(divisor!==1){a.xor('rdx','rdx');a.mov('r10',divisor);a.div('r10');}
  a.xor('rdx','rdx');a.mov('r10',modulus);a.div('r10');a.mov('rax','rdx');
  a.cvtsi2sd('xmm0','rax');a.jmp(save);
  a.label(invalid);a.mov('rax',0x7ff8000000000000n);a.movqToXmm('xmm0','rax');
  a.label(save);a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
 });
 // Date() string formatting and calendar parsing are added with the rest of
 // the Date surface. Until then a call cannot masquerade as a correct date.
 b.fn('rt.Date.code',40,a=>a.call('rt.throwTypeError'));
 rootedFn(b,'rt.Date.construct',168,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:3}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  const supplied=a.unique('supplied'),ready=a.unique('ready');a.test('rdx','rdx');a.jcc('ne',supplied);
  a.call('rt.currentTimeMs');a.cvtsi2sd('xmm0','rax');a.storesd(slot(88),'xmm0');a.jmp(ready);
  a.label(supplied);a.load('rax',slot(48));a.cmp('rax',1);const one=a.unique('one');a.jcc('e',one);
  a.lea('rcx',slot(80));a.load('rdx',slot(48));a.load('r8',slot(56));a.call('rt.dateArgumentsMs');a.jmp(ready);
  a.label(one);a.load('rdx',slot(56));a.load('rax',{base:'rdx'});a.cmp('rax',5);const convert=a.unique('convert');a.jcc('ne',convert);
  a.load('r10',{base:'rdx',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',DateKind);a.jcc('ne',convert);
  a.load('rax',{base:'r10',disp:DateLayout.time});a.store(slot(88),'rax');a.jmp(ready);
  a.label(convert);a.lea('rcx',slot(80));a.load('rdx',slot(56));a.call('rt.toNumber');
  // TimeClip rejects non-finite and out-of-range values, then truncates.
  a.movsd('xmm0',slot(88));a.mov('rax',8640000000000000n);a.cvtsi2sd('xmm1','rax');
  a.ucomisd('xmm0','xmm0');const invalid=a.unique('invalid');a.jcc('p',invalid);
  a.ucomisd('xmm0','xmm1');a.jcc('a',invalid);
  a.mov('rax',-8640000000000000n);a.cvtsi2sd('xmm2','rax');a.ucomisd('xmm0','xmm2');a.jcc('b',invalid);
  a.movsd('xmm0',slot(88));a.cvttsd2si('rax','xmm0');a.cvtsi2sd('xmm0','rax');a.storesd(slot(88),'xmm0');a.jmp(ready);
  a.label(invalid);a.mov('rax',0x7ff8000000000000n);a.store(slot(88),'rax');
  a.label(ready);a.mov('rcx',DateLayout.size);a.call('rt.alloc');
  a.mov('r10',HeapKind.object);a.store({base:'rax',disp:H.kind-H.size},'r10');
  a.mov('r10',DateKind);a.store({base:'rax',disp:O.kind},'r10');a.mov('r10',0);
  for(const offset of [O.properties,O.length,O.stringifying,O.flags])a.store({base:'rax',disp:offset},'r10');
  a.load('r10',slot(frame+40));a.load('r10',{base:'r10',disp:8});a.load('r10',{base:'r10',disp:O.prototype});a.store({base:'rax',disp:O.prototype},'r10');
  a.load('r10',slot(88));a.store({base:'rax',disp:DateLayout.time},'r10');
  a.load('rcx',slot(40));a.store({base:'rcx',disp:8},'rax');a.mov('rax',5);a.store({base:'rcx'},'rax');
 });
}
