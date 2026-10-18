;
    var vm=__nonaRegexpVm.core;
    if(re===undefined){vm.compile(pattern,flags);return undefined}
    var compiled=vm.compile(pattern,flags);
    var matched=vm.execute(compiled,input,start,sticky);
    var globalOrSticky=__nonaRegexpVm.replaceIndexOf.call(flags,'g')>=0||__nonaRegexpVm.replaceIndexOf.call(flags,'y')>=0;
    if(matched===null){
      if(globalOrSticky)re.lastIndex=0;
      return null
    }
    if(globalOrSticky)re.lastIndex=matched.end;
    var result=[__nonaRegexpVm.replaceSlice.call(input,matched.start,matched.end)],captures=matched.captures;
    var field={value:undefined,writable:true,enumerable:true,configurable:true};
    for(var i=1;i<=compiled.groups;i++){
      var begin=captures[i*2];
      field.value=begin===4294967295?undefined:__nonaRegexpVm.replaceSlice.call(input,begin,captures[i*2+1]);
      Object.defineProperty(result,i,field)
    }
    field.value=matched.start;Object.defineProperty(result,'index',field);
    field.value=input;Object.defineProperty(result,'input',field);
    var groups=undefined;
    if(compiled.names.length){
      groups=Object.create(null);
      for(var i=0;i<compiled.names.length;i++){
        // A duplicate name (ES2025) keeps the value of the group that participated.
        var named=compiled.names[i],begin=captures[named.index*2];
        if(begin!==4294967295)groups[named.name]=__nonaRegexpVm.replaceSlice.call(input,begin,captures[named.index*2+1]);
        else if(!(named.name in groups))groups[named.name]=undefined
      }
    }
    field.value=groups;Object.defineProperty(result,'groups',field);
    // The d flag: the core adds indices, so programs without the engine do not carry the code.
    vm.indices(result,compiled,matched);
    return result
};
__nonaRegexpVm.replaceApply=Function.prototype.apply;
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
