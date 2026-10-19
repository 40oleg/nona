;
    var vm=__nonaRegexpVm.core;
    if(re===undefined){vm.compile(pattern,flags);return undefined}
    return vm.exec(re,input,start,sticky,pattern,flags)
};
__nonaRegexpVm.replaceApply=Function.prototype.apply;
// The literal strings check of the engine's candidate loop (#389).
__nonaRegexpVm.replaceStartsWith=String.prototype.startsWith;
// The match result's index, input and groups (the core's exec).
__nonaRegexpVm.replaceDefineProperty=Object.defineProperty;
__nonaRegexpVm.replaceCreate=Object.create;
// The native first-unit scan (#258): a host global only where the engine is linked.
__nonaRegexpVm.regexpScan=typeof __nonaRegexpScan==='function'?__nonaRegexpScan:null;
delete globalThis.__nonaRegexpScan;
__nonaRegexpVm.safeCall=Function.prototype.call.bind(Function.prototype.call);
__nonaRegexpVm.isRejectionError=Error.__nonaIsRejectionErrorInternal;
delete Error.__nonaIsRejectionErrorInternal;
__nonaRegexpVm.append=Array.__nonaAppendInternal;
delete Array.__nonaAppendInternal;
__nonaRegexpVm.typedArrayConstructor=Object.getPrototypeOf(Uint8Array);
__nonaRegexpVm.isTypedArray=__nonaRegexpVm.typedArrayConstructor.__nonaIsTypedArrayInternal;
delete __nonaRegexpVm.typedArrayConstructor.__nonaIsTypedArrayInternal;
__nonaRegexpVm.isConstructor=__nonaRegexpVm.typedArrayConstructor.__nonaIsConstructorInternal;
delete __nonaRegexpVm.typedArrayConstructor.__nonaIsConstructorInternal;
