import {RuntimeBuilder} from './abi.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A,ObjectFlags as OF} from './object-layout.js';
import {emitNativeFunction} from './function-builtin.js';
import {stringLiteral} from './value.js';
export const strictRoots=['rt.strictThrower'];
export const strictPropertyRoots=['rt.strictThrower.name','rt.strictThrower.length','rt.functionPrototype.arguments','rt.functionPrototype.caller'];
export function emitStrict(b:RuntimeBuilder):void {
 emitNativeFunction(b,'rt.strictThrower','',0);
 const functionObject=b.bundle.fragments.find(f=>f.name==='rt.strictThrower')!;
 functionObject.bytes[O.flags]=OF.nonExtensible;
 for(const name of ['name','length'])b.bundle.fragments.find(f=>f.name==='rt.strictThrower.'+name)!.bytes[P.attributes]=0;
 b.fn('rt.strictThrower.code',40,a=>a.call('rt.throwTypeError'));
 const owner=b.bundle.fragments.find(f=>f.name==='rt.functionPrototype')!,head=owner.fixups.find(f=>f.offset===O.properties)!;
 for(const key of ['arguments','caller']){
  const symbol='rt.functionPrototype.'+key;
  b.bundle.fragments.push(stringLiteral(symbol+'.key',key));
  const bytes=new Uint8Array(P.size);bytes[P.attributes]=A.accessor|A.configurable;bytes[P.getter]=5;bytes[P.setter]=5;
  b.bundle.fragments.push({name:symbol,section:'.data',alignment:8,bytes,symbols:{},fixups:[
   {offset:P.next,kind:'va64',target:head.target,addend:0},
   {offset:P.key,kind:'va64',target:symbol+'.key',addend:0},
   {offset:P.getter+8,kind:'va64',target:'rt.strictThrower',addend:0},
   {offset:P.setter+8,kind:'va64',target:'rt.strictThrower',addend:0},
  ]});head.target=symbol;
 }
}
