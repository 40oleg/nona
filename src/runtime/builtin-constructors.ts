import {RuntimeBuilder,slot,failIf} from './abi.js';
import {HeapLayout as H,HeapKind} from './heap-layout.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {FunctionLayout as F,FunctionKind} from './functions.js';
import {stringLiteral} from './value.js';
import {nativeConstructorNames as names,errorConstructorNames} from '../global-builtins.js';
import type {Assembler} from '../backend/x64/assembler.js';
import type {Fixup} from '../backend/pe/model.js';

export const constructorRoots=names.map(name=>'rt.'+name);
const numberConstants=[['MAX_VALUE',Number.MAX_VALUE],['MIN_VALUE',Number.MIN_VALUE],['NaN',NaN],['NEGATIVE_INFINITY',-Infinity],['POSITIVE_INFINITY',Infinity],['EPSILON',Number.EPSILON],['MAX_SAFE_INTEGER',Number.MAX_SAFE_INTEGER],['MIN_SAFE_INTEGER',Number.MIN_SAFE_INTEGER]] as const;
export const constructorPropertyRoots=names.flatMap(name=>[
 ...['name','length','prototype'].map(key=>'rt.'+name+'.'+key),
 'rt.globalObject.'+name,'rt.'+name.toLowerCase()+'Prototype.constructor',
]).concat(numberConstants.map(([name])=>'rt.Number.'+name));
const pointer=(offset:number,target:string):Fixup=>({offset,kind:'va64',target,addend:0});
function copyResult(a:Assembler,offset:number):void {
 a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(offset+n));a.store({base:'rcx',disp:n},'rax');}
}

