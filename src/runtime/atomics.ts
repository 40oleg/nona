import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import {stringLiteral} from './value.js';
import {TypedArrayKind,TypedArrayLayout} from './typed-array.js';
import {ArrayBufferLayout} from './array-buffer.js';

export const atomicsRoots=['rt.Atomics','rt.Atomics.isLockFree.fn','rt.Atomics.load.fn','rt.Atomics.store.fn'];
export const atomicsPropertyRoots=['rt.globalObject.Atomics','rt.Atomics.@@toStringTag',...['isLockFree','load','store'].flatMap(name=>builtinPropertyRoots('rt.Atomics.'+name+'.fn',name,'rt.Atomics'))];

export function emitAtomics(b:RuntimeBuilder):void {
 b.bundle.fragments.push({name:'rt.Atomics',section:'.data',alignment:8,bytes:new Uint8Array(O.size),symbols:{},fixups:[
  {offset:O.prototype,kind:'va64',target:'rt.objectPrototype',addend:0},
 ]});
 prependFunctionBuiltin(b,'rt.Atomics.isLockFree.fn','isLockFree',1,'rt.Atomics');
 prependFunctionBuiltin(b,'rt.Atomics.load.fn','load',2,'rt.Atomics');
 prependFunctionBuiltin(b,'rt.Atomics.store.fn','store',3,'rt.Atomics');
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
}
