// The native ProxyKind object and its traps are installed by the runtime.
export const proxyPreludeSource=String.raw`(function(){
  var create=Function.prototype.__nonaProxyCreateInternal;
  var revoke=Function.prototype.__nonaProxyRevokeInternal;
  var markNative=Function.prototype.__nonaMarkNativeInternal;
  function proxyConstructor(target,handler){
    if(new.target===undefined)throw new TypeError('Proxy requires new');
    return create(target,handler)
  }
  var Proxy=proxyConstructor.bind(undefined);
  Object.defineProperty(Proxy,'name',{value:'Proxy',configurable:true});
  var revocable=({revocable(target,handler){
    var proxy=create(target,handler);
    var revoker=({revoke(){revoke(proxy)}}).revoke;
    Object.defineProperty(revoker,'name',{value:'',configurable:true});
    markNative(revoker);
    return {proxy:proxy,revoke:revoker}
  }}).revocable;
  Object.defineProperty(Proxy,'revocable',{value:revocable,writable:true,configurable:true});
  Object.defineProperty(globalThis,'Proxy',{value:Proxy,writable:true,configurable:true});
  markNative(Proxy);
  markNative(revocable);
})()`;

// Runs last, after every optional prelude: removes the internal hooks the
// preludes captured from Function.prototype.
export const preludeCleanupSource=String.raw`;(function(){
  delete Function.prototype.__nonaProxyCreateInternal;
  delete Function.prototype.__nonaProxyRevokeInternal;
  delete Function.prototype.__nonaProxyPreventInternal;
  delete Function.prototype.__nonaProxySetPrototypeInternal;
  delete Function.prototype.__nonaReflectGetInternal;
  delete Function.prototype.__nonaReflectSetInternal;
  delete Function.prototype.__nonaReflectDefineInternal;
  delete Function.prototype.__nonaReflectOwnKeysInternal;
  delete Function.prototype.__nonaMarkNativeInternal;
  delete Function.prototype.__nonaMarkPromiseInternal;
  delete Function.prototype.__nonaPromiseRealmInternal;
  delete Function.prototype.__nonaRealmVmInternal;
  delete Function.prototype.__nonaSharedQueueInternal;
  delete Function.prototype.__nonaRegExpCopyInternal;
})()`;
