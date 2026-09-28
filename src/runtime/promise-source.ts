// Promise reactions run after the top-level program, before native shutdown.
// This is compiled by the same frontend as user code.
export const promisePreludeSource=String.raw`
var __nonaPromiseDrainJobs=(function(){
  var jobs=[],head=0,states=new WeakMap();
  function enqueue(job){jobs.push(job)}
  function drain(){
    while(head<jobs.length){var job=jobs[head++];job()}
    jobs=[];head=0
  }
  function record(value){
    var state=states.get(value);
    if(state===undefined)throw new TypeError('Incompatible Promise receiver');
    return state
  }
  function settle(promise,kind,value){
    var state=record(promise);
    if(state.kind!==0)return;
    state.kind=kind;state.value=value;
    var reactions=kind===1?state.fulfill:state.reject;
    state.fulfill=[];state.reject=[];
    for(var i=0;i<reactions.length;i++){
      var reaction=reactions[i];
      enqueue((function(r){return function(){runReaction(r,kind,value)}})(reaction))
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
          try{then.call(value,function(next){if(called)return;called=true;resolvePromise(promise,next)},
            function(reason){if(called)return;called=true;settle(promise,2,reason)})}
          catch(error){if(!called)settle(promise,2,error)}
        });
        return
      }
    }
    settle(promise,1,value)
  }
  function resolving(promise){
    var called=false;
    var functions={
      resolve(value){if(called)return;called=true;resolvePromise(promise,value)},
      reject(reason){if(called)return;called=true;settle(promise,2,reason)}
    };
    Object.defineProperty(functions.resolve,'name',{value:''});
    Object.defineProperty(functions.reject,'name',{value:''});
    return functions
  }
  function Promise(executor){
    if(new.target===undefined)throw new TypeError('Promise requires new');
    if(typeof executor!=='function')throw new TypeError('Promise executor must be callable');
    states.set(this,{kind:0,value:undefined,fulfill:[],reject:[]});
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
    if(state.kind===0){state.fulfill.push(reaction);state.reject.push(reaction)}
    else enqueue((function(kind,value){return function(){runReaction(reaction,kind,value)}})(state.kind,state.value));
    return next.promise
  }}).then;
  var caught=({catch(onRejected){return this.then(undefined,onRejected)}}).catch;
  var resolved=({resolve(value){
    var C=this;
    if(!__nonaRegexpVm.isConstructor(C))throw new TypeError('Promise.resolve receiver is not a constructor');
    if(value!==null&&(typeof value==='object'||typeof value==='function')&&states.get(value)!==undefined&&value.constructor===C)return value;
    var next=capability(C),resolve=next.resolve;resolve(value);return next.promise
  }}).resolve;
  var rejected=({reject(reason){
    var next=capability(this),reject=next.reject;reject(reason);return next.promise
  }}).reject;
  var finallyMethod=({finally(onFinally){
    var C=species(this);
    if(typeof onFinally!=='function')return this.then(onFinally,onFinally);
    return this.then(value=>{
      return promiseResolve(C,onFinally()).then(()=>value)
    },reason=>{
      return promiseResolve(C,onFinally()).then(()=>{throw reason})
    })
  }}).finally;
  function promiseResolve(C,value){
    if(value!==null&&(typeof value==='object'||typeof value==='function')&&states.get(value)!==undefined&&value.constructor===C)return value;
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
        var index=values.length;values.push(undefined);remaining++;
        (function(position){
          var called=false;
          if(mode===0)promise.then(value=>{
            if(called)return;called=true;values[position]=value;remaining--;if(remaining===0)resolve(values)
          },reject);
          else promise.then(value=>{
            if(called)return;called=true;values[position]={status:'fulfilled',value:value};remaining--;if(remaining===0)resolve(values)
          },reason=>{
            if(called)return;called=true;values[position]={status:'rejected',reason:reason};remaining--;if(remaining===0)resolve(values)
          })
        })(index)
      }
      remaining--;if(remaining===0&&mode!==2)resolve(values)
    }catch(error){reject(error)}
    return next.promise
  }
  var all=({all(iterable){return combinator(this,iterable,0)}}).all;
  var allSettled=({allSettled(iterable){return combinator(this,iterable,1)}}).allSettled;
  var race=({race(iterable){return combinator(this,iterable,2)}}).race;
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
  Object.defineProperty(Promise,Symbol.species,{get:function(){return this},configurable:true});
  Object.defineProperty(Promise.prototype,Symbol.toStringTag,{value:'Promise',configurable:true});
  Object.defineProperty(globalThis,'Promise',{value:Promise,writable:true,configurable:true});
  Function.prototype.__nonaMarkNativeInternal(Promise);
  return drain
})();
`;
