__nonaRegexpVm.arrayBufferConstructor=ArrayBuffer;
__nonaRegexpVm.arrayBufferNumber=Number;
__nonaRegexpVm.arrayBufferTrunc=Math.trunc;
__nonaRegexpVm.arrayBufferMax=Math.max;
__nonaRegexpVm.arrayBufferMin=Math.min;
__nonaRegexpVm.arrayBufferSpecies=Symbol.species;
__nonaRegexpVm.bufferTypeError=TypeError;
__nonaRegexpVm.bufferRangeError=RangeError;
__nonaRegexpVm.arrayBufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
__nonaRegexpVm.arrayBufferCopy=ArrayBuffer.__nonaCopyInternal;
__nonaRegexpVm.arrayBufferAlignment=ArrayBuffer.__nonaAlignmentInternal;
__nonaRegexpVm.arrayBufferDetach=ArrayBuffer.__nonaDetachInternal;
delete ArrayBuffer.__nonaAlignmentInternal;
delete ArrayBuffer.__nonaCopyInternal;
Object.defineProperty(ArrayBuffer.prototype,'slice',{value:({slice(start,end){
  'use strict';
  var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.arrayBufferLength,this);
  function index(value){
    if(typeof value==='bigint')throw new __nonaRegexpVm.bufferTypeError('Cannot convert BigInt to Number');
    var number=__nonaRegexpVm.arrayBufferNumber(value);
    if(number!==number||number===0)return 0;
    if(number===Infinity)return length;
    if(number===-Infinity)return 0;
    number=__nonaRegexpVm.arrayBufferTrunc(number);
    return number<0?__nonaRegexpVm.arrayBufferMax(length+number,0):__nonaRegexpVm.arrayBufferMin(number,length)
  }
  var first=index(start),final=end===undefined?length:index(end);
  var newLength=Math.max(final-first,0);
  var ctor=this.constructor,species;
  if(ctor===undefined)species=__nonaRegexpVm.arrayBufferConstructor;
  else{
    if(ctor===null||(typeof ctor!=='object'&&typeof ctor!=='function'))throw new __nonaRegexpVm.bufferTypeError('Invalid ArrayBuffer constructor');
    species=ctor[__nonaRegexpVm.arrayBufferSpecies];
    if(species===undefined||species===null)species=__nonaRegexpVm.arrayBufferConstructor
  }
  var result=new species(newLength);
  if(result===this)throw new __nonaRegexpVm.bufferTypeError('ArrayBuffer species returned source buffer');
  var resultLength=__nonaRegexpVm.safeCall(__nonaRegexpVm.arrayBufferLength,result);
  if(resultLength<newLength)throw new __nonaRegexpVm.bufferTypeError('ArrayBuffer species returned a short buffer');
  __nonaRegexpVm.arrayBufferCopy(this,result,first,newLength);
  return result
}}).slice,writable:true,configurable:true});
__nonaRegexpVm.sharedArrayBufferConstructor=SharedArrayBuffer;
__nonaRegexpVm.sharedArrayBufferLength=Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype,'byteLength').get;
Object.defineProperty(SharedArrayBuffer.prototype,'slice',{value:({slice(start,end){
 'use strict';
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.sharedArrayBufferLength,this);
 function index(value){
  if(typeof value==='bigint')throw new __nonaRegexpVm.bufferTypeError('Cannot convert BigInt to Number');
  var number=__nonaRegexpVm.arrayBufferNumber(value);
  if(number!==number||number===0)return 0;
  if(number===Infinity)return length;
  if(number===-Infinity)return 0;
  number=__nonaRegexpVm.arrayBufferTrunc(number);
  return number<0?__nonaRegexpVm.arrayBufferMax(length+number,0):__nonaRegexpVm.arrayBufferMin(number,length)
 }
 var first=index(start),final=end===undefined?length:index(end);
 var newLength=__nonaRegexpVm.arrayBufferMax(final-first,0);
 var ctor=this.constructor,species;
 if(ctor===undefined)species=__nonaRegexpVm.sharedArrayBufferConstructor;
 else{
  if(ctor===null||(typeof ctor!=='object'&&typeof ctor!=='function'))throw new __nonaRegexpVm.bufferTypeError('Invalid SharedArrayBuffer constructor');
  species=ctor[__nonaRegexpVm.arrayBufferSpecies];
  if(species===undefined||species===null)species=__nonaRegexpVm.sharedArrayBufferConstructor
 }
 var result=new species(newLength);
 var resultLength=__nonaRegexpVm.safeCall(__nonaRegexpVm.sharedArrayBufferLength,result);
 if(result===this)throw new __nonaRegexpVm.bufferTypeError('SharedArrayBuffer species returned source buffer');
 if(resultLength<newLength)throw new __nonaRegexpVm.bufferTypeError('SharedArrayBuffer species returned a short buffer');
 __nonaRegexpVm.arrayBufferCopy(this,result,first,newLength);
 return result
}}).slice,writable:true,configurable:true});
__nonaRegexpVm.dvLength=Object.getOwnPropertyDescriptor(DataView.prototype,'byteLength').get;
__nonaRegexpVm.dvBuffer=Object.getOwnPropertyDescriptor(DataView.prototype,'buffer').get;
__nonaRegexpVm.dvGet32=DataView.prototype.getUint32;
__nonaRegexpVm.dvSet32=DataView.prototype.setUint32;
__nonaRegexpVm.dvNumber=Number;
__nonaRegexpVm.dvBigInt=BigInt;
__nonaRegexpVm.dvAsUintN=BigInt.asUintN;
__nonaRegexpVm.dvAsIntN=BigInt.asIntN;
__nonaRegexpVm.dvTrunc=Math.trunc;
__nonaRegexpVm.dvIndex=function(value){
 if(typeof value==='bigint')throw new __nonaRegexpVm.bufferTypeError('Cannot convert BigInt to Number');
 var number=__nonaRegexpVm.dvNumber(value);
 if(number!==number||number===0)return 0;
 if(number===Infinity||number===-Infinity)throw new __nonaRegexpVm.bufferRangeError('Invalid DataView offset');
 number=__nonaRegexpVm.dvTrunc(number);
 if(number<0)throw new __nonaRegexpVm.bufferRangeError('Invalid DataView offset');
 return number
};
__nonaRegexpVm.dvReadBig=function(view,offset,little,signed){
 __nonaRegexpVm.safeCall(__nonaRegexpVm.dvBuffer,view);
 var index=__nonaRegexpVm.dvIndex(offset),length=__nonaRegexpVm.safeCall(__nonaRegexpVm.dvLength,view);
 if(index>length-8)throw new __nonaRegexpVm.bufferRangeError('DataView offset outside buffer');
 var first=__nonaRegexpVm.safeCall(__nonaRegexpVm.dvGet32,view,index,little);
 var second=__nonaRegexpVm.safeCall(__nonaRegexpVm.dvGet32,view,index+4,little);
 var high=little?second:first,low=little?first:second;
 var value=__nonaRegexpVm.dvBigInt(high)*4294967296n+__nonaRegexpVm.dvBigInt(low);
 return signed?__nonaRegexpVm.dvAsIntN(64,value):value
};
__nonaRegexpVm.dvWriteBig=function(view,offset,value,little){
 __nonaRegexpVm.safeCall(__nonaRegexpVm.dvBuffer,view);
 var index=__nonaRegexpVm.dvIndex(offset),raw=__nonaRegexpVm.dvAsUintN(64,value);
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.dvLength,view);
 if(index>length-8)throw new __nonaRegexpVm.bufferRangeError('DataView offset outside buffer');
 var low=__nonaRegexpVm.dvNumber(raw%4294967296n);
 var high=__nonaRegexpVm.dvNumber(raw/4294967296n);
 if(little){__nonaRegexpVm.safeCall(__nonaRegexpVm.dvSet32,view,index,low,true);__nonaRegexpVm.safeCall(__nonaRegexpVm.dvSet32,view,index+4,high,true)}
 else{__nonaRegexpVm.safeCall(__nonaRegexpVm.dvSet32,view,index,high,false);__nonaRegexpVm.safeCall(__nonaRegexpVm.dvSet32,view,index+4,low,false)}
};
Object.defineProperty(DataView.prototype,'getBigInt64',{value:({getBigInt64(byteOffset){'use strict';return __nonaRegexpVm.dvReadBig(this,byteOffset,!!arguments[1],true)}}).getBigInt64,writable:true,configurable:true});
Object.defineProperty(DataView.prototype,'getBigUint64',{value:({getBigUint64(byteOffset){'use strict';return __nonaRegexpVm.dvReadBig(this,byteOffset,!!arguments[1],false)}}).getBigUint64,writable:true,configurable:true});
Object.defineProperty(DataView.prototype,'setBigInt64',{value:({setBigInt64(byteOffset,value){'use strict';return __nonaRegexpVm.dvWriteBig(this,byteOffset,value,!!arguments[2])}}).setBigInt64,writable:true,configurable:true});
Object.defineProperty(DataView.prototype,'setBigUint64',{value:({setBigUint64(byteOffset,value){'use strict';return __nonaRegexpVm.dvWriteBig(this,byteOffset,value,!!arguments[2])}}).setBigUint64,writable:true,configurable:true});
__nonaRegexpVm.typedArrayValues=Uint8Array.prototype.values;
__nonaRegexpVm.typedArraySort=Array.prototype.sort;
__nonaRegexpVm.bigintToString=BigInt.prototype.toString;
__nonaRegexpVm.typedArrayLocaleString=String;
Object.defineProperty(BigInt.prototype,'toLocaleString',{value:({toLocaleString(){'use strict';return __nonaRegexpVm.safeCall(__nonaRegexpVm.bigintToString,this)}}).toLocaleString,writable:true,configurable:true});
__nonaRegexpVm.typedArrayLength=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'length').get;
__nonaRegexpVm.typedArrayBuffer=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'buffer').get;
__nonaRegexpVm.typedArrayByteOffset=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'byteOffset').get;
__nonaRegexpVm.typedArrayDefaultConstructor=__nonaRegexpVm.typedArrayConstructor.__nonaDefaultConstructorInternal;
delete __nonaRegexpVm.typedArrayConstructor.__nonaDefaultConstructorInternal;
__nonaRegexpVm.typedArrayRawLength=__nonaRegexpVm.typedArrayConstructor.__nonaRawLengthInternal;
delete __nonaRegexpVm.typedArrayConstructor.__nonaRawLengthInternal;
__nonaRegexpVm.typedArrayRawByteOffset=__nonaRegexpVm.typedArrayConstructor.__nonaRawByteOffsetInternal;
delete __nonaRegexpVm.typedArrayConstructor.__nonaRawByteOffsetInternal;
Object.defineProperty(__nonaRegexpVm.typedArrayConstructor,'from',{value:({from(source){
 'use strict';
 var constructor=this,mapfn=arguments[1],thisArg=arguments[2];
 if(!__nonaRegexpVm.safeCall(__nonaRegexpVm.isConstructor,undefined,constructor))throw new __nonaRegexpVm.bufferTypeError('TypedArray.from requires a constructor');
 if(mapfn!==undefined&&typeof mapfn!=='function')throw new __nonaRegexpVm.bufferTypeError('TypedArray.from mapper is not callable');
 var method=source[Symbol.iterator],values,length,iterated=method!==undefined&&method!==null;
 if(iterated){
  if(typeof method!=='function')throw new __nonaRegexpVm.bufferTypeError('Iterator method is not callable');
  values=[];var iterator=__nonaRegexpVm.safeCall(method,source);
  if(iterator===null||(typeof iterator!=='object'&&typeof iterator!=='function'))throw new __nonaRegexpVm.bufferTypeError('Iterator is not an object');
  var next=iterator.next;
  if(typeof next!=='function')throw new __nonaRegexpVm.bufferTypeError('Iterator next is not callable');
  for(;;){var step=__nonaRegexpVm.safeCall(next,iterator);if(step===null||(typeof step!=='object'&&typeof step!=='function'))throw new __nonaRegexpVm.bufferTypeError('Iterator result is not an object');if(step.done)break;values[values.length]=step.value}
  length=values.length;
 }else{
  var rawLength=+source.length;
  length=rawLength!==rawLength||rawLength<=0?0:rawLength===Infinity?9007199254740991:Math.min(Math.floor(rawLength),9007199254740991);
 }
 var result=new constructor(length);
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,result);
 if(__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,result)<length)throw new __nonaRegexpVm.bufferTypeError('TypedArray.from result is too short');
 for(var k=0;k<length;k++){var value=iterated?values[k]:source[k];if(mapfn!==undefined)value=__nonaRegexpVm.safeCall(mapfn,thisArg,value,k);if(k<__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,result))result[k]=value}
 return result;
}}).from,writable:true,configurable:true});
[Uint8Array,Int8Array,Uint8ClampedArray,Uint16Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,BigInt64Array,BigUint64Array].forEach(function(ctor){delete ctor.prototype[Symbol.toStringTag]});
Object.defineProperty(__nonaRegexpVm.typedArrayConstructor.prototype,Symbol.toStringTag,{get:Object.getOwnPropertyDescriptor({get [Symbol.toStringTag](){'use strict';if(!__nonaRegexpVm.safeCall(__nonaRegexpVm.isTypedArray,undefined,this))return undefined;return __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayDefaultConstructor,undefined,this).name}},Symbol.toStringTag).get,configurable:true});
Object.defineProperty(__nonaRegexpVm.typedArrayConstructor,Symbol.species,{get:Object.getOwnPropertyDescriptor({get [Symbol.species](){return this}},Symbol.species).get,configurable:true});
__nonaRegexpVm.typedArraySpeciesCreate=function(source,length){
 var defaultConstructor=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayDefaultConstructor,undefined,source);
 var constructor=source.constructor;
 if(constructor===undefined)constructor=defaultConstructor;
 else{
  if(constructor===null||(typeof constructor!=='object'&&typeof constructor!=='function'))throw new __nonaRegexpVm.bufferTypeError('Invalid TypedArray constructor');
  var species=constructor[Symbol.species];
  constructor=species===undefined||species===null?defaultConstructor:species;
 }
 var result=new constructor(length);
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,result);
 if(__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,result)<length)throw new __nonaRegexpVm.bufferTypeError('TypedArray species returned a short result');
 var resultConstructor=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayDefaultConstructor,undefined,result);
 var sourceBig=defaultConstructor===BigInt64Array||defaultConstructor===BigUint64Array;
 var resultBig=resultConstructor===BigInt64Array||resultConstructor===BigUint64Array;
 if(sourceBig!==resultBig)throw new __nonaRegexpVm.bufferTypeError('TypedArray species returned incompatible content type');
 return result;
};
__nonaRegexpVm.typedArraySpeciesCreateView=function(source,buffer,offset,length){
 var defaultConstructor=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayDefaultConstructor,undefined,source);
 var constructor=source.constructor;
 if(constructor===undefined)constructor=defaultConstructor;
 else{
  if(constructor===null||(typeof constructor!=='object'&&typeof constructor!=='function'))throw new __nonaRegexpVm.bufferTypeError('Invalid TypedArray constructor');
  var species=constructor[Symbol.species];
  constructor=species===undefined||species===null?defaultConstructor:species;
 }
 var result=new constructor(buffer,offset,length);
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,result);
 var resultConstructor=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayDefaultConstructor,undefined,result);
 var sourceBig=defaultConstructor===BigInt64Array||defaultConstructor===BigUint64Array;
 var resultBig=resultConstructor===BigInt64Array||resultConstructor===BigUint64Array;
 if(sourceBig!==resultBig)throw new __nonaRegexpVm.bufferTypeError('TypedArray species returned incompatible content type');
 return result;
};
__nonaRegexpVm.typedArrayRelativeIndex=function(value,length){
 var number=+value;
 if(number!==number||number===0)return 0;
 if(number===Infinity)return length;
 if(number===-Infinity)return 0;
 number=__nonaRegexpVm.arrayBufferTrunc(number);
 return number<0?__nonaRegexpVm.arrayBufferMax(length+number,0):__nonaRegexpVm.arrayBufferMin(number,length);
};
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'forEach',{value:({forEach(callbackfn){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this);
 if(typeof callbackfn!=='function')throw new __nonaRegexpVm.bufferTypeError('callbackfn is not callable');
 var thisArg=arguments[1];
 for(var k=0;k<length;k++)__nonaRegexpVm.safeCall(callbackfn,thisArg,this[k],k,this);
}}).forEach,writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'every',{value:({every(callbackfn){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this);
 if(typeof callbackfn!=='function')throw new __nonaRegexpVm.bufferTypeError('callbackfn is not callable');
 var thisArg=arguments[1];
 for(var k=0;k<length;k++)if(!__nonaRegexpVm.safeCall(callbackfn,thisArg,this[k],k,this))return false;
 return true;
}}).every,writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'some',{value:({some(callbackfn){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this);
 if(typeof callbackfn!=='function')throw new __nonaRegexpVm.bufferTypeError('callbackfn is not callable');
 var thisArg=arguments[1];
 for(var k=0;k<length;k++)if(__nonaRegexpVm.safeCall(callbackfn,thisArg,this[k],k,this))return true;
 return false;
}}).some,writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'find',{value:({find(callbackfn){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this);
 if(typeof callbackfn!=='function')throw new __nonaRegexpVm.bufferTypeError('callbackfn is not callable');
 var thisArg=arguments[1];
 for(var k=0;k<length;k++){var value=this[k];if(__nonaRegexpVm.safeCall(callbackfn,thisArg,value,k,this))return value}
 return undefined;
}}).find,writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'findIndex',{value:({findIndex(callbackfn){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this);
 if(typeof callbackfn!=='function')throw new __nonaRegexpVm.bufferTypeError('callbackfn is not callable');
 var thisArg=arguments[1];
 for(var k=0;k<length;k++)if(__nonaRegexpVm.safeCall(callbackfn,thisArg,this[k],k,this))return k;
 return -1;
}}).findIndex,writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'reduce',{value:({reduce(callbackfn){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this);
 if(typeof callbackfn!=='function')throw new __nonaRegexpVm.bufferTypeError('callbackfn is not callable');
 var k=0,accumulator;
 if(arguments.length>1)accumulator=arguments[1];
 else{if(length===0)throw new __nonaRegexpVm.bufferTypeError('Reduce of empty typed array with no initial value');accumulator=this[0];k=1}
 for(;k<length;k++)accumulator=__nonaRegexpVm.safeCall(callbackfn,undefined,accumulator,this[k],k,this);
 return accumulator;
}}).reduce,writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'reduceRight',{value:({reduceRight(callbackfn){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this);
 if(typeof callbackfn!=='function')throw new __nonaRegexpVm.bufferTypeError('callbackfn is not callable');
 var k=length-1,accumulator;
 if(arguments.length>1)accumulator=arguments[1];
 else{if(length===0)throw new __nonaRegexpVm.bufferTypeError('Reduce of empty typed array with no initial value');accumulator=this[k];k--}
 for(;k>=0;k--)accumulator=__nonaRegexpVm.safeCall(callbackfn,undefined,accumulator,this[k],k,this);
 return accumulator;
}}).reduceRight,writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'join',{value:({join(separator){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this);
 var sep=separator===undefined?',':''+separator,result='';
 for(var k=0;k<length;k++){
  if(k>0)result+=sep;
  var element=this[k];
  if(element!==undefined)result+=''+element;
 }
 return result;
}}).join,writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'toString',{value:Array.prototype.toString,writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'map',{value:({map(callbackfn){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this);
 if(typeof callbackfn!=='function')throw new __nonaRegexpVm.bufferTypeError('callbackfn is not callable');
 var result=__nonaRegexpVm.typedArraySpeciesCreate(this,length),thisArg=arguments[1];
 for(var k=0;k<length;k++)result[k]=__nonaRegexpVm.safeCall(callbackfn,thisArg,this[k],k,this);
 return result;
}}).map,writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'filter',{value:({filter(callbackfn){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this);
 if(typeof callbackfn!=='function')throw new __nonaRegexpVm.bufferTypeError('callbackfn is not callable');
 var kept=[],thisArg=arguments[1];
 for(var k=0;k<length;k++){var value=this[k];if(__nonaRegexpVm.safeCall(callbackfn,thisArg,value,k,this))kept[kept.length]=value}
 var result=__nonaRegexpVm.typedArraySpeciesCreate(this,kept.length);
 for(var i=0;i<kept.length;i++)result[i]=kept[i];
 return result;
}}).filter,writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'set',{value:({set(source){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var targetLength=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this);
 var offset=arguments[1];
 var targetOffset=offset===undefined?0:+offset;
 if(targetOffset!==targetOffset)targetOffset=0;
 if(targetOffset===Infinity||targetOffset===-Infinity)throw new __nonaRegexpVm.bufferRangeError('Invalid TypedArray offset');
 targetOffset=__nonaRegexpVm.arrayBufferTrunc(targetOffset);
 if(targetOffset<0)throw new __nonaRegexpVm.bufferRangeError('Invalid TypedArray offset');
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 if(source===null||source===undefined)throw new __nonaRegexpVm.bufferTypeError('Source is null or undefined');
 var sourceIsTyped=__nonaRegexpVm.isTypedArray(source);
 var sourceLength,values;
 if(sourceIsTyped){
  __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,source);
  sourceLength=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,source);
  var targetCtor=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayDefaultConstructor,undefined,this);
  var sourceCtor=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayDefaultConstructor,undefined,source);
  if((targetCtor===BigInt64Array||targetCtor===BigUint64Array)!==(sourceCtor===BigInt64Array||sourceCtor===BigUint64Array))throw new __nonaRegexpVm.bufferTypeError('TypedArray content types differ');
 }else{
  sourceLength=+source.length;
  if(sourceLength!==sourceLength||sourceLength<0)sourceLength=0;
  if(sourceLength===Infinity)sourceLength=9007199254740991;
  sourceLength=__nonaRegexpVm.arrayBufferTrunc(sourceLength);
 }
 if(targetOffset+sourceLength>targetLength)throw new __nonaRegexpVm.bufferRangeError('Source exceeds TypedArray length');
 if(sourceIsTyped&&sourceCtor===targetCtor&&sourceLength>0){
  // Same element type in another buffer: one block copy of the bytes (#253).
  var width=targetCtor.BYTES_PER_ELEMENT;
  var sourceBuffer=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayBuffer,source);
  var targetBuffer=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayBuffer,this);
  if(sourceBuffer!==targetBuffer){
   __nonaRegexpVm.arrayBufferCopy(sourceBuffer,targetBuffer,__nonaRegexpVm.typedArrayRawByteOffset(source),sourceLength*width,
    __nonaRegexpVm.typedArrayRawByteOffset(this)+targetOffset*width);
   return;
  }
 }
 if(sourceIsTyped){
  // Reading a typed array runs no user code: copy through a Float64Array
  // (exact for all non-BigInt element types) instead of a growing Array.
  var bigSource=sourceCtor===BigInt64Array||sourceCtor===BigUint64Array;
  values=bigSource?[]:new Float64Array(sourceLength);
  for(var k=0;k<sourceLength;k++)values[k]=source[k];
  for(var j=0;j<sourceLength;j++)this[targetOffset+j]=values[j];
  return;
 }
 for(var i=0;i<sourceLength;i++){
  var value=sourceIsTyped?values[i]:source[i];
  if(targetOffset+i<__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this))this[targetOffset+i]=value;
 }
}}).set,writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'subarray',{value:({subarray(begin,end){
 'use strict';
 var length=__nonaRegexpVm.typedArrayRawLength(this);
 var first=__nonaRegexpVm.typedArrayRelativeIndex(begin,length);
 var final=end===undefined?length:__nonaRegexpVm.typedArrayRelativeIndex(end,length);
 var newLength=__nonaRegexpVm.arrayBufferMax(final-first,0);
 var defaultConstructor=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayDefaultConstructor,undefined,this);
 var bytesPerElement=defaultConstructor.BYTES_PER_ELEMENT;
 var buffer=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayBuffer,this);
 var byteOffset=__nonaRegexpVm.typedArrayRawByteOffset(this)+first*bytesPerElement;
 return __nonaRegexpVm.typedArraySpeciesCreateView(this,buffer,byteOffset,newLength);
}}).subarray,writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'slice',{value:({slice(start,end){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this);
 var first=__nonaRegexpVm.typedArrayRelativeIndex(start,length);
 var final=end===undefined?length:__nonaRegexpVm.typedArrayRelativeIndex(end,length);
 var count=__nonaRegexpVm.arrayBufferMax(final-first,0);
 var result=__nonaRegexpVm.typedArraySpeciesCreate(this,count);
 if(count>0){
  __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
  var sourceConstructor=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayDefaultConstructor,undefined,this);
  var resultConstructor=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayDefaultConstructor,undefined,result);
  if(sourceConstructor===resultConstructor){
   var width=sourceConstructor.BYTES_PER_ELEMENT;
   var sourceBuffer=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayBuffer,this);
   var resultBuffer=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayBuffer,result);
   var sourceOffset=__nonaRegexpVm.typedArrayRawByteOffset(this)+first*width;
   var resultOffset=__nonaRegexpVm.typedArrayRawByteOffset(result);
   __nonaRegexpVm.arrayBufferCopy(sourceBuffer,resultBuffer,sourceOffset,count*width,resultOffset);
  }else for(var k=0;k<count;k++)result[k]=this[first+k];
 }
 return result;
}}).slice,writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'sort',{value:({sort(comparefn){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this);
 if(comparefn!==undefined&&typeof comparefn!=='function')throw new __nonaRegexpVm.bufferTypeError('comparefn is not callable');
 var values=[];for(var k=0;k<length;k++)values[k]=this[k];
 var compare=comparefn===undefined?function(x,y){
  if(x!==x)return y!==y?0:1;
  if(y!==y)return -1;
  if(x<y)return -1;
  if(x>y)return 1;
  if(x===0&&y===0){if(1/x<1/y)return -1;if(1/x>1/y)return 1}
  return 0;
 }:function(x,y){var result=+__nonaRegexpVm.safeCall(comparefn,undefined,x,y);return result!==result?0:result};
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArraySort,values,compare);
 for(var i=0;i<length;i++)if(i<__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this))this[i]=values[i];
 return this;
}}).sort,writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'toLocaleString',{value:({toLocaleString(){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this),result='';
 for(var k=0;k<length;k++){
  if(k>0)result+=',';
  var value=this[k];
  if(value!==undefined&&value!==null){var localized=value.toLocaleString();if(typeof localized==='symbol')throw new __nonaRegexpVm.bufferTypeError('Cannot convert Symbol to string');result+=__nonaRegexpVm.typedArrayLocaleString(localized)}
 }
 return result;
}}).toLocaleString,writable:true,configurable:true});
(function(){
 var markNative=Function.prototype.__nonaMarkNativeInternal;
 var methods=['forEach','every','some','find','findIndex','reduce','reduceRight','join','map','filter','set','subarray','slice','sort','toLocaleString'];
 var prototype=Object.getPrototypeOf(Uint8Array.prototype);
 for(var i=0;i<methods.length;i++)markNative(prototype[methods[i]]);
 for(var name of ['getBigInt64','getBigUint64','setBigInt64','setBigUint64'])markNative(DataView.prototype[name]);
 markNative(BigInt.prototype.toLocaleString);
 markNative(__nonaRegexpVm.typedArrayConstructor.from);
})();
