// Small built-ins added after ES2020 (ES2021-ES2023): AggregateError,
// Object.hasOwn, the relative indexing method at() and findLast/findLastIndex
// on Array, String and %TypedArray% prototypes. Promise.any lives in the
// Promise prelude, which runs after this one. Intrinsics are captured while
// the prelude runs so later user mutation cannot change the algorithms.
export const es2021PreludeSource=String.raw`;(function(){
  'use strict';
  var defineProperty=Object.defineProperty,markNative=Function.prototype.__nonaMarkNativeInternal;
  var getPrototypeOf=Object.getPrototypeOf,setPrototypeOf=Object.setPrototypeOf,hasOwnProperty=Object.prototype.hasOwnProperty;
  var call=Function.prototype.call.bind(Function.prototype.call),construct=Reflect.construct;
  var ErrorConstructor=Error,StringConstructor=String,ObjectConstructor=Object,TypeErrorConstructor=TypeError;
  var mathFloor=Math.floor,mathMin=Math.min,mathAbs=Math.abs,iteratorSymbol=Symbol.iterator;
  function install(object,name,length,fn){
    defineProperty(fn,'name',{value:name,configurable:true});
    defineProperty(fn,'length',{value:length,configurable:true});
    markNative(fn);
    defineProperty(object,name,{value:fn,writable:true,enumerable:false,configurable:true})
  }
  function isObject(value){return value!==null&&(typeof value==='object'||typeof value==='function')}
  function toStr(value){if(typeof value==='symbol')throw new TypeErrorConstructor('Cannot convert a Symbol value to a string');return StringConstructor(value)}
  function toIntegerOrInfinity(value){var n=+value;if(n!==n||n===0)return 0;if(n===1/0||n===-1/0)return n;return n<0?-mathFloor(-n):mathFloor(n)}
  function toLength(value){var n=toIntegerOrInfinity(value);return n<=0?0:mathMin(n,9007199254740991)}
  function toObject(value,name){if(value===undefined||value===null)throw new TypeErrorConstructor(name+' called on null or undefined');return ObjectConstructor(value)}
  function requireCallable(fn,name){if(typeof fn!=='function')throw new TypeErrorConstructor(name+': predicate is not a function')}

  // AggregateError ( errors, message [, options] ) (ES2021 20.5.7.1).
  var AggregateErrorPrototype;
  // Absent when the prelude is evaluated by Node.js in source tests.
  var realmVm=Function.prototype.__nonaRealmVmInternal||function(){};
  function Target(){}
  function AggregateError(errors,message){
    var newTarget=new.target===undefined?AggregateError:new.target;
    var proto=newTarget.prototype;
    // Not an object: %AggregateError.prototype% of new.target's realm, whose
    // %Object.prototype% the receiver of this construct call got.
    if(!isObject(proto)){var vm=new.target===undefined?undefined:realmVm(this);proto=vm&&vm.AggregateError?vm.AggregateError.prototype:AggregateErrorPrototype}
    Target.prototype=proto;
    var O=construct(ErrorConstructor,[],Target);
    if(message!==undefined)defineProperty(O,'message',{value:toStr(message),writable:true,enumerable:false,configurable:true});
    var options=arguments[2];
    if(isObject(options)&&'cause' in options)defineProperty(O,'cause',{value:options.cause,writable:true,enumerable:false,configurable:true});
    var list=[];for(var item of errors)defineProperty(list,list.length,{value:item,writable:true,enumerable:true,configurable:true});
    defineProperty(O,'errors',{value:list,writable:true,enumerable:false,configurable:true});
    return O
  }
  AggregateErrorPrototype=ObjectConstructor.create(ErrorConstructor.prototype);
  defineProperty(AggregateErrorPrototype,'constructor',{value:AggregateError,writable:true,enumerable:false,configurable:true});
  defineProperty(AggregateErrorPrototype,'name',{value:'AggregateError',writable:true,enumerable:false,configurable:true});
  defineProperty(AggregateErrorPrototype,'message',{value:'',writable:true,enumerable:false,configurable:true});
  defineProperty(AggregateError,'prototype',{value:AggregateErrorPrototype,writable:false,enumerable:false,configurable:false});
  setPrototypeOf(AggregateError,ErrorConstructor);
  install(globalThis,'AggregateError',2,AggregateError);
  __nonaRegexpVm.AggregateError=AggregateError;

  // Object.hasOwn ( O, P ) (ES2022 20.1.2.10).
  install(ObjectConstructor,'hasOwn',2,({hasOwn(O,P){var object=toObject(O,'Object.hasOwn');return call(hasOwnProperty,object,P)}}).hasOwn);

  // Array.prototype.at / findLast / findLastIndex (ES2022, ES2023).
  var ArrayPrototype=Array.prototype;
  install(ArrayPrototype,'at',1,({at(index){
    var O=toObject(this,'Array.prototype.at'),len=toLength(O.length),k=toIntegerOrInfinity(index);
    if(k<0)k+=len;if(k<0||k>=len)return undefined;return O[k]
  }}).at);
  function findLastFrom(O,len,predicate,thisArg,wantIndex){
    for(var k=len-1;k>=0;k--){var value=O[k];if(call(predicate,thisArg,value,k,O))return wantIndex?k:value}
    return wantIndex?-1:undefined
  }
  install(ArrayPrototype,'findLast',1,({findLast(predicate){
    var O=toObject(this,'Array.prototype.findLast'),len=toLength(O.length);requireCallable(predicate,'Array.prototype.findLast');
    return findLastFrom(O,len,predicate,arguments[1],false)
  }}).findLast);
  install(ArrayPrototype,'findLastIndex',1,({findLastIndex(predicate){
    var O=toObject(this,'Array.prototype.findLastIndex'),len=toLength(O.length);requireCallable(predicate,'Array.prototype.findLastIndex');
    return findLastFrom(O,len,predicate,arguments[1],true)
  }}).findLastIndex);
  var unscopables=ArrayPrototype[Symbol.unscopables];
  // Rebuilt in the specification's order (ES2023 23.1.3.38).
  var unscopableNames=['at','copyWithin','entries','fill','find','findIndex','findLast','findLastIndex','flat','flatMap','includes','keys','values'];
  for(var name of unscopableNames)delete unscopables[name];
  for(var name of unscopableNames)defineProperty(unscopables,name,{value:true,writable:true,enumerable:true,configurable:true});

  // String.prototype.at (ES2022 22.1.3.1).
  install(StringConstructor.prototype,'at',1,({at(index){
    if(this===undefined||this===null)throw new TypeErrorConstructor('String.prototype.at called on null or undefined');
    var S=toStr(this),len=S.length,k=toIntegerOrInfinity(index);
    if(k<0)k+=len;if(k<0||k>=len)return undefined;return S[k]
  }}).at);

  // %TypedArray%.prototype.at / findLast / findLastIndex: ValidateTypedArray,
  // then the same algorithms over [[ArrayLength]] (read through length).
  var TypedArrayPrototype=getPrototypeOf(Int8Array.prototype);
  var lengthGetter=ObjectConstructor.getOwnPropertyDescriptor(TypedArrayPrototype,'length').get;
  var typedKeys=TypedArrayPrototype.keys;
  function validate(O,name){
    // %TypedArray%.prototype.keys performs ValidateTypedArray: it throws for
    // a non-typed-array and for a detached buffer, and observes nothing else.
    call(typedKeys,O);
    return call(lengthGetter,O)
  }
  install(TypedArrayPrototype,'at',1,({at(index){
    var len=validate(this,'%TypedArray%.prototype.at'),k=toIntegerOrInfinity(index);
    if(k<0)k+=len;if(k<0||k>=len)return undefined;return this[k]
  }}).at);
  install(TypedArrayPrototype,'findLast',1,({findLast(predicate){
    var len=validate(this,'%TypedArray%.prototype.findLast');requireCallable(predicate,'%TypedArray%.prototype.findLast');
    return findLastFrom(this,len,predicate,arguments[1],false)
  }}).findLast);
  install(TypedArrayPrototype,'findLastIndex',1,({findLastIndex(predicate){
    var len=validate(this,'%TypedArray%.prototype.findLastIndex');requireCallable(predicate,'%TypedArray%.prototype.findLastIndex');
    return findLastFrom(this,len,predicate,arguments[1],true)
  }}).findLastIndex);
})();
`;
