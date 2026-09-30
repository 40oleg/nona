// Object.freeze/seal/isFrozen/isSealed (ES2020 19.1.2.6, .13, .20, .21) through
// the object's internal methods, so Proxy traps run in spec order. The
// native versions handled only ordinary objects.
export const objectIntegrityPreludeSource=String.raw`;(function(){
  'use strict';
  var defineProperty=Object.defineProperty,markNative=Function.prototype.__nonaMarkNativeInternal;
  var preventExtensions=Reflect.preventExtensions,isExtensible=Reflect.isExtensible,ownKeys=Reflect.ownKeys;
  var getOwnPropertyDescriptor=Reflect.getOwnPropertyDescriptor,reflectDefine=Reflect.defineProperty;
  function isObject(value){return value!==null&&(typeof value==='object'||typeof value==='function')}
  function setIntegrityLevel(object,frozen){
    if(!preventExtensions(object))throw new TypeError('Cannot prevent extensions');
    var keys=ownKeys(object);
    for(var i=0;i<keys.length;i++){
      var key=keys[i],descriptor;
      if(!frozen)descriptor={configurable:false};
      else{
        var current=getOwnPropertyDescriptor(object,key);
        if(current===undefined)continue;
        descriptor='get'in current||'set'in current?{configurable:false}:{configurable:false,writable:false};
      }
      if(!reflectDefine(object,key,descriptor))throw new TypeError('Cannot redefine property: '+String(key));
    }
  }
  function testIntegrityLevel(object,frozen){
    if(isExtensible(object))return false;
    var keys=ownKeys(object);
    for(var i=0;i<keys.length;i++){
      var current=getOwnPropertyDescriptor(object,keys[i]);
      if(current===undefined)continue;
      if(current.configurable)return false;
      if(frozen&&'value'in current&&current.writable)return false;
    }
    return true
  }
  function install(name,fn){
    defineProperty(fn,'name',{value:name,configurable:true});markNative(fn);
    defineProperty(Object,name,{value:fn})
  }
  install('freeze',({freeze(O){if(isObject(O))setIntegrityLevel(O,true);return O}}).freeze);
  install('seal',({seal(O){if(isObject(O))setIntegrityLevel(O,false);return O}}).seal);
  install('isFrozen',({isFrozen(O){return isObject(O)?testIntegrityLevel(O,true):true}}).isFrozen);
  install('isSealed',({isSealed(O){return isObject(O)?testIntegrityLevel(O,false):true}}).isSealed);
})();`;
