import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {HeapKind,HeapLayout as H} from './heap-layout.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {emitNativeFunction,prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import {stringLiteral} from './value.js';
import {SharedArrayBufferKind} from './shared-array-buffer.js';

export const ArrayBufferKind=11;
export const ArrayBufferLayout={bytes:O.size,byteLength:O.size+8,detached:O.size+16,size:O.size+24} as const;
export const arrayBufferRoots=['rt.arrayBufferByteLength.fn','rt.ArrayBuffer.species.fn','rt.arrayBufferCopy.fn','rt.ArrayBuffer.isView.fn','rt.arrayBufferDetach.fn'];
export const arrayBufferPropertyRoots=['rt.arraybufferPrototype.byteLength','rt.arraybufferPrototype.@@toStringTag','rt.ArrayBuffer.@@species',...arrayBufferRoots.slice(0,2).flatMap(name=>[name+'.name',name+'.length']),...builtinPropertyRoots('rt.arrayBufferCopy.fn','__nonaCopyInternal','rt.ArrayBuffer'),...builtinPropertyRoots('rt.ArrayBuffer.isView.fn','isView','rt.ArrayBuffer'),...builtinPropertyRoots('rt.arrayBufferDetach.fn','__nonaDetachInternal','rt.ArrayBuffer')];

export function emitArrayBufferPrototype(b:RuntimeBuilder):void {
 const bytes=new Uint8Array(O.size);
 b.bundle.fragments.push({name:'rt.arraybufferPrototype',section:'.data',alignment:8,bytes,symbols:{},fixups:[
  {offset:O.prototype,kind:'va64',target:'rt.objectPrototype',addend:0},
 ]});
}

