import {RuntimeBuilder,slot,failIf} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {FunctionLayout as F,FunctionKind} from './functions.js';
import {stringLiteral} from './value.js';
import {nativeConstructorNames as names,errorConstructorNames} from '../global-builtins.js';
import type {Assembler} from '../backend/x64/assembler.js';
import type {Fixup} from '../backend/pe/model.js';

export const constructorRoots=names.map(name=>'rt.'+name);
export const constructorPropertyRoots=names.flatMap(name=>[
 ...['name','length','prototype'].map(key=>'rt.'+name+'.'+key),
 'rt.globalObject.'+name,'rt.'+name.toLowerCase()+'Prototype.constructor',
]);
const pointer=(offset:number,target:string):Fixup=>({offset,kind:'va64',target,addend:0});
function copyResult(a:Assembler,offset:number):void {
 a.load('rcx',slot(40));for(const n of [0,8]){a.load('rax',slot(offset+n));a.store({base:'rcx',disp:n},'rax');}
}

export function emitBuiltinConstructors(b:RuntimeBuilder):void {
 // Add native constructor objects after all intrinsic prototype headers exist.
 const globalThis=b.bundle.fragments.find(f=>f.name==='rt.globalObject.globalThis')!;
 globalThis.fixups.push(pointer(P.next,'rt.globalObject.Object'));
 for(const [index,name] of names.entries()){
  const symbol='rt.'+name,prototype='rt.'+name.toLowerCase()+'Prototype';
  b.bundle.fragments.push(stringLiteral(symbol+'.text',name),stringLiteral(symbol+'.source','function '+name+'() { [native code] }'));
  const bytes=new Uint8Array(F.size);bytes[O.kind]=FunctionKind;bytes[F.rawThis]=1;bytes[F.constructable]=1;
  b.bundle.fragments.push({name:symbol,section:'.data',alignment:8,bytes,symbols:{},fixups:[
   pointer(O.properties,symbol+'.prototype'),pointer(O.prototype,errorConstructorNames.some(n=>n===name)&&name!=='Error'?'rt.Error':'rt.functionPrototype'),pointer(F.code,symbol+'.code'),
   pointer(F.constructCode,symbol+(['Boolean','Number','String'].includes(name)?'.construct':'.code')),pointer(F.sourceText,symbol+'.source'),
  ]});
  for(const [i,key] of ['prototype','name','length'].entries()){
   const data=new Uint8Array(P.size);data[P.value]=key==='name'?4:key==='length'?3:5;data[P.attributes]=key==='prototype'?0:A.configurable;
   const fixups=[pointer(P.key,'rt.str.'+key)];
   if(i<2)fixups.push(pointer(P.next,symbol+'.'+['name','length'][i]));
   if(key==='length')new DataView(data.buffer).setFloat64(P.value+8,1,true);
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
 // Function exists for reflection/prototype identity. Dynamic compilation is
 // deliberately excluded from this compiler's scope, including via constructor.
 b.fn('rt.Function.code',40,a=>a.call('rt.fail'));
 rootedFn(b,'rt.Object.code',72,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'}],a=>{
  const fresh=a.unique('fresh'),done=a.unique('done');a.test('rdx','rdx');a.jcc('e',fresh);
  a.load('rax',{base:'r8'});a.cmp('rax',1);a.jcc('be',fresh);a.mov('rdx','r8');a.call('rt.toObject');a.jmp(done);
  a.label(fresh);a.mov('rdx',0);a.mov('r8',0);a.call('rt.newObject');a.label(done);
 });
 for(const [name,tag] of [['Boolean',2],['Number',3],['String',4]] as const)for(const construct of [false,true]){
  rootedFn(b,'rt.'+name+(construct?'.construct':'.code'),88,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:1}],a=>{
   a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
   const convert=a.unique('convert'),ready=a.unique('ready');a.test('rdx','rdx');a.jcc('ne',convert);
   a.mov('rax',tag);a.store(slot(64),'rax');if(name==='String')a.lea('rax',{rip:'rt.str.empty'});else a.mov('rax',0);a.store(slot(72),'rax');a.jmp(ready);
   a.label(convert);
   if(name==='Boolean'){
    a.mov('rcx','r8');a.call('rt.toBoolean');a.store(slot(72),'rax');a.mov('rax',2);a.store(slot(64),'rax');
   }else{a.lea('rcx',slot(64));a.mov('rdx','r8');a.call(name==='Number'?'rt.toNumber':'rt.toString');}
   a.label(ready);
   if(construct){a.load('rcx',slot(40));a.lea('rdx',slot(64));a.call('rt.boxReceiver');}else copyResult(a,64);
  });
 }
 rootedFn(b,'rt.Array.code',136,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:80,count:3}],a=>{
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
  a.label(done);copyResult(a,80);
 });
}
