;
    var vm=__nonaRegexpVm.core;
    if(re===undefined){vm.compile(pattern,flags);return undefined}
    // [Symbol.match]'s global loop in one call (#389): the matched strings.
    var collect=__nonaRegexpVm.collect;
    if(collect!==0){
      __nonaRegexpVm.collect=0;
      var strings=vm.matchStrings(re,input,start,sticky,pattern,flags,collect===2);
      if(strings!==undefined){__nonaRegexpVm.collected=true;return strings}
    }
    return vm.exec(re,input,start,sticky,pattern,flags)
};
// Set by RegExp.prototype[Symbol.match] around its call of the builtin exec:
// 1 (2 in unicode mode) asks for every match of a global expression at once.
__nonaRegexpVm.collect=0;
__nonaRegexpVm.collected=false;
__nonaRegexpVm.replaceApply=Function.prototype.apply;
// The literal strings check of the engine's candidate loop (#389).
__nonaRegexpVm.replaceStartsWith=String.prototype.startsWith;
// The match result's index, input and groups (the core's exec).
__nonaRegexpVm.replaceDefineProperty=Object.defineProperty;
__nonaRegexpVm.replaceCreate=Object.create;
__nonaRegexpVm.replaceGetPrototypeOf=Object.getPrototypeOf;
__nonaRegexpVm.replaceObjectPrototype=Object.prototype;
// The native first-unit scan (#258): a host global only where the engine is linked.
__nonaRegexpVm.regexpScan=typeof __nonaRegexpScan==='function'?__nonaRegexpScan:null;
delete globalThis.__nonaRegexpScan;
__nonaRegexpVm.safeCall=Function.prototype.call.bind(Function.prototype.call);
__nonaRegexpVm.isRejectionError=Error.__nonaIsRejectionErrorInternal;
delete Error.__nonaIsRejectionErrorInternal;
// Uncaught exceptions of a program without the process prelude (#501), which
// replaces both functions (process-exceptions.js): the diagnostic on stderr
// and exit code 1. console.error is still the native one here.
(function(exit,write,isRejectionError){
  if(typeof exit!=='function')return;
  __nonaRegexpVm.dispatchUncaught=function(error){
    var diagnostic;
    try{diagnostic=String((error&&error.stack)||error)}catch(ignored){diagnostic='Uncaught exception'}
    try{write(diagnostic)}catch(ignored){}
    exit()
  };
  __nonaRegexpVm.reportUnhandledRejection=function(reason,promise,fail){
    if(!fail)return;
    var branded;
    try{branded=isRejectionError(reason)}catch(error){__nonaRegexpVm.dispatchUncaught(error);return}
    if(!branded){
      var description=reason!==null&&(typeof reason==='object'||typeof reason==='function')?'[object '+(typeof reason==='function'?'Function':'Object')+']':String(reason);
      var error=new Error('The promise rejected with the reason "'+description+'".');
      error.name='UnhandledPromiseRejection';
      error.code='ERR_UNHANDLED_REJECTION';
      reason=error
    }
    __nonaRegexpVm.dispatchUncaught(reason)
  }
})(Error.__nonaExitInternal,console.error,__nonaRegexpVm.isRejectionError);
delete Error.__nonaExitInternal;
__nonaRegexpVm.append=Array.__nonaAppendInternal;
delete Array.__nonaAppendInternal;
__nonaRegexpVm.typedArrayConstructor=Object.getPrototypeOf(Uint8Array);
__nonaRegexpVm.isTypedArray=__nonaRegexpVm.typedArrayConstructor.__nonaIsTypedArrayInternal;
delete __nonaRegexpVm.typedArrayConstructor.__nonaIsTypedArrayInternal;
__nonaRegexpVm.isConstructor=__nonaRegexpVm.typedArrayConstructor.__nonaIsConstructorInternal;
delete __nonaRegexpVm.typedArrayConstructor.__nonaIsConstructorInternal;
__nonaRegexpVm.isProxy=__nonaRegexpVm.typedArrayConstructor.__nonaIsProxyInternal;
delete __nonaRegexpVm.typedArrayConstructor.__nonaIsProxyInternal;
// nona:util takes it from the global object and deletes it (util.types.isProxy, #469).
Object.defineProperty(globalThis,'__nonaIsProxy',{value:__nonaRegexpVm.isProxy,writable:true,configurable:true});
