import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import {stringLiteral} from './value.js';
import {TypedArrayKind,TypedArrayLayout} from './typed-array.js';
import {ArrayBufferLayout} from './array-buffer.js';

const rmwNames=['add','sub','exchange','and','or','xor'] as const;
export const atomicsRoots=['rt.Atomics','rt.Atomics.isLockFree.fn','rt.Atomics.load.fn','rt.Atomics.store.fn','rt.Atomics.compareExchange.fn','rt.Atomics.notify.fn','rt.Atomics.wait.fn',...rmwNames.map(name=>'rt.Atomics.'+name+'.fn')];
export const atomicsPropertyRoots=['rt.globalObject.Atomics','rt.Atomics.@@toStringTag',...['isLockFree','load','store','compareExchange','notify','wait',...rmwNames].flatMap(name=>builtinPropertyRoots('rt.Atomics.'+name+'.fn',name,'rt.Atomics'))];

export function emitAtomics(b:RuntimeBuilder):void {
 b.bundle.imports.push({dll:'KERNELBASE.dll',name:'WaitOnAddress',symbol:'WaitOnAddress'});
 for(const [name,value] of [['notEqual','not-equal'],['timedOut','timed-out'],['ok','ok']] as const)b.bundle.fragments.push(stringLiteral('rt.Atomics.'+name,value));
 b.bundle.fragments.push({name:'rt.Atomics',section:'.data',alignment:8,bytes:new Uint8Array(O.size),symbols:{},fixups:[
  {offset:O.prototype,kind:'va64',target:'rt.objectPrototype',addend:0},
 ]});
 prependFunctionBuiltin(b,'rt.Atomics.isLockFree.fn','isLockFree',1,'rt.Atomics');
 prependFunctionBuiltin(b,'rt.Atomics.load.fn','load',2,'rt.Atomics');
 prependFunctionBuiltin(b,'rt.Atomics.store.fn','store',3,'rt.Atomics');
 prependFunctionBuiltin(b,'rt.Atomics.compareExchange.fn','compareExchange',4,'rt.Atomics');
 prependFunctionBuiltin(b,'rt.Atomics.notify.fn','notify',3,'rt.Atomics');
 prependFunctionBuiltin(b,'rt.Atomics.wait.fn','wait',4,'rt.Atomics');
 for(const name of rmwNames)prependFunctionBuiltin(b,'rt.Atomics.'+name+'.fn',name,3,'rt.Atomics');
 b.bundle.fragments.push(stringLiteral('rt.str.Atomics','Atomics'));
 const atomics=b.bundle.fragments.find(f=>f.name==='rt.Atomics')!;
 const tagHead=atomics.fixups.find(f=>f.offset===O.properties)!;
 const tag=new Uint8Array(P.size);tag[P.value]=4;tag[P.attributes]=A.configurable;
 b.bundle.fragments.push({name:'rt.Atomics.@@toStringTag',section:'.data',alignment:8,bytes:tag,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:tagHead.target,addend:0},
  {offset:P.key,kind:'va64',target:'rt.Symbol.toStringTag.value',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.str.Atomics',addend:0},
 ]});tagHead.target='rt.Atomics.@@toStringTag';
 const global=b.bundle.fragments.find(f=>f.name==='rt.globalObject')!;
 const head=global.fixups.find(f=>f.offset===O.properties)!;
 const property=new Uint8Array(P.size);property[P.value]=5;property[P.attributes]=A.writable|A.configurable;
 b.bundle.fragments.push({name:'rt.globalObject.Atomics',section:'.data',alignment:8,bytes:property,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:head.target,addend:0},
  {offset:P.key,kind:'va64',target:'rt.str.Atomics',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.Atomics',addend:0},
 ]});head.target='rt.globalObject.Atomics';
 rootedFn(b,'rt.Atomics.isLockFree.fn.code',88,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:1}],a=>{
  a.store(slot(40),'rcx');a.mov('rax',0);a.store(slot(64),'rax');a.store(slot(72),'rax');
  const converted=a.unique('converted');a.test('rdx','rdx');a.jcc('e',converted);
  a.lea('rcx',slot(64));a.mov('rdx','r8');a.call('rt.toNumber');a.label(converted);
  a.movsd('xmm0',slot(72));a.cvttsd2si('rax','xmm0');
  const yes=a.unique('yes'),done=a.unique('done');for(const size of [1,2,4,8]){a.cmp('rax',size);a.jcc('e',yes);}
  a.mov('rax',0);a.jmp(done);a.label(yes);a.mov('rax',1);a.label(done);
  a.load('rcx',slot(40));a.mov('r10',2);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
 });
 rootedFn(b,'rt.Atomics.notify.fn.code',136,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:2}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.test('rdx','rdx');failIf(a,'e','rt.throwTypeError');a.load('rax',{base:'r8'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',{base:'r8',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',TypedArrayKind);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'r10',disp:TypedArrayLayout.elementType});a.cmp('rax',7);const accepted=a.unique('accepted');a.jcc('e',accepted);a.cmp('rax',10);failIf(a,'ne','rt.throwTypeError');a.label(accepted);
  a.store(slot(64),'r10');a.load('r11',{base:'r10',disp:TypedArrayLayout.buffer});a.load('rax',{base:'r11',disp:ArrayBufferLayout.detached});a.test('rax','rax');failIf(a,'ne','rt.throwTypeError');
  a.mov('rax',0);a.store(slot(80),'rax');a.store(slot(88),'rax');const indexReady=a.unique('indexReady');a.load('rax',slot(48));a.cmp('rax',2);a.jcc('b',indexReady);a.load('r10',slot(56));for(const n of [0,8]){a.load('rax',{base:'r10',disp:16+n});a.store(slot(80+n),'rax');}a.label(indexReady);
  a.lea('rcx',slot(80));a.lea('rdx',slot(80));a.call('rt.toNumber');a.movsd('xmm0',slot(88));const notNan=a.unique('notNan'),coerced=a.unique('coerced');a.ucomisd('xmm0','xmm0');a.jcc('np',notNan);a.mov('rax',0);a.jmp(coerced);a.label(notNan);a.cvttsd2si('rax','xmm0');a.label(coerced);a.test('rax','rax');failIf(a,'s','rt.throwRangeError');
  a.load('r10',slot(64));a.load('rdx',{base:'r10',disp:TypedArrayLayout.length});a.cmp('rax','rdx');failIf(a,'ae','rt.throwRangeError');
  a.load('rax',slot(48));a.cmp('rax',3);const countReady=a.unique('countReady');a.jcc('b',countReady);a.load('r10',slot(56));a.load('rax',{base:'r10',disp:32});a.cmp('rax',0);a.jcc('e',countReady);a.load('rax',{base:'r10',disp:32});a.store(slot(96),'rax');a.load('rax',{base:'r10',disp:40});a.store(slot(104),'rax');a.lea('rcx',slot(96));a.lea('rdx',slot(96));a.call('rt.toNumber');a.label(countReady);
  a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.mov('rax',0);a.cvtsi2sd('xmm0','rax');a.storesd({base:'rcx',disp:8},'xmm0');
 });
 rootedFn(b,'rt.Atomics.load.fn.code',136,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:1}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.test('rdx','rdx');failIf(a,'e','rt.throwTypeError');
  a.load('rax',{base:'r8'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',{base:'r8',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',TypedArrayKind);failIf(a,'ne','rt.throwTypeError');
  a.store(slot(64),'r10');a.load('rax',{base:'r10',disp:TypedArrayLayout.elementType});a.store(slot(72),'rax');
  a.cmp('rax',3);failIf(a,'e','rt.throwTypeError');a.cmp('rax',8);const valid=a.unique('valid');a.jcc('b',valid);a.cmp('rax',10);failIf(a,'b','rt.throwTypeError');a.label(valid);
  a.load('r10',{base:'r10',disp:TypedArrayLayout.buffer});a.load('rax',{base:'r10',disp:ArrayBufferLayout.detached});a.test('rax','rax');failIf(a,'ne','rt.throwTypeError');
  a.mov('rax',0);a.store(slot(80),'rax');a.store(slot(88),'rax');const indexReady=a.unique('indexReady');
  a.load('rax',slot(48));a.cmp('rax',2);a.jcc('b',indexReady);a.load('r10',slot(56));for(const n of [0,8]){a.load('rax',{base:'r10',disp:16+n});a.store(slot(80+n),'rax');}a.label(indexReady);
  a.lea('rcx',slot(80));a.lea('rdx',slot(80));a.call('rt.toNumber');
  a.movsd('xmm0',slot(88));const notNan=a.unique('notNan'),coerced=a.unique('coerced');a.ucomisd('xmm0','xmm0');a.jcc('np',notNan);a.mov('rax',0);a.jmp(coerced);a.label(notNan);a.cvttsd2si('rax','xmm0');a.label(coerced);
  a.test('rax','rax');failIf(a,'s','rt.throwRangeError');a.store(slot(96),'rax');
  a.load('r10',slot(64));a.load('r11',{base:'r10',disp:TypedArrayLayout.buffer});a.load('rdx',{base:'r11',disp:ArrayBufferLayout.detached});a.test('rdx','rdx');failIf(a,'ne','rt.throwTypeError');
  a.load('rdx',{base:'r10',disp:TypedArrayLayout.length});a.cmp('rax','rdx');failIf(a,'ae','rt.throwRangeError');
  a.load('r11',slot(72));const byte=a.unique('byte'),word=a.unique('word'),quad=a.unique('quad'),address=a.unique('address');a.cmp('r11',3);a.jcc('b',byte);a.cmp('r11',6);a.jcc('b',word);a.cmp('r11',10);a.jcc('ae',quad);a.shl('rax',2);a.jmp(address);a.label(word);a.shl('rax',1);a.jmp(address);a.label(quad);a.shl('rax',3);a.label(byte);a.label(address);
  a.load('rdx',{base:'r10',disp:TypedArrayLayout.byteOffset});a.add('rax','rdx');a.load('rdx',{base:'r10',disp:TypedArrayLayout.buffer});a.load('rdx',{base:'rdx',disp:ArrayBufferLayout.bytes});a.add('rdx','rax');
  const loadByte=a.unique('loadByte'),loadWord=a.unique('loadWord'),loadQuad=a.unique('loadQuad'),loaded=a.unique('loaded');a.cmp('r11',3);a.jcc('b',loadByte);a.cmp('r11',6);a.jcc('b',loadWord);a.cmp('r11',10);a.jcc('ae',loadQuad);a.load('rax',{base:'rdx'},32);a.jmp(loaded);a.label(loadWord);a.load('rax',{base:'rdx'},16);a.jmp(loaded);a.label(loadQuad);a.load('rax',{base:'rdx'},64);a.jmp(loaded);a.label(loadByte);a.load('rax',{base:'rdx'},8);a.label(loaded);a.mfence();
  const signed8=a.unique('signed8'),signed16=a.unique('signed16'),signed32=a.unique('signed32'),number=a.unique('number'),bigint=a.unique('bigint');a.load('r10',slot(72));a.cmp('r10',10);a.jcc('ae',bigint);a.cmp('r10',2);a.jcc('e',signed8);a.cmp('r10',5);a.jcc('e',signed16);a.cmp('r10',7);a.jcc('e',signed32);a.jmp(number);
  a.label(signed8);a.shl('rax',56);a.sar('rax',56);a.jmp(number);a.label(signed16);a.shl('rax',48);a.sar('rax',48);a.jmp(number);a.label(signed32);a.shl('rax',32);a.sar('rax',32);a.label(number);
  a.cvtsi2sd('xmm0','rax');a.load('rcx',slot(40));a.mov('r10',3);a.store({base:'rcx'},'r10');a.storesd({base:'rcx',disp:8},'xmm0');const done=a.unique('done');a.jmp(done);
  a.label(bigint);a.mov('rdx','rax');a.mov('r8',0);a.cmp('r10',10);const unsigned=a.unique('unsigned');a.jcc('ne',unsigned);a.mov('r8',1);a.label(unsigned);a.load('rcx',slot(40));a.call('rt.uint64ToBigInt');a.label(done);
 });
 rootedFn(b,'rt.Atomics.store.fn.code',200,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:4}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.test('rdx','rdx');failIf(a,'e','rt.throwTypeError');a.load('rax',{base:'r8'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',{base:'r8',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',TypedArrayKind);failIf(a,'ne','rt.throwTypeError');
  a.store(slot(64),'r10');a.load('rax',{base:'r10',disp:TypedArrayLayout.elementType});a.store(slot(72),'rax');
  a.cmp('rax',3);failIf(a,'e','rt.throwTypeError');a.cmp('rax',8);const valid=a.unique('valid');a.jcc('b',valid);a.cmp('rax',10);failIf(a,'b','rt.throwTypeError');a.label(valid);
  a.load('r10',{base:'r10',disp:TypedArrayLayout.buffer});a.load('rax',{base:'r10',disp:ArrayBufferLayout.detached});a.test('rax','rax');failIf(a,'ne','rt.throwTypeError');
  a.mov('rax',0);a.store(slot(80),'rax');a.store(slot(88),'rax');const indexReady=a.unique('indexReady');a.load('rax',slot(48));a.cmp('rax',2);a.jcc('b',indexReady);a.load('r10',slot(56));for(const n of [0,8]){a.load('rax',{base:'r10',disp:16+n});a.store(slot(80+n),'rax');}a.label(indexReady);
  a.lea('rcx',slot(80));a.lea('rdx',slot(80));a.call('rt.toNumber');a.movsd('xmm0',slot(88));const notNan=a.unique('notNan'),coerced=a.unique('coerced');a.ucomisd('xmm0','xmm0');a.jcc('np',notNan);a.mov('rax',0);a.jmp(coerced);a.label(notNan);a.cvttsd2si('rax','xmm0');a.label(coerced);a.test('rax','rax');failIf(a,'s','rt.throwRangeError');a.store(slot(96),'rax');
  a.load('r10',slot(64));a.load('r11',{base:'r10',disp:TypedArrayLayout.buffer});a.load('rdx',{base:'r11',disp:ArrayBufferLayout.detached});a.test('rdx','rdx');failIf(a,'ne','rt.throwTypeError');a.load('rdx',{base:'r10',disp:TypedArrayLayout.length});a.cmp('rax','rdx');failIf(a,'ae','rt.throwRangeError');
  a.mov('rax',0);a.store(slot(112),'rax');a.store(slot(120),'rax');const valueReady=a.unique('valueReady');a.load('rax',slot(48));a.cmp('rax',3);a.jcc('b',valueReady);a.load('r10',slot(56));for(const n of [0,8]){a.load('rax',{base:'r10',disp:32+n});a.store(slot(112+n),'rax');}a.label(valueReady);
  a.load('rax',slot(72));a.cmp('rax',10);const number=a.unique('number'),converted=a.unique('converted');a.jcc('b',number);
  a.lea('rcx',slot(128));a.lea('rdx',slot(112));a.call('rt.toBigIntValue');a.lea('rdx',slot(128));a.call('rt.bigintToUint64');a.store(slot(144),'rax');a.jmp(converted);
  a.label(number);a.lea('rcx',slot(128));a.lea('rdx',slot(112));a.call('rt.toNumber');a.movsd('xmm0',slot(136));
  const finite=a.unique('finite'),truncated=a.unique('truncated'),zero=a.unique('zero');a.ucomisd('xmm0','xmm0');a.jcc('np',finite);a.label(zero);a.mov('rax',0);a.store(slot(136),'rax');a.jmp(truncated);
  a.label(finite);a.cvttsd2si('rax','xmm0');a.mov('r10',-9223372036854775808n);a.cmp('rax','r10');a.jcc('e',truncated);a.cvtsi2sd('xmm0','rax');a.storesd(slot(136),'xmm0');a.label(truncated);
  a.lea('rcx',slot(128));a.call('rt.toInt32');a.store(slot(144),'rax');a.label(converted);
  a.load('r10',slot(64));a.load('r11',{base:'r10',disp:TypedArrayLayout.buffer});a.load('rdx',{base:'r11',disp:ArrayBufferLayout.detached});a.test('rdx','rdx');failIf(a,'ne','rt.throwTypeError');
  a.load('rax',slot(96));a.load('r11',slot(72));const byte=a.unique('byte'),word=a.unique('word'),quad=a.unique('quad'),address=a.unique('address');a.cmp('r11',3);a.jcc('b',byte);a.cmp('r11',6);a.jcc('b',word);a.cmp('r11',10);a.jcc('ae',quad);a.shl('rax',2);a.jmp(address);a.label(word);a.shl('rax',1);a.jmp(address);a.label(quad);a.shl('rax',3);a.label(byte);a.label(address);
  a.load('rdx',{base:'r10',disp:TypedArrayLayout.byteOffset});a.add('rax','rdx');a.load('rdx',{base:'r10',disp:TypedArrayLayout.buffer});a.load('rdx',{base:'rdx',disp:ArrayBufferLayout.bytes});a.add('rdx','rax');a.load('rax',slot(144));
  const storeByte=a.unique('storeByte'),storeWord=a.unique('storeWord'),storeQuad=a.unique('storeQuad'),stored=a.unique('stored');a.cmp('r11',3);a.jcc('b',storeByte);a.cmp('r11',6);a.jcc('b',storeWord);a.cmp('r11',10);a.jcc('ae',storeQuad);a.atomicExchange({base:'rdx'},'rax',32);a.jmp(stored);a.label(storeWord);a.atomicExchange({base:'rdx'},'rax',16);a.jmp(stored);a.label(storeQuad);a.atomicExchange({base:'rdx'},'rax',64);a.jmp(stored);a.label(storeByte);a.atomicExchange({base:'rdx'},'rax',8);a.label(stored);
  a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(128+n));a.store({base:'rcx',disp:n},'rax');}
 });
 rootedFn(b,'rt.Atomics.wait.fn.code',248,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:7}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.test('rdx','rdx');failIf(a,'e','rt.throwTypeError');a.load('rax',{base:'r8'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',{base:'r8',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',TypedArrayKind);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'r10',disp:TypedArrayLayout.elementType});a.cmp('rax',7);const valid=a.unique('valid');a.jcc('e',valid);a.cmp('rax',10);failIf(a,'ne','rt.throwTypeError');a.label(valid);a.store(slot(72),'rax');a.store(slot(64),'r10');
  a.load('r11',{base:'r10',disp:TypedArrayLayout.buffer});a.load('rax',{base:'r11',disp:O.kind});a.cmp('rax',14);failIf(a,'ne','rt.throwTypeError');
  a.mov('rax',0);a.store(slot(80),'rax');a.store(slot(88),'rax');const indexReady=a.unique('indexReady');a.load('rax',slot(48));a.cmp('rax',2);a.jcc('b',indexReady);a.load('r10',slot(56));for(const n of [0,8]){a.load('rax',{base:'r10',disp:16+n});a.store(slot(80+n),'rax');}a.label(indexReady);
  a.lea('rcx',slot(80));a.lea('rdx',slot(80));a.call('rt.toNumber');a.movsd('xmm0',slot(88));const notNan=a.unique('notNan'),coerced=a.unique('coerced');a.ucomisd('xmm0','xmm0');a.jcc('np',notNan);a.mov('rax',0);a.jmp(coerced);a.label(notNan);a.cvttsd2si('rax','xmm0');a.label(coerced);a.test('rax','rax');failIf(a,'s','rt.throwRangeError');a.store(slot(96),'rax');
  a.load('r10',slot(64));a.load('rdx',{base:'r10',disp:TypedArrayLayout.length});a.cmp('rax','rdx');failIf(a,'ae','rt.throwRangeError');
  a.mov('rax',0);a.store(slot(112),'rax');a.store(slot(120),'rax');const valueReady=a.unique('valueReady');a.load('rax',slot(48));a.cmp('rax',3);a.jcc('b',valueReady);a.load('r10',slot(56));for(const n of [0,8]){a.load('rax',{base:'r10',disp:32+n});a.store(slot(112+n),'rax');}a.label(valueReady);
  a.load('rax',slot(72));a.cmp('rax',10);const numeric=a.unique('numeric'),valueConverted=a.unique('valueConverted');a.jcc('b',numeric);
  a.lea('rcx',slot(128));a.lea('rdx',slot(112));a.call('rt.toBigIntValue');a.lea('rdx',slot(128));a.call('rt.bigintToUint64');a.store(slot(144),'rax');a.jmp(valueConverted);
  a.label(numeric);a.lea('rcx',slot(128));a.lea('rdx',slot(112));a.call('rt.toNumber');a.lea('rcx',slot(128));a.call('rt.toInt32');a.store(slot(144),'rax');a.label(valueConverted);
  a.mov('rax',0xffffffffn);a.store(slot(192),'rax');a.load('rax',slot(48));a.cmp('rax',4);const timeoutReady=a.unique('timeoutReady');a.jcc('b',timeoutReady);a.load('r10',slot(56));a.load('rax',{base:'r10',disp:48});a.test('rax','rax');a.jcc('e',timeoutReady);for(const n of [0,8]){a.load('rax',{base:'r10',disp:48+n});a.store(slot(160+n),'rax');}
  a.lea('rcx',slot(176));a.lea('rdx',slot(160));a.call('rt.toNumber');a.movsd('xmm0',slot(184));a.ucomisd('xmm0','xmm0');a.jcc('p',timeoutReady);a.mov('rax',0);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');const positive=a.unique('positive');a.jcc('a',positive);a.store(slot(192),'rax');a.jmp(timeoutReady);
  a.label(positive);a.mov('rax',0xfffffffen);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',timeoutReady);a.cvttsd2si('rax','xmm0');a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');const integral=a.unique('integral');a.jcc('e',integral);a.add('rax',1);a.label(integral);a.store(slot(192),'rax');a.label(timeoutReady);
  a.load('r10',slot(64));a.load('rax',slot(96));a.load('r11',slot(72));a.cmp('r11',10);const quad=a.unique('quad'),address=a.unique('address');a.jcc('e',quad);a.shl('rax',2);a.jmp(address);a.label(quad);a.shl('rax',3);a.label(address);a.load('rdx',{base:'r10',disp:TypedArrayLayout.byteOffset});a.add('rax','rdx');a.load('rdx',{base:'r10',disp:TypedArrayLayout.buffer});a.load('rdx',{base:'rdx',disp:ArrayBufferLayout.bytes});a.add('rax','rdx');a.store(slot(200),'rax');
  a.load('r10',slot(144));a.cmp('r11',10);const readQuad=a.unique('readQuad'),compared=a.unique('compared');a.jcc('e',readQuad);a.load('rax',{base:'rax'},32);a.mov('rdx',0xffffffffn);a.and('r10','rdx');a.jmp(compared);a.label(readQuad);a.load('rax',{base:'rax'},64);a.label(compared);a.cmp('rax','r10');const notEqual=a.unique('notEqual'),timedOut=a.unique('timedOut'),finish=a.unique('finish');a.jcc('ne',notEqual);
  a.load('rax',slot(192));a.test('rax','rax');a.jcc('e',timedOut);
  a.load('rcx',slot(200));a.lea('rdx',slot(144));a.mov('r8',4);a.load('rax',slot(72));a.cmp('rax',10);const widthReady=a.unique('widthReady');a.jcc('ne',widthReady);a.mov('r8',8);a.label(widthReady);a.load('r9',slot(192));a.callImport('WaitOnAddress');a.test('rax','rax');a.jcc('e',timedOut);a.load('rcx',slot(40));a.lea('rax',{rip:'rt.Atomics.ok'});a.jmp(finish);
  a.label(notEqual);a.load('rcx',slot(40));a.lea('rax',{rip:'rt.Atomics.notEqual'});a.jmp(finish);a.label(timedOut);a.load('rcx',slot(40));a.lea('rax',{rip:'rt.Atomics.timedOut'});a.label(finish);a.mov('r10',4);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
 });
 for(const name of rmwNames)rootedFn(b,'rt.Atomics.'+name+'.fn.code',200,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:4}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.test('rdx','rdx');failIf(a,'e','rt.throwTypeError');a.load('rax',{base:'r8'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',{base:'r8',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',TypedArrayKind);failIf(a,'ne','rt.throwTypeError');
  a.store(slot(64),'r10');a.load('rax',{base:'r10',disp:TypedArrayLayout.elementType});a.store(slot(72),'rax');
  a.cmp('rax',3);failIf(a,'e','rt.throwTypeError');a.cmp('rax',8);const valid=a.unique('valid');a.jcc('b',valid);a.cmp('rax',10);failIf(a,'b','rt.throwTypeError');a.label(valid);
  a.load('r10',{base:'r10',disp:TypedArrayLayout.buffer});a.load('rax',{base:'r10',disp:ArrayBufferLayout.detached});a.test('rax','rax');failIf(a,'ne','rt.throwTypeError');
  a.mov('rax',0);a.store(slot(80),'rax');a.store(slot(88),'rax');const indexReady=a.unique('indexReady');a.load('rax',slot(48));a.cmp('rax',2);a.jcc('b',indexReady);a.load('r10',slot(56));for(const n of [0,8]){a.load('rax',{base:'r10',disp:16+n});a.store(slot(80+n),'rax');}a.label(indexReady);
  a.lea('rcx',slot(80));a.lea('rdx',slot(80));a.call('rt.toNumber');a.movsd('xmm0',slot(88));const notNan=a.unique('notNan'),coerced=a.unique('coerced');a.ucomisd('xmm0','xmm0');a.jcc('np',notNan);a.mov('rax',0);a.jmp(coerced);a.label(notNan);a.cvttsd2si('rax','xmm0');a.label(coerced);a.test('rax','rax');failIf(a,'s','rt.throwRangeError');a.store(slot(96),'rax');
  a.load('r10',slot(64));a.load('r11',{base:'r10',disp:TypedArrayLayout.buffer});a.load('rdx',{base:'r11',disp:ArrayBufferLayout.detached});a.test('rdx','rdx');failIf(a,'ne','rt.throwTypeError');a.load('rdx',{base:'r10',disp:TypedArrayLayout.length});a.cmp('rax','rdx');failIf(a,'ae','rt.throwRangeError');
  a.mov('rax',0);a.store(slot(112),'rax');a.store(slot(120),'rax');const valueReady=a.unique('valueReady');a.load('rax',slot(48));a.cmp('rax',3);a.jcc('b',valueReady);a.load('r10',slot(56));for(const n of [0,8]){a.load('rax',{base:'r10',disp:32+n});a.store(slot(112+n),'rax');}a.label(valueReady);
  a.load('rax',slot(72));a.cmp('rax',10);const number=a.unique('number'),converted=a.unique('converted');a.jcc('b',number);
  a.lea('rcx',slot(128));a.lea('rdx',slot(112));a.call('rt.toBigIntValue');a.lea('rdx',slot(128));a.call('rt.bigintToUint64');a.store(slot(144),'rax');a.jmp(converted);
  a.label(number);a.lea('rcx',slot(128));a.lea('rdx',slot(112));a.call('rt.toNumber');a.lea('rcx',slot(128));a.call('rt.toInt32');a.store(slot(144),'rax');a.label(converted);
  a.load('r10',slot(64));a.load('r11',{base:'r10',disp:TypedArrayLayout.buffer});a.load('rdx',{base:'r11',disp:ArrayBufferLayout.detached});a.test('rdx','rdx');failIf(a,'ne','rt.throwTypeError');
  a.load('rax',slot(96));a.load('r11',slot(72));const byte=a.unique('byte'),word=a.unique('word'),quad=a.unique('quad'),address=a.unique('address');a.cmp('r11',3);a.jcc('b',byte);a.cmp('r11',6);a.jcc('b',word);a.cmp('r11',10);a.jcc('ae',quad);a.shl('rax',2);a.jmp(address);a.label(word);a.shl('rax',1);a.jmp(address);a.label(quad);a.shl('rax',3);a.label(byte);a.label(address);
  a.load('rdx',{base:'r10',disp:TypedArrayLayout.byteOffset});a.add('rax','rdx');a.load('rdx',{base:'r10',disp:TypedArrayLayout.buffer});a.load('rdx',{base:'rdx',disp:ArrayBufferLayout.bytes});a.add('rdx','rax');a.load('rax',slot(144));if(name==='sub')a.neg('rax');
  const atomic=(width:8|16|32|64)=>{
   if(name==='exchange')a.atomicExchange({base:'rdx'},'rax',width);
   else if(name==='add'||name==='sub')a.atomicXadd({base:'rdx'},'rax',width);
   else{
    a.load('r11',slot(144));a.load('rax',{base:'rdx'},width);const retry=a.unique('retry');a.label(retry);a.mov('r10','rax');
    if(name==='and')a.and('r10','r11');else if(name==='or')a.or('r10','r11');else a.xor('r10','r11');
    a.atomicCompareExchange({base:'rdx'},'r10',width);a.jcc('ne',retry);
   }
  };
  const opByte=a.unique('opByte'),opWord=a.unique('opWord'),opQuad=a.unique('opQuad'),operated=a.unique('operated');a.cmp('r11',3);a.jcc('b',opByte);a.cmp('r11',6);a.jcc('b',opWord);a.cmp('r11',10);a.jcc('ae',opQuad);atomic(32);a.jmp(operated);a.label(opWord);atomic(16);a.and('rax',65535);a.jmp(operated);a.label(opQuad);atomic(64);a.jmp(operated);a.label(opByte);atomic(8);a.and('rax',255);a.label(operated);
  const signed8=a.unique('signed8'),signed16=a.unique('signed16'),signed32=a.unique('signed32'),resultNumber=a.unique('resultNumber'),bigint=a.unique('bigint');a.load('r10',slot(72));a.cmp('r10',10);a.jcc('ae',bigint);a.cmp('r10',2);a.jcc('e',signed8);a.cmp('r10',5);a.jcc('e',signed16);a.cmp('r10',7);a.jcc('e',signed32);a.jmp(resultNumber);
  a.label(signed8);a.shl('rax',56);a.sar('rax',56);a.jmp(resultNumber);a.label(signed16);a.shl('rax',48);a.sar('rax',48);a.jmp(resultNumber);a.label(signed32);a.shl('rax',32);a.sar('rax',32);a.label(resultNumber);a.cvtsi2sd('xmm0','rax');a.load('rcx',slot(40));a.mov('r10',3);a.store({base:'rcx'},'r10');a.storesd({base:'rcx',disp:8},'xmm0');const done=a.unique('done');a.jmp(done);
  a.label(bigint);a.mov('rdx','rax');a.mov('r8',0);a.cmp('r10',10);const unsigned=a.unique('unsigned');a.jcc('ne',unsigned);a.mov('r8',1);a.label(unsigned);a.load('rcx',slot(40));a.call('rt.uint64ToBigInt');a.label(done);
 });
 rootedFn(b,'rt.Atomics.compareExchange.fn.code',232,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:7}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.test('rdx','rdx');failIf(a,'e','rt.throwTypeError');a.load('rax',{base:'r8'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',{base:'r8',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',TypedArrayKind);failIf(a,'ne','rt.throwTypeError');
  a.store(slot(64),'r10');a.load('rax',{base:'r10',disp:TypedArrayLayout.elementType});a.store(slot(72),'rax');
  a.cmp('rax',3);failIf(a,'e','rt.throwTypeError');a.cmp('rax',8);const valid=a.unique('valid');a.jcc('b',valid);a.cmp('rax',10);failIf(a,'b','rt.throwTypeError');a.label(valid);
  a.load('r10',{base:'r10',disp:TypedArrayLayout.buffer});a.load('rax',{base:'r10',disp:ArrayBufferLayout.detached});a.test('rax','rax');failIf(a,'ne','rt.throwTypeError');
  a.mov('rax',0);a.store(slot(80),'rax');a.store(slot(88),'rax');const indexReady=a.unique('indexReady');a.load('rax',slot(48));a.cmp('rax',2);a.jcc('b',indexReady);a.load('r10',slot(56));for(const n of [0,8]){a.load('rax',{base:'r10',disp:16+n});a.store(slot(80+n),'rax');}a.label(indexReady);
  a.lea('rcx',slot(80));a.lea('rdx',slot(80));a.call('rt.toNumber');a.movsd('xmm0',slot(88));const notNan=a.unique('notNan'),coerced=a.unique('coerced');a.ucomisd('xmm0','xmm0');a.jcc('np',notNan);a.mov('rax',0);a.jmp(coerced);a.label(notNan);a.cvttsd2si('rax','xmm0');a.label(coerced);a.test('rax','rax');failIf(a,'s','rt.throwRangeError');a.store(slot(96),'rax');
  a.load('r10',slot(64));a.load('r11',{base:'r10',disp:TypedArrayLayout.buffer});a.load('rdx',{base:'r11',disp:ArrayBufferLayout.detached});a.test('rdx','rdx');failIf(a,'ne','rt.throwTypeError');a.load('rdx',{base:'r10',disp:TypedArrayLayout.length});a.cmp('rax','rdx');failIf(a,'ae','rt.throwRangeError');
  for(const [position,target,minCount] of [[32,112,3],[48,160,4]] as const){a.mov('rax',0);a.store(slot(target),'rax');a.store(slot(target+8),'rax');const absent=a.unique('absent');a.load('rax',slot(48));a.cmp('rax',minCount);a.jcc('b',absent);a.load('r10',slot(56));for(const n of [0,8]){a.load('rax',{base:'r10',disp:position+n});a.store(slot(target+n),'rax');}a.label(absent);}
  for(const [source,converted,bits] of [[112,128,144],[160,176,192]] as const){
   a.load('rax',slot(72));a.cmp('rax',10);const number=a.unique('number'),done=a.unique('done');a.jcc('b',number);
   a.lea('rcx',slot(converted));a.lea('rdx',slot(source));a.call('rt.toBigIntValue');a.lea('rdx',slot(converted));a.call('rt.bigintToUint64');a.store(slot(bits),'rax');a.jmp(done);
   a.label(number);a.lea('rcx',slot(converted));a.lea('rdx',slot(source));a.call('rt.toNumber');a.lea('rcx',slot(converted));a.call('rt.toInt32');a.store(slot(bits),'rax');a.label(done);
  }
  a.load('r10',slot(64));a.load('r11',{base:'r10',disp:TypedArrayLayout.buffer});a.load('rdx',{base:'r11',disp:ArrayBufferLayout.detached});a.test('rdx','rdx');failIf(a,'ne','rt.throwTypeError');
  a.load('rax',slot(96));a.load('r11',slot(72));const byte=a.unique('byte'),word=a.unique('word'),quad=a.unique('quad'),address=a.unique('address');a.cmp('r11',3);a.jcc('b',byte);a.cmp('r11',6);a.jcc('b',word);a.cmp('r11',10);a.jcc('ae',quad);a.shl('rax',2);a.jmp(address);a.label(word);a.shl('rax',1);a.jmp(address);a.label(quad);a.shl('rax',3);a.label(byte);a.label(address);
  a.load('rdx',{base:'r10',disp:TypedArrayLayout.byteOffset});a.add('rax','rdx');a.load('rdx',{base:'r10',disp:TypedArrayLayout.buffer});a.load('rdx',{base:'rdx',disp:ArrayBufferLayout.bytes});a.add('rdx','rax');a.load('rax',slot(144));a.load('r10',slot(192));
  const opByte=a.unique('opByte'),opWord=a.unique('opWord'),opQuad=a.unique('opQuad'),operated=a.unique('operated');a.cmp('r11',3);a.jcc('b',opByte);a.cmp('r11',6);a.jcc('b',opWord);a.cmp('r11',10);a.jcc('ae',opQuad);a.atomicCompareExchange({base:'rdx'},'r10',32);a.mov('r11',0xffffffffn);a.and('rax','r11');a.jmp(operated);a.label(opWord);a.atomicCompareExchange({base:'rdx'},'r10',16);a.and('rax',65535);a.jmp(operated);a.label(opQuad);a.atomicCompareExchange({base:'rdx'},'r10',64);a.jmp(operated);a.label(opByte);a.atomicCompareExchange({base:'rdx'},'r10',8);a.and('rax',255);a.label(operated);
  const signed8=a.unique('signed8'),signed16=a.unique('signed16'),signed32=a.unique('signed32'),resultNumber=a.unique('resultNumber'),bigint=a.unique('bigint');a.load('r10',slot(72));a.cmp('r10',10);a.jcc('ae',bigint);a.cmp('r10',2);a.jcc('e',signed8);a.cmp('r10',5);a.jcc('e',signed16);a.cmp('r10',7);a.jcc('e',signed32);a.jmp(resultNumber);
  a.label(signed8);a.shl('rax',56);a.sar('rax',56);a.jmp(resultNumber);a.label(signed16);a.shl('rax',48);a.sar('rax',48);a.jmp(resultNumber);a.label(signed32);a.shl('rax',32);a.sar('rax',32);a.label(resultNumber);a.cvtsi2sd('xmm0','rax');a.load('rcx',slot(40));a.mov('r10',3);a.store({base:'rcx'},'r10');a.storesd({base:'rcx',disp:8},'xmm0');const done=a.unique('done');a.jmp(done);
  a.label(bigint);a.mov('rdx','rax');a.mov('r8',0);a.cmp('r10',10);const unsigned=a.unique('unsigned');a.jcc('ne',unsigned);a.mov('r8',1);a.label(unsigned);a.load('rcx',slot(40));a.call('rt.uint64ToBigInt');a.label(done);
 });
}
