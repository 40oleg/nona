import {RuntimeBuilder,slot} from './abi.js';
import {rootedFn} from './root-scope.js';
import {stringLiteral} from './value.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {BoxKind,BoxLayout} from './boxing.js';
import {emitFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';

export const bigintRoots=['rt.bigintToString.fn','rt.bigintValueOf.fn'];
export const bigintPropertyRoots=['rt.bigintPrototype.@@toStringTag',...builtinPropertyRoots('rt.bigintToString.fn','toString','rt.bigintPrototype'),...builtinPropertyRoots('rt.bigintValueOf.fn','valueOf','rt.bigintPrototype')];

export function emitBigInt(b:RuntimeBuilder):void {
 b.bundle.fragments.push(stringLiteral('rt.bigint.minus','-'));
 b.bundle.fragments.push(stringLiteral('rt.bigint.zero','0'));
 rootedFn(b,'rt.bigintNeg',136,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'locals',offset:64,count:3}],a=>{
  a.store(slot(40),'rcx');a.mov('rax',7);a.store(slot(64),'rax');a.load('rax',{base:'rdx',disp:8});a.store(slot(72),'rax');a.load('r10',{base:'rax'});
  const zero=a.unique('zero'),negative=a.unique('negative'),done=a.unique('done');a.cmp('r10',1);a.jcc('ne','rt.bigintNeg.sign');a.load('r11',{base:'rax',disp:8},16);a.cmp('r11',48);a.jcc('e',zero);
  a.label('rt.bigintNeg.sign');a.load('r11',{base:'rax',disp:8},16);a.cmp('r11',45);a.jcc('e',negative);
  a.mov('rax',4);a.store(slot(80),'rax');a.lea('rax',{rip:'rt.bigint.minus'});a.store(slot(88),'rax');a.mov('rax',4);a.store(slot(96),'rax');a.load('rax',slot(72));a.store(slot(104),'rax');
  a.lea('rcx',slot(112));a.lea('rdx',slot(80));a.lea('r8',slot(96));a.call('rt.concat');a.jmp(done);
  a.label(negative);a.lea('rcx',slot(112));a.load('rdx',slot(72));a.mov('r8',1);a.mov('r9','r10');a.call('rt.jsonSlice');a.jmp(done);
  a.label(zero);a.mov('rax',4);a.store(slot(112),'rax');a.load('rax',slot(72));a.store(slot(120),'rax');
  a.label(done);a.load('rcx',slot(40));a.mov('rax',7);a.store({base:'rcx'},'rax');a.load('rax',slot(120));a.store({base:'rcx',disp:8},'rax');
 });
 rootedFn(b,'rt.bigintAdd',280,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'value',register:'r8'},{kind:'locals',offset:80,count:3}],a=>{
  a.store(slot(40),'rcx');for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(80+n),'rax');a.load('rax',{base:'r8',disp:n});a.store(slot(96+n),'rax');}
  for(const [base,length,sign,start] of [[88,128,144,160],[104,136,152,168]] as const){a.load('r10',slot(base));a.load('rax',{base:'r10'});a.store(slot(length),'rax');a.load('rax',{base:'r10',disp:8},16);a.cmp('rax',45);const positive=a.unique('positive'),ready=a.unique('ready');a.jcc('ne',positive);a.mov('rax',1);a.store(slot(sign),'rax');a.store(slot(start),'rax');a.jmp(ready);a.label(positive);a.mov('rax',0);a.store(slot(sign),'rax');a.store(slot(start),'rax');a.label(ready);}
  a.load('rax',slot(144));a.load('r10',slot(152));a.cmp('rax','r10');const sameSign=a.unique('sameSign'),ordered=a.unique('ordered'),compare=a.unique('compare'),compareLoop=a.unique('compareLoop'),swap=a.unique('swap'),zero=a.unique('zero');a.jcc('e',sameSign);
  a.mov('rax',1);a.store(slot(192),'rax');a.load('rax',slot(128));a.load('r11',slot(160));a.sub('rax','r11');a.load('r10',slot(136));a.load('r11',slot(168));a.sub('r10','r11');a.cmp('rax','r10');a.jcc('b',swap);a.jcc('a',ordered);a.mov('rax',0);a.store(slot(256),'rax');a.label(compareLoop);
  a.load('rax',slot(256));a.load('r10',slot(128));a.load('r11',slot(160));a.sub('r10','r11');a.cmp('rax','r10');a.jcc('ae',zero);
  a.load('r10',slot(160));a.add('r10','rax');a.shl('r10',1);a.load('r11',slot(88));a.add('r11','r10');a.load('r11',{base:'r11',disp:8},16);
  a.load('r10',slot(168));a.add('r10','rax');a.shl('r10',1);a.load('rdx',slot(104));a.add('rdx','r10');a.load('rdx',{base:'rdx',disp:8},16);a.cmp('r11','rdx');a.jcc('b',swap);a.jcc('a',ordered);a.load('rax',slot(256));a.add('rax',1);a.store(slot(256),'rax');a.jmp(compareLoop);
  a.label(swap);for(const [left,right] of [[80,96],[88,104],[128,136],[144,152],[160,168]] as const){a.load('rax',slot(left));a.load('r10',slot(right));a.store(slot(left),'r10');a.store(slot(right),'rax');}a.jmp(ordered);
  a.label(sameSign);a.mov('rax',0);a.store(slot(192),'rax');a.label(ordered);a.load('rax',slot(144));a.store(slot(224),'rax');
  a.load('rax',slot(128));a.load('r11',slot(160));a.sub('rax','r11');a.load('r10',slot(136));a.load('r11',slot(168));a.sub('r10','r11');a.cmp('rax','r10');const capacity=a.unique('capacity');a.jcc('ae',capacity);a.mov('rax','r10');a.label(capacity);a.add('rax',2);a.store(slot(216),'rax');a.mov('rcx','rax');a.shl('rcx',1);a.add('rcx',8);a.call('rt.alloc');a.mov('r10',4);a.store(slot(112),'r10');a.store(slot(120),'rax');a.load('r10',slot(216));a.store({base:'rax'},'r10');
  a.load('rax',slot(128));a.sub('rax',1);a.store(slot(176),'rax');a.load('rax',slot(136));a.sub('rax',1);a.store(slot(184),'rax');a.load('rax',slot(216));a.sub('rax',1);a.store(slot(208),'rax');a.mov('rax',0);a.store(slot(200),'rax');
  const loop=a.unique('loop'),digits=a.unique('digits'),readB=a.unique('readB'),calculate=a.unique('calculate'),subtract=a.unique('subtract'),write=a.unique('write'),finish=a.unique('finish');a.label(loop);
  a.load('rax',slot(176));a.load('r10',slot(160));a.cmp('rax','r10');a.jcc('ge',digits);a.load('rax',slot(184));a.load('r10',slot(168));a.cmp('rax','r10');a.jcc('ge',digits);a.load('rax',slot(200));a.test('rax','rax');a.jcc('e',finish);
  a.label(digits);a.mov('rax',0);a.store(slot(232),'rax');a.store(slot(240),'rax');a.load('rax',slot(176));a.load('r10',slot(160));a.cmp('rax','r10');a.jcc('l',readB);a.shl('rax',1);a.load('r10',slot(88));a.add('r10','rax');a.load('rax',{base:'r10',disp:8},16);a.sub('rax',48);a.store(slot(232),'rax');
  a.label(readB);a.load('rax',slot(184));a.load('r10',slot(168));a.cmp('rax','r10');a.jcc('l',calculate);a.shl('rax',1);a.load('r10',slot(104));a.add('r10','rax');a.load('rax',{base:'r10',disp:8},16);a.sub('rax',48);a.store(slot(240),'rax');
  a.label(calculate);a.load('rax',slot(192));a.test('rax','rax');a.jcc('ne',subtract);a.load('rax',slot(232));a.load('r11',slot(240));a.add('rax','r11');a.load('r11',slot(200));a.add('rax','r11');a.mov('r10',0);a.cmp('rax',10);a.jcc('b',write);a.sub('rax',10);a.mov('r10',1);a.jmp(write);
  a.label(subtract);a.load('rax',slot(232));a.load('r11',slot(240));a.sub('rax','r11');a.load('r11',slot(200));a.sub('rax','r11');a.mov('r10',0);a.cmp('rax',0);a.jcc('ge',write);a.add('rax',10);a.mov('r10',1);
  a.label(write);a.store(slot(200),'r10');a.add('rax',48);a.load('r10',slot(208));a.shl('r10',1);a.load('r11',slot(120));a.add('r11','r10');a.store({base:'r11',disp:8},'rax',16);for(const index of [176,184,208]){a.load('rax',slot(index));a.sub('rax',1);a.store(slot(index),'rax');}a.jmp(loop);
  a.label(finish);a.load('rax',slot(208));a.add('rax',1);a.store(slot(248),'rax');const trim=a.unique('trim'),trimDone=a.unique('trimDone');a.label(trim);a.load('rax',slot(248));a.load('r10',slot(216));a.sub('r10',1);a.cmp('rax','r10');a.jcc('ae',trimDone);a.shl('rax',1);a.load('r10',slot(120));a.add('r10','rax');a.load('r11',{base:'r10',disp:8},16);a.cmp('r11',48);a.jcc('ne',trimDone);a.load('rax',slot(248));a.add('rax',1);a.store(slot(248),'rax');a.jmp(trim);a.label(trimDone);
  a.load('rax',slot(248));a.load('r10',slot(216));a.sub('r10',1);a.cmp('rax','r10');const nonzero=a.unique('nonzero');a.jcc('ne',nonzero);a.shl('rax',1);a.load('r10',slot(120));a.add('r10','rax');a.load('r11',{base:'r10',disp:8},16);a.cmp('r11',48);a.jcc('e',zero);
  a.label(nonzero);a.load('rax',slot(224));a.test('rax','rax');const slice=a.unique('slice');a.jcc('e',slice);a.load('rax',slot(248));a.sub('rax',1);a.store(slot(248),'rax');a.shl('rax',1);a.load('r10',slot(120));a.add('r10','rax');a.mov('rax',45);a.store({base:'r10',disp:8},'rax',16);
  a.label(slice);a.lea('rcx',slot(112));a.load('rdx',slot(120));a.load('r8',slot(248));a.load('r9',slot(216));a.call('rt.jsonSlice');a.jmp('rt.bigintAdd.return');
  a.label(zero);a.mov('rax',4);a.store(slot(112),'rax');a.lea('rax',{rip:'rt.bigint.zero'});a.store(slot(120),'rax');
  a.label('rt.bigintAdd.return');a.load('rcx',slot(40));a.mov('rax',7);a.store({base:'rcx'},'rax');a.load('rax',slot(120));a.store({base:'rcx',disp:8},'rax');
 });
 rootedFn(b,'rt.bigintFromDecimal',200,[{kind:'output',register:'rcx'},{kind:'locals',offset:64,count:3}],a=>{
  a.store(slot(40),'rcx');a.mov('rax',4);a.store(slot(64),'rax');a.store(slot(72),'rdx');a.mov('rax',0);a.store(slot(112),'rax');a.load('rax',{base:'rdx'});a.store(slot(120),'rax');
  const white=(label:string)=>{for(const c of [9,10,11,12,13,32]){a.cmp('r11',c);a.jcc('e',label);}};
  const left=a.unique('left'),leftNext=a.unique('leftNext'),right=a.unique('right'),rightNext=a.unique('rightNext'),sign=a.unique('sign'),invalid=a.unique('invalid'),zero=a.unique('zero'),done=a.unique('done');
  a.label(left);a.load('rax',slot(112));a.load('r10',slot(120));a.cmp('rax','r10');a.jcc('ae',zero);a.shl('rax',1);a.load('r10',slot(72));a.add('r10','rax');a.load('r11',{base:'r10',disp:8},16);white(leftNext);a.jmp(right);a.label(leftNext);a.load('rax',slot(112));a.add('rax',1);a.store(slot(112),'rax');a.jmp(left);
  a.label(right);a.load('rax',slot(120));a.load('r10',slot(112));a.cmp('rax','r10');a.jcc('be',zero);a.sub('rax',1);a.shl('rax',1);a.load('r10',slot(72));a.add('r10','rax');a.load('r11',{base:'r10',disp:8},16);white(rightNext);a.jmp(sign);a.label(rightNext);a.load('rax',slot(120));a.sub('rax',1);a.store(slot(120),'rax');a.jmp(right);
  a.label(sign);a.load('rax',slot(120));a.load('r10',slot(112));a.sub('rax','r10');a.cmp('rax',3);const decimal=a.unique('decimal');a.jcc('b',decimal);
  a.load('rax',slot(112));a.shl('rax',1);a.load('r10',slot(72));a.add('r10','rax');a.load('r11',{base:'r10',disp:8},16);a.cmp('r11',48);a.jcc('ne',decimal);a.load('r11',{base:'r10',disp:10},16);
  const hex=a.unique('hex'),binary=a.unique('binary'),octal=a.unique('octal'),prefixReady=a.unique('prefixReady');for(const code of [120,88]){a.cmp('r11',code);a.jcc('e',hex);}for(const code of [98,66]){a.cmp('r11',code);a.jcc('e',binary);}for(const code of [111,79]){a.cmp('r11',code);a.jcc('e',octal);}a.jmp(decimal);
  a.label(hex);a.mov('rax',16);a.jmp(prefixReady);a.label(binary);a.mov('rax',2);a.jmp(prefixReady);a.label(octal);a.mov('rax',8);a.label(prefixReady);a.store(slot(152),'rax');a.mov('rax',7);a.store(slot(80),'rax');a.lea('rax',{rip:'rt.bigint.zero'});a.store(slot(88),'rax');a.load('rax',slot(112));a.add('rax',2);a.store(slot(160),'rax');
  const prefixLoop=a.unique('prefixLoop'),prefixDone=a.unique('prefixDone'),prefixLower=a.unique('prefixLower'),digitReady=a.unique('digitReady');a.label(prefixLoop);a.load('rax',slot(160));a.load('r10',slot(120));a.cmp('rax','r10');a.jcc('ae',prefixDone);a.shl('rax',1);a.load('r10',slot(72));a.add('r10','rax');a.load('r11',{base:'r10',disp:8},16);
  a.cmp('r11',48);a.jcc('b',invalid);a.cmp('r11',57);a.jcc('a',prefixLower);a.sub('r11',48);a.jmp(digitReady);
  a.label(prefixLower);a.cmp('r11',65);a.jcc('b',invalid);a.cmp('r11',70);const lowercase=a.unique('lowercase');a.jcc('a',lowercase);a.sub('r11',55);a.jmp(digitReady);a.label(lowercase);a.cmp('r11',97);a.jcc('b',invalid);a.cmp('r11',102);a.jcc('a',invalid);a.sub('r11',87);
  a.label(digitReady);a.load('rax',slot(152));a.cmp('r11','rax');a.jcc('ae',invalid);a.lea('rcx',slot(80));a.lea('rdx',slot(80));a.mov('r8','rax');a.mov('r9','r11');a.call('rt.bigintScaleDigit');a.load('rax',slot(160));a.add('rax',1);a.store(slot(160),'rax');a.jmp(prefixLoop);
  a.label(prefixDone);a.jmp(done);
  a.label(decimal);a.mov('rax',0);a.store(slot(128),'rax');a.load('rax',slot(112));a.shl('rax',1);a.load('r10',slot(72));a.add('r10','rax');a.load('r11',{base:'r10',disp:8},16);a.cmp('r11',45);const plus=a.unique('plus'),digits=a.unique('digits');a.jcc('ne',plus);a.mov('rax',1);a.store(slot(128),'rax');a.jmp('rt.bigintFromDecimal.skipSign');a.label(plus);a.cmp('r11',43);a.jcc('ne',digits);a.label('rt.bigintFromDecimal.skipSign');a.load('rax',slot(112));a.add('rax',1);a.store(slot(112),'rax');
  a.label(digits);a.load('rax',slot(112));a.load('r10',slot(120));a.cmp('rax','r10');a.jcc('ae',invalid);a.store(slot(136),'rax');a.mov('r10',-1);a.store(slot(144),'r10');const scan=a.unique('scan'),next=a.unique('next'),scanDone=a.unique('scanDone');a.label(scan);a.load('rax',slot(136));a.load('r10',slot(120));a.cmp('rax','r10');a.jcc('ae',scanDone);a.shl('rax',1);a.load('r10',slot(72));a.add('r10','rax');a.load('r11',{base:'r10',disp:8},16);a.cmp('r11',48);a.jcc('b',invalid);a.cmp('r11',57);a.jcc('a',invalid);a.cmp('r11',48);a.jcc('e',next);a.load('r10',slot(144));a.cmp('r10',-1);a.jcc('ne',next);a.load('rax',slot(136));a.store(slot(144),'rax');a.label(next);a.load('rax',slot(136));a.add('rax',1);a.store(slot(136),'rax');a.jmp(scan);
  a.label(scanDone);a.load('rax',slot(144));a.cmp('rax',-1);a.jcc('e',zero);a.lea('rcx',slot(80));a.load('rdx',slot(72));a.mov('r8','rax');a.load('r9',slot(120));a.call('rt.jsonSlice');a.load('rax',slot(128));a.test('rax','rax');a.jcc('e',done);
  a.mov('rax',4);a.store(slot(96),'rax');a.lea('rax',{rip:'rt.bigint.minus'});a.store(slot(104),'rax');a.lea('rcx',slot(80));a.lea('rdx',slot(96));a.lea('r8',slot(80));a.call('rt.concat');a.jmp(done);
  a.label(zero);a.mov('rax',4);a.store(slot(80),'rax');a.lea('rax',{rip:'rt.bigint.zero'});a.store(slot(88),'rax');a.jmp(done);
  a.label(invalid);a.call('rt.throwSyntaxError');a.label(done);a.load('rcx',slot(40));a.mov('rax',7);a.store({base:'rcx'},'rax');a.load('rax',slot(88));a.store({base:'rcx',disp:8},'rax');
 });
 // Multiply a nonnegative decimal BigInt by a radix <= 16 and add one digit.
 rootedFn(b,'rt.bigintScaleDigit',168,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'locals',offset:64,count:2}],a=>{
  a.store(slot(40),'rcx');a.mov('rax',7);a.store(slot(64),'rax');a.load('rax',{base:'rdx',disp:8});a.store(slot(72),'rax');a.store(slot(96),'r8');a.store(slot(104),'r9');a.load('rax',{base:'rax'});a.store(slot(112),'rax');a.add('rax',3);a.store(slot(144),'rax');a.mov('rcx','rax');a.shl('rcx',1);a.add('rcx',8);a.call('rt.alloc');a.mov('r10',4);a.store(slot(80),'r10');a.store(slot(88),'rax');a.load('r10',slot(144));a.store({base:'rax'},'r10');
  a.load('rax',slot(112));a.sub('rax',1);a.store(slot(120),'rax');a.load('rax',slot(144));a.sub('rax',1);a.store(slot(128),'rax');a.load('rax',slot(104));a.store(slot(136),'rax');
  const loop=a.unique('loop'),digit=a.unique('digit'),emit=a.unique('emit'),done=a.unique('done');a.label(loop);a.load('rax',slot(120));a.cmp('rax',0);a.jcc('ge',digit);a.load('rax',slot(136));a.test('rax','rax');a.jcc('e',done);a.jmp(emit);
  a.label(digit);a.shl('rax',1);a.load('r10',slot(72));a.add('r10','rax');a.load('rax',{base:'r10',disp:8},16);a.sub('rax',48);a.load('r10',slot(96));a.imul('rax','r10');a.load('r10',slot(136));a.add('rax','r10');
  a.label(emit);a.xor('rdx','rdx');a.mov('r10',10);a.div('r10');a.store(slot(136),'rax');a.add('rdx',48);a.load('r10',slot(128));a.shl('r10',1);a.load('r11',slot(88));a.add('r11','r10');a.store({base:'r11',disp:8},'rdx',16);for(const offset of [120,128]){a.load('rax',slot(offset));a.sub('rax',1);a.store(slot(offset),'rax');}a.jmp(loop);
  a.label(done);a.load('rax',slot(128));a.add('rax',1);a.store(slot(152),'rax');a.lea('rcx',slot(80));a.load('rdx',slot(88));a.mov('r8','rax');a.load('r9',slot(144));a.call('rt.jsonSlice');a.load('rcx',slot(40));a.mov('rax',7);a.store({base:'rcx'},'rax');a.load('rax',slot(88));a.store({base:'rcx',disp:8},'rax');
 });
 b.fn('rt.BigInt.construct',40,a=>a.call('rt.throwTypeError'));
 rootedFn(b,'rt.BigInt.code',120,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:2}],a=>{
  a.store(slot(40),'rcx');a.test('rdx','rdx');const supplied=a.unique('supplied');a.jcc('ne',supplied);a.call('rt.throwTypeError');a.label(supplied);for(const n of [0,8]){a.load('rax',{base:'r8',disp:n});a.store(slot(64+n),'rax');}
  const inspect=a.unique('inspect'),boolean=a.unique('boolean'),number=a.unique('number'),string=a.unique('string'),done=a.unique('done');a.label(inspect);a.load('rax',slot(64));a.cmp('rax',7);a.jcc('e',done);a.cmp('rax',2);a.jcc('e',boolean);a.cmp('rax',3);a.jcc('e',number);a.cmp('rax',4);a.jcc('e',string);a.cmp('rax',5);const object=a.unique('object');a.jcc('e',object);a.call('rt.throwTypeError');
  a.label(object);a.lea('rcx',slot(80));a.lea('rdx',slot(64));a.call('rt.objectToPrimitiveNumber');for(const n of [0,8]){a.load('rax',slot(80+n));a.store(slot(64+n),'rax');}a.jmp(inspect);
  a.label(boolean);a.load('rax',slot(72));a.test('rax','rax');const falseValue=a.unique('falseValue');a.jcc('e',falseValue);a.lea('rax',{rip:'rt.bigint.one'});a.jmp('rt.BigInt.booleanReady');a.label(falseValue);a.lea('rax',{rip:'rt.bigint.zero'});a.label('rt.BigInt.booleanReady');a.store(slot(72),'rax');a.mov('rax',7);a.store(slot(64),'rax');a.jmp(done);
  a.label(number);a.movsd('xmm0',slot(72));a.ucomisd('xmm0','xmm0');const range=a.unique('range');a.jcc('p',range);a.mov('rax',0x43e0000000000000n);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',range);a.mov('rax',0xc3e0000000000000n);a.movqToXmm('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',range);a.cvttsd2si('rax','xmm0');a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ne',range);a.lea('rcx',slot(80));a.lea('rdx',slot(64));a.call('rt.toString');a.load('rdx',slot(88));a.lea('rcx',slot(64));a.call('rt.bigintFromDecimal');a.jmp(done);a.label(range);a.call('rt.throwRangeError');
  a.label(string);a.lea('rcx',slot(80));a.load('rdx',slot(72));a.call('rt.bigintFromDecimal');for(const n of [0,8]){a.load('rax',slot(80+n));a.store(slot(64+n),'rax');}
  a.label(done);a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(64+n));a.store({base:'rcx',disp:n},'rax');}
 });
 b.bundle.fragments.push(stringLiteral('rt.bigint.one','1'));
 emitFunctionBuiltin(b,'rt.bigintToString.fn','toString',0,'rt.bigintPrototype.valueOf','rt.bigintPrototype');
 emitFunctionBuiltin(b,'rt.bigintValueOf.fn','valueOf',0,undefined,'rt.bigintPrototype');
 b.bundle.fragments.push(stringLiteral('rt.bigint.tag','BigInt'));
 const tag=new Uint8Array(P.size);tag[P.value]=4;tag[P.attributes]=A.configurable;
 const prototypeHead=b.bundle.fragments.find(f=>f.name==='rt.bigintPrototype')!.fixups.find(f=>f.offset===O.properties)!;
 b.bundle.fragments.push({name:'rt.bigintPrototype.@@toStringTag',section:'.data',alignment:8,bytes:tag,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:prototypeHead.target,addend:0},
  {offset:P.key,kind:'va64',target:'rt.Symbol.toStringTag.value',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.bigint.tag',addend:0},
 ]});
 prototypeHead.target='rt.bigintPrototype.@@toStringTag';
 for(const method of ['toString','valueOf'] as const)rootedFn(b,'rt.bigint'+method[0]!.toUpperCase()+method.slice(1)+'.fn.code',104,[{kind:'output',register:'rcx'},{kind:'locals',offset:64,count:1}],(a,frame)=>{
  a.store(slot(40),'rcx');a.load('rdx',slot(frame+40));a.load('rax',{base:'rdx'});const valid=a.unique('valid');a.cmp('rax',7);a.jcc('e',valid);a.cmp('rax',5);const invalid=a.unique('invalid');a.jcc('ne',invalid);a.load('r10',{base:'rdx',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',BoxKind);a.jcc('ne',invalid);a.add('r10',BoxLayout.value);a.load('rax',{base:'r10'});a.cmp('rax',7);a.jcc('ne',invalid);a.mov('rdx','r10');a.jmp(valid);a.label(invalid);a.call('rt.throwTypeError');a.label(valid);
  a.load('rcx',slot(40));a.mov('rax',method==='toString'?4:7);a.store({base:'rcx'},'rax');a.load('rax',{base:'rdx',disp:8});a.store({base:'rcx',disp:8},'rax');
 });
}
