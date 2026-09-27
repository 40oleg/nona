import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {HeapKind,HeapLayout as H} from './heap-layout.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {emitNativeFunction} from './function-builtin.js';
import {stringLiteral} from './value.js';
import {ArrayBufferLayout} from './array-buffer.js';

export const SharedArrayBufferKind=14;
export const sharedArrayBufferRoots=['rt.sharedArrayBufferByteLength.fn','rt.SharedArrayBuffer.species.fn'];
export const sharedArrayBufferPropertyRoots=['rt.sharedarraybufferPrototype.byteLength','rt.sharedarraybufferPrototype.@@toStringTag','rt.SharedArrayBuffer.@@species',...sharedArrayBufferRoots.flatMap(name=>[name+'.name',name+'.length'])];

export function emitSharedArrayBufferPrototype(b:RuntimeBuilder):void {
 const bytes=new Uint8Array(O.size);
 b.bundle.fragments.push({name:'rt.sharedarraybufferPrototype',section:'.data',alignment:8,bytes,symbols:{},fixups:[
  {offset:O.prototype,kind:'va64',target:'rt.objectPrototype',addend:0},
 ]});
}

export function emitSharedArrayBuffer(b:RuntimeBuilder):void {
 const prototype=b.bundle.fragments.find(f=>f.name==='rt.sharedarraybufferPrototype')!;
 b.bundle.fragments.push(stringLiteral('rt.sharedArrayBufferTag','SharedArrayBuffer'));
 const tag=new Uint8Array(P.size);tag[P.value]=4;tag[P.attributes]=A.configurable;
 const tagHead=prototype.fixups.find(f=>f.offset===O.properties)!;
 b.bundle.fragments.push({name:'rt.sharedarraybufferPrototype.@@toStringTag',section:'.data',alignment:8,bytes:tag,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:tagHead.target,addend:0},
  {offset:P.key,kind:'va64',target:'rt.Symbol.toStringTag.value',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.sharedArrayBufferTag',addend:0},
 ]});tagHead.target='rt.sharedarraybufferPrototype.@@toStringTag';
 emitNativeFunction(b,'rt.SharedArrayBuffer.species.fn','get [Symbol.species]',0);
 const species=new Uint8Array(P.size);species[P.attributes]=A.accessor|A.configurable;species[P.getter]=5;
 const constructor=b.bundle.fragments.find(f=>f.name==='rt.SharedArrayBuffer')!;
 const speciesHead=constructor.fixups.find(f=>f.offset===O.properties)!;
 b.bundle.fragments.push({name:'rt.SharedArrayBuffer.@@species',section:'.data',alignment:8,bytes:species,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:speciesHead.target,addend:0},
  {offset:P.key,kind:'va64',target:'rt.Symbol.species.value',addend:0},
  {offset:P.getter+8,kind:'va64',target:'rt.SharedArrayBuffer.species.fn',addend:0},
 ]});speciesHead.target='rt.SharedArrayBuffer.@@species';
 b.fn('rt.SharedArrayBuffer.species.fn.code',40,a=>{a.load('rdx',slot(80));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store({base:'rcx',disp:offset},'rax');}});
 emitNativeFunction(b,'rt.sharedArrayBufferByteLength.fn','get byteLength',0);
 const property=new Uint8Array(P.size);property[P.attributes]=A.accessor|A.configurable;property[P.getter]=5;
 b.bundle.fragments.push(stringLiteral('rt.sharedarraybufferPrototype.byteLength.key','byteLength'));
 const head=prototype.fixups.find(f=>f.offset===O.properties);
 b.bundle.fragments.push({name:'rt.sharedarraybufferPrototype.byteLength',section:'.data',alignment:8,bytes:property,symbols:{},fixups:[
  ...(head?[{offset:P.next,kind:'va64' as const,target:head.target,addend:0}]:[]),
  {offset:P.key,kind:'va64',target:'rt.sharedarraybufferPrototype.byteLength.key',addend:0},
  {offset:P.getter+8,kind:'va64',target:'rt.sharedArrayBufferByteLength.fn',addend:0},
 ]});if(head)head.target='rt.sharedarraybufferPrototype.byteLength';else prototype.fixups.push({offset:O.properties,kind:'va64',target:'rt.sharedarraybufferPrototype.byteLength',addend:0});
 b.fn('rt.sharedArrayBufferByteLength.fn.code',40,a=>{
  a.load('rdx',slot(80));a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('rdx',{base:'rdx',disp:8});a.load('rax',{base:'rdx',disp:O.kind});a.cmp('rax',SharedArrayBufferKind);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'rdx',disp:ArrayBufferLayout.byteLength});a.cvtsi2sd('xmm0','rax');
  a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
 });
 b.fn('rt.SharedArrayBuffer.code',40,a=>a.call('rt.throwTypeError'));
 rootedFn(b,'rt.SharedArrayBuffer.construct',168,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:1}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.mov('rax',0);a.store(slot(72),'rax');
  const ready=a.unique('ready'),zero=a.unique('zero'),invalid=a.unique('invalid');
  a.test('rdx','rdx');a.jcc('e',ready);
  a.load('rax',{base:'r8'});a.test('rax','rax');a.jcc('e',ready);
  a.lea('rcx',slot(80));a.mov('rdx','r8');a.call('rt.toNumber');
  a.movsd('xmm0',slot(88));a.ucomisd('xmm0','xmm0');a.jcc('p',zero);
  a.mov('rax',-1);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('be',invalid);
  a.mov('rax',0x7fffffff);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');a.jcc('a',invalid);
  a.cvttsd2si('rax','xmm0');a.store(slot(72),'rax');a.jmp(ready);
  a.label(zero);a.mov('rax',0);a.store(slot(72),'rax');a.jmp(ready);
  a.label(invalid);a.call('rt.throwRangeError');a.label(ready);
  a.load('rcx',slot(72));a.call('rt.alloc');a.store(slot(64),'rax');
  a.load('r8',slot(72));a.load('rdx',slot(64));a.mov('r10',0);
  const fill=a.unique('fill'),filled=a.unique('filled');a.label(fill);a.test('r8','r8');a.jcc('e',filled);
  a.store({base:'rdx'},'r10',8);a.add('rdx',1);a.sub('r8',1);a.jmp(fill);a.label(filled);
  a.mov('rcx',ArrayBufferLayout.size);a.call('rt.alloc');
  a.mov('r10',HeapKind.object);a.store({base:'rax',disp:H.kind-H.size},'r10');
  a.mov('r10',SharedArrayBufferKind);a.store({base:'rax',disp:O.kind},'r10');a.mov('r10',0);
  for(const offset of [O.properties,O.length,O.stringifying,O.flags])a.store({base:'rax',disp:offset},'r10');
  a.load('r10',slot(frame+40));a.load('r10',{base:'r10',disp:8});a.load('r10',{base:'r10',disp:O.prototype});a.store({base:'rax',disp:O.prototype},'r10');
  a.load('r10',slot(64));a.store({base:'rax',disp:ArrayBufferLayout.bytes},'r10');
  a.load('r10',slot(72));a.store({base:'rax',disp:ArrayBufferLayout.byteLength},'r10');
  a.mov('r10',0);a.store({base:'rax',disp:ArrayBufferLayout.detached},'r10');
  a.load('rcx',slot(40));a.mov('r10',5);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
 });
}
