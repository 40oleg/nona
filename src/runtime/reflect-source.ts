// Bootstrap ordinary-object Reflect operations in the native program. Proxy
// interception and newTarget-sensitive construction need runtime support.
export const reflectPreludeSource=String.raw`(function(){
  function object(target){
    if(target===null||(typeof target!=='object'&&typeof target!=='function'))throw new TypeError('Reflect target must be an object');
    return target
  }
  function list(value){
    if(value===null||(typeof value!=='object'&&typeof value!=='function'))throw new TypeError('Arguments list must be an object');
    return value
  }
  var reflect={};
  var nativeConstruct=Function.prototype.__nonaReflectConstructInternal;
  var nativePrevent=Function.prototype.__nonaProxyPreventInternal;
  var nativeSetPrototype=Function.prototype.__nonaProxySetPrototypeInternal;
  var nativeGet=Function.prototype.__nonaReflectGetInternal;
  Object.defineProperty(globalThis,'Reflect',{value:reflect,writable:true,configurable:true});
  Object.defineProperty(reflect,Symbol.toStringTag,{value:'Reflect',configurable:true});
  function method(name,length,fn){
    Object.defineProperty(reflect,name,{value:fn,writable:true,configurable:true});
    Object.defineProperty(fn,'name',{value:name,configurable:true});
    Object.defineProperty(fn,'length',{value:length,configurable:true});
    Function.prototype.__nonaMarkNativeInternal(fn)
  }
  method('apply',3,({apply(target,thisArgument,argumentsList){
    if(typeof target!=='function')throw new TypeError('Reflect.apply target must be callable');
    return Function.prototype.apply.call(target,thisArgument,list(argumentsList))
  }}).apply);
  method('construct',2,({construct(target,argumentsList,newTarget){
    if(!__nonaRegexpVm.isConstructor(target))throw new TypeError('Reflect.construct target must be a constructor');
    if(arguments.length<3)newTarget=target;
    if(!__nonaRegexpVm.isConstructor(newTarget))throw new TypeError('newTarget must be a constructor');
    list(argumentsList);
    var length=+argumentsList.length;
    if(length!==length||length<=0)length=0;
    else if(length>65536)throw new RangeError('Too many constructor arguments');
    else length=Math.floor(length);
    var args=[];
    for(var i=0;i<length;i++)Object.defineProperty(args,args.length,{value:argumentsList[i],writable:true,enumerable:true,configurable:true});
    return nativeConstruct(target,args,newTarget)
  }}).construct);
  method('ownKeys',1,({ownKeys(target){
    object(target);
    return Object.getOwnPropertyNames(target).concat(Object.getOwnPropertySymbols(target))
  }}).ownKeys);
  method('has',2,({has(target,key){return key in object(target)}}).has);
  method('getOwnPropertyDescriptor',2,({getOwnPropertyDescriptor(target,key){return Object.getOwnPropertyDescriptor(object(target),key)}}).getOwnPropertyDescriptor);
  method('getPrototypeOf',1,({getPrototypeOf(target){return Object.getPrototypeOf(object(target))}}).getPrototypeOf);
  method('isExtensible',1,({isExtensible(target){return Object.isExtensible(object(target))}}).isExtensible);
  method('preventExtensions',1,({preventExtensions(target){return nativePrevent(object(target))}}).preventExtensions);
  method('defineProperty',3,({defineProperty(target,key,attributes){
    object(target);
    var keyHolder={[key]:0},names=Object.getOwnPropertyNames(keyHolder);
    key=names.length?names[0]:Object.getOwnPropertySymbols(keyHolder)[0];
    if(attributes===null||(typeof attributes!=='object'&&typeof attributes!=='function'))throw new TypeError('Property descriptor must be an object');
    var descriptor={};
    if('enumerable'in attributes)descriptor.enumerable=!!attributes.enumerable;
    if('configurable'in attributes)descriptor.configurable=!!attributes.configurable;
    if('value'in attributes)descriptor.value=attributes.value;
    if('writable'in attributes)descriptor.writable=!!attributes.writable;
    if('get'in attributes)descriptor.get=attributes.get;
    if('set'in attributes)descriptor.set=attributes.set;
    Object.defineProperty({},'validate',descriptor);
    try{Object.defineProperty(target,key,descriptor);return true}
    catch(error){if(error instanceof TypeError)return false;throw error}
  }}).defineProperty);
  method('setPrototypeOf',2,({setPrototypeOf(target,prototype){
    object(target);
    if(prototype!==null&&(typeof prototype!=='object'&&typeof prototype!=='function'))throw new TypeError('Prototype must be an object or null');
    var proxyResult=nativeSetPrototype(target,prototype);
    if(proxyResult!==undefined)return proxyResult;
    try{Object.setPrototypeOf(target,prototype);return true}
    catch(error){if(error instanceof TypeError)return false;throw error}
  }}).setPrototypeOf);
  method('deleteProperty',2,({deleteProperty(target,key){return delete object(target)[key]}}).deleteProperty);
  method('get',2,({get(target,key,receiver){
    object(target);
    if(arguments.length<3)return target[key];
    return nativeGet(target,key,receiver)
  }}).get);
  method('set',3,({set(target,key,value,receiver){
    object(target);
    if(arguments.length<4)receiver=target;
    var current=target,descriptor;
    while(current!==null){
      descriptor=Object.getOwnPropertyDescriptor(current,key);
      if(descriptor!==undefined)break;
      current=Object.getPrototypeOf(current)
    }
    if(descriptor!==undefined){
      if(!('value'in descriptor)){
        if(descriptor.set===undefined)return false;
        descriptor.set.call(receiver,value);return true
      }
      if(!descriptor.writable)return false
    }
    if(receiver===null||(typeof receiver!=='object'&&typeof receiver!=='function'))return false;
    var own=Object.getOwnPropertyDescriptor(receiver,key);
    if(own!==undefined){
      if(!('value'in own)||!own.writable)return false;
      Object.defineProperty(receiver,key,{value:value});return true
    }
    if(!Object.isExtensible(receiver))return false;
    Object.defineProperty(receiver,key,{value:value,writable:true,enumerable:true,configurable:true});return true
  }}).set);
  var propertyOrder=['defineProperty','deleteProperty','apply','construct','get','getOwnPropertyDescriptor','getPrototypeOf','has','isExtensible','ownKeys','preventExtensions','set','setPrototypeOf'];
  var methods=[];
  for(var i=0;i<propertyOrder.length;i++)methods[i]=reflect[propertyOrder[i]];
  for(var i=0;i<propertyOrder.length;i++)delete reflect[propertyOrder[i]];
  for(var i=0;i<propertyOrder.length;i++)Object.defineProperty(reflect,propertyOrder[i],{value:methods[i],writable:true,configurable:true});
})();
delete Function.prototype.__nonaReflectConstructInternal;`;
