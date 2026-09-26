import type {NamedFragment} from '../backend/pe/model.js';
import type {RuntimeBuilder} from './abi.js';
import {ObjectLayout as O,PropertyLayout as P} from './object-layout.js';
import {errorConstructorNames} from '../global-builtins.js';

// Static emission order is an implementation detail. Link the implemented own
// properties newest-first so ownKeys observes the intrinsic creation order.
export function orderIntrinsicProperties(b:RuntimeBuilder):void {
 const orders:Record<string,string[]>={
  'rt.Object':['length','name','prototype','getOwnPropertyDescriptor','getOwnPropertyDescriptors','getOwnPropertyNames','getOwnPropertySymbols','is','preventExtensions','seal','create','defineProperties','defineProperty','freeze','getPrototypeOf','setPrototypeOf','isExtensible','isFrozen','isSealed','keys','entries','values'],
  'rt.functionPrototype':['length','name','constructor','apply','bind','call','toString','arguments','caller','@@hasInstance'],
  'rt.objectPrototype':['constructor','hasOwnProperty','isPrototypeOf','propertyIsEnumerable','toString','valueOf','__proto__','toLocaleString'],
  'rt.arrayPrototype':['constructor','join','toString','toLocaleString','concat','flat','flatMap','sort','pop','push','shift','unshift','splice','slice','includes','indexOf','lastIndexOf','forEach','map','filter','some','every','find','findIndex','reduce','reduceRight','fill','copyWithin','reverse','keys','entries','values','@@iterator','@@unscopables'],
  'rt.Array':['length','name','prototype','from','isArray','of','@@species'],
  'rt.Number':['length','name','prototype','isFinite','isInteger','isNaN','isSafeInteger','parseFloat','parseInt','MAX_VALUE','MIN_VALUE','NaN','NEGATIVE_INFINITY','POSITIVE_INFINITY','EPSILON','MAX_SAFE_INTEGER','MIN_SAFE_INTEGER'],
  'rt.String':['length','name','prototype','fromCharCode','fromCodePoint','raw'],
  'rt.Math':['E','LN10','LN2','LOG10E','LOG2E','PI','SQRT1_2','SQRT2','abs','acos','acosh','asin','asinh','atan','atanh','atan2','cbrt','ceil','clz32','cos','cosh','exp','expm1','floor','fround','hypot','imul','log','log1p','log10','log2','max','min','pow','random','round','sign','sin','sinh','sqrt','tan','tanh','trunc','@@toStringTag'],
  'rt.booleanPrototype':['constructor','toString','valueOf'],
  'rt.numberPrototype':['constructor','toString','toFixed','valueOf'],
  'rt.stringPrototype':['constructor','toString','valueOf','charAt','charCodeAt','codePointAt','concat','toLowerCase','toUpperCase','includes','indexOf','lastIndexOf','startsWith','endsWith','padStart','padEnd','repeat','slice','substring','trim','trimStart','trimEnd','trimLeft','trimRight','@@iterator'],
  'rt.symbolPrototype':['constructor','toString','valueOf','description','@@toPrimitive','@@toStringTag'],
  'rt.iteratorPrototype':['next','@@iterator'],
  'rt.Symbol':['length','name','prototype','for','keyFor',...['asyncIterator','hasInstance','isConcatSpreadable','iterator','match','matchAll','replace','search','species','split','toPrimitive','toStringTag','unscopables']],
  'rt.console':['log'],
  'rt.globalObject':['Object','Function','Array','Number','Boolean','String','Symbol',...errorConstructorNames,'Math','globalThis','undefined','NaN','Infinity','parseFloat','parseInt','isFinite','isNaN','console'],
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
   let text='';if(view.getBigUint64(0,true)===0xffffffffffffffffn)text=key.name==='rt.Symbol.iterator.value'?'@@iterator':key.name==='rt.Symbol.toStringTag.value'?'@@toStringTag':key.name==='rt.Symbol.hasInstance.value'?'@@hasInstance':key.name==='rt.Symbol.species.value'?'@@species':key.name==='rt.Symbol.unscopables.value'?'@@unscopables':'@@toPrimitive';else for(let i=8;i<key.bytes.length;i+=2)text+=String.fromCharCode(view.getUint16(i,true));
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