export function emitBuiltinConstructors(b:RuntimeBuilder):void {
 b.bundle.fragments.push(stringLiteral('rt.str.symbolOpen','Symbol('),stringLiteral('rt.str.symbolClose',')'));
 rootedFn(b,'rt.symbolDescriptiveString',120,[{kind:'output',register:'rcx'},{kind:'value',register:'rdx'},{kind:'locals',offset:64,count:3}],a=>{
  a.store(slot(40),'rcx');a.load('rax',{base:'rdx'});a.cmp('rax',6);failIf(a,'ne','rt.throwTypeError');
  a.load('rax',{base:'rdx',disp:8});a.load('rax',{base:'rax',disp:8});
  const hasDescription=a.unique('hasDescription');a.test('rax','rax');a.jcc('ne',hasDescription);a.lea('rax',{rip:'rt.str.empty'});a.label(hasDescription);
  a.mov('r10',4);a.store(slot(64),'r10');a.store(slot(80),'r10');a.store(slot(96),'r10');
  a.lea('r10',{rip:'rt.str.symbolOpen'});a.store(slot(72),'r10');a.store(slot(88),'rax');
  a.lea('r10',{rip:'rt.str.symbolClose'});a.store(slot(104),'r10');
  a.lea('rcx',slot(64));a.lea('rdx',slot(64));a.lea('r8',slot(80));a.call('rt.concat');
  a.load('rcx',slot(40));a.lea('rdx',slot(64));a.lea('r8',slot(96));a.call('rt.concat');
 });
 // Add native constructor objects after all intrinsic prototype headers exist.
 const globalThis=b.bundle.fragments.find(f=>f.name==='rt.globalObject.globalThis')!;
 globalThis.fixups.push(pointer(P.next,'rt.globalObject.Object'));
 for(const [index,name] of names.entries()){
  const symbol='rt.'+name,prototype='rt.'+name.toLowerCase()+'Prototype';
  b.bundle.fragments.push(stringLiteral(symbol+'.text',name),stringLiteral(symbol+'.source','function '+name+'() { [native code] }'));
  const bytes=new Uint8Array(F.size);bytes[O.kind]=FunctionKind;bytes[F.rawThis]=1;bytes[F.constructable]=1;
  b.bundle.fragments.push({name:symbol,section:'.data',alignment:8,bytes,symbols:{},fixups:[
   pointer(O.properties,symbol+'.prototype'),pointer(O.prototype,errorConstructorNames.some(n=>n===name)&&name!=='Error'?'rt.Error':'rt.functionPrototype'),pointer(F.code,symbol+'.code'),
   pointer(F.constructCode,symbol+(['Object','Boolean','Number','String','Array','Date'].includes(name)||errorConstructorNames.some(n=>n===name)?'.construct':name==='Symbol'||name==='BigInt'?'.construct':'.code')),pointer(F.sourceText,symbol+'.source'),
  ]});
  for(const [i,key] of ['prototype','name','length'].entries()){
   const data=new Uint8Array(P.size);data[P.value]=key==='name'?4:key==='length'?3:5;data[P.attributes]=key==='prototype'?0:A.configurable;
   const fixups=[pointer(P.key,'rt.str.'+key)];
   if(i<2)fixups.push(pointer(P.next,symbol+'.'+['name','length'][i]));
   if(key==='length')new DataView(data.buffer).setFloat64(P.value+8,name==='Symbol'?0:name==='Date'?7:1,true);
   else fixups.push(pointer(P.value+8,key==='name'?symbol+'.text':prototype));
   b.bundle.fragments.push({name:symbol+'.'+key,section:'.data',alignment:8,bytes:data,symbols:{},fixups});
  }
  const global=new Uint8Array(P.size);global[P.value]=5;global[P.attributes]=A.writable|A.configurable;
  b.bundle.fragments.push({name:'rt.globalObject.'+name,section:'.data',alignment:8,bytes:global,symbols:{},fixups:[
   pointer(P.key,symbol+'.text'),pointer(P.value+8,symbol),...(index+1<names.length?[pointer(P.next,'rt.globalObject.'+names[index+1])]:[]),
  ]});
  const header=b.bundle.fragments.find(f=>f.name===prototype)!;
  const head=header.fixups.find(f=>f.offset===O.properties)!;
  const constructor=new Uint8Array(P.size);constructor[P.value]=5;constructor[P.attributes]=A.writable|A.configurable;
  b.bundle.fragments.push({name:prototype+'.constructor',section:'.data',alignment:8,bytes:constructor,symbols:{},fixups:[
   pointer(P.key,'rt.str.constructor'),pointer(P.value+8,symbol),pointer(P.next,head.target),
  ]});
  head.target=prototype+'.constructor';
 }
 const numberHeader=b.bundle.fragments.find(f=>f.name==='rt.Number')!;
 const numberHead=numberHeader.fixups.find(f=>f.offset===O.properties)!;
 for(const [name,value] of numberConstants){
  const node='rt.Number.'+name,key=node+'.key';b.bundle.fragments.push(stringLiteral(key,name));
  const data=new Uint8Array(P.size);data[P.value]=3;new DataView(data.buffer).setFloat64(P.value+8,value,true);
  b.bundle.fragments.push({name:node,section:'.data',alignment:8,bytes:data,symbols:{},fixups:[
   pointer(P.next,numberHead.target),pointer(P.key,key),
  ]});numberHead.target=node;
 }
 // Function exists for reflection/prototype identity. Dynamic compilation is
 // deliberately excluded from this compiler's scope, including via constructor.
 b.fn('rt.Function.code',40,a=>a.call('rt.fail'));
 b.fn('rt.Symbol.construct',40,a=>a.call('rt.throwTypeError'));
 rootedFn(b,'rt.Symbol.code',88,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:1}],a=>{
  a.store(slot(40),'rcx');a.mov('rax',0);a.store(slot(72),'rax');
  const allocate=a.unique('allocate');a.test('rdx','rdx');a.jcc('e',allocate);a.load('rax',{base:'r8'});a.test('rax','rax');a.jcc('e',allocate);
  a.lea('rcx',slot(64));a.mov('rdx','r8');a.call('rt.toString');
  a.label(allocate);a.mov('rcx',16);a.call('rt.alloc');
  a.mov('r10',-1);a.store({base:'rax'},'r10');a.load('r10',slot(72));a.store({base:'rax',disp:8},'r10');
  a.mov('r10',HeapKind.symbol);a.store({base:'rax',disp:H.kind-H.size},'r10');
  a.load('rcx',slot(40));a.mov('r10',6);a.store({base:'rcx'},'r10');a.store({base:'rcx',disp:8},'rax');
 });
 for(const construct of [false,true])rootedFn(b,construct?'rt.Object.construct':'rt.Object.code',72,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'}],(a,frame)=>{
  const ordinary=a.unique('ordinaryObjectConstruction'),finished=a.unique('objectConstructionFinished');
  if(construct){
   a.load('rax',slot(frame+48));a.test('rax','rax');a.jcc('e',ordinary);
   a.load('rdx',slot(frame+40));for(const offset of [0,8]){a.load('rax',{base:'rdx',disp:offset});a.store({base:'rcx',disp:offset},'rax');}
   a.jmp(finished);a.label(ordinary);
  }
  const fresh=a.unique('fresh'),done=a.unique('done');a.test('rdx','rdx');a.jcc('e',fresh);
  a.load('rax',{base:'r8'});a.cmp('rax',1);a.jcc('be',fresh);a.mov('rdx','r8');a.call('rt.toObject');a.jmp(done);
  a.label(fresh);a.mov('rdx',0);a.mov('r8',0);a.call('rt.newObject');a.label(done);if(construct)a.label(finished);
 });
 for(const [name,tag] of [['Boolean',2],['Number',3],['String',4]] as const)for(const construct of [false,true]){
  rootedFn(b,'rt.'+name+(construct?'.construct':'.code'),88,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:1}],(a,frame)=>{
   a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
   const convert=a.unique('convert'),ready=a.unique('ready');a.test('rdx','rdx');a.jcc('ne',convert);
   a.mov('rax',tag);a.store(slot(64),'rax');if(name==='String')a.lea('rax',{rip:'rt.str.empty'});else a.mov('rax',0);a.store(slot(72),'rax');a.jmp(ready);
   a.label(convert);
   if(name==='Boolean'){
    a.mov('rcx','r8');a.call('rt.toBoolean');a.store(slot(72),'rax');a.mov('rax',2);a.store(slot(64),'rax');
   }else{a.lea('rcx',slot(64));a.mov('rdx','r8');if(name==='String'&&!construct){
    const plain=a.unique('plain'),converted=a.unique('converted');a.load('rax',{base:'r8'});a.cmp('rax',6);a.jcc('ne',plain);a.call('rt.symbolDescriptiveString');a.jmp(converted);a.label(plain);a.call('rt.toString');a.label(converted);
   }else if(name==='Number'){
    const ordinary=a.unique('ordinary'),converted=a.unique('converted');a.load('rax',{base:'r8'});a.cmp('rax',7);a.jcc('ne',ordinary);a.load('rcx',{base:'r8',disp:8});a.call('rt.parseNumber');a.mov('rax',3);a.store(slot(64),'rax');a.storesd(slot(72),'xmm0');a.jmp(converted);a.label(ordinary);a.call('rt.toNumber');a.label(converted);
   }else a.call('rt.toString');}
   a.label(ready);
   if(construct){
    a.load('rcx',slot(40));a.lea('rdx',slot(64));a.call('rt.boxReceiver');
    a.load('r10',slot(frame+40));a.load('r10',{base:'r10',disp:8});a.load('r10',{base:'r10',disp:O.prototype});
    a.load('rax',slot(40));a.load('rax',{base:'rax',disp:8});a.store({base:'rax',disp:O.prototype},'r10');
   }else copyResult(a,64);
  });
 }
 for(const construct of [false,true])rootedFn(b,construct?'rt.Array.construct':'rt.Array.code',136,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:3}],(a,frame)=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.lea('rcx',slot(80));a.mov('rdx',1);a.mov('r8',0);a.call('rt.newObject');
  const elements=a.unique('elements'),loop=a.unique('loop'),done=a.unique('done');
  a.load('rax',slot(48));a.cmp('rax',1);a.jcc('ne',elements);
  a.load('rdx',slot(56));a.load('rax',{base:'rdx'});a.cmp('rax',3);a.jcc('ne',elements);
  a.load('rcx',slot(88));a.call('rt.setArrayLength');a.jmp(done);
  a.label(elements);a.load('rax',slot(48));a.mov('r10',0xffffffff);a.cmp('rax','r10');failIf(a,'a','rt.throwRangeError');
  a.mov('rax',0);a.store(slot(64),'rax');
  a.label(loop);a.load('rax',slot(64));a.load('r10',slot(48));a.cmp('rax','r10');a.jcc('ae',done);
  a.cvtsi2sd('xmm0','rax');a.storesd(slot(104),'xmm0');a.mov('rax',3);a.store(slot(96),'rax');
  a.lea('rcx',slot(112));a.lea('rdx',slot(96));a.call('rt.toString');
  a.load('r8',slot(64));a.shl('r8',4);a.load('rax',slot(56));a.add('r8','rax');
  a.lea('rcx',slot(80));a.lea('rdx',slot(112));a.mov('r9',1);a.call('rt.setProperty');
  a.load('rax',slot(64));a.add('rax',1);a.store(slot(64),'rax');a.jmp(loop);
  a.label(done);
  if(construct){
   // The prepared receiver carries the prototype selected by new.target.
   a.load('r10',slot(frame+40));a.load('r10',{base:'r10',disp:8});a.load('r10',{base:'r10',disp:O.prototype});
   a.load('rax',slot(88));a.store({base:'rax',disp:O.prototype},'r10');
  }
  copyResult(a,80);
 });
}