export function emitArrayBuffer(b:RuntimeBuilder):void {
 prependFunctionBuiltin(b,'rt.arrayBufferDetach.fn','__nonaDetachInternal',1,'rt.ArrayBuffer');
 b.fn('rt.arrayBufferDetach.fn.code',40,a=>{
  a.test('rdx','rdx');failIf(a,'e','rt.throwTypeError');
  a.load('rax',{base:'r8'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',{base:'r8',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',ArrayBufferKind);failIf(a,'ne','rt.throwTypeError');
  a.mov('rax',0);a.store({base:'r10',disp:ArrayBufferLayout.byteLength},'rax');
  a.mov('rax',1);a.store({base:'r10',disp:ArrayBufferLayout.detached},'rax');
  a.mov('rax',0);
  a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');
 });
 prependFunctionBuiltin(b,'rt.ArrayBuffer.isView.fn','isView',1,'rt.ArrayBuffer');
 b.fn('rt.ArrayBuffer.isView.fn.code',40,a=>{
  a.mov('rax',2);a.store({base:'rcx'},'rax');a.mov('rax',0);a.store({base:'rcx',disp:8},'rax');
  const done=a.unique('done');a.test('rdx','rdx');a.jcc('e',done);
  a.load('rax',{base:'r8'});a.cmp('rax',5);a.jcc('ne',done);
  a.load('rax',{base:'r8',disp:8});a.load('rax',{base:'rax',disp:O.kind});a.cmp('rax',12);const yes=a.unique('yes');a.jcc('e',yes);a.cmp('rax',13);a.jcc('ne',done);a.label(yes);
  a.mov('rax',1);a.store({base:'rcx',disp:8},'rax');a.label(done);
 });
 prependFunctionBuiltin(b,'rt.arrayBufferCopy.fn','__nonaCopyInternal',4,'rt.ArrayBuffer');
 b.fn('rt.arrayBufferCopy.fn.code',88,a=>{
  a.cmp('rdx',4);failIf(a,'b','rt.throwTypeError');
  a.load('rax',{base:'r8'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',{base:'r8',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',ArrayBufferKind);const sourceReady=a.unique('sourceReady');a.jcc('e',sourceReady);a.cmp('rax',SharedArrayBufferKind);failIf(a,'ne','rt.throwTypeError');a.label(sourceReady);a.store(slot(40),'r10');
  a.load('rax',{base:'r10',disp:ArrayBufferLayout.detached});a.test('rax','rax');failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'r8',disp:16});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',{base:'r8',disp:24});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',ArrayBufferKind);const targetReady=a.unique('targetReady');a.jcc('e',targetReady);a.cmp('rax',SharedArrayBufferKind);failIf(a,'ne','rt.throwTypeError');a.label(targetReady);a.store(slot(48),'r10');
  a.load('rax',{base:'r10',disp:ArrayBufferLayout.detached});a.test('rax','rax');failIf(a,'ne','rt.throwTypeError');
  for(const [source,target] of [[32,56],[48,64]] as const){
   a.load('rax',{base:'r8',disp:source});a.cmp('rax',3);failIf(a,'ne','rt.throwTypeError');
   a.movsd('xmm0',{base:'r8',disp:source+8});a.cvttsd2si('rax','xmm0');a.test('rax','rax');failIf(a,'s','rt.throwRangeError');a.store(slot(target),'rax');
  }
  a.mov('rax',0);a.store(slot(72),'rax');const noTargetOffset=a.unique('noTargetOffset');a.cmp('rdx',5);a.jcc('b',noTargetOffset);
  a.load('rax',{base:'r8',disp:64});a.cmp('rax',3);failIf(a,'ne','rt.throwTypeError');a.movsd('xmm0',{base:'r8',disp:72});a.cvttsd2si('rax','xmm0');a.test('rax','rax');failIf(a,'s','rt.throwRangeError');a.store(slot(72),'rax');a.label(noTargetOffset);
  a.load('rax',slot(56));a.load('r11',slot(64));a.add('rax','r11');failIf(a,'b','rt.throwRangeError');
  a.load('r10',slot(40));a.load('r10',{base:'r10',disp:ArrayBufferLayout.byteLength});a.cmp('rax','r10');failIf(a,'a','rt.throwRangeError');
  a.load('rax',slot(64));a.load('r11',slot(72));a.add('rax','r11');failIf(a,'b','rt.throwRangeError');a.load('r10',slot(48));a.load('r10',{base:'r10',disp:ArrayBufferLayout.byteLength});a.cmp('rax','r10');failIf(a,'a','rt.throwRangeError');
  a.load('rdx',slot(40));a.load('rdx',{base:'rdx',disp:ArrayBufferLayout.bytes});a.load('r11',slot(56));a.add('rdx','r11');
  a.load('r8',slot(48));a.load('r8',{base:'r8',disp:ArrayBufferLayout.bytes});a.load('r11',slot(72));a.add('r8','r11');a.load('r9',slot(64));
  const copy=a.unique('copy'),done=a.unique('done');
  a.label(copy);a.test('r9','r9');a.jcc('e',done);a.load('rax',{base:'rdx'},8);a.store({base:'r8'},'rax',8);a.add('rdx',1);a.add('r8',1);a.sub('r9',1);a.jmp(copy);
  a.label(done);
  a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');
 });
 b.bundle.fragments.push(stringLiteral('rt.arrayBufferTag','ArrayBuffer'));
 const tag=new Uint8Array(P.size);tag[P.value]=4;tag[P.attributes]=A.configurable;
 const prototype=b.bundle.fragments.find(f=>f.name==='rt.arraybufferPrototype')!;
 const tagHead=prototype.fixups.find(f=>f.offset===O.properties)!;
 b.bundle.fragments.push({name:'rt.arraybufferPrototype.@@toStringTag',section:'.data',alignment:8,bytes:tag,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:tagHead.target,addend:0},
  {offset:P.key,kind:'va64',target:'rt.Symbol.toStringTag.value',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.arrayBufferTag',addend:0},
 ]});tagHead.target='rt.arraybufferPrototype.@@toStringTag';
 emitNativeFunction(b,'rt.ArrayBuffer.species.fn','get [Symbol.species]',0);
 const species=new Uint8Array(P.size);species[P.attributes]=A.accessor|A.configurable;species[P.getter]=5;
 const constructor=b.bundle.fragments.find(f=>f.name==='rt.ArrayBuffer')!;
 const speciesHead=constructor.fixups.find(f=>f.offset===O.properties)!;
 b.bundle.fragments.push({name:'rt.ArrayBuffer.@@species',section:'.data',alignment:8,bytes:species,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:speciesHead.target,addend:0},
  {offset:P.key,kind:'va64',target:'rt.Symbol.species.value',addend:0},
  {offset:P.getter+8,kind:'va64',target:'rt.ArrayBuffer.species.fn',addend:0},
 ]});speciesHead.target='rt.ArrayBuffer.@@species';
 b.fn('rt.ArrayBuffer.species.fn.code',40,a=>{a.load('rdx',slot(80));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store({base:'rcx',disp:offset},'rax');}});
 emitNativeFunction(b,'rt.arrayBufferByteLength.fn','get byteLength',0);
 const property=new Uint8Array(P.size);property[P.attributes]=A.accessor|A.configurable;property[P.getter]=5;
 b.bundle.fragments.push(stringLiteral('rt.arraybufferPrototype.byteLength.key','byteLength'));
 const owner=b.bundle.fragments.find(f=>f.name==='rt.arraybufferPrototype')!;
 const head=owner.fixups.find(f=>f.offset===O.properties);
 b.bundle.fragments.push({name:'rt.arraybufferPrototype.byteLength',section:'.data',alignment:8,bytes:property,symbols:{},fixups:[
  ...(head?[{offset:P.next,kind:'va64' as const,target:head.target,addend:0}]:[]),
  {offset:P.key,kind:'va64',target:'rt.arraybufferPrototype.byteLength.key',addend:0},
  {offset:P.getter+8,kind:'va64',target:'rt.arrayBufferByteLength.fn',addend:0},
 ]});if(head)head.target='rt.arraybufferPrototype.byteLength';else owner.fixups.push({offset:O.properties,kind:'va64',target:'rt.arraybufferPrototype.byteLength',addend:0});
 b.fn('rt.arrayBufferByteLength.fn.code',40,a=>{
  a.load('rdx',slot(80));a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('rdx',{base:'rdx',disp:8});a.load('rax',{base:'rdx',disp:O.kind});a.cmp('rax',ArrayBufferKind);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'rdx',disp:ArrayBufferLayout.byteLength});a.cvtsi2sd('xmm0','rax');
  a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
 });
 b.fn('rt.ArrayBuffer.code',40,a=>a.call('rt.throwTypeError'));
 rootedFn(b,'rt.ArrayBuffer.construct',168,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:1}],(a,frame)=>{
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
  a.label(invalid);a.call('rt.throwRangeError');
  a.label(ready);
  a.load('rcx',slot(72));a.call('rt.alloc');a.store(slot(64),'rax');
  a.load('r8',slot(72));a.load('rdx',slot(64));a.mov('r10',0);
  const fill=a.unique('fill'),filled=a.unique('filled');a.label(fill);a.test('r8','r8');a.jcc('e',filled);
  a.store({base:'rdx'},'r10',8);a.add('rdx',1);a.sub('r8',1);a.jmp(fill);a.label(filled);
  a.mov('rcx',ArrayBufferLayout.size);a.call('rt.alloc');
  a.mov('r10',HeapKind.object);a.store({base:'rax',disp:H.kind-H.size},'r10');
  a.mov('r10',ArrayBufferKind);a.store({base:'rax',disp:O.kind},'r10');a.mov('r10',0);
  for(const offset of [O.properties,O.length,O.stringifying,O.flags])a.store({base:'rax',disp:offset},'r10');
  a.load('r10',slot(frame+40));a.load('r10',{base:'r10',disp:8});a.load('r10',{base:'r10',disp:O.prototype});a.store({base:'rax',disp:O.prototype},'r10');
  a.load('r10',slot(64));a.store({base:'rax',disp:ArrayBufferLayout.bytes},'r10');
  a.load('r10',slot(72));a.store({base:'rax',disp:ArrayBufferLayout.byteLength},'r10');
  a.mov('r10',0);a.store({base:'rax',disp:ArrayBufferLayout.detached},'r10');
  a.load('rcx',slot(40));a.mov('r10',5);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
 });
}
