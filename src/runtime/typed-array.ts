import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {HeapKind,HeapLayout as H} from './heap-layout.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {emitNativeFunction} from './function-builtin.js';
import {stringLiteral} from './value.js';
import {ArrayBufferKind,ArrayBufferLayout} from './array-buffer.js';

/** Common layout for future numeric and BigInt typed-array variants. */
export const TypedArrayKind=13;
export const TypedArrayLayout={buffer:O.size,byteOffset:O.size+8,byteLength:O.size+16,length:O.size+24,elementType:O.size+32,size:O.size+40} as const;
export const typedArrayRoots=['rt.typedArrayBuffer.fn','rt.typedArrayByteOffset.fn','rt.typedArrayByteLength.fn','rt.typedArrayLength.fn','rt.uint8Convert.fn','rt.typedArrayValues.fn','rt.typedArrayKeys.fn','rt.typedArrayEntries.fn'];
export const typedArrayPropertyRoots=['rt.uint8arrayPrototype.@@toStringTag',...['buffer','byteOffset','byteLength','length'].map(name=>'rt.uint8arrayPrototype.'+name),...['values','keys','entries','@@iterator'].map(name=>'rt.typedArrayPrototype.'+name),...typedArrayRoots.flatMap(name=>[name+'.name',name+'.length'])];

export function emitTypedArrayPrototype(b:RuntimeBuilder):void {
 b.bundle.fragments.push({name:'rt.typedArrayPrototype',section:'.data',alignment:8,bytes:new Uint8Array(O.size),symbols:{},fixups:[
  {offset:O.prototype,kind:'va64',target:'rt.objectPrototype',addend:0},
 ]});
 b.bundle.fragments.push({name:'rt.uint8arrayPrototype',section:'.data',alignment:8,bytes:new Uint8Array(O.size),symbols:{},fixups:[
  {offset:O.prototype,kind:'va64',target:'rt.typedArrayPrototype',addend:0},
 ]});
}

