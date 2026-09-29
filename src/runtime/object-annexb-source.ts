// Annex B.2.2.2-B.2.2.5 legacy accessor methods on Object.prototype.
// Intrinsics are captured while the prelude runs so later user mutation of
// Object or its static methods cannot change the observable algorithm.
export const objectAnnexBPreludeSource=String.raw`(function(){
  'use strict';
  var defineProperty=Object.defineProperty;
  var getOwnPropertyDescriptor=Object.getOwnPropertyDescriptor;
  var getPrototypeOf=Object.getPrototypeOf;
  var getOwnPropertyNames=Object.getOwnPropertyNames;
  var getOwnPropertySymbols=Object.getOwnPropertySymbols;
  var markNative=Function.prototype.__nonaMarkNativeInternal;
  var objectPrototype=Object.prototype;
  function toObject(value){
    if(value===undefined||value===null)throw new TypeError('Object.prototype method called on null or undefined');
    return Object(value)
  }
  // Computed member names perform exactly one ToPropertyKey.
  function toPropertyKey(value){
    var holder={[value]:0},names=getOwnPropertyNames(holder);
    return names.length?names[0]:getOwnPropertySymbols(holder)[0]
  }
  function lookup(receiver,key,getter){
    var object=toObject(receiver);
    key=toPropertyKey(key);
    for(;;){
      var descriptor=getOwnPropertyDescriptor(object,key);
      if(descriptor!==undefined){
        if('get' in descriptor)return getter?descriptor.get:descriptor.set;
        return undefined
      }
      object=getPrototypeOf(object);
      if(object===null)return undefined
    }
  }
  function method(name,length,fn){
    defineProperty(objectPrototype,name,{value:fn,writable:true,enumerable:false,configurable:true});
    defineProperty(fn,'name',{value:name,configurable:true});
    defineProperty(fn,'length',{value:length,configurable:true});
    markNative(fn)
  }
  method('__defineGetter__',2,({__defineGetter__(key,getter){
    var object=toObject(this);
    if(typeof getter!=='function')throw new TypeError('Object.prototype.__defineGetter__: Expecting function');
    defineProperty(object,toPropertyKey(key),{get:getter,enumerable:true,configurable:true})
  }}).__defineGetter__);
  method('__defineSetter__',2,({__defineSetter__(key,setter){
    var object=toObject(this);
    if(typeof setter!=='function')throw new TypeError('Object.prototype.__defineSetter__: Expecting function');
    defineProperty(object,toPropertyKey(key),{set:setter,enumerable:true,configurable:true})
  }}).__defineSetter__);
  method('__lookupGetter__',1,({__lookupGetter__(key){return lookup(this,key,true)}}).__lookupGetter__);
  method('__lookupSetter__',1,({__lookupSetter__(key){return lookup(this,key,false)}}).__lookupSetter__);
})()`;
