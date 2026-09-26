import {RuntimeBuilder,slot} from './abi.js';
import {rootedFn} from './root-scope.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {prependFunctionBuiltin,builtinPropertyRoots} from './function-builtin.js';
import {stringLiteral} from './value.js';

export const mathRoots=['rt.Math','rt.Math.pow.fn'];
const mathConstants=[['E',Math.E],['LN10',Math.LN10],['LN2',Math.LN2],['LOG10E',Math.LOG10E],['LOG2E',Math.LOG2E],['PI',Math.PI],['SQRT1_2',Math.SQRT1_2],['SQRT2',Math.SQRT2]] as const;
export const mathPropertyRoots=['rt.globalObject.Math','rt.Math.@@toStringTag',...mathConstants.map(([name])=>'rt.Math.'+name),...builtinPropertyRoots('rt.Math.pow.fn','pow','rt.Math')];

export function emitMath(b:RuntimeBuilder):void {
 b.bundle.fragments.push({name:'rt.Math',section:'.data',alignment:8,bytes:new Uint8Array(O.size),symbols:{},fixups:[
  {offset:O.prototype,kind:'va64',target:'rt.objectPrototype',addend:0},
 ]});
 prependFunctionBuiltin(b,'rt.Math.pow.fn','pow',2,'rt.Math');
 b.bundle.fragments.push(stringLiteral('rt.str.Math','Math'));
 const math=b.bundle.fragments.find(f=>f.name==='rt.Math')!;
 const mathHead=math.fixups.find(f=>f.offset===O.properties)!;
 for(const [name,value] of mathConstants){
  const node='rt.Math.'+name,key=node+'.key';b.bundle.fragments.push(stringLiteral(key,name));
  const bytes=new Uint8Array(P.size);bytes[P.value]=3;new DataView(bytes.buffer).setFloat64(P.value+8,value,true);
  b.bundle.fragments.push({name:node,section:'.data',alignment:8,bytes,symbols:{},fixups:[
   {offset:P.next,kind:'va64',target:mathHead.target,addend:0},
   {offset:P.key,kind:'va64',target:key,addend:0},
  ]});mathHead.target=node;
 }
 const tag=new Uint8Array(P.size);tag[P.value]=4;tag[P.attributes]=A.configurable;
 b.bundle.fragments.push({name:'rt.Math.@@toStringTag',section:'.data',alignment:8,bytes:tag,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:mathHead.target,addend:0},
  {offset:P.key,kind:'va64',target:'rt.Symbol.toStringTag.value',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.str.Math',addend:0},
 ]});mathHead.target='rt.Math.@@toStringTag';
 const global=b.bundle.fragments.find(f=>f.name==='rt.globalObject')!;
 const head=global.fixups.find(f=>f.offset===O.properties)!;
 const property=new Uint8Array(P.size);property[P.value]=5;property[P.attributes]=A.writable|A.configurable;
 b.bundle.fragments.push({name:'rt.globalObject.Math',section:'.data',alignment:8,bytes:property,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:head.target,addend:0},
  {offset:P.key,kind:'va64',target:'rt.str.Math',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.Math',addend:0},
 ]});head.target='rt.globalObject.Math';
 rootedFn(b,'rt.Math.pow.fn.code',120,[{kind:'output',register:'rcx'},{kind:'range',register:'r8',count:'rdx'},{kind:'locals',offset:64,count:2}],a=>{
  a.store(slot(40),'rcx');a.store(slot(48),'rdx');a.store(slot(56),'r8');
  a.mov('rax',0);a.store(slot(64),'rax');a.store(slot(72),'rax');a.store(slot(80),'rax');a.store(slot(88),'rax');
  const first=a.unique('first'),second=a.unique('second');a.test('rdx','rdx');a.jcc('e',first);a.load('rdx',slot(56));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:n});a.store(slot(64+n),'rax');}
  a.label(first);a.load('rax',slot(48));a.cmp('rax',2);a.jcc('b',second);a.load('rdx',slot(56));for(const n of [0,8]){a.load('rax',{base:'rdx',disp:16+n});a.store(slot(80+n),'rax');}
  a.label(second);a.lea('rcx',slot(64));a.lea('rdx',slot(64));a.call('rt.toNumber');a.lea('rcx',slot(80));a.lea('rdx',slot(80));a.call('rt.toNumber');
  a.movsd('xmm0',slot(72));a.movsd('xmm1',slot(88));a.call('rt.numberPow');a.load('rcx',slot(40));a.mov('rax',3);a.store({base:'rcx'},'rax');a.storesd({base:'rcx',disp:8},'xmm0');
 });
}
