import {RuntimeBuilder} from './abi.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {FunctionKind,FunctionLayout as F} from './functions.js';
import {stringLiteral} from './value.js';

export const builtinPropertyRoots=(symbol:string,method:string,owner='rt.functionPrototype')=>[owner+'.'+method,symbol+'.name',symbol+'.length'];
/** Install another intrinsic method without disconnecting existing properties. */
export function prependFunctionBuiltin(b:RuntimeBuilder,symbol:string,method:string,length:number,owner:string):void {
 const header=b.bundle.fragments.find(f=>f.name===owner);
 if(!header)throw new Error('Missing builtin owner '+owner);
 const head=header.fixups.find(f=>f.offset===O.properties);
 emitFunctionBuiltin(b,symbol,method,length,head?.target,owner);
 if(head)head.target=owner+'.'+method;
 else header.fixups.push({offset:O.properties,kind:'va64',target:owner+'.'+method,addend:0});
}
/** Static nonconstructable native function and its configurable prototype property. */
export function emitFunctionBuiltin(b:RuntimeBuilder,symbol:string,method:string,length:number,nextProperty:string|undefined,owner='rt.functionPrototype'):void {
 const key=owner==='rt.functionPrototype'?'rt.str.'+method:symbol+'.key';
 emitNativeFunction(b,symbol,method,length,key);
 const property=new Uint8Array(P.size);property[P.value]=5;property[P.attributes]=A.writable|A.configurable;
 b.bundle.fragments.push({name:owner+'.'+method,section:'.data',alignment:8,bytes:property,symbols:{},fixups:[
  ...(nextProperty?[{offset:P.next,kind:'va64' as const,target:nextProperty,addend:0}]:[]),
  {offset:P.key,kind:'va64',target:key,addend:0},
  {offset:P.value+8,kind:'va64',target:symbol,addend:0},
 ]});
}
/** Intrinsic callable without an owner data property, also used by accessors. */
export function emitNativeFunction(b:RuntimeBuilder,symbol:string,method:string,length:number,key=symbol+'.key'):void {
 b.bundle.fragments.push(stringLiteral(key,method));
 b.bundle.fragments.push(stringLiteral(symbol+'.source','function '+method+'() { [native code] }'));
 const callable=new Uint8Array(F.size);callable[O.kind]=FunctionKind;callable[F.rawThis]=1;
 b.bundle.fragments.push({name:symbol,section:'.data',alignment:8,bytes:callable,symbols:{},fixups:[
  {offset:O.properties,kind:'va64',target:symbol+'.name',addend:0},
  {offset:O.prototype,kind:'va64',target:'rt.functionPrototype',addend:0},
  {offset:F.code,kind:'va64',target:symbol+'.code',addend:0},
  {offset:F.sourceText,kind:'va64',target:symbol+'.source',addend:0},
 ]});
 for(const name of ['name','length']){
  const bytes=new Uint8Array(P.size);bytes[P.value]=name==='name'?4:3;bytes[P.attributes]=A.configurable;
  const fixups:{offset:number;kind:'va64';target:string;addend:number}[]=[{offset:P.key,kind:'va64',target:'rt.str.'+name,addend:0}];
  if(name==='name')fixups.push({offset:P.next,kind:'va64',target:symbol+'.length',addend:0},{offset:P.value+8,kind:'va64',target:key,addend:0});
  else new DataView(bytes.buffer).setFloat64(P.value+8,length,true);
  b.bundle.fragments.push({name:symbol+'.'+name,section:'.data',alignment:8,bytes,symbols:{},fixups});
 }
}
