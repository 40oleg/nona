import {RuntimeBuilder,slot,failIf} from './abi.js';
import {selectNativeConstructPrototype} from './constructor-prototype.js';
import {rootedFn} from './root-scope.js';
import {HeapKind,HeapLayout as H} from './heap-layout.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {emitNativeFunction,prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import {stringLiteral} from './value.js';
import {ArrayBufferKind,ArrayBufferLayout} from './array-buffer.js';
import {SharedArrayBufferKind} from './shared-array-buffer.js';

export const DataViewKind=12;
export const DataViewLayout={buffer:O.size,byteOffset:O.size+8,byteLength:O.size+16,size:O.size+24} as const;
const byteMethods=['getInt8','getUint8','setInt8','setUint8'] as const;
const wordMethods=['getInt16','getUint16','getInt32','getUint32','setInt16','setUint16','setInt32','setUint32'] as const;
const floatMethods=['getFloat32','getFloat64','setFloat32','setFloat64'] as const;
const bigintMethods=['getBigInt64','getBigUint64','setBigInt64','setBigUint64'] as const;
const dataMethods=[...byteMethods,...wordMethods,...floatMethods,...bigintMethods];
export const dataViewRoots=['rt.dataViewBuffer.fn','rt.dataViewByteOffset.fn','rt.dataViewByteLength.fn',...dataMethods.map(name=>'rt.dataView'+name.charAt(0).toUpperCase()+name.slice(1)+'.fn')];
export const dataViewPropertyRoots=['rt.dataviewPrototype.@@toStringTag',...['buffer','byteOffset','byteLength'].map(name=>'rt.dataviewPrototype.'+name),...dataViewRoots.slice(0,3).flatMap(name=>[name+'.name',name+'.length']),...dataMethods.flatMap(name=>builtinPropertyRoots('rt.dataView'+name.charAt(0).toUpperCase()+name.slice(1)+'.fn',name,'rt.dataviewPrototype'))];

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
   if(name!=='buffer'){a.load('r10',{base:'rdx',disp:DataViewLayout.buffer});a.load('r10',{base:'r10',disp:ArrayBufferLayout.detached});a.test('r10','r10');failIf(a,'ne','rt.throwTypeError');}
   a.load('rax',{base:'rdx',disp:offset});if(name==='buffer'){
    a.mov('r10',5);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
   }else{
    a.cvtsi2sd('xmm0','rax');a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
   }
  });
 }
 for(const name of byteMethods){
  const write=name.startsWith('set'),signed=name.includes('Int8')&&!name.includes('Uint8'),symbol='rt.dataView'+name.charAt(0).toUpperCase()+name.slice(1)+'.fn';
  prependFunctionBuiltin(b,symbol,name,write?2:1,'rt.dataviewPrototype');
  rootedFn(b,symbol+'.code',136,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:3}],(a,frame)=>{
   a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
   a.load('rdx',slot(frame+40));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store(slot(80+offset),'rax');}
   a.load('rax',slot(80));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
   a.load('rax',slot(88));a.load('rax',{base:'rax',disp:O.kind});a.cmp('rax',DataViewKind);failIf(a,'ne','rt.throwTypeError');
   a.mov('rax',3);a.store(slot(96),'rax');a.mov('rax',0);a.store(slot(104),'rax');
   const haveIndex=a.unique('haveIndex');a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',haveIndex);
   a.lea('rcx',slot(96));a.load('rdx',slot(56));a.call('rt.toNumber');a.label(haveIndex);
   a.movsd('xmm0',slot(104));a.ucomisd('xmm0','xmm0');const zero=a.unique('zero'),ready=a.unique('ready');a.jcc('p',zero);
   a.mov('rax',-1);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'be','rt.throwRangeError');
   a.mov('rax',0x7fffffff);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'a','rt.throwRangeError');
   a.cvttsd2si('rax','xmm0');a.jmp(ready);a.label(zero);a.mov('rax',0);a.label(ready);a.store(slot(72),'rax');
   if(write){
    a.mov('rax',0);a.store(slot(112),'rax');a.store(slot(120),'rax');
    const valueReady=a.unique('valueReady');a.load('rax',slot(48));a.cmp('rax',2);a.jcc('b',valueReady);
    a.load('rcx',slot(56));a.add('rcx',16);a.jmp(valueReady+'.converted');
    a.label(valueReady);a.lea('rcx',slot(112));a.label(valueReady+'.converted');a.call('rt.toInt32');a.and('rax',255);a.store(slot(64),'rax');
   }
   a.load('rdx',slot(88));a.load('r10',{base:'rdx',disp:DataViewLayout.buffer});a.load('r10',{base:'r10',disp:ArrayBufferLayout.detached});a.test('r10','r10');failIf(a,'ne','rt.throwTypeError');
   a.load('rax',slot(72));a.load('r10',{base:'rdx',disp:DataViewLayout.byteLength});a.cmp('rax','r10');failIf(a,'ae','rt.throwRangeError');
   a.load('r10',{base:'rdx',disp:DataViewLayout.byteOffset});a.add('rax','r10');
   a.load('rdx',{base:'rdx',disp:DataViewLayout.buffer});a.load('rdx',{base:'rdx',disp:ArrayBufferLayout.bytes});a.add('rdx','rax');
   if(write){a.load('rax',slot(64));a.store({base:'rdx'},'rax',8);a.load('rcx',slot(40));a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');}
   else{a.load('rax',{base:'rdx'},8);if(signed){a.shl('rax',56);a.sar('rax',56);}a.cvtsi2sd('xmm0','rax');a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');}
  });
 }
 for(const name of [...wordMethods,...floatMethods]){
  const write=name.startsWith('set'),signed=name.includes('Int')&&!name.includes('Uint'),floating=name.includes('Float');
  const width=name.endsWith('16')?2:name.endsWith('64')?8:4,bits=width*8;
  const symbol='rt.dataView'+name.charAt(0).toUpperCase()+name.slice(1)+'.fn';
  prependFunctionBuiltin(b,symbol,name,write?2:1,'rt.dataviewPrototype');
  rootedFn(b,symbol+'.code',168,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:3}],(a,frame)=>{
   a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
   a.load('rdx',slot(frame+40));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store(slot(80+offset),'rax');}
   a.load('rax',slot(80));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');
   a.load('rax',slot(88));a.load('rax',{base:'rax',disp:O.kind});a.cmp('rax',DataViewKind);failIf(a,'ne','rt.throwTypeError');
   a.mov('rax',3);a.store(slot(96),'rax');a.mov('rax',0);a.store(slot(104),'rax');
   const haveIndex=a.unique('haveIndex');a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',haveIndex);
   a.lea('rcx',slot(96));a.load('rdx',slot(56));a.call('rt.toNumber');a.label(haveIndex);
   a.movsd('xmm0',slot(104));a.ucomisd('xmm0','xmm0');const zero=a.unique('zero'),ready=a.unique('ready');a.jcc('p',zero);
   a.mov('rax',-1);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'be','rt.throwRangeError');
   a.mov('rax',0x7fffffff);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'a','rt.throwRangeError');
   a.cvttsd2si('rax','xmm0');a.jmp(ready);a.label(zero);a.mov('rax',0);a.label(ready);a.store(slot(72),'rax');
   if(write){
    a.mov('rax',0);a.store(slot(112),'rax');a.store(slot(120),'rax');if(floating){a.store(slot(144),'rax');a.store(slot(152),'rax');}
    const missing=a.unique('missing'),convert=a.unique('convert');a.load('rax',slot(48));a.cmp('rax',2);a.jcc('b',missing);
    a.load('rcx',slot(56));a.add('rcx',16);a.jmp(convert);
    a.label(missing);a.lea('rcx',slot(floating?144:112));a.label(convert);
    if(floating){
     a.mov('rdx','rcx');a.lea('rcx',slot(112));a.call('rt.toNumber');
     a.movsd('xmm0',slot(120));if(width===4)a.cvtsd2ss('xmm0','xmm0');a.movqFromXmm('rax','xmm0');a.store(slot(128),'rax');
    }else{a.call('rt.toInt32');a.store(slot(128),'rax');}
   }
   a.mov('rax',0);a.store(slot(64),'rax');
   const noEndian=a.unique('noEndian');a.load('rax',slot(48));a.cmp('rax',write?3:2);a.jcc('b',noEndian);
   a.load('rcx',slot(56));a.add('rcx',write?32:16);a.call('rt.toBoolean');a.store(slot(64),'rax');a.label(noEndian);
   a.load('rdx',slot(88));a.load('r10',{base:'rdx',disp:DataViewLayout.buffer});a.load('r10',{base:'r10',disp:ArrayBufferLayout.detached});a.test('r10','r10');failIf(a,'ne','rt.throwTypeError');
   a.load('rax',{base:'rdx',disp:DataViewLayout.byteLength});a.cmp('rax',width);failIf(a,'b','rt.throwRangeError');
   a.sub('rax',width);a.load('r10',slot(72));a.cmp('r10','rax');failIf(a,'a','rt.throwRangeError');
   a.load('rax',{base:'rdx',disp:DataViewLayout.byteOffset});a.add('rax','r10');
   a.load('rdx',{base:'rdx',disp:DataViewLayout.buffer});a.load('rdx',{base:'rdx',disp:ArrayBufferLayout.bytes});a.add('rdx','rax');
   const little=a.unique('little'),finished=a.unique('finished');a.load('rax',slot(64));a.test('rax','rax');a.jcc('ne',little);
   if(write){for(let i=0;i<width;i++){a.load('rax',slot(128));a.shr('rax',bits-8*(i+1));a.and('rax',255);a.store({base:'rdx',disp:i},'rax',8);}}
   else{a.mov('rax',0);for(let i=0;i<width;i++){a.shl('rax',8);a.load('r10',{base:'rdx',disp:i},8);a.or('rax','r10');}}
   a.jmp(finished);a.label(little);
   if(write){for(let i=0;i<width;i++){a.load('rax',slot(128));if(i)a.shr('rax',8*i);a.and('rax',255);a.store({base:'rdx',disp:i},'rax',8);}}
   else{a.mov('rax',0);for(let i=width-1;i>=0;i--){a.shl('rax',8);a.load('r10',{base:'rdx',disp:i},8);a.or('rax','r10');}}
   a.label(finished);
   a.load('rcx',slot(40));if(write){a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');}
   else{if(floating){a.movqToXmm('xmm0','rax');if(width===4)a.cvtss2sd('xmm0','xmm0');}
    else{if(signed){a.shl('rax',64-bits);a.sar('rax',64-bits);}a.cvtsi2sd('xmm0','rax');}
    a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');}
  });
 }
 for(const name of bigintMethods){
  const write=name.startsWith('set'),signed=name.includes('BigInt64'),symbol='rt.dataView'+name.charAt(0).toUpperCase()+name.slice(1)+'.fn';
  prependFunctionBuiltin(b,symbol,name,write?2:1,'rt.dataviewPrototype');
  rootedFn(b,symbol+'.code',168,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:3}],(a,frame)=>{
   a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
   a.load('rdx',slot(frame+40));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(80+n),'rax');}
   a.load('rax',slot(80));a.cmp('rax',5);failIf(a,'ne','rt.throwTypeError');a.load('rax',slot(88));a.load('rax',{base:'rax',disp:O.kind});a.cmp('rax',DataViewKind);failIf(a,'ne','rt.throwTypeError');
   a.mov('rax',3);a.store(slot(96),'rax');a.mov('rax',0);a.store(slot(104),'rax');const index=a.unique('index');a.load('rax',slot(48));a.test('rax','rax');a.jcc('e',index);a.lea('rcx',slot(96));a.load('rdx',slot(56));a.call('rt.toNumber');a.label(index);
   a.movsd('xmm0',slot(104));a.ucomisd('xmm0','xmm0');const zero=a.unique('zero'),ready=a.unique('ready');a.jcc('p',zero);a.mov('rax',-1);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'be','rt.throwRangeError');a.mov('rax',0x7fffffff);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'a','rt.throwRangeError');a.cvttsd2si('rax','xmm0');a.jmp(ready);a.label(zero);a.mov('rax',0);a.label(ready);a.store(slot(72),'rax');
   if(write){const missing=a.unique('missing'),convert=a.unique('convert');a.load('rax',slot(48));a.cmp('rax',2);a.jcc('b',missing);a.load('rdx',slot(56));a.add('rdx',16);a.jmp(convert);a.label(missing);a.lea('rdx',{rip:'rt.undefinedValue'});a.label(convert);a.call('rt.bigintToUint64');a.store(slot(128),'rax');}
   a.mov('rax',0);a.store(slot(64),'rax');const noEndian=a.unique('noEndian');a.load('rax',slot(48));a.cmp('rax',write?3:2);a.jcc('b',noEndian);a.load('rcx',slot(56));a.add('rcx',write?32:16);a.call('rt.toBoolean');a.store(slot(64),'rax');a.label(noEndian);
   a.load('rdx',slot(88));a.load('r10',{base:'rdx',disp:DataViewLayout.buffer});a.load('r10',{base:'r10',disp:ArrayBufferLayout.detached});a.test('r10','r10');failIf(a,'ne','rt.throwTypeError');a.load('rax',{base:'rdx',disp:DataViewLayout.byteLength});a.cmp('rax',8);failIf(a,'b','rt.throwRangeError');a.sub('rax',8);a.load('r10',slot(72));a.cmp('r10','rax');failIf(a,'a','rt.throwRangeError');a.load('rax',{base:'rdx',disp:DataViewLayout.byteOffset});a.add('rax','r10');a.load('rdx',{base:'rdx',disp:DataViewLayout.buffer});a.load('rdx',{base:'rdx',disp:ArrayBufferLayout.bytes});a.add('rdx','rax');
   const little=a.unique('little'),finish=a.unique('finish');a.load('rax',slot(64));a.test('rax','rax');a.jcc('ne',little);
   if(write){for(let i=0;i<8;i++){a.load('rax',slot(128));a.shr('rax',56-8*i);a.and('rax',255);a.store({base:'rdx',disp:i},'rax',8);}}
   else{a.mov('rax',0);for(let i=0;i<8;i++){a.shl('rax',8);a.load('r10',{base:'rdx',disp:i},8);a.or('rax','r10');}}a.jmp(finish);a.label(little);
   if(write){for(let i=0;i<8;i++){a.load('rax',slot(128));if(i)a.shr('rax',8*i);a.and('rax',255);a.store({base:'rdx',disp:i},'rax',8);}}
   else{a.mov('rax',0);for(let i=7;i>=0;i--){a.shl('rax',8);a.load('r10',{base:'rdx',disp:i},8);a.or('rax','r10');}}a.label(finish);
   a.load('rcx',slot(40));if(write){a.mov('rax',0);a.store({base:'rcx'},'rax');a.store({base:'rcx',disp:8},'rax');}else{a.mov('rdx','rax');a.mov('r8',signed?1:0);a.call('rt.uint64ToBigInt');}
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
  a.load('r10',{base:'r8',disp:8});a.load('rax',{base:'r10',disp:O.kind});a.cmp('rax',ArrayBufferKind);const accepted=a.unique('accepted');a.jcc('e',accepted);a.cmp('rax',SharedArrayBufferKind);failIf(a,'ne','rt.throwTypeError');a.label(accepted);
  a.store(slot(64),'r10');a.mov('rax',0);a.store(slot(72),'rax');a.store(slot(80),'rax');
  const haveOffset=a.unique('haveOffset'),haveLength=a.unique('haveLength');
  a.load('rax',slot(48));a.cmp('rax',2);a.jcc('b',haveOffset);
  a.load('rax',slot(56));a.add('rax',16);a.load('rax',{base:'rax'});a.test('rax','rax');a.jcc('e',haveOffset);
  a.lea('rcx',slot(88));a.load('rdx',slot(56));a.add('rdx',16);a.call('rt.toNumber');
  a.movsd('xmm0',slot(96));a.ucomisd('xmm0','xmm0');const zero=a.unique('zero');a.jcc('p',zero);
  a.mov('rax',-1);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'be','rt.throwRangeError');
  a.mov('rax',0x7fffffff);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'a','rt.throwRangeError');
  a.cvttsd2si('rax','xmm0');a.store(slot(72),'rax');a.label(zero);
  a.label(haveOffset);a.load('rax',slot(64));a.load('r10',{base:'rax',disp:ArrayBufferLayout.detached});a.test('r10','r10');failIf(a,'ne','rt.throwTypeError');a.load('rax',{base:'rax',disp:ArrayBufferLayout.byteLength});a.load('r10',slot(72));a.cmp('r10','rax');failIf(a,'a','rt.throwRangeError');a.sub('rax','r10');a.store(slot(80),'rax');
  a.load('rax',slot(48));a.cmp('rax',3);a.jcc('b',haveLength);
  a.load('rax',slot(56));a.add('rax',32);a.load('rax',{base:'rax'});a.test('rax','rax');a.jcc('e',haveLength);
  a.lea('rcx',slot(88));a.load('rdx',slot(56));a.add('rdx',32);a.call('rt.toNumber');
  a.movsd('xmm0',slot(96));a.ucomisd('xmm0','xmm0');const lengthNumber=a.unique('lengthNumber');a.jcc('np',lengthNumber);a.mov('rax',0);a.store(slot(80),'rax');a.jmp(haveLength);a.label(lengthNumber);
  a.mov('rax',-1);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'be','rt.throwRangeError');
  a.mov('rax',0x7fffffff);a.cvtsi2sd('xmm1','rax');a.ucomisd('xmm0','xmm1');failIf(a,'a','rt.throwRangeError');
  a.cvttsd2si('rax','xmm0');a.load('r10',slot(80));a.cmp('rax','r10');failIf(a,'a','rt.throwRangeError');a.store(slot(80),'rax');
  a.label(haveLength);
  a.load('r10',slot(64));a.load('r10',{base:'r10',disp:ArrayBufferLayout.detached});a.test('r10','r10');failIf(a,'ne','rt.throwTypeError');
  a.mov('rcx',DataViewLayout.size);a.call('rt.alloc');
  a.mov('r10',HeapKind.object);a.store({base:'rax',disp:H.kind-H.size},'r10');
  a.mov('r10',DataViewKind);a.store({base:'rax',disp:O.kind},'r10');a.mov('r10',0);
  for(const offset of [O.properties,O.length,O.stringifying,O.flags])a.store({base:'rax',disp:offset},'r10');
  selectNativeConstructPrototype(a,frame,'rt.dataviewPrototype');a.store({base:'rax',disp:O.prototype},'r10');
  a.load('r10',slot(64));a.store({base:'rax',disp:DataViewLayout.buffer},'r10');
  a.load('r10',slot(72));a.store({base:'rax',disp:DataViewLayout.byteOffset},'r10');
  a.load('r10',slot(80));a.store({base:'rax',disp:DataViewLayout.byteLength},'r10');
  a.load('rcx',slot(40));a.mov('r10',5);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
 });
}
