// Promise reactions run after the top-level program, before native shutdown.
// This is compiled by the same frontend as user code.
export const promisePreludeSource=String.raw`
var __nonaPromiseDrainJobs=(function(){
  var jobs=[],head=0,unhandled=[],states=new WeakMap(),defineProperty=Object.defineProperty;
  var failOnUnhandled=__NONA_FAIL_ON_UNHANDLED__;
  var getState=WeakMap.prototype.get.bind(states),setState=WeakMap.prototype.set.bind(states);
  // CreateDataProperty through one reused descriptor: a fresh descriptor
  // object per append cost five allocations on every job and reaction.
  var appendDescriptor={value:undefined,writable:true,enumerable:true,configurable:true};
  function append(array,value){
    appendDescriptor.value=value;defineProperty(array,array.length,appendDescriptor);appendDescriptor.value=undefined
  }
  var noReactions=[];
  function enqueue(job){append(jobs,job)}
  // Realms created later reuse the first realm's queue and drain.
  var sharedQueue=Function.prototype.__nonaSharedQueueInternal,hostEnqueue=sharedQueue();
  if(typeof hostEnqueue==='function')enqueue=function(job){hostEnqueue(job)};
  else sharedQueue(enqueue);
  function drain(){
    while(head<jobs.length){var job=jobs[head++];job()}
    jobs=[];head=0;
    for(var i=0;i<unhandled.length;i++){
      if(failOnUnhandled&&!unhandled[i].handled)throw unhandled[i].value
    }
    unhandled=[]
  }
  function record(value){
    var state=getState(value);
    if(state===undefined)throw new TypeError('Incompatible Promise receiver');
    return state
  }
  function settle(promise,kind,value){
    var state=record(promise);
    if(state.kind!==0)return;
    state.kind=kind;state.value=value;
    if(kind===2&&!state.handled)append(unhandled,state);
    var reactions=kind===1?state.fulfill:state.reject;
    state.fulfill=noReactions;state.reject=noReactions;
    for(let i=0;i<reactions.length;i++){
      let reaction=reactions[i];
      enqueue(function(){runReaction(reaction,kind,value)})
    }
  }
  function runReaction(reaction,kind,value){
    try{
      var handler=kind===1?reaction.onFulfilled:reaction.onRejected;
      var resolve=reaction.resolve,reject=reaction.reject;
      if(typeof handler!=='function'){
        if(kind===1)resolve(value);else reject(value)
      }else resolve(handler(value))
    }catch(error){var reject=reaction.reject;reject(error)}
  }
  function resolvePromise(promise,value){
    if(promise===value){settle(promise,2,new TypeError('Promise self resolution'));return}
    if(value!==null&&(typeof value==='object'||typeof value==='function')){
      var then;
      try{then=value.then}catch(error){settle(promise,2,error);return}
      if(typeof then==='function'){
        enqueue(function(){
          var called=false;
          try{then.call(value,next=>{if(called)return;called=true;resolvePromise(promise,next)},
            reason=>{if(called)return;called=true;settle(promise,2,reason)})}
          catch(error){if(!called)settle(promise,2,error)}
        });
        return
      }
    }
    settle(promise,1,value)
  }
  // The resolving functions are anonymous (name ""): arrows in an array
  // literal get no name, so nothing has to be redefined afterwards.
  function resolving(promise){
    var called=false;
    var functions=[
      value=>{if(called)return;called=true;resolvePromise(promise,value)},
      reason=>{if(called)return;called=true;settle(promise,2,reason)}
    ];
    return {resolve:functions[0],reject:functions[1]}
  }
  function Promise(executor){
    if(new.target===undefined)throw new TypeError('Promise requires new');
    if(typeof executor!=='function')throw new TypeError('Promise executor must be callable');
    setState(this,{kind:0,value:undefined,fulfill:[],reject:[],handled:false});
    var functions=resolving(this);
    try{executor(functions.resolve,functions.reject)}catch(error){functions.reject(error)}
  }
  function species(value){
    var constructor=value.constructor;
    if(constructor===undefined)return Promise;
    if(constructor===null||(typeof constructor!=='object'&&typeof constructor!=='function'))throw new TypeError('Invalid Promise constructor');
    var result=constructor[Symbol.species];
    return result===undefined||result===null?Promise:result
  }
  function capability(C){
    if(!__nonaRegexpVm.isConstructor(C))throw new TypeError('Promise constructor required');
    var resolve,reject;
    var promise=new C((y,n)=>{
      if(resolve!==undefined||reject!==undefined)throw new TypeError('Promise capability executor called twice');
      resolve=y;reject=n
    });
    if(typeof resolve!=='function'||typeof reject!=='function')throw new TypeError('Invalid Promise capability');
    return {promise:promise,resolve:resolve,reject:reject}
  }
  var then=({then(onFulfilled,onRejected){
    var state=record(this),C=species(this),next=capability(C);
    var reaction={onFulfilled:onFulfilled,onRejected:onRejected,resolve:next.resolve,reject:next.reject};
    state.handled=true;
    if(state.kind===0){append(state.fulfill,reaction);append(state.reject,reaction)}
    else enqueue((function(kind,value){return function(){runReaction(reaction,kind,value)}})(state.kind,state.value));
    return next.promise
  }}).then;
  var caught=({catch(onRejected){return this.then(undefined,onRejected)}}).catch;
  var resolved=({resolve(value){
    var C=this;
    if(!__nonaRegexpVm.isConstructor(C))throw new TypeError('Promise.resolve receiver is not a constructor');
    if(value!==null&&(typeof value==='object'||typeof value==='function')&&getState(value)!==undefined&&value.constructor===C)return value;
    var next=capability(C),resolve=next.resolve;resolve(value);return next.promise
  }}).resolve;
  var rejected=({reject(reason){
    var next=capability(this),reject=next.reject;reject(reason);return next.promise
  }}).reject;
  var finallyMethod=({finally(onFinally){
    var C=species(this);
    if(typeof onFinally!=='function')return this.then(onFinally,onFinally);
    return this.then(value=>promiseResolve(C,onFinally()).then(()=>value),
      reason=>promiseResolve(C,onFinally()).then(()=>{throw reason}))
  }}).finally;
  function promiseResolve(C,value){
    if(value!==null&&(typeof value==='object'||typeof value==='function')&&getState(value)!==undefined&&value.constructor===C)return value;
    var next=capability(C),resolve=next.resolve;resolve(value);return next.promise
  }
  function combinator(C,iterable,mode){
    var next=capability(C),resolve=next.resolve,reject=next.reject;
    var values=[],remaining=1;
    try{
      var resolveMethod=C.resolve;
      if(typeof resolveMethod!=='function')throw new TypeError('Promise.resolve must be callable');
      for(var item of iterable){
        var promise=resolveMethod.call(C,item);
        if(mode===2){promise.then(resolve,reject);continue}
        var index=values.length;append(values,undefined);remaining++;
        (function(position){
          var called=false;
          // Promise.any (ES2021): the first fulfilment wins; all rejections
          // reject with an AggregateError of the reasons in order.
          if(mode===3)promise.then(resolve,reason=>{
            if(called)return;called=true;values[position]=reason;remaining--;if(remaining===0)reject(aggregate(values))
          });
          else if(mode===0)promise.then(value=>{
            if(called)return;called=true;values[position]=value;remaining--;if(remaining===0)resolve(values)
          },reject);
          else promise.then(value=>{
            if(called)return;called=true;values[position]={status:'fulfilled',value:value};remaining--;if(remaining===0)resolve(values)
          },reason=>{
            if(called)return;called=true;values[position]={status:'rejected',reason:reason};remaining--;if(remaining===0)resolve(values)
          })
        })(index)
      }
      remaining--;if(remaining===0&&mode===3)reject(aggregate(values));else if(remaining===0&&mode!==2)resolve(values)
    }catch(error){reject(error)}
    return next.promise
  }
  var all=({all(iterable){return combinator(this,iterable,0)}}).all;
  var allSettled=({allSettled(iterable){return combinator(this,iterable,1)}}).allSettled;
  var race=({race(iterable){return combinator(this,iterable,2)}}).race;
  var AggregateErrorConstructor=__nonaRegexpVm.AggregateError;
  function aggregate(errors){var error=new AggregateErrorConstructor([]);Object.defineProperty(error,'errors',{value:errors,writable:true,enumerable:false,configurable:true});return error}
  var any=({any(iterable){return combinator(this,iterable,3)}}).any;
  function method(target,name,value){
    Object.defineProperty(target,name,{value:value,writable:true,configurable:true});
    Object.defineProperty(value,'name',{value:name,configurable:true});
    Function.prototype.__nonaMarkNativeInternal(value)
  }
  method(Promise.prototype,'then',then);
  method(Promise.prototype,'catch',caught);
  method(Promise.prototype,'finally',finallyMethod);
  method(Promise,'resolve',resolved);
  method(Promise,'reject',rejected);
  method(Promise,'all',all);
  method(Promise,'allSettled',allSettled);
  method(Promise,'race',race);
  method(Promise,'any',any);
  var speciesGetter=Object.getOwnPropertyDescriptor({get [Symbol.species](){return this}},Symbol.species).get;
  Object.defineProperty(Promise,Symbol.species,{get:speciesGetter,configurable:true});
  Object.defineProperty(Promise,'prototype',{writable:false});
  Object.defineProperty(Promise.prototype,Symbol.toStringTag,{value:'Promise',configurable:true});
  Object.defineProperty(globalThis,'Promise',{value:Promise,writable:true,configurable:true});
  Function.prototype.__nonaMarkNativeInternal(Promise);
  Function.prototype.__nonaMarkNativeInternal(speciesGetter);
  Function.prototype.__nonaMarkPromiseInternal(Promise);

  // Async functions and generators run on internal generator coroutines.
  // Each await suspends the coroutine with an own "await" flag in its result.
  var coroutinePrototype=Object.getPrototypeOf(function*(){}).prototype;
  var coroutineNext=coroutinePrototype.next,coroutineThrow=coroutinePrototype.throw,coroutineReturn=coroutinePrototype.return;
  var hasOwn=Object.prototype.hasOwnProperty,objectCreate=Object.create,getPrototypeOf=Object.getPrototypeOf;
  function noop(){}
  function performThen(promise,onFulfilled,onRejected){
    var state=record(promise);
    var reaction={onFulfilled:onFulfilled,onRejected:onRejected,resolve:noop,reject:noop};
    state.handled=true;
    if(state.kind===0){append(state.fulfill,reaction);append(state.reject,reaction)}
    else enqueue((function(kind,value){return function(){runReaction(reaction,kind,value)}})(state.kind,state.value))
  }
  // Await(value): PromiseResolve(%Promise%, value), then PerformPromiseThen.
  function awaitValue(value,onFulfilled,onRejected){performThen(promiseResolve(Promise,value),onFulfilled,onRejected)}
  function resume(coroutine,mode,value){
    return mode===0?coroutineNext.call(coroutine,value):mode===1?coroutineThrow.call(coroutine,value):coroutineReturn.call(coroutine,value)
  }
  // The internal coroutine marks an await step with an own "await" property
  // on its fresh result object (see rt.generatorNext); nothing else can.
  function isAwait(result){return result.await===true}
  __nonaRegexpVm.asyncFunctionStart=function(coroutine){
    var promise=new Promise(noop),functions=resolving(promise),resumeNext,resumeThrow;
    function step(mode,value){
      var result;
      try{result=resume(coroutine,mode,value)}
      catch(error){var reject=functions.reject;reject(error);return}
      if(isAwait(result)){
        // The continuations exist only for functions that do await.
        if(resumeNext===undefined){resumeNext=function(value){step(0,value)};resumeThrow=function(error){step(1,error)}}
        try{awaitValue(result.value,resumeNext,resumeThrow)}catch(error){step(1,error)}
        return
      }
      var resolve=functions.resolve;resolve(result.value)
    }
    step(0,undefined);
    return promise
  };

  var asyncGeneratorStates=new WeakMap();
  var getGeneratorState=WeakMap.prototype.get.bind(asyncGeneratorStates),setGeneratorState=WeakMap.prototype.set.bind(asyncGeneratorStates);
  var asyncGeneratorPrototype=Object.getPrototypeOf((async function*(){}).prototype);
  function iterResult(value,done){return {value:value,done:done}}
  function generatorSettle(generator,rejected,value){
    var state=getGeneratorState(generator),request=state.queue[state.head];
    state.queue[state.head++]=undefined;
    if(state.head===state.queue.length){state.queue=[];state.head=0}
    if(rejected){var reject=request.reject;reject(value)}
    else{var resolve=request.resolve;resolve(value)}
  }
  // AsyncGeneratorResumeNext: states 0 suspendedStart, 1 suspendedYield,
  // 2 executing, 3 awaiting-return, 4 completed.
  function resumeNextRequest(generator){
    var state=getGeneratorState(generator);
    for(;;){
      if(state.state===2||state.state===3||state.head===state.queue.length)return;
      var request=state.queue[state.head],mode=request.mode,value=request.value;
      if(mode!==0){
        if(state.state===0)state.state=4;
        if(state.state===4){
          if(mode===2){
            state.state=3;
            try{
              awaitValue(value,function(result){state.state=4;generatorSettle(generator,false,iterResult(result,true));resumeNextRequest(generator)},
                function(reason){state.state=4;generatorSettle(generator,true,reason);resumeNextRequest(generator)})
            }catch(error){state.state=4;generatorSettle(generator,true,error);continue}
            return
          }
          generatorSettle(generator,true,value);continue
        }
      }else if(state.state===4){generatorSettle(generator,false,iterResult(undefined,true));continue}
      var resumeFromYield=state.state===1;
      state.state=2;
      // A return request resumes a suspended yield after awaiting its value.
      if(mode===2&&resumeFromYield){
        try{awaitValue(value,function(result){generatorStep(generator,2,result)},function(reason){generatorStep(generator,1,reason)})}
        catch(error){generatorStep(generator,1,error)}
        return
      }
      generatorStep(generator,mode,value);
      return
    }
  }
  function generatorStep(generator,mode,value){
    var state=getGeneratorState(generator),result;
    try{result=resume(state.coroutine,mode,value)}
    catch(error){state.state=4;generatorSettle(generator,true,error);resumeNextRequest(generator);return}
    if(isAwait(result)){
      try{awaitValue(result.value,function(next){generatorStep(generator,0,next)},function(reason){generatorStep(generator,1,reason)})}
      catch(error){generatorStep(generator,1,error)}
      return
    }
    if(result.done){state.state=4;generatorSettle(generator,false,iterResult(result.value,true));resumeNextRequest(generator);return}
    state.state=1;generatorSettle(generator,false,iterResult(result.value,false));resumeNextRequest(generator)
  }
  __nonaRegexpVm.asyncGeneratorStart=function(coroutine){
    var prototype=getPrototypeOf(coroutine);
    if(prototype===coroutinePrototype)prototype=asyncGeneratorPrototype;
    var generator=objectCreate(prototype);
    setGeneratorState(generator,{coroutine:coroutine,state:0,queue:[],head:0});
    return generator
  };
  function enqueueRequest(generator,mode,value){
    var promise=new Promise(noop),functions=resolving(promise);
    var state=generator!==null&&(typeof generator==='object'||typeof generator==='function')?getGeneratorState(generator):undefined;
    if(state===undefined){var reject=functions.reject;reject(new TypeError('Not an async generator'));return promise}
    append(state.queue,{mode:mode,value:value,resolve:functions.resolve,reject:functions.reject});
    if(state.state!==2)resumeNextRequest(generator);
    return promise
  }
  function define(target,name,value,writable){
    Object.defineProperty(target,name,{value:value,writable:writable,configurable:true})
  }
  function nativeMethod(target,name,value){
    define(target,name,value,true);
    Function.prototype.__nonaMarkNativeInternal(value)
  }
  nativeMethod(asyncGeneratorPrototype,'next',({next(value){return enqueueRequest(this,0,value)}}).next);
  nativeMethod(asyncGeneratorPrototype,'return',({return(value){return enqueueRequest(this,2,value)}}).return);
  nativeMethod(asyncGeneratorPrototype,'throw',({throw(value){return enqueueRequest(this,1,value)}}).throw);
  define(asyncGeneratorPrototype,Symbol.toStringTag,'AsyncGenerator',false);
  var asyncIteratorPrototype=getPrototypeOf(asyncGeneratorPrototype);
  var asyncIterator=({[Symbol.asyncIterator](){'use strict';return this}})[Symbol.asyncIterator];
  nativeMethod(asyncIteratorPrototype,Symbol.asyncIterator,asyncIterator);
  // GetIterator(obj, async) and %AsyncFromSyncIteratorPrototype%.
  var asyncIteratorSymbol=Symbol.asyncIterator,iteratorSymbol=Symbol.iterator;
  function isObject(value){return value!==null&&(typeof value==='object'||typeof value==='function')}
  var asyncFromSyncStates=new WeakMap();
  var getSyncRecord=WeakMap.prototype.get.bind(asyncFromSyncStates),setSyncRecord=WeakMap.prototype.set.bind(asyncFromSyncStates);
  var asyncFromSyncPrototype=objectCreate(asyncIteratorPrototype);
  function syncRecord(iterator){
    var record=isObject(iterator)?getSyncRecord(iterator):undefined;
    if(record===undefined)throw new TypeError('Not an async-from-sync iterator');
    return record
  }
  // Newer editions close the sync iterator when a yielded promise rejects;
  // Test262 and current engines follow that behavior.
  function closeSyncIterator(record,throwing,error){
    if(throwing){
      try{var method=record.iterator.return;if(method!==undefined&&method!==null)method.call(record.iterator)}catch(ignored){}
      throw error
    }
    var method=record.iterator.return;
    if(method===undefined||method===null)return;
    var result=method.call(record.iterator);
    if(!isObject(result))throw new TypeError('Iterator result must be an object')
  }
  function asyncFromSyncContinuation(result,functions,record,closeOnRejection){
    try{
      var done=!!result.done,value=result.value,wrapper;
      try{wrapper=promiseResolve(Promise,value)}
      catch(error){if(!done&&closeOnRejection)closeSyncIterator(record,true,error);throw error}
      var state=record_(wrapper);state.handled=true;
      var onRejected=done||!closeOnRejection?undefined:function(error){closeSyncIterator(record,true,error)};
      var reaction={onFulfilled:function(unwrapped){return iterResult(unwrapped,done)},onRejected:onRejected,resolve:functions.resolve,reject:functions.reject};
      if(state.kind===0){append(state.fulfill,reaction);append(state.reject,reaction)}
      else enqueue((function(kind,settled){return function(){runReaction(reaction,kind,settled)}})(state.kind,state.value))
    }catch(error){var reject=functions.reject;reject(error)}
  }
  var record_=record;
  function asyncFromSyncMethod(name,body){
    var method=({[name](value){
      var promise=new Promise(noop),functions=resolving(promise);
      try{var record=syncRecord(this);body(record,arguments.length>0,value,functions)}
      catch(error){var reject=functions.reject;reject(error)}
      return promise
    }})[name];
    nativeMethod(asyncFromSyncPrototype,name,method)
  }
  asyncFromSyncMethod('next',function(record,present,value,functions){
    var result=present?record.next.call(record.iterator,value):record.next.call(record.iterator);
    if(!isObject(result))throw new TypeError('Iterator result must be an object');
    asyncFromSyncContinuation(result,functions,record,true)
  });
  asyncFromSyncMethod('return',function(record,present,value,functions){
    var method=record.iterator.return;
    if(method===undefined||method===null){var resolve=functions.resolve;resolve(iterResult(value,true));return}
    var result=present?method.call(record.iterator,value):method.call(record.iterator);
    if(!isObject(result))throw new TypeError('Iterator result must be an object');
    asyncFromSyncContinuation(result,functions,record,false)
  });
  asyncFromSyncMethod('throw',function(record,present,value,functions){
    var method=record.iterator.throw;
    if(method===undefined||method===null){
      closeSyncIterator(record,false);
      throw new TypeError('The iterator does not provide a throw method')
    }
    var result=present?method.call(record.iterator,value):method.call(record.iterator);
    if(!isObject(result))throw new TypeError('Iterator result must be an object');
    asyncFromSyncContinuation(result,functions,record,true)
  });
  __nonaRegexpVm.getAsyncIterator=function(object){
    var method=object[asyncIteratorSymbol];
    if(method===undefined||method===null){
      var syncMethod=object[iteratorSymbol];
      if(typeof syncMethod!=='function')throw new TypeError('Object is not async iterable');
      var syncIterator=syncMethod.call(object);
      if(!isObject(syncIterator))throw new TypeError('Iterator must be an object');
      var iterator=objectCreate(asyncFromSyncPrototype);
      setSyncRecord(iterator,{iterator:syncIterator,next:syncIterator.next});
      return iterator
    }
    if(typeof method!=='function')throw new TypeError('Symbol.asyncIterator must be callable');
    var result=method.call(object);
    if(!isObject(result))throw new TypeError('Async iterator must be an object');
    return result
  };
  // Object environment records for sloppy-mode with statements.
  var unscopablesSymbol=Symbol.unscopables,reflectSet=Reflect.set;
  __nonaRegexpVm.withObject=function(value){
    if(value===undefined||value===null)throw new TypeError('Cannot convert undefined or null to object');
    return Object(value)
  };
  __nonaRegexpVm.withHasBinding=function(object,name){
    if(object===undefined)return false; // eval-aot environment not created yet
    if(!(name in object))return false;
    var unscopables=object[unscopablesSymbol];
    return !(isObject(unscopables)&&unscopables[name])
  };
  __nonaRegexpVm.withGetBindingValue=function(object,name,strict){
    if(!(name in object)){if(strict)throw new ReferenceError(name+' is not defined');return undefined}
    return object[name]
  };
  __nonaRegexpVm.withSetMutableBinding=function(object,name,value,strict){
    if(!(name in object)&&strict)throw new ReferenceError(name+' is not defined');
    if(!reflectSet(object,name,value)&&strict)throw new TypeError('Cannot assign to read only property '+name)
  };
  // Literal eval compiled ahead of time (src/frontend/eval-aot.ts).
  var intrinsicEval=globalThis.eval,isExtensible=Object.isExtensible,reflectApplyEval=Reflect.apply;
  __nonaRegexpVm.isEval=function(value){return value===intrinsicEval};
  // The object environment of a function's sloppy eval var declarations, created on first use.
  __nonaRegexpVm.evalDeclareVars=function(env,names){
    if(env===undefined)env=objectCreate(null);
    for(var i=0;i<names.length;i++)if(!reflectGetOwn(env,names[i]))reflectDefine(env,names[i],{value:undefined,writable:true,enumerable:true,configurable:true});
    return env
  };
  // EvalDeclarationInstantiation for global code: CanDeclareGlobalFunction and
  // CanDeclareGlobalVar for every name, then the configurable bindings.
  __nonaRegexpVm.evalGlobalDeclarations=function(functionNames,functions,varNames){
    var global=globalThis,i,d;
    for(i=0;i<functionNames.length;i++){
      d=reflectGetOwn(global,functionNames[i]);
      if(d===undefined?!isExtensible(global):!d.configurable&&!('value'in d&&d.writable&&d.enumerable))throw new TypeError('Cannot declare global function '+functionNames[i]);
    }
    for(i=0;i<varNames.length;i++)if(!reflectGetOwn(global,varNames[i])&&!isExtensible(global))throw new TypeError('Cannot declare global variable '+varNames[i]);
    for(i=0;i<functionNames.length;i++){
      d=reflectGetOwn(global,functionNames[i]);
      if(!reflectDefine(global,functionNames[i],d===undefined||d.configurable?{value:functions[i],writable:true,enumerable:true,configurable:true}:{value:functions[i]}))throw new TypeError('Cannot declare global function '+functionNames[i]);
    }
    for(i=0;i<varNames.length;i++)if(!reflectGetOwn(global,varNames[i]))reflectDefine(global,varNames[i],{value:undefined,writable:true,enumerable:true,configurable:true});
  };
  __nonaRegexpVm.callWithGlobalThis=function(code){return reflectApplyEval(code,globalThis,[])};
  // Source text modules: namespace exotic objects, evaluation and import().
  var reflectGetOwn=Reflect.getOwnPropertyDescriptor,reflectDefine=Reflect.defineProperty,reflectDelete=Reflect.deleteProperty,reflectOwnKeys=Reflect.ownKeys,reflectGet=Reflect.get;
  var proxyCreate=Function.prototype.__nonaProxyCreateInternal,preventExtensions=Object.preventExtensions,toStringTagSymbol=Symbol.toStringTag;
  function sameValue(a,b){return a===b?a!==0||1/a===1/b:a!==a&&b!==b}
  __nonaRegexpVm.createImportMeta=function(){return objectCreate(null)};
  // ES2022 class elements. A private name is a record with a WeakMap from
  // each object that has it to its value (fields) or to true (the brand of a
  // private method or accessor, whose functions the record holds). Kinds:
  // 0 field, 1 method, 2 accessor.
  var weakMapConstructor=WeakMap,callPrototype=Function.prototype.call;
  function callBound(method){return callPrototype.bind(method)}
  var weakHas=callBound(WeakMap.prototype.has),weakGet=callBound(WeakMap.prototype.get),weakSet=callBound(WeakMap.prototype.set),reflectApplyField=Reflect.apply;
  __nonaRegexpVm.privateName=function(description,kind){
    // The name is its own WeakMap: native code reads fields and methods through it.
    var name=new weakMapConstructor();name.description=description;name.kind=kind;name.map=name;
    name.method=undefined;name.getter=undefined;name.setter=undefined;return name
  };
  __nonaRegexpVm.privateMethod=function(name,fn,kind){if(kind===1)name.getter=fn;else if(kind===2)name.setter=fn;else name.method=fn};
  // Private elements cannot be added to a non-extensible object (Test262
  // nonextensible-applies-to-private, ES2026).
  var objectIsExtensible=Object.isExtensible;
  function privateAdd(object,name,value){
    if(weakHas(name.map,object))throw new TypeError('Cannot initialize '+name.description+' twice on the same object');
    if(!objectIsExtensible(object))throw new TypeError('Cannot define private member '+name.description+' on a non-extensible object');
    weakSet(name.map,object,value)
  }
  function privateCheck(object,name,action){
    if(object===null||typeof object!=='object'&&typeof object!=='function'||!weakHas(name.map,object))
      throw new TypeError('Cannot '+action+' private member '+name.description+' from an object whose class did not declare it')
  }
  // A method's brand maps the object to the method itself.
  __nonaRegexpVm.privateBrand=function(object,name){privateAdd(object,name,name.kind===1?name.method:true)};
  __nonaRegexpVm.privateDefine=function(object,name,value){privateAdd(object,name,value)};
  __nonaRegexpVm.privateGet=function(object,name){
    privateCheck(object,name,'read');
    if(name.kind===0)return weakGet(name.map,object);
    if(name.kind===1)return name.method;
    if(name.getter===undefined)throw new TypeError("'"+name.description+"' was defined without a getter");
    return reflectApplyField(name.getter,object,[])
  };
  __nonaRegexpVm.privateSet=function(object,name,value){
    privateCheck(object,name,'write');
    if(name.kind===0)weakSet(name.map,object,value);
    else if(name.kind===1)throw new TypeError('Private method '+name.description+' is not writable');
    else if(name.setter===undefined)throw new TypeError("'"+name.description+"' was defined without a setter");
    else reflectApplyField(name.setter,object,[value]);
    return value
  };
  __nonaRegexpVm.privateIn=function(name,object){
    if(object===null||typeof object!=='object'&&typeof object!=='function')throw new TypeError("Cannot use 'in' operator to search for '"+name.description+"' in "+(object===null?'null':typeof object));
    return weakHas(name.map,object)
  };
  // InitializeInstanceElements / static elements: triples of kind (0 brand of
  // a private method, 1 field, 2 private field, 3 static block), key or
  // private name or block, and initializer (undefined without one).
  var fieldDescriptor={value:undefined,writable:true,enumerable:true,configurable:true};
  __nonaRegexpVm.initializeFields=function(object,list){
    for(var i=0;i<list.length;i+=3){
      var kind=list[i],key=list[i+1],init=list[i+2];
      if(kind===0){privateAdd(object,key,key.kind===1?key.method:true);continue}
      if(kind===3){reflectApplyField(key,object,[]);continue}
      var value=init===undefined?undefined:reflectApplyField(init,object,[kind===2?key.description:key]);
      if(kind===2){privateAdd(object,key,value);continue}
      fieldDescriptor.value=value;
      try{defineProperty(object,key,fieldDescriptor)}finally{fieldDescriptor.value=undefined}
    }
  };
  // A computed static class element named "prototype" fails DefinePropertyOrThrow.
  __nonaRegexpVm.staticMethodKey=function(key){if(key==='prototype')throw new TypeError('Classes may not have a static property named \'prototype\'');return key};
  __nonaRegexpVm.createNamespace=function(names,getters){
    var target=objectCreate(null),lookup=objectCreate(null),keys=[];
    for(var i=0;i<names.length;i++){
      defineProperty(target,names[i],{value:undefined,writable:true,enumerable:true,configurable:false});
      lookup[names[i]]=getters[i];append(keys,names[i]);
    }
    defineProperty(target,toStringTagSymbol,{value:'Module',writable:false,enumerable:false,configurable:false});
    preventExtensions(target);
    function exported(key){return typeof key==='string'&&hasOwn.call(lookup,key)}
    function ownDescriptor(key){return {value:lookup[key](),writable:true,enumerable:true,configurable:false}}
    return proxyCreate(target,{
      get(t,key){if(typeof key==='symbol')return reflectGet(t,key);return exported(key)?lookup[key]():undefined},
      set(){return false},
      has(t,key){return typeof key==='symbol'?key in t:exported(key)},
      deleteProperty(t,key){return typeof key==='symbol'?reflectDelete(t,key):!exported(key)},
      getOwnPropertyDescriptor(t,key){if(typeof key==='symbol')return reflectGetOwn(t,key);return exported(key)?ownDescriptor(key):undefined},
      defineProperty(t,key,descriptor){
        if(typeof key==='symbol')return reflectDefine(t,key,descriptor);
        if(!exported(key))return false;
        var current=ownDescriptor(key);
        if(descriptor.configurable===true||descriptor.enumerable===false||'get'in descriptor||'set'in descriptor||descriptor.writable===false)return false;
        return 'value'in descriptor?sameValue(descriptor.value,current.value):true
      },
      ownKeys(t){var result=[];for(var i=0;i<keys.length;i++)append(result,keys[i]);append(result,toStringTagSymbol);return result},
      getPrototypeOf(){return null},
      setPrototypeOf(t,prototype){return prototype===null},
      isExtensible(){return false},
      preventExtensions(){return true}
    })
  };
  var moduleTable=[],modulePaths=objectCreate(null);
  __nonaRegexpVm.registerModule=function(index,path,body,requests,namespace,specifiers,targets,linkError){
    var resolved=objectCreate(null);for(var i=0;i<specifiers.length;i++)resolved[specifiers[i]]=targets[i];
    moduleTable[index]={path:path,body:body,requests:requests,namespace:namespace,resolved:resolved,status:0,error:undefined,failed:false,linkError:linkError};
    modulePaths[path]=index
  };
  var scriptRecord;
  __nonaRegexpVm.registerScript=function(path,specifiers,targets){
    var resolved=objectCreate(null);for(var i=0;i<specifiers.length;i++)resolved[specifiers[i]]=targets[i];
    scriptRecord={path:path,resolved:resolved}
  };
  function evaluateModule(index){
    var record=moduleTable[index];
    if(record.status===2){if(record.failed)throw record.error;return}
    if(record.status===1)return;
    record.status=1;
    try{
      for(var i=0;i<record.requests.length;i++)evaluateModule(record.requests[i]);
      record.body.call(undefined)
    }catch(error){record.status=2;record.failed=true;record.error=error;throw error}
    record.status=2
  }
  __nonaRegexpVm.evaluateModule=evaluateModule;
  // Link errors anywhere in the static graph of an imported module.
  function linkError(index,seen){
    if(seen[index])return undefined;seen[index]=true;
    var record=moduleTable[index];if(record.linkError!==undefined)return record.linkError;
    for(var i=0;i<record.requests.length;i++){var error=linkError(record.requests[i],seen);if(error!==undefined)return error}
    return undefined
  }
  function resolveSpecifier(specifier,referrerPath){
    if(!(specifier.slice(0,2)==='./'||specifier.slice(0,3)==='../'||specifier.slice(0,1)==='/'))return undefined;
    var parts=[],segments=specifier.split('/'),i;
    if(specifier.slice(0,1)!=='/'){var base=referrerPath.split('/');for(i=1;i<base.length-1;i++)append(parts,base[i])}
    for(i=0;i<segments.length;i++){
      var segment=segments[i];
      if(segment===''||segment==='.')continue;
      if(segment==='..')parts.length=parts.length>0?parts.length-1:0;else append(parts,segment)
    }
    return '/'+parts.join('/')
  }
  __nonaRegexpVm.dynamicImport=function(specifier,referrer){
    var promise=new Promise(noop),functions=resolving(promise);
    try{
      if(typeof specifier==='symbol')throw new TypeError('Cannot convert a Symbol value to a string');
      var text=String(specifier);
      var target,record=referrer>=0?moduleTable[referrer]:scriptRecord;
      if(record&&hasOwn.call(record.resolved,text))target=record.resolved[text];
      else if(record){var path=resolveSpecifier(text,record.path);if(path!==undefined&&hasOwn.call(modulePaths,path))target=modulePaths[path]}
      if(target===undefined)throw new TypeError('Cannot find module \''+text+'\'');
      var failure=linkError(target,objectCreate(null));
      if(failure!==undefined)throw new SyntaxError(failure);
      enqueue(function(){
        try{evaluateModule(target)}catch(error){var reject=functions.reject;reject(error);return}
        var resolve=functions.resolve;resolve(moduleTable[target].namespace)
      })
    }catch(error){var reject=functions.reject;reject(error)}
    return promise
  };
  // Dynamic async function constructors are part of the documented
  // eval/Function exception; they exist for reflection only.
  // An empty source needs no compiler: it yields a fresh anonymous function of that kind.
  function dynamicConstructor(name,prototype,makeEmpty){
    var constructor=function(){
      // ToString of every argument first (observable), then the exception.
      for(var i=0,source=false;i<arguments.length;i++)if((''+arguments[i]).trim()!=='')source=true;
      if(source)throw new EvalError('Nona compiles ahead of time: '+name+' needs source text known at compile time');
      var fn=makeEmpty();
      define(fn,'name','anonymous',false);
      if(new.target!==undefined&&new.target!==constructor){
        var proto=new.target.prototype;
        if(proto!==null&&(typeof proto==='object'||typeof proto==='function'))Object.setPrototypeOf(fn,proto)
      }
      return fn
    };
    define(constructor,'name',name,false);
    define(constructor,'length',1,false);
    Object.defineProperty(constructor,'prototype',{value:prototype,writable:false,enumerable:false,configurable:false});
    Object.setPrototypeOf(constructor,Function);
    define(prototype,'constructor',constructor,false);
    Function.prototype.__nonaMarkNativeInternal(constructor);
    return constructor
  }
  var asyncFunctionPrototype=getPrototypeOf(async function(){});
  define(asyncFunctionPrototype,Symbol.toStringTag,'AsyncFunction',false);
  dynamicConstructor('AsyncFunction',asyncFunctionPrototype,function(){return async function(){}});
  var asyncGeneratorFunctionPrototype=getPrototypeOf(async function*(){});
  define(asyncGeneratorFunctionPrototype,Symbol.toStringTag,'AsyncGeneratorFunction',false);
  define(asyncGeneratorFunctionPrototype,'prototype',asyncGeneratorPrototype,false);
  define(asyncGeneratorPrototype,'constructor',asyncGeneratorFunctionPrototype,false);
  dynamicConstructor('AsyncGeneratorFunction',asyncGeneratorFunctionPrototype,function(){return async function*(){}});
  var generatorFunctionPrototype=getPrototypeOf(function*(){});
  if(!hasOwn.call(generatorFunctionPrototype,'constructor'))dynamicConstructor('GeneratorFunction',generatorFunctionPrototype,function(){return function*(){}});
  if(!hasOwn.call(generatorFunctionPrototype,Symbol.toStringTag))define(generatorFunctionPrototype,Symbol.toStringTag,'GeneratorFunction',false);
  // The timer prelude queues microtasks (queueMicrotask) on the same queue.
  __nonaRegexpVm.enqueueJob=function(job){enqueue(job)};
  return drain
})();
`;
