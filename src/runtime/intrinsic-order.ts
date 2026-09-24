import type {NamedFragment} from '../backend/pe/model.js';
import type {RuntimeBuilder} from './abi.js';
import {ObjectLayout as O,PropertyLayout as P} from './object-layout.js';
import {errorConstructorNames} from '../global-builtins.js';

// Static emission order is an implementation detail. Link the implemented own
// properties newest-first so ownKeys observes the intrinsic creation order.
export function orderIntrinsicProperties(b:RuntimeBuilder):void {
 const orders:Record<string,string[]>={
  'rt.Object':['length','name','prototype','getOwnPropertyDescriptor','getOwnPropertyDescriptors','getOwnPropertyNames','is','preventExtensions','seal','create','defineProperties','defineProperty','freeze','getPrototypeOf','setPrototypeOf','isExtensible','isFrozen','isSealed','keys','entries','values'],
  'rt.functionPrototype':['length','name','constructor','apply','bind','call','toString','arguments','caller'],
  'rt.objectPrototype':['constructor','hasOwnProperty','isPrototypeOf','propertyIsEnumerable','toString','valueOf','__proto__','toLocaleString'],
  'rt.arrayPrototype':['constructor','join','toString'],
  'rt.booleanPrototype':['constructor','toString','valueOf'],
  'rt.numberPrototype':['constructor','toString','valueOf'],
  'rt.stringPrototype':['constructor','toString','valueOf'],
  'rt.console':['log'],
  'rt.globalObject':['Object','Function','Array','Number','Boolean','String',...errorConstructorNames,'globalThis','undefined','NaN','Infinity','console'],
  ...Object.fromEntries(errorConstructorNames.map(name=>['rt.'+name.toLowerCase()+'Prototype',['constructor','name','message',...(name==='Error'?['toString']:[])]])),
 };
 const fragments=new Map(b.bundle.fragments.map(f=>[f.name,f]));
 for(const [owner,order] of Object.entries(orders)){
  const head=fragments.get(owner)!.fixups.find(f=>f.offset===O.properties)!;
  const nodes:{node:NamedFragment;rank:number}[]=[];let name:string|undefined=head.target;
  while(name){
   const node:NamedFragment=fragments.get(name)!;
   const key=fragments.get(node.fixups.find(f=>f.offset===P.key)!.target)!;
   const view=new DataView(key.bytes.buffer,key.bytes.byteOffset,key.bytes.byteLength);
   let text='';for(let i=8;i<key.bytes.length;i+=2)text+=String.fromCharCode(view.getUint16(i,true));
   const rank=order.indexOf(text);
   if(rank<0)throw new Error('Missing intrinsic property order: '+owner+'.'+text);
   nodes.push({node,rank});name=node.fixups.find(f=>f.offset===P.next)?.target;
  }
  nodes.sort((a,b)=>b.rank-a.rank);head.target=nodes[0]!.node.name;
  for(let i=0;i<nodes.length;i++){
   const node=nodes[i]!.node;node.fixups=node.fixups.filter(f=>f.offset!==P.next);
   if(i+1<nodes.length)node.fixups.push({offset:P.next,kind:'va64',target:nodes[i+1]!.node.name,addend:0});
  }
 }
}
