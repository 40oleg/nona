import {RuntimeBuilder} from './abi.js';
import {ObjectLayout as O,PropertyLayout as P,PropertyAttributes as A} from './object-layout.js';
import {stringLiteral} from './value.js';

const names=['copyWithin','entries','fill','find','findIndex','flat','flatMap','includes','keys','values'];
export const arrayUnscopablesRoots=['rt.arrayUnscopables'];
export const arrayUnscopablesPropertyRoots=['rt.arrayPrototype.@@unscopables',...names.map(name=>'rt.arrayUnscopables.'+name)];

export function emitArrayUnscopables(b:RuntimeBuilder):void {
 const object=new Uint8Array(O.size);
 b.bundle.fragments.push({name:'rt.arrayUnscopables',section:'.data',alignment:8,bytes:object,symbols:{},fixups:[{offset:O.properties,kind:'va64',target:'rt.arrayUnscopables.'+names.at(-1),addend:0}]});
 for(let i=0;i<names.length;i++){
  const name=names[i]!;
  b.bundle.fragments.push(stringLiteral('rt.arrayUnscopables.'+name+'.key',name));
  const property=new Uint8Array(P.size);property[P.value]=2;property[P.value+8]=1;property[P.attributes]=A.ordinary;
  b.bundle.fragments.push({name:'rt.arrayUnscopables.'+name,section:'.data',alignment:8,bytes:property,symbols:{},fixups:[
   {offset:P.key,kind:'va64',target:'rt.arrayUnscopables.'+name+'.key',addend:0},
   ...(i?[{offset:P.next,kind:'va64' as const,target:'rt.arrayUnscopables.'+names[i-1],addend:0}]:[]),
  ]});
 }
 const prototype=b.bundle.fragments.find(f=>f.name==='rt.arrayPrototype')!;
 const head=prototype.fixups.find(f=>f.offset===O.properties)!;
 const property=new Uint8Array(P.size);property[P.value]=5;property[P.attributes]=A.configurable;
 b.bundle.fragments.push({name:'rt.arrayPrototype.@@unscopables',section:'.data',alignment:8,bytes:property,symbols:{},fixups:[
  {offset:P.next,kind:'va64',target:head.target,addend:0},
  {offset:P.key,kind:'va64',target:'rt.Symbol.unscopables.value',addend:0},
  {offset:P.value+8,kind:'va64',target:'rt.arrayUnscopables',addend:0},
 ]});head.target='rt.arrayPrototype.@@unscopables';
}
