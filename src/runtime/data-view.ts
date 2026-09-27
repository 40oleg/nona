import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {HeapKind,HeapLayout as H} from './heap-layout.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {emitNativeFunction} from './function-builtin.js';
import {stringLiteral} from './value.js';
import {ArrayBufferKind,ArrayBufferLayout} from './array-buffer.js';

export const DataViewKind=12;
export const DataViewLayout={buffer:O.size,byteOffset:O.size+8,byteLength:O.size+16,size:O.size+24} as const;
export const dataViewRoots=['rt.dataViewBuffer.fn','rt.dataViewByteOffset.fn','rt.dataViewByteLength.fn'];
export const dataViewPropertyRoots=['rt.dataviewPrototype.@@toStringTag',...['buffer','byteOffset','byteLength'].map(name=>'rt.dataviewPrototype.'+name),...dataViewRoots.flatMap(name=>[name+'.name',name+'.length'])];

export function emitDataViewPrototype(b:RuntimeBuilder):void {
 const bytes=new Uint8Array(O.size);
 b.bundle.fragments.push({name:'rt.dataviewPrototype',section:'.data',alignment:8,bytes,symbols:{},fixups:[{offset:O.prototype,kind:'va64',target:'rt.objectPrototype',addend:0}]});
}

export function emitDataView(b:RuntimeBuilder):void {
 const prototype=b.bundle.fragments.find(f=>f.name==='rt.dataviewPrototype')!;
 for(const [name,offset] of [['buffer',DataViewLayout.buffer],['byteOffset',DataViewLayout.byteOffset],['byteLength',DataViewLayout.byteLength]] as const){
  const symbol='rt.dataView'+name.charAt(0).toUpperCase()+name.slice(1)+'.fn';
  emitNativeFunction(b,symbol,'get '+name,0);
  b.bundle.fragments.push(stringLiteral('rt.dataviewPrototype.'+name+'.key',name));
  const property=new Uint8Array(P.size);property[P.attributes]=A.accessor|A.configurable;property[P.getter]=5;
  const head=prototype.fixups.find(f=>f.offset===O.properties);
  b.bundle.fragments.push({name:'rt.dataviewPrototype.'+name,section:'.data',alignment:8,bytes:property,symbols:{},fixups:[
   ...(head?[{offset:P.next,kind:'va64' as const,target:head.target,addend:0}]:[]),
   {offset:P.key,kind:'va64',target:'rt.dataviewPrototype.'+name+'.key',addend:0},
   {offset:P.getter+8,kind:'va64',target:symbol,addend:0},
  ]});if(head)head.target='rt.dataviewPrototype.'+name;else prototype.fixups.push({offset:O.properties,kind:'va64',target:'rt.dataviewPrototype.'+name,addend:0});
  b.fn(symbol+'.code',40,a=>{
   a.load('rdx',slot(80));a.load('rax',{base:'rdx'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
   a.load('rdx',{base:'rdx',disp:8});a.load('rax',{base:'rdx',disp:O.kind});a.cmp('rax',DataViewKind);failIf(a,'ne','rt.throwTypeError');
   a.load('rax',{base:'rdx',disp:offset});if(name==='buffer'){
    a.mov('r10',5);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
   }else{
    a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
   }
  });
 }
 b.bundle.fragments.push(stringLiteral('rt.dataViewTag','DataView'));
 const tag=new Uint8Array(P.size);tag[P.value]=4;tag[P.attributes]=A.configurable;
 const tagHead=prototype.fixups.find(f=>f.offset===O.properties)!;
 b.bundle.fragments.push({name:'rt.dataviewPrototype.@@toStringTag',section:'.data',alignment:8,bytes:tag,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:tagHead.target,addend:0},
  {offset:P.key,kind:'va64',target:'rt.Symbol.toStringTag.value',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.dataViewTag',addend:0},
 ]});tagHead.target='rt.dataviewPrototype.@@toStringTag';
 b.fn('rt.DataView.code',40,a=>a.call('rt.throwTypeError'));
 rootedFn(b,'rt.DataView.construct',168,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:88,count:1}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.test('rdx','rdx');failIf(a,'e','rt.throwTypeError');
  a.load('rax',{base:'r8'});a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
  a.load('r10',{base:'r8',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',ArrayBufferKind);failIf(a,'ne','rt.throwTypeError');
  a.store(slot(64),'r10');a.mov('rax',0);a.store(slot(72),'rax');a.store(slot(80),'rax');
  const haveOffset=a.unique('haveOffset'),haveLength=a.unique('haveLength');
  a.load('rax',slot(48));a.cmp('rax',2);a.jcc('b',haveOffset);
  a.load('rax',slot(56));a.add('rax',16);a.load('rax',{base:'rax'});a.test('rax','rax');a.jcc('e',haveOffset);
  a.lea('rcx',slot(88));a.load('rdx',slot(56));a.add('rdx',16);a.call('rt.toNumber');
  a.movsd('xmm0',slot(96));a.ucomisd('xmm0','xmm0');const zero=a.unique('zero');a.jcc('p',zero);
  a.mov('rax',-1);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'be','rt.throwRangeError');
  a.mov('rax',0x7fffffff);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'a','rt.throwRangeError');
  a.cvttsd2si('rax','xmm0');a.store(slot(72),'rax');a.label(zero);
  a.label(haveOffset);a.load('rax',slot(64));a.load('rax',{base:'rax',disp:ArrayBufferLayout.byteLength});a.load('r10',slot(72));a.cmp('r10','rax');failIf(a,'a','rt.throwRangeError');a.sub('rax','r10');a.store(slot(80),'rax');
  a.load('rax',slot(48));a.cmp('rax',3);a.jcc('b',haveLength);
  a.load('rax',slot(56));a.add('rax',32);a.load('rax',{base:'rax'});a.test('rax','rax');a.jcc('e',haveLength);
  a.lea('rcx',slot(88));a.load('rdx',slot(56));a.add('rdx',32);a.call('rt.toNumber');
  a.movsd('xmm0',slot(96));a.ucomisd('xmm0','xmm0');a.jcc('p',haveLength);
  a.mov('rax',-1);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'be','rt.throwRangeError');
  a.mov('rax',0x7fffffff);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'a','rt.throwRangeError');
  a.cvttsd2si('rax','xmm0');a.load('r10',slot(80));a.cmp('rax','r10');failIf(a,'a','rt.throwRangeError');a.store(slot(80),'rax');
  a.label(haveLength);
  a.mov('rcx',DataViewLayout.size);a.call('rt.alloc');
  a.mov('r10',HeapKind.object);a.store({base:'rax',disp:H.kind-H.size},'r10');
  a.mov('r10',DataViewKind);a.store({base:'rax',disp:O.kind},'r10');a.mov('r10',0);
  for(const offset of [O.properties,O.length,O.stringifying,O.flags])a.store({base:'rax',disp:offset},'r10');
  a.load('r10',slot(frame+40));a.load('r10',{base:'r10',disp:8});a.load('r10',{base:'r10',disp:O.prototype});a.store({base:'rax',disp:O.prototype},'r10');
  a.load('r10',slot(64));a.store({base:'rax',disp:DataViewLayout.buffer},'r10');
  a.load('r10',slot(72));a.store({base:'rax',disp:DataViewLayout.byteOffset},'r10');
  a.load('r10',slot(80));a.store({base:'rax',disp:DataViewLayout.byteLength},'r10');
  a.load('rcx',slot(40));a.mov('r10',5);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
 });
}
