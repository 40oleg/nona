import {RuntimeBuilder,slot} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O} from './object-layout.js';
import {BoxKind,BoxLayout} from './boxing.js';
import {stringLiteral} from './value.js';

export function emitJsonStringify(b:RuntimeBuilder):void {
 for(const [name,value] of [['openArray','['],['closeArray',']'],['openObject','{'],['closeObject','}'],['colon',':']] as const)b.bundle.fragments.push(stringLiteral('rt.json.'+name,value));
 b.bundle.fragments.push(stringLiteral('rt.json.toJSON','toJSON'));
 b.bundle.fragments.push(stringLiteral('rt.json.newline','\n'));
 b.bundle.fragments.push(stringLiteral('rt.json.space',' '));
 rootedFn(b,'rt.jsonNormalizeGap',136,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'locals',offset:64,count:3}],a=>{
  a.store(slot(40),'rcx');for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(64+n),'rax');}
  const raw=a.unique('raw'),number=a.unique('number'),string=a.unique('string'),done=a.unique('done');a.load('rax',slot(64));a.cmp('rax',5);a.jcc('ne',raw);
  a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',BoxKind);a.jcc('ne',raw);a.load('rax',{base:'r10',disp:BoxLayout.value});a.cmp('rax',3);a.jcc('e',number);a.cmp('rax',4);a.jcc('e',string);a.jmp(raw);
  a.label(raw);a.load('rax',slot(64));a.cmp('rax',3);a.jcc('e',number);a.cmp('rax',4);a.jcc('e',string);
  a.mov('rax',4);a.store(slot(80),'rax');a.lea('rax',{rip:'rt.str.empty'});a.store(slot(88),'rax');a.jmp(done);
  a.label(number);a.lea('rcx',slot(64));a.lea('rdx',slot(64));a.call('rt.toNumber');a.movsd('xmm0',slot(72));a.mov('rax',0);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');const zero=a.unique('zero'),ready=a.unique('ready');a.jcc('p',zero);a.jcc('be',zero);a.mov('rax',10);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',ready);a.cvttsd2si('rax','xmm0');a.jmp(ready);a.label(zero);a.mov('rax',0);a.label(ready);a.store(slot(112),'rax');
  a.mov('rax',4);a.store(slot(80),'rax');a.lea('rax',{rip:'rt.str.empty'});a.store(slot(88),'rax');a.mov('rax',4);a.store(slot(96),'rax');a.lea('rax',{rip:'rt.json.space'});a.store(slot(104),'rax');a.mov('rax',0);a.store(slot(120),'rax');const loop=a.unique('gapLoop');a.label(loop);a.load('rax',slot(120));a.load('r10',slot(112));a.cmp('rax','r10');a.jcc('ae',done);a.lea('rcx',slot(80));a.lea('rdx',slot(80));a.lea('r8',slot(96));a.call('rt.concat');a.load('rax',slot(120));a.add('rax',1);a.store(slot(120),'rax');a.jmp(loop);
  a.label(string);a.lea('rcx',slot(64));a.lea('rdx',slot(64));a.call('rt.toString');a.load('r10',slot(72));a.load('rax',{base:'r10'});a.cmp('rax',10);const copy=a.unique('copy');a.jcc('be',copy);a.lea('rcx',slot(80));a.mov('rdx','r10');a.mov('r8',0);a.mov('r9',10);a.call('rt.jsonSlice');a.jmp(done);a.label(copy);for(const n of [0,8]){a.load('rax',slot(64+n));a.store(slot(80+n),'rax');}
  a.label(done);a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(80+n));a.store({base:'rcx',disp:n},'rax');}
 });
 rootedFn(b,'rt.jsonBuildPropertyList',232,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'locals',offset:64,count:8}],a=>{
  a.store(slot(40),'rcx');for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(64+n),'rax');}
  const original=a.unique('original'),loop=a.unique('loop'),next=a.unique('next'),check=a.unique('check'),append=a.unique('append'),done=a.unique('done');
  a.load('rax',slot(64));a.cmp('rax',5);a.jcc('ne',original);a.lea('rcx',slot(64));a.call('rt.isArray');a.test('rax','rax');a.jcc('e',original);
  a.mov('rax',4);a.store(slot(176),'rax');a.lea('rax',{rip:'rt.str.length'});a.store(slot(184),'rax');
  a.lea('rcx',slot(176));a.lea('rdx',slot(64));a.lea('r8',slot(176));a.call('rt.getProperty');a.lea('rcx',slot(176));a.lea('rdx',slot(176));a.call('rt.toNumber');
  a.movsd('xmm0',slot(184));a.ucomisd('xmm0','xmm0');const zeroLength=a.unique('zeroLength'),lengthReady=a.unique('lengthReady');a.jcc('p',zeroLength);a.mov('rax',0);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',zeroLength);a.mov('rax',9007199254740991n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',lengthReady);a.cvttsd2si('rax','xmm0');a.jmp(lengthReady);a.label(zeroLength);a.mov('rax',0);a.label(lengthReady);a.store(slot(200),'rax');
  a.lea('rcx',slot(80));a.mov('rdx',1);a.mov('r8',0);a.call('rt.newObject');a.mov('rax',0);a.store(slot(192),'rax');
  a.label(loop);a.load('rax',slot(192));a.load('r10',slot(200));a.cmp('rax','r10');a.jcc('ae',done);
  a.lea('rcx',slot(96));a.mov('rdx','rax');a.call('rt.arrayIndexKey');a.lea('rcx',slot(112));a.lea('rdx',slot(64));a.lea('r8',slot(96));a.call('rt.getProperty');
  a.load('rax',slot(112));a.cmp('rax',3);a.jcc('e',append);a.cmp('rax',4);a.jcc('e',append);a.cmp('rax',5);a.jcc('ne',next);
  a.load('r10',slot(120));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',4);a.jcc('ne',next);a.load('rax',{base:'r10',disp:O.size});a.cmp('rax',3);a.jcc('e',append);a.cmp('rax',4);a.jcc('ne',next);
  a.label(append);a.lea('rcx',slot(112));a.lea('rdx',slot(112));a.call('rt.toString');a.mov('rax',0);a.store(slot(208),'rax');
  a.label(check);a.load('rax',slot(208));a.load('r10',slot(88));a.load('r10',{base:'r10',disp:O.length});a.cmp('rax','r10');const fresh=a.unique('fresh');a.jcc('ae',fresh);
  a.lea('rcx',slot(128));a.mov('rdx','rax');a.call('rt.arrayIndexKey');a.lea('rcx',slot(144));a.lea('rdx',slot(80));a.lea('r8',slot(128));a.call('rt.getProperty');
  a.load('rcx',slot(120));a.load('rdx',slot(152));a.call('rt.compareStrings');a.test('rax','rax');a.jcc('e',next);a.load('rax',slot(208));a.add('rax',1);a.store(slot(208),'rax');a.jmp(check);
  a.label(fresh);a.lea('rcx',slot(80));a.lea('rdx',slot(112));a.call('rt.appendArrayValue');
  a.label(next);a.load('rax',slot(192));a.add('rax',1);a.store(slot(192),'rax');a.jmp(loop);
  a.label(original);for(const n of [0,8]){a.load('rax',slot(64+n));a.store(slot(80+n),'rax');}
  a.label(done);a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(80+n));a.store({base:'rcx',disp:n},'rax');}
 });
 rootedFn(b,'rt.jsonStringifyValue',328,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'value',register:'r8'},{kind:'value',register:'r9'},{kind:'locals',offset:64,count:8},{kind:'locals',offset:248,count:2},{kind:'locals',offset:296,count:1}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'r8');for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(64+n),'rax');a.load('rax',{base:'r9',disp:n});a.store(slot(248+n),'rax');}
  a.load('r10',slot(frame+40));a.store(slot(56),'r10');for(const n of [0,8]){a.load('rax',{base:'r10',disp:n});a.store(slot(264+n),'rax');}
  const dispatch=a.unique('dispatch'),checkToJson=a.unique('checkToJson');a.load('rax',slot(64));a.cmp('rax',5);a.jcc('e',checkToJson);a.cmp('rax',7);a.jcc('ne',dispatch);a.label(checkToJson);
  a.mov('rax',4);a.store(slot(96),'rax');a.lea('rax',{rip:'rt.json.toJSON'});a.store(slot(104),'rax');
  a.lea('rcx',slot(112));a.lea('rdx',slot(64));a.lea('r8',slot(96));a.call('rt.getProperty');
  a.load('rax',slot(112));a.cmp('rax',5);a.jcc('ne',dispatch);a.load('r10',slot(120));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',2);a.jcc('ne',dispatch);
  a.lea('rax',slot(64));a.store(slot(32),'rax');a.lea('rcx',slot(64));a.lea('rdx',slot(112));a.mov('r8',1);a.load('r9',slot(48));a.call('rt.invoke');
  a.label(dispatch);const noReplacer=a.unique('noReplacer');a.load('rax',slot(264));a.cmp('rax',5);a.jcc('ne',noReplacer);a.load('r10',slot(272));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',2);a.jcc('ne',noReplacer);
  a.load('r10',slot(48));for(const n of [0,8]){a.load('rax',{base:'r10',disp:n});a.store(slot(144+n),'rax');a.load('rax',slot(64+n));a.store(slot(160+n),'rax');}
  a.lea('rax',slot(248));a.store(slot(32),'rax');a.lea('rcx',slot(64));a.lea('rdx',slot(264));a.mov('r8',2);a.lea('r9',slot(144));a.call('rt.invoke');
  a.label(noReplacer);a.load('rax',slot(64));const primitiveReady=a.unique('primitiveReady'),numberBox=a.unique('numberBox'),stringBox=a.unique('stringBox');a.cmp('rax',5);a.jcc('ne',primitiveReady);
  a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',BoxKind);a.jcc('ne',primitiveReady);
  a.load('rax',{base:'r10',disp:BoxLayout.value});a.cmp('rax',2);const booleanBox=a.unique('booleanBox');a.jcc('e',booleanBox);a.cmp('rax',7);a.jcc('e',booleanBox);a.cmp('rax',3);a.jcc('e',numberBox);a.cmp('rax',4);a.jcc('e',stringBox);a.jmp(primitiveReady);
  a.label(booleanBox);for(const n of [0,8]){a.load('rax',{base:'r10',disp:BoxLayout.value+n});a.store(slot(64+n),'rax');}a.jmp(primitiveReady);
  a.label(numberBox);a.lea('rcx',slot(64));a.lea('rdx',slot(64));a.call('rt.toNumber');a.jmp(primitiveReady);
  a.label(stringBox);a.lea('rcx',slot(64));a.lea('rdx',slot(64));a.call('rt.toString');
  a.label(primitiveReady);
  const omitted=a.unique('omitted'),nullValue=a.unique('nullValue'),convert=a.unique('convert'),quote=a.unique('quote'),composite=a.unique('composite'),array=a.unique('array'),loop=a.unique('loop'),next=a.unique('next'),done=a.unique('done');
  a.load('rax',slot(64));a.cmp('rax',7);const notBigInt=a.unique('notBigInt');a.jcc('ne',notBigInt);a.call('rt.throwTypeError');a.label(notBigInt);a.cmp('rax',1);a.jcc('e',convert);a.cmp('rax',2);a.jcc('e',convert);a.cmp('rax',4);a.jcc('e',quote);a.cmp('rax',5);a.jcc('e',composite);a.cmp('rax',3);a.jcc('ne',omitted);
  a.movsd('xmm0',slot(72));a.ucomisd('xmm0','xmm0');a.jcc('p',nullValue);for(const bits of [0x7ff0000000000000n,0xfff0000000000000n]){a.mov('rax',bits);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('e',nullValue);}
  a.label(convert);a.lea('rcx',slot(80));a.lea('rdx',slot(64));a.call('rt.toString');a.jmp(done);
  a.label(quote);a.lea('rcx',slot(80));a.load('rdx',slot(72));a.call('rt.jsonQuote');a.jmp(done);
  a.label(nullValue);a.mov('rax',4);a.store(slot(80),'rax');a.lea('rax',{rip:'rt.json.null'});a.store(slot(88),'rax');a.jmp(done);
  a.label(composite);a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',2);a.jcc('e',omitted);
  a.load('rax',{base:'r10',disp:O.stringifying});a.test('rax','rax');const enter=a.unique('enter');a.jcc('e',enter);a.call('rt.throwTypeError');a.label(enter);
  a.mov('rax',1);a.store({base:'r10',disp:O.stringifying},'rax');a.load('rax',{rip:'rt.cleanupHead'});a.store(slot(224),'rax');a.store(slot(232),'r10');a.lea('rax',slot(224));a.store({rip:'rt.cleanupHead'},'rax');
  a.lea('rcx',slot(64));a.call('rt.isArray');a.test('rax','rax');a.jcc('ne',array);a.mov('rax',1);a.store(slot(208),'rax');
  const ordinaryKeys=a.unique('ordinaryKeys'),keysReady=a.unique('keysReady');a.load('rax',slot(264));a.cmp('rax',5);a.jcc('ne',ordinaryKeys);a.load('r10',slot(272));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',1);a.jcc('ne',ordinaryKeys);
  for(const n of [0,8]){a.load('rax',slot(264+n));a.store(slot(144+n),'rax');}a.jmp(keysReady);
  a.label(ordinaryKeys);a.lea('rcx',slot(144));a.mov('rdx',1);a.lea('r8',slot(64));a.call('rt.Object.keys.fn.code');
  a.label(keysReady);a.load('r10',slot(152));a.load('rax',{base:'r10',disp:O.length});a.store(slot(216),'rax');
  a.mov('rax',4);a.store(slot(80),'rax');a.lea('rax',{rip:'rt.json.openObject'});a.store(slot(88),'rax');a.jmp(loop);
  a.label(array);a.mov('rax',0);a.store(slot(208),'rax');
  a.mov('rax',4);a.store(slot(176),'rax');a.lea('rax',{rip:'rt.str.length'});a.store(slot(184),'rax');
  a.lea('rcx',slot(176));a.lea('rdx',slot(64));a.lea('r8',slot(176));a.call('rt.getProperty');a.lea('rcx',slot(176));a.lea('rdx',slot(176));a.call('rt.toNumber');
  a.movsd('xmm0',slot(184));a.ucomisd('xmm0','xmm0');const zeroLength=a.unique('zeroLength'),lengthReady=a.unique('lengthReady');a.jcc('p',zeroLength);a.mov('rax',0);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',zeroLength);a.mov('rax',9007199254740991n);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',lengthReady);a.cvttsd2si('rax','xmm0');a.jmp(lengthReady);a.label(zeroLength);a.mov('rax',0);a.label(lengthReady);a.store(slot(216),'rax');
  a.mov('rax',4);a.store(slot(80),'rax');a.lea('rax',{rip:'rt.json.openArray'});a.store(slot(88),'rax');
  a.label(loop);a.load('r10',slot(56));for(const n of [0,8]){a.load('rax',{base:'r10',disp:32+n});a.store(slot(296+n),'rax');}
  a.load('rax',{base:'r10',disp:24});a.load('rax',{base:'rax'});a.test('rax','rax');const noIndent=a.unique('noIndent');a.jcc('e',noIndent);
  a.lea('rcx',slot(312));a.lea('rdx',slot(296));a.load('r8',slot(56));a.add('r8',16);a.call('rt.concat');a.load('r10',slot(56));for(const n of [0,8]){a.load('rax',slot(312+n));a.store({base:'r10',disp:32+n},'rax');}a.label(noIndent);
  a.mov('rax',0);a.store(slot(200),'rax');a.store(slot(240),'rax');const iterate=a.unique('iterate'),finish=a.unique('finish'),objectKey=a.unique('objectKey'),append=a.unique('append'),notFirst=a.unique('notFirst');a.label(iterate);
  a.load('rax',slot(200));a.load('r10',slot(216));a.cmp('rax','r10');a.jcc('ae',finish);
  a.load('r10',slot(208));a.test('r10','r10');a.jcc('ne',objectKey);
  a.lea('rcx',slot(96));a.load('rdx',slot(200));a.call('rt.arrayIndexKey');a.jmp('rt.jsonStringifyValue.keyReady');
  a.label(objectKey);a.load('rax',slot(200));a.cvtsi2sd('xmm0','rax');a.storesd(slot(104),'xmm0');a.mov('rax',3);a.store(slot(96),'rax');
  a.lea('rcx',slot(160));a.lea('rdx',slot(144));a.lea('r8',slot(96));a.call('rt.getProperty');for(const n of [0,8]){a.load('rax',slot(160+n));a.store(slot(96+n),'rax');}
  a.label('rt.jsonStringifyValue.keyReady');a.lea('rcx',slot(112));a.lea('rdx',slot(64));a.lea('r8',slot(96));a.call('rt.getProperty');
  a.load('rax',slot(56));a.store(slot(32),'rax');a.lea('rcx',slot(128));a.lea('rdx',slot(112));a.lea('r8',slot(96));a.lea('r9',slot(64));a.call('rt.jsonStringifyValue');
  a.load('rax',slot(128));a.test('rax','rax');a.jcc('ne',append);a.load('r10',slot(208));a.test('r10','r10');a.jcc('ne',next);a.mov('rax',4);a.store(slot(128),'rax');a.lea('rax',{rip:'rt.json.null'});a.store(slot(136),'rax');
  a.label(append);a.load('rax',slot(240));a.test('rax','rax');a.jcc('e',notFirst);a.mov('rax',4);a.store(slot(176),'rax');a.lea('rax',{rip:'rt.str.comma'});a.store(slot(184),'rax');a.lea('rcx',slot(80));a.lea('rdx',slot(80));a.lea('r8',slot(176));a.call('rt.concat');
  a.label(notFirst);a.mov('rax',1);a.store(slot(240),'rax');
  a.load('r10',slot(56));a.load('rax',{base:'r10',disp:24});a.load('rax',{base:'rax'});a.test('rax','rax');const noLine=a.unique('noLine');a.jcc('e',noLine);
  a.mov('rax',4);a.store(slot(176),'rax');a.lea('rax',{rip:'rt.json.newline'});a.store(slot(184),'rax');a.lea('rcx',slot(80));a.lea('rdx',slot(80));a.lea('r8',slot(176));a.call('rt.concat');
  a.load('r8',slot(56));a.add('r8',32);a.lea('rcx',slot(80));a.lea('rdx',slot(80));a.call('rt.concat');a.label(noLine);
  a.load('rax',slot(208));a.test('rax','rax');a.jcc('e','rt.jsonStringifyValue.appendValue');
  a.lea('rcx',slot(176));a.load('rdx',slot(104));a.call('rt.jsonQuote');a.lea('rcx',slot(80));a.lea('rdx',slot(80));a.lea('r8',slot(176));a.call('rt.concat');
  a.mov('rax',4);a.store(slot(176),'rax');a.lea('rax',{rip:'rt.json.colon'});a.store(slot(184),'rax');a.lea('rcx',slot(80));a.lea('rdx',slot(80));a.lea('r8',slot(176));a.call('rt.concat');
  a.load('r10',slot(56));a.load('rax',{base:'r10',disp:24});a.load('rax',{base:'rax'});a.test('rax','rax');const noColonSpace=a.unique('noColonSpace');a.jcc('e',noColonSpace);a.lea('rax',{rip:'rt.json.space'});a.store(slot(184),'rax');a.lea('rcx',slot(80));a.lea('rdx',slot(80));a.lea('r8',slot(176));a.call('rt.concat');a.label(noColonSpace);
  a.label('rt.jsonStringifyValue.appendValue');a.lea('rcx',slot(80));a.lea('rdx',slot(80));a.lea('r8',slot(128));a.call('rt.concat');
  a.label(next);a.load('rax',slot(200));a.add('rax',1);a.store(slot(200),'rax');a.jmp(iterate);
  a.label(finish);a.load('rax',slot(240));a.test('rax','rax');const noClosingLine=a.unique('noClosingLine');a.jcc('e',noClosingLine);a.load('r10',slot(56));a.load('rax',{base:'r10',disp:24});a.load('rax',{base:'rax'});a.test('rax','rax');a.jcc('e',noClosingLine);
  a.mov('rax',4);a.store(slot(176),'rax');a.lea('rax',{rip:'rt.json.newline'});a.store(slot(184),'rax');a.lea('rcx',slot(80));a.lea('rdx',slot(80));a.lea('r8',slot(176));a.call('rt.concat');a.lea('rcx',slot(80));a.lea('rdx',slot(80));a.lea('r8',slot(296));a.call('rt.concat');a.label(noClosingLine);
  a.mov('rax',4);a.store(slot(176),'rax');a.load('r10',slot(208));a.test('r10','r10');const objectClose=a.unique('objectClose');a.jcc('ne',objectClose);a.lea('rax',{rip:'rt.json.closeArray'});a.jmp('rt.jsonStringifyValue.closeReady');a.label(objectClose);a.lea('rax',{rip:'rt.json.closeObject'});a.label('rt.jsonStringifyValue.closeReady');a.store(slot(184),'rax');
  a.lea('rcx',slot(80));a.lea('rdx',slot(80));a.lea('r8',slot(176));a.call('rt.concat');
  a.load('r10',slot(56));for(const n of [0,8]){a.load('rax',slot(296+n));a.store({base:'r10',disp:32+n},'rax');}
  a.load('rax',slot(224));a.store({rip:'rt.cleanupHead'},'rax');a.load('r10',slot(72));a.mov('rax',0);a.store({base:'r10',disp:O.stringifying},'rax');a.jmp(done);
  a.label(omitted);a.mov('rax',0);a.store(slot(80),'rax');a.store(slot(88),'rax');
  a.label(done);a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(80+n));a.store({base:'rcx',disp:n},'rax');}
 });
}
