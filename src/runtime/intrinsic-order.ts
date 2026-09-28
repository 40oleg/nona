import type {NamedFragment} from '../backend/pe/model.js';
import type {RuntimeBuilder} from './abi.js';
import {ObjectLayout as O,PropertyLayout as P} from './object-layout.js';
import {errorConstructorNames} from '../global-builtins.js';

// Static emission order is an implementation detail. Link the implemented own
// properties newest-first so ownKeys observes the intrinsic creation order.
export function orderIntrinsicProperties(b:RuntimeBuilder):void {
 const orders:Record<string,string[]>={
  'rt.Object':['length','name','prototype','assign','getOwnPropertyDescriptor','getOwnPropertyDescriptors','getOwnPropertyNames','getOwnPropertySymbols','is','preventExtensions','seal','create','defineProperties','defineProperty','freeze','getPrototypeOf','setPrototypeOf','isExtensible','isFrozen','isSealed','keys','entries','values','fromEntries'],
  'rt.functionPrototype':['length','name','constructor','apply','bind','call','toString','arguments','caller','@@hasInstance','__nonaMarkNativeInternal','__nonaReflectConstructInternal','__nonaProxyCreateInternal','__nonaProxyRevokeInternal','__nonaProxyPreventInternal','__nonaProxySetPrototypeInternal','__nonaReflectGetInternal','__nonaReflectSetInternal','__nonaReflectOwnKeysInternal'],
  'rt.objectPrototype':['constructor','hasOwnProperty','isPrototypeOf','propertyIsEnumerable','toString','valueOf','__proto__','toLocaleString'],
  'rt.arrayPrototype':['constructor','join','toString','toLocaleString','concat','flat','flatMap','sort','pop','push','shift','unshift','splice','slice','includes','indexOf','lastIndexOf','forEach','map','filter','some','every','find','findIndex','reduce','reduceRight','fill','copyWithin','reverse','keys','entries','values','@@iterator','@@unscopables'],
  'rt.Array':['length','name','prototype','from','isArray','of','@@species'],
  'rt.Number':['length','name','prototype','isFinite','isInteger','isNaN','isSafeInteger','parseFloat','parseInt','MAX_VALUE','MIN_VALUE','NaN','NEGATIVE_INFINITY','POSITIVE_INFINITY','EPSILON','MAX_SAFE_INTEGER','MIN_SAFE_INTEGER'],
  'rt.BigInt':['length','name','prototype','asIntN','asUintN'],
  'rt.Date':['length','name','prototype','now','parse','UTC'],
  'rt.RegExp':['length','name','prototype','@@species'],
  'rt.ArrayBuffer':['length','name','prototype','@@species','isView','__nonaCopyInternal','__nonaDetachInternal'],
  'rt.SharedArrayBuffer':['length','name','prototype','@@species'],
  'rt.Map':['length','name','prototype','@@species'],
  'rt.Set':['length','name','prototype','@@species'],
  'rt.WeakMap':['length','name','prototype'],
  'rt.WeakSet':['length','name','prototype'],
  'rt.DataView':['length','name','prototype'],
  'rt.Uint8Array':['length','name','prototype','BYTES_PER_ELEMENT'],
  'rt.Int8Array':['length','name','prototype','BYTES_PER_ELEMENT'],
  'rt.Uint8ClampedArray':['length','name','prototype','BYTES_PER_ELEMENT'],
  'rt.Int16Array':['length','name','prototype','BYTES_PER_ELEMENT'],
  'rt.Uint16Array':['length','name','prototype','BYTES_PER_ELEMENT'],
  'rt.Int32Array':['length','name','prototype','BYTES_PER_ELEMENT'],
  'rt.Uint32Array':['length','name','prototype','BYTES_PER_ELEMENT'],
  'rt.Float32Array':['length','name','prototype','BYTES_PER_ELEMENT'],
  'rt.Float64Array':['length','name','prototype','BYTES_PER_ELEMENT'],
  'rt.BigInt64Array':['length','name','prototype','BYTES_PER_ELEMENT'],
  'rt.BigUint64Array':['length','name','prototype','BYTES_PER_ELEMENT'],
  'rt.TypedArray':['length','name','prototype','of','__nonaDefaultConstructorInternal','__nonaIsTypedArrayInternal','__nonaIsConstructorInternal','__nonaRawLengthInternal','__nonaRawByteOffsetInternal'],
  'rt.String':['length','name','prototype','fromCharCode','fromCodePoint','raw'],
  'rt.Math':['E','LN10','LN2','LOG10E','LOG2E','PI','SQRT1_2','SQRT2','abs','acos','acosh','asin','asinh','atan','atanh','atan2','cbrt','ceil','clz32','cos','cosh','exp','expm1','floor','fround','hypot','imul','log','log1p','log10','log2','max','min','pow','random','round','sign','sin','sinh','sqrt','tan','tanh','trunc','@@toStringTag'],
  'rt.JSON':['parse','stringify','@@toStringTag'],
  'rt.Atomics':['add','and','compareExchange','exchange','isLockFree','load','notify','or','store','sub','wait','xor','@@toStringTag'],
  'rt.booleanPrototype':['constructor','toString','valueOf'],
  'rt.numberPrototype':['constructor','toExponential','toFixed','toLocaleString','toPrecision','toString','valueOf'],
  'rt.stringPrototype':['constructor','toString','valueOf','charAt','charCodeAt','codePointAt','concat','toLowerCase','toLocaleLowerCase','toUpperCase','toLocaleUpperCase','includes','indexOf','lastIndexOf','startsWith','endsWith','localeCompare','normalize','padStart','padEnd','repeat','replace','slice','split','substring','trim','trimStart','trimEnd','trimLeft','trimRight','@@iterator'],
  'rt.symbolPrototype':['constructor','toString','valueOf','description','@@toPrimitive','@@toStringTag'],
  'rt.bigintPrototype':['constructor','toString','valueOf','@@toStringTag'],
  'rt.datePrototype':['constructor','toString','toDateString','toTimeString','toISOString','toUTCString','toJSON','toLocaleString','toLocaleDateString','toLocaleTimeString','valueOf','getTime','getFullYear','getUTCFullYear','getMonth','getUTCMonth','getDate','getUTCDate','getDay','getUTCDay','getHours','getUTCHours','getMinutes','getUTCMinutes','getSeconds','getUTCSeconds','getMilliseconds','getUTCMilliseconds','getTimezoneOffset','setTime','setFullYear','setUTCFullYear','setMonth','setUTCMonth','setDate','setUTCDate','setHours','setUTCHours','setMinutes','setUTCMinutes','setSeconds','setUTCSeconds','setMilliseconds','setUTCMilliseconds','getYear','@@toPrimitive'],
  'rt.regexpPrototype':['constructor','exec','dotAll','flags','global','ignoreCase','multiline','source','sticky','unicode','test','toString','@@match','@@matchAll','@@replace','@@search','@@split'],
  'rt.arraybufferPrototype':['constructor','byteLength','slice','@@toStringTag'],
  'rt.dataviewPrototype':['constructor','buffer','byteLength','byteOffset','getInt8','setInt8','getUint8','setUint8','getInt16','setInt16','getUint16','setUint16','getInt32','setInt32','getUint32','setUint32','getFloat32','setFloat32','getFloat64','setFloat64','getBigInt64','setBigInt64','getBigUint64','setBigUint64','@@toStringTag'],
  'rt.mapPrototype':['constructor','clear','delete','forEach','get','has','set','size','entries','keys','values','@@iterator','@@toStringTag'],
  'rt.mapIteratorPrototype':['next','@@toStringTag'],
  'rt.setCollectionPrototype':['constructor','add','clear','delete','forEach','has','size','entries','keys','values','@@iterator','@@toStringTag'],
  'rt.setIteratorPrototype':['next','@@toStringTag'],
  'rt.weakmapPrototype':['constructor','delete','get','has','set','@@toStringTag'],
  'rt.weaksetPrototype':['constructor','add','delete','has','@@toStringTag'],
  'rt.typedArrayPrototype':['constructor','buffer','byteOffset','byteLength','length','copyWithin','entries','fill','includes','indexOf','keys','lastIndexOf','values','@@iterator','reverse'],
  'rt.uint8arrayPrototype':['constructor','BYTES_PER_ELEMENT','@@toStringTag'],
  'rt.int8arrayPrototype':['constructor','BYTES_PER_ELEMENT','@@toStringTag'],
  'rt.uint8clampedarrayPrototype':['constructor','BYTES_PER_ELEMENT','@@toStringTag'],
  'rt.int16arrayPrototype':['constructor','BYTES_PER_ELEMENT','@@toStringTag'],
  'rt.uint16arrayPrototype':['constructor','BYTES_PER_ELEMENT','@@toStringTag'],
  'rt.int32arrayPrototype':['constructor','BYTES_PER_ELEMENT','@@toStringTag'],
  'rt.uint32arrayPrototype':['constructor','BYTES_PER_ELEMENT','@@toStringTag'],
  'rt.float32arrayPrototype':['constructor','BYTES_PER_ELEMENT','@@toStringTag'],
  'rt.float64arrayPrototype':['constructor','BYTES_PER_ELEMENT','@@toStringTag'],
  'rt.bigint64arrayPrototype':['constructor','BYTES_PER_ELEMENT','@@toStringTag'],
  'rt.biguint64arrayPrototype':['constructor','BYTES_PER_ELEMENT','@@toStringTag'],
  'rt.iteratorPrototype':['next','@@iterator'],
  'rt.Symbol':['length','name','prototype','for','keyFor',...['asyncIterator','hasInstance','isConcatSpreadable','iterator','match','matchAll','replace','search','species','split','toPrimitive','toStringTag','unscopables']],
  'rt.console':['log'],
  'rt.globalObject':['Object','Function','Array','Number','Boolean','String','Date','RegExp','Map','Set','WeakMap','WeakSet','ArrayBuffer','SharedArrayBuffer','DataView','Int8Array','Uint8Array','Uint8ClampedArray','Int16Array','Uint16Array','Int32Array','Uint32Array','Float32Array','Float64Array','BigInt64Array','BigUint64Array','Symbol','BigInt',...errorConstructorNames,'Math','JSON','Atomics','globalThis','undefined','NaN','Infinity','parseFloat','parseInt','isFinite','isNaN','decodeURI','decodeURIComponent','encodeURI','encodeURIComponent','console'],
  ...Object.fromEntries(errorConstructorNames.map(name=>['rt.'+name.toLowerCase()+'Prototype',['constructor','name','message',...(name==='Error'?['toString']:[])]])),
 };
 const fragments=new Map(b.bundle.fragments.map(f=>[f.name,f]));
 for(const [owner,order] of Object.entries(orders)){
  const head=fragments.get(owner)!.fixups.find(f=>f.offset===O.properties);if(!head)throw new Error("Missing head: "+owner);
  const nodes:{node:NamedFragment;rank:number}[]=[];let name:string|undefined=head.target;
  while(name){
   const node:NamedFragment=fragments.get(name)!;
   const keyFixup=node.fixups.find(f=>f.offset===P.key);if(!keyFixup)throw new Error("Missing key fixup: "+owner+" "+name);const key=fragments.get(keyFixup.target)!;
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
