// Timers and the host event loop (setTimeout/setInterval/queueMicrotask).
// The prelude replaces the Promise drain function with the event loop: the
// entry calls it once after the top-level program. It adds no prelude globals.
export const timersPreludeSource=String.raw`
__nonaPromiseDrainJobs=(function(drain){
  // Cloned realms (Test262) have no host primitives; they share the first realm's loop.
  if(typeof __nonaHostNow!=='function')return drain;
  var hostNow=__nonaHostNow,hostWait=__nonaHostWait;
  delete globalThis.__nonaHostNow;delete globalThis.__nonaHostWait;
  var defineProperty=Object.defineProperty,reflectApply=Reflect.apply,floor=Math.floor,ceil=Math.ceil,toNumber=Number;
  var enqueueJob=__nonaRegexpVm.enqueueJob;
  var heap=[],active=new Map(),count=0,referenced=0,nextId=1,seq=0,origin=hostNow();
  var immediates=[],immediateHead=0,immediateStates=new WeakMap();
  var immediateGet=WeakMap.prototype.get.bind(immediateStates),immediateSet=WeakMap.prototype.set.bind(immediateStates);
  __nonaRegexpVm.hasPendingTimers=function(){return referenced!==0};
  __nonaRegexpVm.activeTimerResources=function(){var resources=[];active.forEach(function(timer){if(timer.referenced)append(resources,timer.immediate?'Immediate':'Timeout')});return resources};
  var getTimer=Map.prototype.get.bind(active),setTimer=Map.prototype.set.bind(active),deleteTimer=Map.prototype['delete'].bind(active);
  function append(array,value){defineProperty(array,array.length,{value:value,writable:true,enumerable:true,configurable:true})}
  function less(x,y){return x.when<y.when||(x.when===y.when&&x.seq<y.seq)}
  function siftUp(i){
    while(i>0){var p=floor((i-1)/2);if(!less(heap[i],heap[p]))return;var t=heap[i];heap[i]=heap[p];heap[p]=t;i=p}
  }
  function siftDown(i){
    var n=heap.length;
    for(;;){
      var l=2*i+1,r=l+1,m=i;
      if(l<n&&less(heap[l],heap[m]))m=l;
      if(r<n&&less(heap[r],heap[m]))m=r;
      if(m===i)return;
      var t=heap[i];heap[i]=heap[m];heap[m]=t;i=m
    }
  }
  function push(timer){append(heap,timer);siftUp(heap.length-1)}
  function pop(){
    var top=heap[0],last=heap[heap.length-1];heap.length=heap.length-1;
    if(heap.length>0){heap[0]=last;siftDown(0)}
    return top
  }
  // Cancelled timers are removed lazily; rebuild when they dominate the heap.
  function compact(){
    if(heap.length<=64||heap.length<=2*count)return;
    var live=[];
    for(var i=0;i<heap.length;i++)if(!heap[i].cancelled)append(live,heap[i]);
    heap=live;
    for(var j=floor(heap.length/2)-1;j>=0;j--)siftDown(j)
  }
  function delayOf(delay){delay=toNumber(delay);return delay>=1&&delay<=2147483647?delay:1}
  function schedule(callback,delay,args,repeat,unreferenced){
    if(typeof callback!=='function')throw new TypeError('The "callback" argument must be of type function');
    var context=__nonaRegexpVm.asyncContext;
    var d=delayOf(delay),id=nextId++;
    var timer={id:id,when:hostNow()+d,seq:++seq,delay:d,callback:callback,args:args,repeat:repeat,cancelled:false,referenced:!unreferenced,context:context?context.activeRecord:undefined};
    setTimer(id,timer);count++;if(timer.referenced)referenced++;push(timer);
    return id
  }
  function rest(list){var args=[];for(var i=2;i<list.length;i++)append(args,list[i]);return args}
  function cancel(id){
    if(typeof id!=='number'&&typeof id!=='string')return;
    var timer=getTimer(toNumber(id));
    if(timer===undefined)return;
    timer.cancelled=true;deleteTimer(timer.id);count--;if(timer.referenced)referenced--;compact()
  }
  function setTimeout(callback,delay){return schedule(callback,delay,rest(arguments),false)}
  function setInterval(callback,delay){return schedule(callback,delay,rest(arguments),true)}
  function clearTimeout(id){cancel(id)}
  function clearInterval(id){cancel(id)}
  function immediateState(handle){var state=immediateGet(handle);if(!state)throw new TypeError('Invalid Immediate receiver');return state}
  function Immediate(){}
  function immediateRef(){var state=immediateState(this);if(!state.cancelled&&!state.referenced){state.referenced=true;referenced++}return this}
  function immediateUnref(){var state=immediateState(this);if(!state.cancelled&&state.referenced){state.referenced=false;referenced--}return this}
  function immediateHasRef(){return immediateState(this).referenced}
  function clearImmediate(handle){if((typeof handle!=='object'&&typeof handle!=='function')||handle===null)return;var state=immediateGet(handle);if(!state||state.cancelled)return;state.cancelled=true;deleteTimer(state.id);count--;if(state.referenced)referenced--;state.referenced=false}
  function immediateDispose(){clearImmediate(this)}
  function immediateMethod(key,value){defineProperty(Immediate.prototype,key,{value:value,writable:true,configurable:true})}
  immediateMethod('ref',immediateRef);immediateMethod('unref',immediateUnref);immediateMethod('hasRef',immediateHasRef);
  immediateMethod(Symbol.dispose,immediateDispose);
  function setImmediate(callback){
    if(typeof callback!=='function'){var error=new TypeError('The "callback" argument must be of type function');error.code='ERR_INVALID_ARG_TYPE';throw error}
    var args=[];for(var i=1;i<arguments.length;i++)append(args,arguments[i]);
    var context=__nonaRegexpVm.asyncContext,handle=new Immediate(),id=nextId++;
    var state={id:id,callback:callback,args:args,repeat:false,immediate:true,handle:handle,cancelled:false,referenced:true,context:context?context.activeRecord:undefined};
    immediateSet(handle,state);setTimer(id,state);count++;referenced++;append(immediates,state);return handle
  }
  __nonaRegexpVm.scheduleUnreferencedTimeout=function(callback,delay){return schedule(callback,delay,[],false,true)};
  function queueMicrotask(callback){
    if(typeof callback!=='function')throw new TypeError('The "callback" argument must be of type function');
    var context=__nonaRegexpVm.asyncContext,snapshot=context?context.activeRecord:undefined;
    enqueueJob(function(){var active=__nonaRegexpVm.asyncContext,previous=active?active.activeRecord:undefined,captured=snapshot||(active?active.defaultRecord:undefined);try{if(active&&captured!==previous)active.runCapturedNullary(captured,callback);else callback()}finally{if(!active){active=__nonaRegexpVm.asyncContext;previous=active?active.defaultRecord:undefined}if(active&&active.activeRecord!==previous)active.restoreRecord(previous)}})
  }
  function now(){return hostNow()-origin}
  var performance={};
  defineProperty(performance,'now',{value:now,writable:true,enumerable:true,configurable:true});
  function install(name,value){defineProperty(globalThis,name,{value:value,writable:true,enumerable:true,configurable:true})}
  install('setTimeout',setTimeout);install('setInterval',setInterval);
  install('clearTimeout',clearTimeout);install('clearInterval',clearInterval);
  install('setImmediate',setImmediate);install('clearImmediate',clearImmediate);
  install('queueMicrotask',queueMicrotask);install('performance',performance);
  function run(timer){
    if(timer.repeat){timer.when=hostNow()+timer.delay;timer.seq=++seq;push(timer)}
    else{deleteTimer(timer.id);count--;if(timer.referenced)referenced--;if(timer.immediate){timer.cancelled=true;timer.referenced=false}}
    var context=__nonaRegexpVm.asyncContext,previous=context?context.activeRecord:undefined;
    var captured=timer.context||(context?context.defaultRecord:undefined);
    try{if(context&&captured&&captured!==previous)context.runCaptured(captured,timer.callback,timer.handle,timer.args);else reflectApply(timer.callback,timer.handle,timer.args)}catch(error){if(typeof __nonaRegexpVm.dispatchUncaught!=='function')throw error;__nonaRegexpVm.dispatchUncaught(error,'uncaughtException')}finally{if(!context){context=__nonaRegexpVm.asyncContext;previous=context?context.defaultRecord:undefined}if(context&&context.activeRecord!==previous)context.restoreRecord(previous)}
  }
  function immediatePhase(){var limit=immediates.length;while(immediateHead<limit){var state=immediates[immediateHead++];if(!state.cancelled){run(state);drain()}}if(immediateHead===immediates.length){immediates=[];immediateHead=0}}
  return function eventLoop(){
    drain();
    if(referenced===0&&!(typeof __nonaRegexpVm.hasPendingIO==='function'&&__nonaRegexpVm.hasPendingIO()))return;
    for(;;){
      if(typeof __nonaRegexpVm.pumpSignals==='function'){
        try{__nonaRegexpVm.pumpSignals()}catch(error){if(typeof __nonaRegexpVm.dispatchUncaught!=='function')throw error;__nonaRegexpVm.dispatchUncaught(error,'uncaughtException')}
        drain()
      }
      var pendingIO=typeof __nonaRegexpVm.hasPendingIO==='function'&&__nonaRegexpVm.hasPendingIO();
      var readableIO=typeof __nonaRegexpVm.hasReadableIO==='function'&&__nonaRegexpVm.hasReadableIO();
      if(readableIO&&(referenced>0||pendingIO)){__nonaRegexpVm.pumpIO();drain();pendingIO=__nonaRegexpVm.hasPendingIO();readableIO=__nonaRegexpVm.hasReadableIO()}
      if(heap.length===0){if(immediateHead<immediates.length&&(referenced>0||pendingIO)){immediatePhase();continue}if(pendingIO){hostWait(5);continue}return}
      var timer=heap[0];
      if(timer.cancelled){pop();continue}
      var remaining=timer.when-hostNow();
      if(remaining>0){if(referenced===0&&!pendingIO)return;if(immediateHead<immediates.length){immediatePhase();continue}var signals=typeof __nonaRegexpVm.hasSignalWatches==='function'&&__nonaRegexpVm.hasSignalWatches();hostWait(readableIO||signals?Math.min(5,ceil(remaining)):ceil(remaining));continue}
      // Finish timers already due in this phase even if its last reference expires.
      var phaseTime=hostNow();
      while(heap.length>0){
        timer=heap[0];
        if(timer.cancelled){pop();continue}
        if(timer.when>phaseTime)break;
        pop();run(timer);drain()
      }
      if(immediateHead<immediates.length)immediatePhase();
      if(referenced===0&&!(typeof __nonaRegexpVm.hasPendingIO==='function'&&__nonaRegexpVm.hasPendingIO()))return;
    }
  }
})(__nonaPromiseDrainJobs);
`;
