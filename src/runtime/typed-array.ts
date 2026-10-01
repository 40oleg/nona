import {RuntimeBuilder,slot,failIf} from './abi.js';
import {selectNativeConstructPrototype,resolveDeferredConstructPrototype} from './constructor-prototype.js';
import {rootedFn} from './root-scope.js';
import {HeapKind,HeapLayout as H} from './heap-layout.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A,ProxyKind,ProxyConstructable} from './object-layout.js';
import {emitNativeFunction,prependFunctionBuiltin} from './function-builtin.js';
import {stringLiteral} from './value.js';
import {ArrayBufferKind,ArrayBufferLayout} from './array-buffer.js';
import {SharedArrayBufferKind} from './shared-array-buffer.js';
import {FunctionLayout as F,FunctionKind} from './functions.js';

/** Common layout for future numeric and BigInt typed-array variants. */
export const TypedArrayKind=13;
export const TypedArrayLayout={buffer:O.size,byteOffset:O.size+8,byteLength:O.size+16,length:O.size+24,elementType:O.size+32,size:O.size+40} as const;
const typedArrayWidths=[['Uint8Array','uint8array',1],['Int8Array','int8array',1],['Uint8ClampedArray','uint8clampedarray',1],['Uint16Array','uint16array',2],['Int16Array','int16array',2],['Uint32Array','uint32array',4],['Int32Array','int32array',4],['Float32Array','float32array',4],['Float64Array','float64array',8],['BigInt64Array','bigint64array',8],['BigUint64Array','biguint64array',8]] as const;
export const typedArrayRoots=['rt.TypedArray','rt.TypedArray.of.fn','rt.typedArrayDefaultConstructor.fn','rt.typedArrayIsTypedArray.fn','rt.typedArrayIsConstructor.fn','rt.typedArrayRawLength.fn','rt.typedArrayRawByteOffset.fn','rt.typedArrayBuffer.fn','rt.typedArrayByteOffset.fn','rt.typedArrayByteLength.fn','rt.typedArrayLength.fn','rt.uint8Convert.fn','rt.uint8ClampedConvert.fn','rt.uint16Convert.fn','rt.uint32Convert.fn','rt.float32Convert.fn','rt.float64Convert.fn','rt.bigint64Convert.fn','rt.biguint64Convert.fn','rt.typedArrayValues.fn','rt.typedArrayKeys.fn','rt.typedArrayEntries.fn','rt.typedArrayReverse.fn','rt.typedArrayCopyWithin.fn','rt.typedArrayFill.fn',...['Includes','IndexOf','LastIndexOf'].map(name=>'rt.typedArray'+name+'.fn')];
export const typedArrayPropertyRoots=['rt.TypedArray.prototype','rt.TypedArray.name','rt.TypedArray.length','rt.TypedArray.of','rt.TypedArray.__nonaDefaultConstructorInternal','rt.TypedArray.__nonaIsTypedArrayInternal','rt.TypedArray.__nonaIsConstructorInternal','rt.TypedArray.__nonaRawLengthInternal','rt.TypedArray.__nonaRawByteOffsetInternal','rt.typedArrayPrototype.constructor',...typedArrayWidths.map(([,lower])=>'rt.'+lower+'Prototype.@@toStringTag'),...typedArrayWidths.flatMap(([name,lower])=>['rt.'+name+'.BYTES_PER_ELEMENT','rt.'+lower+'Prototype.BYTES_PER_ELEMENT']),...['buffer','byteOffset','byteLength','length'].map(name=>'rt.typedArrayPrototype.'+name),...['values','keys','entries','@@iterator','reverse','copyWithin','fill','includes','indexOf','lastIndexOf'].map(name=>'rt.typedArrayPrototype.'+name),...typedArrayRoots.filter(name=>name!=='rt.TypedArray').flatMap(name=>[name+'.name',name+'.length'])];

export function emitTypedArrayPrototype(b:RuntimeBuilder):void {
 b.bundle.fragments.push({name:'rt.typedArrayPrototype',section:'.data',alignment:8,bytes:new Uint8Array(O.size),symbols:{},fixups:[
  {offset:O.prototype,kind:'va64',target:'rt.objectPrototype',addend:0},
 ]});
 b.bundle.fragments.push({name:'rt.uint8arrayPrototype',section:'.data',alignment:8,bytes:new Uint8Array(O.size),symbols:{},fixups:[
  {offset:O.prototype,kind:'va64',target:'rt.typedArrayPrototype',addend:0},
 ]});
 b.bundle.fragments.push({name:'rt.int8arrayPrototype',section:'.data',alignment:8,bytes:new Uint8Array(O.size),symbols:{},fixups:[
  {offset:O.prototype,kind:'va64',target:'rt.typedArrayPrototype',addend:0},
 ]});
 b.bundle.fragments.push({name:'rt.uint8clampedarrayPrototype',section:'.data',alignment:8,bytes:new Uint8Array(O.size),symbols:{},fixups:[
  {offset:O.prototype,kind:'va64',target:'rt.typedArrayPrototype',addend:0},
 ]});
 for(const name of ['uint16array','int16array'])b.bundle.fragments.push({name:'rt.'+name+'Prototype',section:'.data',alignment:8,bytes:new Uint8Array(O.size),symbols:{},fixups:[
  {offset:O.prototype,kind:'va64',target:'rt.typedArrayPrototype',addend:0},
 ]});
 for(const name of ['uint32array','int32array','float32array','float64array','bigint64array','biguint64array'])b.bundle.fragments.push({name:'rt.'+name+'Prototype',section:'.data',alignment:8,bytes:new Uint8Array(O.size),symbols:{},fixups:[
  {offset:O.prototype,kind:'va64',target:'rt.typedArrayPrototype',addend:0},
 ]});
}