export function emitTypedArray(b:RuntimeBuilder):void {
 const common=b.bundle.fragments.find(f=>f.name==='rt.typedArrayPrototype')!;
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
 emitNativeFunction(b,'rt.uint8Convert.fn','',1);
 rootedFn(b,'rt.uint8Convert.fn.code',104,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'}],a=>{
  a.store(slot(40),'rcx');a.mov('rcx','r8');a.call('rt.toInt32');a.and('rax',255);a.cvtsi2sd('xmm0','rax');
  a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
 });
 const prototype=b.bundle.fragments.find(f=>f.name==='rt.uint8arrayPrototype')!;
 for(const [name,offset] of [['buffer',TypedArrayLayout.buffer],['byteOffset',TypedArrayLayout.byteOffset],['byteLength',TypedArrayLayout.byteLength],['length',TypedArrayLayout.length]] as const){
  const symbol='rt.typedArray'+name.charAt(0).toUpperCase()+name.slice(1)+'.fn';
  emitNativeFunction(b,symbol,'get '+name,0);
  b.bundle.fragments.push(stringLiteral('rt.uint8arrayPrototype.'+name+'.key',name));
  const property=new Uint8Array(P.size);property[P.attributes]=A.accessor|A.configurable;property[P.getter]=5;
  const head=prototype.fixups.find(f=>f.offset===O.properties);
  b.bundle.fragments.push({name:'rt.uint8arrayPrototype.'+name,section:'.data',alignment:8,bytes:property,symbols:{},fixups:[
   ...(head?[{offset:P.next,kind:'va64' as const,target:head.target,addend:0}]:[]),
   {offset:P.key,kind:'va64',target:'rt.uint8arrayPrototype.'+name+'.key',addend:0},
   {offset:P.getter+8,kind:'va64',target:symbol,addend:0},
  ]});if(head)head.target='rt.uint8arrayPrototype.'+name;else prototype.fixups.push({offset:O.properties,kind:'va64',target:'rt.uint8arrayPrototype.'+name,addend:0});
  b.fn(symbol+'.code',40,a=>{
   a.load('rdx',slot(80));a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
   a.load('rdx',{base:'rdx',disp:8});a.load('rax',{base:'rdx',disp:O.kind});a.cmp('rax',TypedArrayKind);failIf(a,'ne','rt.throwTypeError');
   a.load('rax',{base:'rdx',disp:offset});if(name==='buffer'){
    a.mov('r10',5);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
   }else{
    a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
   }
  });
 }
 b.bundle.fragments.push(stringLiteral('rt.uint8ArrayTag','Uint8Array'));
 const tag=new Uint8Array(P.size);tag[P.value]=4;tag[P.attributes]=A.configurable;
 const tagHead=prototype.fixups.find(f=>f.offset===O.properties)!;
 b.bundle.fragments.push({name:'rt.uint8arrayPrototype.@@toStringTag',section:'.data',alignment:8,bytes:tag,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:tagHead.target,addend:0},
  {offset:P.key,kind:'va64',target:'rt.Symbol.toStringTag.value',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.uint8ArrayTag',addend:0},
 ]});tagHead.target='rt.uint8arrayPrototype.@@toStringTag';
 b.fn('rt.Uint8Array.code',40,a=>a.call('rt.throwTypeError'));
 rootedFn(b,'rt.Uint8Array.construct',328,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:96,count:11}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');a.mov('rax',0);for(const n of [64,72,80,272,280,288])a.store(slot(n),'rax');
  const allocate=a.unique('allocate'),view=a.unique('view'),fromObject=a.unique('fromObject'),ready=a.unique('ready');
  a.test('rdx','rdx');a.jcc('e',allocate);
  a.load('rax',{base:'r8'});a.cmp('rax',5);a.jcc('ne',allocate);
  a.load('r10',{base:'r8',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',ArrayBufferKind);a.jcc('e',view);a.jmp(fromObject);
  a.label(fromObject);
  a.mov('rax',5);a.store(slot(144),'rax');a.store(slot(160),'rax');
  a.lea('rax',{rip:'rt.Array.from.fn'});a.store(slot(152),'rax');a.lea('rax',{rip:'rt.Array'});a.store(slot(168),'rax');
  a.load('r10',slot(56));for(const n of [0,8]){a.load('rax',{base:'r10',disp:n});a.store(slot(176+n),'rax');}
  a.mov('rax',5);a.store(slot(192),'rax');a.lea('rax',{rip:'rt.uint8Convert.fn'});a.store(slot(200),'rax');
  a.lea('rax',slot(160));a.store(slot(32),'rax');a.lea('rcx',slot(224));a.lea('rdx',slot(144));a.mov('r8',2);a.lea('r9',slot(176));a.call('rt.invoke');
  a.load('r10',slot(232));a.load('rax',{base:'r10',disp:O.length});a.store(slot(280),'rax');
  a.mov('r10',3);a.store(slot(96),'r10');a.cvtsi2sd('xmm0','rax');a.storesd(slot(104),'xmm0');
  a.mov('r10',1);a.store(slot(48),'r10');a.store(slot(288),'r10');a.lea('r10',slot(96));a.store(slot(56),'r10');a.jmp(allocate);
  a.label(allocate);
  a.lea('rcx',slot(128));a.mov('rdx',0);a.mov('r8',0);a.call('rt.newObject');
  a.load('rax',slot(136));a.lea('r10',{rip:'rt.arraybufferPrototype'});a.store({base:'rax',disp:O.prototype},'r10');
  a.lea('rax',slot(128));a.store(slot(32),'rax');
  a.lea('rcx',slot(96));a.load('rdx',slot(48));a.test('rdx','rdx');const one=a.unique('one');a.jcc('e',one);a.mov('rdx',1);a.label(one);a.load('r8',slot(56));a.call('rt.ArrayBuffer.construct');
  a.load('rax',slot(104));a.store(slot(80),'rax');a.load('rax',{base:'rax',disp:ArrayBufferLayout.byteLength});a.store(slot(72),'rax');a.jmp(ready);
  a.label(view);a.store(slot(80),'r10');
  const offsetReady=a.unique('offsetReady'),lengthReady=a.unique('lengthReady');
  a.load('rax',slot(48));a.cmp('rax',2);a.jcc('b',offsetReady);
  a.load('rax',slot(56));a.add('rax',16);a.load('rax',{base:'rax'});a.test('rax','rax');a.jcc('e',offsetReady);
  a.lea('rcx',slot(112));a.load('rdx',slot(56));a.add('rdx',16);a.call('rt.toNumber');
  a.movsd('xmm0',slot(120));a.ucomisd('xmm0','xmm0');a.jcc('p',offsetReady);
  a.mov('rax',-1);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'be','rt.throwRangeError');
  a.mov('rax',0x7fffffff);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'a','rt.throwRangeError');
  a.cvttsd2si('rax','xmm0');a.store(slot(64),'rax');
  a.label(offsetReady);a.load('rax',slot(80));a.load('rax',{base:'rax',disp:ArrayBufferLayout.byteLength});a.load('r10',slot(64));a.cmp('r10','rax');failIf(a,'a','rt.throwRangeError');a.sub('rax','r10');a.store(slot(72),'rax');
  a.load('rax',slot(48));a.cmp('rax',3);a.jcc('b',lengthReady);
  a.load('rax',slot(56));a.add('rax',32);a.load('rax',{base:'rax'});a.test('rax','rax');a.jcc('e',lengthReady);
  a.lea('rcx',slot(112));a.load('rdx',slot(56));a.add('rdx',32);a.call('rt.toNumber');
  a.movsd('xmm0',slot(120));a.ucomisd('xmm0','xmm0');a.jcc('p',lengthReady);
  a.mov('rax',-1);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'be','rt.throwRangeError');
  a.mov('rax',0x7fffffff);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'a','rt.throwRangeError');
  a.cvttsd2si('rax','xmm0');a.load('r10',slot(72));a.cmp('rax','r10');failIf(a,'a','rt.throwRangeError');a.store(slot(72),'rax');
  a.label(lengthReady);a.label(ready);
  a.mov('rcx',TypedArrayLayout.size);a.call('rt.alloc');
  a.mov('r10',HeapKind.object);a.store({base:'rax',disp:H.kind-H.size},'r10');
  a.mov('r10',TypedArrayKind);a.store({base:'rax',disp:O.kind},'r10');a.mov('r10',0);
  for(const offset of [O.properties,O.length,O.stringifying,O.flags])a.store({base:'rax',disp:offset},'r10');
  a.load('r10',slot(frame+40));a.load('r10',{base:'r10',disp:8});a.load('r10',{base:'r10',disp:O.prototype});a.store({base:'rax',disp:O.prototype},'r10');
  a.load('r10',slot(80));a.store({base:'rax',disp:TypedArrayLayout.buffer},'r10');
  a.load('r10',slot(64));a.store({base:'rax',disp:TypedArrayLayout.byteOffset},'r10');
  a.load('r10',slot(72));a.store({base:'rax',disp:TypedArrayLayout.byteLength},'r10');a.store({base:'rax',disp:TypedArrayLayout.length},'r10');
  a.mov('r10',1);a.store({base:'rax',disp:TypedArrayLayout.elementType},'r10');
  a.load('rcx',slot(40));a.mov('r10',5);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
  a.load('rax',slot(288));a.test('rax','rax');const copyDone=a.unique('copyDone'),copyLoop=a.unique('copyLoop');a.jcc('e',copyDone);
  a.label(copyLoop);a.load('rax',slot(272));a.load('r10',slot(280));a.cmp('rax','r10');a.jcc('ae',copyDone);
  a.lea('rcx',slot(240));a.mov('rdx','rax');a.call('rt.arrayIndexKey');
  a.lea('rcx',slot(256));a.lea('rdx',slot(224));a.lea('r8',slot(240));a.call('rt.getProperty');
  a.lea('rcx',slot(256));a.call('rt.toInt32');a.and('rax',255);
  a.load('rdx',slot(40));a.load('rdx',{base:'rdx',disp:8});a.load('rdx',{base:'rdx',disp:TypedArrayLayout.buffer});a.load('rdx',{base:'rdx',disp:ArrayBufferLayout.bytes});a.load('r10',slot(272));a.add('rdx','r10');a.store({base:'rdx'},'rax',8);
  a.load('rax',slot(272));a.add('rax',1);a.store(slot(272),'rax');a.jmp(copyLoop);a.label(copyDone);
 });
}