export function emitTypedArray(b:RuntimeBuilder):void {
 const common=b.bundle.fragments.find(f=>f.name==='rt.typedArrayPrototype')!;
 const typedConstructor=new Uint8Array(F.size);typedConstructor[O.kind]=FunctionKind;typedConstructor[F.constructable]=1;typedConstructor[F.rawThis]=1;
 b.bundle.fragments.push(stringLiteral('rt.TypedArray.text','TypedArray'),stringLiteral('rt.TypedArray.source','function TypedArray() { [native code] }'));
 b.bundle.fragments.push({name:'rt.TypedArray',section:'.data',alignment:8,bytes:typedConstructor,symbols:{},fixups:[
  {offset:O.properties,kind:'va64',target:'rt.TypedArray.prototype',addend:0},
  {offset:O.prototype,kind:'va64',target:'rt.functionPrototype',addend:0},
  {offset:F.code,kind:'va64',target:'rt.TypedArray.code',addend:0},
  {offset:F.constructCode,kind:'va64',target:'rt.TypedArray.construct',addend:0},
  {offset:F.sourceText,kind:'va64',target:'rt.TypedArray.source',addend:0},
 ]});
 for(const [name,next] of [['prototype','name'],['name','length'],['length',null]] as const){
  const bytes=new Uint8Array(P.size);bytes[P.value]=name==='name'?4:name==='length'?3:5;bytes[P.attributes]=name==='prototype'?0:A.configurable;
  b.bundle.fragments.push({name:'rt.TypedArray.'+name,section:'.data',alignment:8,bytes,symbols:{},fixups:[
   {offset:P.key,kind:'va64',target:'rt.str.'+name,addend:0},
   ...(next?[{offset:P.next,kind:'va64' as const,target:'rt.TypedArray.'+next,addend:0}]:[]),
   ...(name==='length'?[]:[{offset:P.value+8,kind:'va64' as const,target:name==='name'?'rt.TypedArray.text':'rt.typedArrayPrototype',addend:0}]),
  ]});
 }
 b.fn('rt.TypedArray.code',40,a=>a.call('rt.throwTypeError'));
 b.fn('rt.TypedArray.construct',40,a=>a.call('rt.throwTypeError'));
 prependFunctionBuiltin(b,'rt.TypedArray.of.fn','of',0,'rt.TypedArray');
 prependFunctionBuiltin(b,'rt.typedArrayDefaultConstructor.fn','__nonaDefaultConstructorInternal',1,'rt.TypedArray');
 prependFunctionBuiltin(b,'rt.typedArrayIsTypedArray.fn','__nonaIsTypedArrayInternal',1,'rt.TypedArray');
 prependFunctionBuiltin(b,'rt.typedArrayIsConstructor.fn','__nonaIsConstructorInternal',1,'rt.TypedArray');
 b.fn('rt.typedArrayIsConstructor.fn.code',40,a=>{
  const done=a.unique('done');a.mov('rax',0);a.test('rdx','rdx');a.jcc('e',done);
  a.load('r10',{base:'r8'});a.cmp('r10',5);a.jcc('ne',done);
  a.load('r10',{base:'r8',disp:8});a.load('r11',{base:'r10',disp:O.kind});const proxyConstructor=a.unique('proxyConstructor');a.cmp('r11',ProxyKind);a.jcc('e',proxyConstructor);a.cmp('r11',FunctionKind);a.jcc('ne',done);
  a.load('rax',{base:'r10',disp:F.constructable});a.test('rax','rax');a.jcc('e',done);a.mov('rax',1);a.jmp(done);a.label(proxyConstructor);a.load('rax',{base:'r10',disp:O.flags});a.and('rax',ProxyConstructable);a.test('rax','rax');const notConstructor=a.unique('notConstructor');a.jcc('e',notConstructor);a.mov('rax',1);a.label(notConstructor);a.label(done);a.mov('r10',2);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
 });
 b.fn('rt.typedArrayIsTypedArray.fn.code',40,a=>{
  const done=a.unique('done');a.mov('rax',0);a.test('rdx','rdx');a.jcc('e',done);
  a.load('r10',{base:'r8'});a.cmp('r10',5);a.jcc('ne',done);
  a.load('r10',{base:'r8',disp:8});a.load('r10',{base:'r10',disp:O.kind});a.cmp('r10',TypedArrayKind);a.jcc('ne',done);
  a.mov('rax',1);a.label(done);a.mov('r10',2);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
 });
 for(const [name,offset] of [['RawLength',TypedArrayLayout.length],['RawByteOffset',TypedArrayLayout.byteOffset]] as const){
  const symbol='rt.typedArray'+name+'.fn';prependFunctionBuiltin(b,symbol,'__nona'+name+'Internal',1,'rt.TypedArray');
  b.fn(symbol+'.code',40,a=>{
   a.test('rdx','rdx');failIf(a,'e','rt.throwTypeError');a.load('rax',{base:'r8'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
   a.load('r10',{base:'r8',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',TypedArrayKind);failIf(a,'ne','rt.throwTypeError');
   a.load('rax',{base:'r10',disp:offset});a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
  });
 }
 b.fn('rt.typedArrayDefaultConstructor.fn.code',40,a=>{
  a.test('rdx','rdx');failIf(a,'e','rt.throwTypeError');
  a.load('rax',{base:'r8'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',{base:'r8',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',TypedArrayKind);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'r10',disp:TypedArrayLayout.elementType});const found=a.unique('found');
  for(let i=0;i<typedArrayWidths.length;i++){
   const next=a.unique('next');a.cmp('rax',i+1);a.jcc('ne',next);a.lea('rax',{rip:'rt.'+typedArrayWidths[i]![0]});a.jmp(found);a.label(next);
  }
  a.call('rt.throwTypeError');a.label(found);a.mov('r10',5);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
 });
 rootedFn(b,'rt.TypedArray.of.fn.code',200,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:3}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'r8');a.store(slot(56),'rdx');
  a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(80+n),'rax');}
  a.load('rax',slot(80));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',slot(88));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',FunctionKind);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'r10',disp:F.constructable});a.test('rax','rax');failIf(a,'e','rt.throwTypeError');
  a.lea('rcx',slot(96));a.lea('rdx',slot(80));a.load('r8',slot(56));a.mov('r9',1);a.call('rt.arrayFromConstruct');
  a.load('rax',slot(96));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',slot(104));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',TypedArrayKind);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'r10',disp:TypedArrayLayout.length});a.load('r11',slot(56));a.cmp('rax','r11');failIf(a,'b','rt.throwTypeError');
  a.mov('rax',0);a.store(slot(160),'rax');const loop=a.unique('loop'),done=a.unique('done');a.label(loop);
  a.load('rax',slot(160));a.load('r10',slot(56));a.cmp('rax','r10');a.jcc('ae',done);
  a.shl('rax',4);a.load('rdx',slot(48));a.add('rdx','rax');for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(112+n),'rax');}
  a.lea('rcx',slot(96));a.load('rdx',slot(160));a.lea('r8',slot(112));a.call('rt.arrayFromDefine');
  a.load('rax',slot(160));a.add('rax',1);a.store(slot(160),'rax');a.jmp(loop);
  a.label(done);a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(96+n));a.store({base:'rcx',disp:n},'rax');}
 });
 const constructor=new Uint8Array(P.size);constructor[P.value]=5;constructor[P.attributes]=A.writable|A.configurable;
 b.bundle.fragments.push({name:'rt.typedArrayPrototype.constructor',section:'.data',alignment:8,bytes:constructor,symbols:{},fixups:[
  {offset:P.key,kind:'va64',target:'rt.str.constructor',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.TypedArray',addend:0},
 ]});common.fixups.push({offset:O.properties,kind:'va64',target:'rt.typedArrayPrototype.constructor',addend:0});
 for(const name of ['Uint8Array','Int8Array','Uint8ClampedArray','Uint16Array','Int16Array','Uint32Array','Int32Array','Float32Array','Float64Array','BigInt64Array','BigUint64Array'])b.bundle.fragments.find(f=>f.name==='rt.'+name)!.fixups.find(f=>f.offset===O.prototype)!.target='rt.TypedArray';
 for(const [name,mode] of [['values',0],['keys',1],['entries',2]] as const){
  const symbol='rt.typedArray'+name.charAt(0).toUpperCase()+name.slice(1)+'.fn';emitNativeFunction(b,symbol,name,0);
  b.bundle.fragments.push(stringLiteral('rt.typedArrayPrototype.'+name+'.key',name));
  const bytes=new Uint8Array(P.size);bytes[P.value]=5;bytes[P.attributes]=A.writable|A.configurable;
  const head=common.fixups.find(f=>f.offset===O.properties);
  b.bundle.fragments.push({name:'rt.typedArrayPrototype.'+name,section:'.data',alignment:8,bytes,symbols:{},fixups:[
   ...(head?[{offset:P.next,kind:'va64' as const,target:head.target,addend:0}]:[]),
   {offset:P.key,kind:'va64',target:'rt.typedArrayPrototype.'+name+'.key',addend:0},
   {offset:P.value+8,kind:'va64',target:symbol,addend:0},
  ]});if(head)head.target='rt.typedArrayPrototype.'+name;else common.fixups.push({offset:O.properties,kind:'va64',target:'rt.typedArrayPrototype.'+name,addend:0});
  rootedFn(b,symbol+'.code',88,[{kind:'output',register:'rcx'},{kind:'locals',offset:64,count:1}],(a,frame)=>{
   a.store(slot(40),'rcx');a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(64+n),'rax');}
   a.load('rax',slot(64));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
   a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',TypedArrayKind);failIf(a,'ne','rt.throwTypeError');
   a.load('r11',{base:'r10',disp:TypedArrayLayout.buffer});a.load('r11',{base:'r11',disp:ArrayBufferLayout.detached});a.test('r11','r11');failIf(a,'ne','rt.throwTypeError');
   a.load('rcx',slot(40));a.lea('rdx',slot(64));a.mov('r8',mode);a.call('rt.newIterator');
  });
 }
 const iterator=new Uint8Array(P.size);iterator[P.value]=5;iterator[P.attributes]=A.writable|A.configurable;
 const head=common.fixups.find(f=>f.offset===O.properties)!;
 b.bundle.fragments.push({name:'rt.typedArrayPrototype.@@iterator',section:'.data',alignment:8,bytes:iterator,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:head.target,addend:0},
  {offset:P.key,kind:'va64',target:'rt.Symbol.iterator.value',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.typedArrayValues.fn',addend:0},
 ]});head.target='rt.typedArrayPrototype.@@iterator';
 prependFunctionBuiltin(b,'rt.typedArrayReverse.fn','reverse',0,'rt.typedArrayPrototype');
 rootedFn(b,'rt.typedArrayReverse.fn.code',120,[{kind:'output',register:'rcx'},{kind:'locals',offset:64,count:1}],(a,frame)=>{
  a.store(slot(40),'rcx');a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(64+n),'rax');}
  a.load('rax',slot(64));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',TypedArrayKind);failIf(a,'ne','rt.throwTypeError');
  a.load('r11',{base:'r10',disp:TypedArrayLayout.buffer});a.load('r11',{base:'r11',disp:ArrayBufferLayout.detached});a.test('r11','r11');failIf(a,'ne','rt.throwTypeError');
  const done=a.unique('done');a.mov('rax',0);a.store(slot(80),'rax');a.load('rax',{base:'r10',disp:TypedArrayLayout.length});a.test('rax','rax');a.jcc('e',done);a.sub('rax',1);a.store(slot(88),'rax');
  a.load('rax',{base:'r10',disp:TypedArrayLayout.elementType});const one=a.unique('one'),two=a.unique('two'),eight=a.unique('eight'),widthReady=a.unique('widthReady');a.cmp('rax',4);a.jcc('b',one);a.cmp('rax',6);a.jcc('b',two);a.cmp('rax',9);a.jcc('ae',eight);a.mov('rax',4);a.jmp(widthReady);a.label(one);a.mov('rax',1);a.jmp(widthReady);a.label(two);a.mov('rax',2);a.jmp(widthReady);a.label(eight);a.mov('rax',8);a.label(widthReady);a.store(slot(96),'rax');
  a.load('rax',{base:'r10',disp:TypedArrayLayout.buffer});a.load('rax',{base:'rax',disp:ArrayBufferLayout.bytes});a.load('r11',{base:'r10',disp:TypedArrayLayout.byteOffset});a.add('rax','r11');a.store(slot(112),'rax');
  const loop=a.unique('loop'),next=a.unique('next');a.label(loop);a.load('r10',slot(80));a.load('r11',slot(88));a.cmp('r10','r11');a.jcc('ae',done);a.mov('rax',0);a.store(slot(104),'rax');
  a.label(next);a.load('rax',slot(104));a.load('r11',slot(96));a.cmp('rax','r11');const advance=a.unique('advance');a.jcc('ae',advance);
  a.load('r10',slot(80));a.imul('r10','r11');a.add('r10','rax');a.load('r11',slot(112));a.add('r10','r11');
  a.load('r8',slot(88));a.load('r11',slot(96));a.imul('r8','r11');a.add('r8','rax');a.load('r11',slot(112));a.add('r8','r11');
  a.load('rax',{base:'r10'},8);a.load('rdx',{base:'r8'},8);a.store({base:'r10'},'rdx',8);a.store({base:'r8'},'rax',8);
  a.load('rax',slot(104));a.add('rax',1);a.store(slot(104),'rax');a.jmp(next);
  a.label(advance);a.load('rax',slot(80));a.add('rax',1);a.store(slot(80),'rax');a.load('rax',slot(88));a.sub('rax',1);a.store(slot(88),'rax');a.jmp(loop);a.label(done);
  a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(64+n));a.store({base:'rcx',disp:n},'rax');}
 });
 prependFunctionBuiltin(b,'rt.typedArrayCopyWithin.fn','copyWithin',2,'rt.typedArrayPrototype');
 rootedFn(b,'rt.typedArrayCopyWithin.fn.code',216,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:1}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(64+n),'rax');}
  a.load('rax',slot(64));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',TypedArrayKind);failIf(a,'ne','rt.throwTypeError');a.load('r11',{base:'r10',disp:TypedArrayLayout.buffer});a.load('r11',{base:'r11',disp:ArrayBufferLayout.detached});a.test('r11','r11');failIf(a,'ne','rt.throwTypeError');a.load('rax',{base:'r10',disp:TypedArrayLayout.length});a.store(slot(80),'rax');
  for(const [ordinal,target] of [[0,88],[1,96],[2,104]] as const){
   const absent=a.unique('absent'),zero=a.unique('zero'),negative=a.unique('negative'),atEnd=a.unique('atEnd'),ready=a.unique('ready');
   a.load('rax',slot(48));a.cmp('rax',ordinal+1);a.jcc('b',absent);a.load('rdx',slot(56));a.add('rdx',ordinal*16);a.load('rax',{base:'rdx'});a.test('rax','rax');a.jcc('e',absent);
   a.lea('rcx',slot(152));a.call('rt.toNumber');a.movsd('xmm0',slot(160));a.ucomisd('xmm0','xmm0');a.jcc('p',zero);
   a.mov('rax',0);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('b',negative);
   a.load('rax',slot(80));a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',atEnd);a.cvttsd2si('rax','xmm0');a.jmp(ready);
   a.label(negative);a.load('rax',slot(80));a.neg('rax');a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',zero);a.cvttsd2si('rax','xmm0');a.load('r10',slot(80));a.add('rax','r10');a.jmp(ready);
   a.label(zero);a.mov('rax',0);a.jmp(ready);a.label(absent);a.mov('rax',0);if(ordinal===2)a.load('rax',slot(80));a.jmp(ready);a.label(atEnd);a.load('rax',slot(80));a.label(ready);a.store(slot(target),'rax');
  }
  const done=a.unique('done'),countReady=a.unique('countReady'),forward=a.unique('forward'),loop=a.unique('loop'),copy=a.unique('copy'),advance=a.unique('advance');
  a.load('rax',slot(104));a.load('r10',slot(96));a.sub('rax','r10');a.test('rax','rax');a.jcc('le',done);a.load('r10',slot(80));a.load('r11',slot(88));a.sub('r10','r11');a.test('r10','r10');a.jcc('le',done);a.cmp('rax','r10');a.jcc('le',countReady);a.mov('rax','r10');a.label(countReady);a.store(slot(112),'rax');a.load('r10',slot(72));a.load('r10',{base:'r10',disp:TypedArrayLayout.buffer});a.load('r10',{base:'r10',disp:ArrayBufferLayout.detached});a.test('r10','r10');failIf(a,'ne','rt.throwTypeError');a.mov('rax',1);a.store(slot(120),'rax');
  a.load('rax',slot(96));a.load('r10',slot(88));a.cmp('rax','r10');a.jcc('ae',forward);a.load('r11',slot(112));a.add('rax','r11');a.cmp('r10','rax');a.jcc('ae',forward);a.sub('r11',1);a.load('rax',slot(96));a.add('rax','r11');a.store(slot(96),'rax');a.load('rax',slot(88));a.add('rax','r11');a.store(slot(88),'rax');a.mov('rax',-1);a.store(slot(120),'rax');a.label(forward);
  a.load('r10',slot(72));a.load('rax',{base:'r10',disp:TypedArrayLayout.elementType});const one=a.unique('one'),two=a.unique('two'),eight=a.unique('eight'),widthReady=a.unique('widthReady');a.cmp('rax',4);a.jcc('b',one);a.cmp('rax',6);a.jcc('b',two);a.cmp('rax',9);a.jcc('ae',eight);a.mov('rax',4);a.jmp(widthReady);a.label(one);a.mov('rax',1);a.jmp(widthReady);a.label(two);a.mov('rax',2);a.jmp(widthReady);a.label(eight);a.mov('rax',8);a.label(widthReady);a.store(slot(128),'rax');
  a.load('rax',{base:'r10',disp:TypedArrayLayout.buffer});a.load('rax',{base:'rax',disp:ArrayBufferLayout.bytes});a.load('r11',{base:'r10',disp:TypedArrayLayout.byteOffset});a.add('rax','r11');a.store(slot(136),'rax');
  a.label(loop);a.mov('rax',0);a.store(slot(144),'rax');a.label(copy);a.load('rax',slot(144));a.load('r11',slot(128));a.cmp('rax','r11');a.jcc('ae',advance);
  a.load('r10',slot(96));a.imul('r10','r11');a.add('r10','rax');a.load('r11',slot(136));a.add('r10','r11');a.load('r8',slot(88));a.load('r11',slot(128));a.imul('r8','r11');a.add('r8','rax');a.load('r11',slot(136));a.add('r8','r11');a.load('rax',{base:'r10'},8);a.store({base:'r8'},'rax',8);a.load('rax',slot(144));a.add('rax',1);a.store(slot(144),'rax');a.jmp(copy);
  a.label(advance);a.load('r10',slot(120));a.load('rax',slot(96));a.add('rax','r10');a.store(slot(96),'rax');a.load('rax',slot(88));a.add('rax','r10');a.store(slot(88),'rax');a.load('rax',slot(112));a.sub('rax',1);a.store(slot(112),'rax');a.test('rax','rax');a.jcc('ne',loop);a.label(done);
  a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(64+n));a.store({base:'rcx',disp:n},'rax');}
 });
 prependFunctionBuiltin(b,'rt.typedArrayFill.fn','fill',1,'rt.typedArrayPrototype');
 rootedFn(b,'rt.typedArrayFill.fn.code',200,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:1}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(64+n),'rax');}
  a.load('rax',slot(64));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',TypedArrayKind);failIf(a,'ne','rt.throwTypeError');a.load('r11',{base:'r10',disp:TypedArrayLayout.buffer});a.load('r11',{base:'r11',disp:ArrayBufferLayout.detached});a.test('r11','r11');failIf(a,'ne','rt.throwTypeError');a.load('rax',{base:'r10',disp:TypedArrayLayout.length});a.store(slot(80),'rax');a.load('rax',{base:'r10',disp:TypedArrayLayout.elementType});a.store(slot(104),'rax');
  const missingValue=a.unique('missingValue'),valueReady=a.unique('valueReady'),clamped=a.unique('clamped'),floating=a.unique('floating'),bigint=a.unique('bigint'),converted=a.unique('converted');a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',missingValue);a.load('rax',slot(56));a.jmp(valueReady);a.label(missingValue);a.lea('rax',{rip:'rt.undefinedValue'});a.label(valueReady);a.store(slot(144),'rax');
  a.load('rax',slot(104));a.cmp('rax',10);a.jcc('ae',bigint);a.cmp('rax',8);a.jcc('ae',floating);a.cmp('rax',3);a.jcc('e',clamped);
  a.load('rcx',slot(144));a.call('rt.toInt32');a.jmp(converted);
  a.label(clamped);a.load('rcx',slot(144));a.call('rt.toUint8Clamp');a.jmp(converted);
  a.label(bigint);a.load('rdx',slot(144));a.call('rt.bigintToUint64');a.jmp(converted);
  a.label(floating);a.lea('rcx',slot(152));a.load('rdx',slot(144));a.call('rt.toNumber');a.movsd('xmm0',slot(160));a.load('r10',slot(104));a.cmp('r10',8);const float64=a.unique('float64');a.jcc('ne',float64);a.cvtsd2ss('xmm0','xmm0');a.label(float64);a.movqFromXmm('rax','xmm0');a.label(converted);a.store(slot(120),'rax');
  for(const [ordinal,target] of [[1,88],[2,96]] as const){
   const absent=a.unique('absent'),zero=a.unique('zero'),negative=a.unique('negative'),atEnd=a.unique('atEnd'),ready=a.unique('ready');
   a.load('rax',slot(48));a.cmp('rax',ordinal+1);a.jcc('b',absent);a.load('rdx',slot(56));a.add('rdx',ordinal*16);a.load('rax',{base:'rdx'});a.test('rax','rax');a.jcc('e',absent);
   a.lea('rcx',slot(152));a.call('rt.toNumber');a.movsd('xmm0',slot(160));a.ucomisd('xmm0','xmm0');a.jcc('p',zero);
   a.mov('rax',0);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('b',negative);
   a.load('rax',slot(80));a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',atEnd);a.cvttsd2si('rax','xmm0');a.jmp(ready);
   a.label(negative);a.load('rax',slot(80));a.neg('rax');a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',zero);a.cvttsd2si('rax','xmm0');a.load('r10',slot(80));a.add('rax','r10');a.jmp(ready);
   a.label(zero);a.mov('rax',0);a.jmp(ready);a.label(absent);a.mov('rax',0);if(ordinal===2)a.load('rax',slot(80));a.jmp(ready);a.label(atEnd);a.load('rax',slot(80));a.label(ready);a.store(slot(target),'rax');
  }
  a.load('r10',slot(72));a.load('r10',{base:'r10',disp:TypedArrayLayout.buffer});a.load('r10',{base:'r10',disp:ArrayBufferLayout.detached});a.test('r10','r10');failIf(a,'ne','rt.throwTypeError');
  a.load('r10',slot(72));a.load('rax',{base:'r10',disp:TypedArrayLayout.elementType});const one=a.unique('one'),two=a.unique('two'),eight=a.unique('eight'),widthReady=a.unique('widthReady');a.cmp('rax',4);a.jcc('b',one);a.cmp('rax',6);a.jcc('b',two);a.cmp('rax',9);a.jcc('ae',eight);a.mov('rax',4);a.jmp(widthReady);a.label(one);a.mov('rax',1);a.jmp(widthReady);a.label(two);a.mov('rax',2);a.jmp(widthReady);a.label(eight);a.mov('rax',8);a.label(widthReady);a.store(slot(128),'rax');
  a.load('rax',{base:'r10',disp:TypedArrayLayout.buffer});a.load('rax',{base:'rax',disp:ArrayBufferLayout.bytes});a.load('r11',{base:'r10',disp:TypedArrayLayout.byteOffset});a.add('rax','r11');a.store(slot(136),'rax');
  const loop=a.unique('loop'),done=a.unique('done'),byte=a.unique('byte'),word=a.unique('word'),double=a.unique('double');a.label(loop);a.load('rax',slot(88));a.load('r10',slot(96));a.cmp('rax','r10');a.jcc('ae',done);a.load('r11',slot(128));a.imul('rax','r11');a.load('rdx',slot(136));a.add('rdx','rax');a.load('rax',slot(120));a.cmp('r11',2);a.jcc('b',byte);a.jcc('e',word);a.cmp('r11',8);a.jcc('e',double);a.store({base:'rdx'},'rax',32);const advance=a.unique('advance');a.jmp(advance);a.label(double);a.store({base:'rdx'},'rax',64);a.jmp(advance);a.label(word);a.store({base:'rdx'},'rax',16);a.jmp(advance);a.label(byte);a.store({base:'rdx'},'rax',8);a.label(advance);a.load('rax',slot(88));a.add('rax',1);a.store(slot(88),'rax');a.jmp(loop);a.label(done);
  a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(64+n));a.store({base:'rcx',disp:n},'rax');}
 });
 for(const name of ['includes','indexOf','lastIndexOf'] as const){
  const symbol='rt.typedArray'+name[0]!.toUpperCase()+name.slice(1)+'.fn';
  prependFunctionBuiltin(b,symbol,name,1,'rt.typedArrayPrototype');
  rootedFn(b,symbol+'.code',216,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:5}],(a,frame)=>{
   a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(64+n),'rax');}
   a.load('rax',slot(64));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.load('r10',slot(72));a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',TypedArrayKind);failIf(a,'ne','rt.throwTypeError');a.load('r11',{base:'r10',disp:TypedArrayLayout.buffer});a.load('r11',{base:'r11',disp:ArrayBufferLayout.detached});a.test('r11','r11');failIf(a,'ne','rt.throwTypeError');a.load('rax',{base:'r10',disp:TypedArrayLayout.length});a.store(slot(168),'rax');
   const notFound=a.unique('notFound'),found=a.unique('found'),result=a.unique('result');a.test('rax','rax');a.jcc('e',notFound);
   a.load('rax',slot(48));const noSearch=a.unique('noSearch'),searchReady=a.unique('searchReady');a.test('rax','rax');a.jcc('e',noSearch);a.load('rdx',slot(56));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(80+n),'rax');}a.jmp(searchReady);a.label(noSearch);a.mov('rax',0);a.store(slot(80),'rax');a.store(slot(88),'rax');a.label(searchReady);
   if(name==='lastIndexOf'){a.load('rax',slot(168));a.sub('rax',1);}else a.mov('rax',0);a.store(slot(160),'rax');
   const startReady=a.unique('startReady'),startZero=a.unique('startZero'),negative=a.unique('negative'),atEnd=a.unique('atEnd');a.load('rax',slot(48));a.cmp('rax',2);a.jcc('b',startReady);
   a.load('rdx',slot(56));a.add('rdx',16);a.lea('rcx',slot(144));a.call('rt.toNumber');a.movsd('xmm0',slot(152));a.ucomisd('xmm0','xmm0');a.jcc('p',startZero);
   a.mov('rax',0);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('b',negative);
   a.load('rax',slot(168));a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',name==='lastIndexOf'?atEnd:notFound);a.cvttsd2si('rax','xmm0');a.store(slot(160),'rax');a.jmp(startReady);
   a.label(negative);a.load('rax',slot(168));a.neg('rax');a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc(name==='lastIndexOf'?'b':'be',name==='lastIndexOf'?notFound:startZero);a.cvttsd2si('rax','xmm0');a.load('r10',slot(168));a.add('rax','r10');a.store(slot(160),'rax');a.jmp(startReady);
   a.label(startZero);a.mov('rax',0);a.store(slot(160),'rax');a.jmp(startReady);a.label(atEnd);a.load('rax',slot(168));a.sub('rax',1);a.store(slot(160),'rax');a.label(startReady);
   if(name!=='includes'){a.load('r10',slot(72));a.load('r10',{base:'r10',disp:TypedArrayLayout.buffer});a.load('r10',{base:'r10',disp:ArrayBufferLayout.detached});a.test('r10','r10');a.jcc('ne',notFound);}
   const loop=a.unique('loop'),next=a.unique('next');a.label(loop);if(name!=='lastIndexOf'){a.load('rax',slot(160));a.load('r10',slot(168));a.cmp('rax','r10');a.jcc('ae',notFound);}
   a.lea('rcx',slot(96));a.load('rdx',slot(160));a.call('rt.arrayIndexKey');a.lea('rcx',slot(112));a.lea('rdx',slot(64));a.lea('r8',slot(96));a.call('rt.getProperty');
   a.lea('rcx',slot(128));a.lea('rdx',slot(112));a.lea('r8',slot(80));a.call('rt.strictEq');a.load('rax',slot(136));a.test('rax','rax');a.jcc('ne',found);
   if(name==='includes'){
    a.load('rax',slot(112));a.cmp('rax',3);a.jcc('ne',next);a.load('rax',slot(80));a.cmp('rax',3);a.jcc('ne',next);a.movsd('xmm0',slot(120));a.ucomisd('xmm0','xmm0');a.jcc('np',next);a.movsd('xmm0',slot(88));a.ucomisd('xmm0','xmm0');a.jcc('p',found);
   }
   a.label(next);a.load('rax',slot(160));if(name==='lastIndexOf'){a.test('rax','rax');a.jcc('e',notFound);a.sub('rax',1);}else a.add('rax',1);a.store(slot(160),'rax');a.jmp(loop);
   a.label(found);if(name==='includes')a.mov('rax',1);else a.load('rax',slot(160));a.jmp(result);a.label(notFound);a.mov('rax',name==='includes'?0:-1);a.label(result);
   a.load('rcx',slot(40));if(name==='includes'){a.mov('r10',2);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');}else{a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');}
  });
 }
 emitNativeFunction(b,'rt.uint8Convert.fn','',1);
 rootedFn(b,'rt.uint8Convert.fn.code',104,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'}],a=>{
  a.store(slot(40),'rcx');a.mov('rcx','r8');a.call('rt.toInt32');a.and('rax',255);a.cvtsi2sd('xmm0','rax');
  a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
 });
 // ToUint8Clamp rounds exact half values to the nearest even byte.
 rootedFn(b,'rt.toUint8Clamp',88,[{kind:'value',register:'rcx'},{kind:'locals',offset:64,count:1}],a=>{
  a.mov('rdx','rcx');a.lea('rcx',slot(64));a.call('rt.toNumber');
  a.movsd('xmm0',slot(72));const zero=a.unique('zero'),high=a.unique('high'),done=a.unique('done'),up=a.unique('up');
  a.ucomisd('xmm0','xmm0');a.jcc('p',zero);
  a.mov('rax',0);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',zero);
  a.mov('rax',255);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('ae',high);
  a.cvttsd2si('rax','xmm0');a.cvtsi2sd('xmm1','rax');a.mov('r10',0x3fe0000000000000n);a.movqToXmm('xmm2','r10');a.addsd('xmm1','xmm2');
  a.ucomisd('xmm0','xmm1');a.jcc('a',up);a.jcc('b',done);a.mov('r10','rax');a.and('r10',1);a.test('r10','r10');a.jcc('e',done);
  a.label(up);a.add('rax',1);a.jmp(done);a.label(high);a.mov('rax',255);a.jmp(done);a.label(zero);a.mov('rax',0);a.label(done);
 });
 emitNativeFunction(b,'rt.uint8ClampedConvert.fn','',1);
 rootedFn(b,'rt.uint8ClampedConvert.fn.code',104,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'}],a=>{
  a.store(slot(40),'rcx');a.mov('rcx','r8');a.call('rt.toUint8Clamp');a.cvtsi2sd('xmm0','rax');
  a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
 });
 emitNativeFunction(b,'rt.uint16Convert.fn','',1);
 rootedFn(b,'rt.uint16Convert.fn.code',104,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'}],a=>{
  a.store(slot(40),'rcx');a.mov('rcx','r8');a.call('rt.toInt32');a.and('rax',65535);a.cvtsi2sd('xmm0','rax');
  a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
 });
 emitNativeFunction(b,'rt.uint32Convert.fn','',1);
 rootedFn(b,'rt.uint32Convert.fn.code',104,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'}],a=>{
  a.store(slot(40),'rcx');a.mov('rcx','r8');a.call('rt.toInt32');a.mov('r10',0xffffffffn);a.and('rax','r10');a.cvtsi2sd('xmm0','rax');
  a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
 });
 for(const width of [4,8] as const){
  const symbol=width===4?'rt.float32Convert.fn':'rt.float64Convert.fn';emitNativeFunction(b,symbol,'',1);
  rootedFn(b,symbol+'.code',104,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'}],a=>{
   a.store(slot(40),'rcx');a.lea('rcx',slot(80));a.mov('rdx','r8');a.call('rt.toNumber');
   a.movsd('xmm0',slot(88));if(width===4){a.cvtsd2ss('xmm0','xmm0');a.cvtss2sd('xmm0','xmm0');}
   a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
  });
 }
 for(const signed of [true,false]){
  const symbol=signed?'rt.bigint64Convert.fn':'rt.biguint64Convert.fn';emitNativeFunction(b,symbol,'',1);
  rootedFn(b,symbol+'.code',104,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'}],a=>{
   a.store(slot(40),'rcx');a.mov('rdx','r8');a.call('rt.bigintToUint64');a.load('rcx',slot(40));a.mov('rdx','rax');a.mov('r8',signed?1:0);a.call('rt.uint64ToBigInt');
  });
 }
 const prototype=common;
 for(const [name,offset] of [['buffer',TypedArrayLayout.buffer],['byteOffset',TypedArrayLayout.byteOffset],['byteLength',TypedArrayLayout.byteLength],['length',TypedArrayLayout.length]] as const){
  const symbol='rt.typedArray'+name.charAt(0).toUpperCase()+name.slice(1)+'.fn';
  emitNativeFunction(b,symbol,'get '+name,0);
  b.bundle.fragments.push(stringLiteral('rt.typedArrayPrototype.'+name+'.key',name));
  const property=new Uint8Array(P.size);property[P.attributes]=A.accessor|A.configurable;property[P.getter]=5;
  const head=prototype.fixups.find(f=>f.offset===O.properties);
  b.bundle.fragments.push({name:'rt.typedArrayPrototype.'+name,section:'.data',alignment:8,bytes:property,symbols:{},fixups:[
   ...(head?[{offset:P.next,kind:'va64' as const,target:head.target,addend:0}]:[]),
   {offset:P.key,kind:'va64',target:'rt.typedArrayPrototype.'+name+'.key',addend:0},
   {offset:P.getter+8,kind:'va64',target:symbol,addend:0},
  ]});if(head)head.target='rt.typedArrayPrototype.'+name;else prototype.fixups.push({offset:O.properties,kind:'va64',target:'rt.typedArrayPrototype.'+name,addend:0});
  b.fn(symbol+'.code',40,a=>{
   a.load('rdx',slot(80));a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
   a.load('rdx',{base:'rdx',disp:8});a.load('rax',{base:'rdx',disp:O.kind});a.cmp('rax',TypedArrayKind);failIf(a,'ne','rt.throwTypeError');
   a.load('rax',{base:'rdx',disp:offset});if(name!=='buffer'){const attached=a.unique('attached');a.load('r10',{base:'rdx',disp:TypedArrayLayout.buffer});a.load('r10',{base:'r10',disp:ArrayBufferLayout.detached});a.test('r10','r10');a.jcc('e',attached);a.mov('rax',0);a.label(attached);}if(name==='buffer'){
    a.mov('r10',5);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
   }else{
    a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
   }
  });
 }
 for(const [name,lower] of [['Uint8Array','uint8array'],['Int8Array','int8array'],['Uint8ClampedArray','uint8clampedarray'],['Uint16Array','uint16array'],['Int16Array','int16array'],['Uint32Array','uint32array'],['Int32Array','int32array'],['Float32Array','float32array'],['Float64Array','float64array'],['BigInt64Array','bigint64array'],['BigUint64Array','biguint64array']] as const){
  const tagName='rt.'+lower+'Tag',prototypeName='rt.'+lower+'Prototype',node=prototypeName+'.@@toStringTag';
  b.bundle.fragments.push(stringLiteral(tagName,name));
  const tag=new Uint8Array(P.size);tag[P.value]=4;tag[P.attributes]=A.configurable;
  const owner=b.bundle.fragments.find(f=>f.name===prototypeName)!;
  const tagHead=owner.fixups.find(f=>f.offset===O.properties);
  b.bundle.fragments.push({name:node,section:'.data',alignment:8,bytes:tag,symbols:{},fixups:[
   ...(tagHead?[{offset:P.next,kind:'va64' as const,target:tagHead.target,addend:0}]:[]),
   {offset:P.key,kind:'va64',target:'rt.Symbol.toStringTag.value',addend:0},
   {offset:P.value+8,kind:'va64',target:tagName,addend:0},
  ]});if(tagHead)tagHead.target=node;else owner.fixups.push({offset:O.properties,kind:'va64',target:node,addend:0});
 }
 b.bundle.fragments.push(stringLiteral('rt.typedArrayBytesPerElement.key','BYTES_PER_ELEMENT'));
 for(const [name,lower,width] of typedArrayWidths)for(const ownerName of ['rt.'+name,'rt.'+lower+'Prototype']){
  const owner=b.bundle.fragments.find(f=>f.name===ownerName)!;const head=owner.fixups.find(f=>f.offset===O.properties);
  const node=ownerName+'.BYTES_PER_ELEMENT',bytes=new Uint8Array(P.size);bytes[P.value]=3;new DataView(bytes.buffer).setFloat64(P.value+8,width,true);
  b.bundle.fragments.push({name:node,section:'.data',alignment:8,bytes,symbols:{},fixups:[
   ...(head?[{offset:P.next,kind:'va64' as const,target:head.target,addend:0}]:[]),
   {offset:P.key,kind:'va64',target:'rt.typedArrayBytesPerElement.key',addend:0},
  ]});if(head)head.target=node;else owner.fixups.push({offset:O.properties,kind:'va64',target:node,addend:0});
 }
 for(const [name,elementType,width] of [['Uint8Array',1,1],['Int8Array',2,1],['Uint8ClampedArray',3,1],['Uint16Array',4,2],['Int16Array',5,2],['Uint32Array',6,4],['Int32Array',7,4],['Float32Array',8,4],['Float64Array',9,8],['BigInt64Array',10,8],['BigUint64Array',11,8]] as const){
 b.fn('rt.'+name+'.code',40,a=>a.call('rt.throwTypeError'));
 rootedFn(b,'rt.'+name+'.construct',328,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:96,count:11}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.mov('rax',0);for(const n of [64,72,80,272,280,288,296])a.store(slot(n),'rax');
  const allocate=a.unique('allocate'),view=a.unique('view'),fromObject=a.unique('fromObject'),ready=a.unique('ready');
  a.test('rdx','rdx');a.jcc('e',allocate);
  a.load('rax',{base:'r8'});a.cmp('rax',5);a.jcc('ne',allocate);
  // Object arguments: AllocateTypedArray (GetPrototypeFromConstructor) comes first.
  resolveDeferredConstructPrototype(a,frame,'rt.'+name.toLowerCase()+'Prototype',112);a.load('r8',slot(56));
  a.load('r10',{base:'r8',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',ArrayBufferKind);a.jcc('e',view);a.cmp('rax',SharedArrayBufferKind);a.jcc('e',view);a.jmp(fromObject);
  a.label(fromObject);
  a.mov('rax',5);a.store(slot(144),'rax');a.store(slot(160),'rax');
  a.lea('rax',{rip:'rt.Array.from.fn'});a.store(slot(152),'rax');a.lea('rax',{rip:'rt.Array'});a.store(slot(168),'rax');
  a.load('r10',slot(56));for(const n of [0,8]){a.load('rax',{base:'r10',disp:n});a.store(slot(176+n),'rax');}
  a.mov('rax',5);a.store(slot(192),'rax');a.lea('rax',{rip:elementType===3?'rt.uint8ClampedConvert.fn':elementType===8?'rt.float32Convert.fn':elementType===9?'rt.float64Convert.fn':elementType===10?'rt.bigint64Convert.fn':elementType===11?'rt.biguint64Convert.fn':width===4?'rt.uint32Convert.fn':width===2?'rt.uint16Convert.fn':'rt.uint8Convert.fn'});a.store(slot(200),'rax');
  // thisArg marker: Array.from converts array-like elements as it reads them
  // (ES2020 22.2.4.4 step 8) but leaves iterated values raw (IteratorToList first).
  a.mov('rax',5);a.store(slot(208),'rax');a.lea('rax',{rip:'rt.typedArrayRawLength.fn'});a.store(slot(216),'rax');
  a.lea('rax',slot(160));a.store(slot(32),'rax');a.lea('rcx',slot(224));a.lea('rdx',slot(144));a.mov('r8',3);a.lea('r9',slot(176));a.call('rt.invoke');
  a.load('r10',slot(232));a.load('rax',{base:'r10',disp:O.length});a.store(slot(280),'rax');
  a.mov('r10',3);a.store(slot(96),'r10');a.cvtsi2sd('xmm0','rax');a.storesd(slot(104),'xmm0');
  a.mov('r10',1);a.store(slot(48),'r10');a.store(slot(288),'r10');a.lea('r10',slot(96));a.store(slot(56),'r10');a.jmp(allocate);
  a.label(allocate);
  {
   const noLength=a.unique('noLength'),zeroLength=a.unique('zeroLength'),prepared=a.unique('prepared');
   a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',noLength);
   a.lea('rcx',slot(112));a.load('rdx',slot(56));a.call('rt.toNumber');a.movsd('xmm0',slot(120));
   a.ucomisd('xmm0','xmm0');a.jcc('p',zeroLength);a.mov('rax',-1);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'be','rt.throwRangeError');
   a.mov('rax',Math.floor(0x7fffffff/width));a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'a','rt.throwRangeError');
   a.cvttsd2si('rax','xmm0');if(width>1)a.shl('rax',width===8?3:width===4?2:1);a.jmp(prepared);a.label(zeroLength);a.mov('rax',0);
   a.label(prepared);a.mov('r10',3);a.store(slot(96),'r10');a.cvtsi2sd('xmm0','rax');a.storesd(slot(104),'xmm0');a.lea('r10',slot(96));a.store(slot(56),'r10');a.mov('r10',1);a.store(slot(48),'r10');
   a.label(noLength);
  }
  // Length overload: ToIndex(length) precedes AllocateTypedArray (ES2020 22.2.4.2).
  resolveDeferredConstructPrototype(a,frame,'rt.'+name.toLowerCase()+'Prototype',112);
  a.lea('rcx',slot(128));a.mov('rdx',0);a.mov('r8',0);a.call('rt.newObject');
  a.load('rax',slot(136));a.lea('r10',{rip:'rt.arraybufferPrototype'});a.store({base:'rax',disp:O.prototype},'r10');
  a.lea('rax',slot(128));a.store(slot(32),'rax');
  a.lea('rcx',slot(96));a.load('rdx',slot(48));a.test('rdx','rdx');const one=a.unique('one');a.jcc('e',one);a.mov('rdx',1);a.label(one);a.load('r8',slot(56));a.call('rt.ArrayBuffer.construct');
  a.load('rax',slot(104));a.store(slot(80),'rax');a.load('rax',{base:'rax',disp:ArrayBufferLayout.byteLength});a.store(slot(296),'rax');if(width>1)a.shr('rax',width===8?3:width===4?2:1);a.store(slot(72),'rax');a.jmp(ready);
  a.label(view);a.store(slot(80),'r10');
  // ES2020 22.2.4.5: ToIndex(byteOffset), alignment, ToIndex(length), then
  // IsDetachedBuffer, then the bounds checks. slot 304: length given, 312: length.
  const offsetReady=a.unique('offsetReady'),lengthReady=a.unique('lengthReady'),lengthNaN=a.unique('lengthNaN'),lengthNumber=a.unique('lengthNumber'),givenLength=a.unique('givenLength');
  const shift=width===8?3:width===4?2:width===2?1:0;
  a.mov('rax',0);a.store(slot(304),'rax');
  a.load('rax',slot(48));a.cmp('rax',2);a.jcc('b',offsetReady);
  a.load('rax',slot(56));a.add('rax',16);a.load('rax',{base:'rax'});a.test('rax','rax');a.jcc('e',offsetReady);
  a.lea('rcx',slot(112));a.load('rdx',slot(56));a.add('rdx',16);a.call('rt.toNumber');
  a.movsd('xmm0',slot(120));a.ucomisd('xmm0','xmm0');a.jcc('p',offsetReady);
  a.mov('rax',-1);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'be','rt.throwRangeError');
  a.mov('rax',0x7fffffff);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'a','rt.throwRangeError');
  a.cvttsd2si('rax','xmm0');a.store(slot(64),'rax');
  a.label(offsetReady);if(width>1){a.load('rax',slot(64));a.and('rax',width-1);a.test('rax','rax');failIf(a,'ne','rt.throwRangeError');}
  a.load('rax',slot(48));a.cmp('rax',3);a.jcc('b',lengthReady);
  a.load('rax',slot(56));a.add('rax',32);a.load('rax',{base:'rax'});a.test('rax','rax');a.jcc('e',lengthReady);
  a.lea('rcx',slot(112));a.load('rdx',slot(56));a.add('rdx',32);a.call('rt.toNumber');
  a.movsd('xmm0',slot(120));a.ucomisd('xmm0','xmm0');a.jcc('p',lengthNaN);a.jmp(lengthNumber);
  a.label(lengthNaN);a.mov('rax',0);a.cvtsi2sd('xmm0','rax');
  a.label(lengthNumber);
  a.mov('rax',-1);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'be','rt.throwRangeError');
  a.mov('rax',0x7fffffff);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'a','rt.throwRangeError');
  a.cvttsd2si('rax','xmm0');a.store(slot(312),'rax');a.mov('rax',1);a.store(slot(304),'rax');
  a.label(lengthReady);
  a.load('r10',slot(80));a.load('rax',{base:'r10',disp:ArrayBufferLayout.detached});a.test('rax','rax');failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'r10',disp:ArrayBufferLayout.byteLength});a.load('r10',slot(64));
  a.load('r11',slot(304));a.test('r11','r11');a.jcc('ne',givenLength);
  if(width>1){a.mov('r11','rax');a.and('r11',width-1);a.test('r11','r11');failIf(a,'ne','rt.throwRangeError');}
  a.cmp('r10','rax');failIf(a,'a','rt.throwRangeError');a.sub('rax','r10');a.store(slot(296),'rax');
  if(shift)a.shr('rax',shift);a.store(slot(72),'rax');a.jmp(ready);
  a.label(givenLength);a.load('r11',slot(312));a.store(slot(72),'r11');if(shift)a.shl('r11',shift);a.store(slot(296),'r11');
  a.add('r11','r10');a.cmp('r11','rax');failIf(a,'a','rt.throwRangeError');
  a.label(ready);
  a.load('r10',slot(80));a.load('r10',{base:'r10',disp:ArrayBufferLayout.detached});a.test('r10','r10');failIf(a,'ne','rt.throwTypeError');
  a.mov('rcx',TypedArrayLayout.size);a.call('rt.alloc');
  a.mov('r10',HeapKind.object);a.store({base:'rax',disp:H.kind-H.size},'r10');
  a.mov('r10',TypedArrayKind);a.store({base:'rax',disp:O.kind},'r10');a.mov('r10',0);
  for(const offset of [O.properties,O.length,O.stringifying,O.flags])a.store({base:'rax',disp:offset},'r10');
  selectNativeConstructPrototype(a,frame,'rt.'+name.toLowerCase()+'Prototype');a.store({base:'rax',disp:O.prototype},'r10');
  a.load('r10',slot(80));a.store({base:'rax',disp:TypedArrayLayout.buffer},'r10');
  a.load('r10',slot(64));a.store({base:'rax',disp:TypedArrayLayout.byteOffset},'r10');
  a.load('r10',slot(72));a.store({base:'rax',disp:TypedArrayLayout.length},'r10');a.load('r10',slot(width>1?296:72));a.store({base:'rax',disp:TypedArrayLayout.byteLength},'r10');
  a.mov('r10',elementType);a.store({base:'rax',disp:TypedArrayLayout.elementType},'r10');
  a.load('rcx',slot(40));a.mov('r10',5);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
  a.load('rax',slot(288));a.test('rax','rax');const copyDone=a.unique('copyDone'),copyLoop=a.unique('copyLoop');a.jcc('e',copyDone);
  a.label(copyLoop);a.load('rax',slot(272));a.load('r10',slot(280));a.cmp('rax','r10');a.jcc('ae',copyDone);
  a.lea('rcx',slot(240));a.mov('rdx','rax');a.call('rt.arrayIndexKey');
  a.lea('rcx',slot(256));a.lea('rdx',slot(224));a.lea('r8',slot(240));a.call('rt.getProperty');
  a.lea('rcx',slot(256));if(elementType>=10){a.lea('rcx',slot(240));a.lea('rdx',slot(256));a.call('rt.toBigIntValue');a.lea('rcx',slot(240));a.mov('rdx','rcx');a.call('rt.bigintToUint64');}
  else if(elementType>=8){a.mov('rdx','rcx');a.lea('rcx',slot(304));a.call('rt.toNumber');a.movsd('xmm0',slot(312));if(elementType===8)a.cvtsd2ss('xmm0','xmm0');a.movqFromXmm('rax','xmm0');}
  else{a.call(elementType===3?'rt.toUint8Clamp':'rt.toInt32');if(elementType!==3){if(width===4){a.mov('r10',0xffffffffn);a.and('rax','r10');}else a.and('rax',width===2?65535:255);}}
  a.load('rdx',slot(40));a.load('rdx',{base:'rdx',disp:8});a.load('rdx',{base:'rdx',disp:TypedArrayLayout.buffer});a.load('rdx',{base:'rdx',disp:ArrayBufferLayout.bytes});a.load('r10',slot(272));if(width>1)a.shl('r10',width===8?3:width===4?2:1);a.add('rdx','r10');a.store({base:'rdx'},'rax',width===8?64:width===4?32:width===2?16:8);
  a.load('rax',slot(272));a.add('rax',1);a.store(slot(272),'rax');a.jmp(copyLoop);a.label(copyDone);
 });
 }
}
