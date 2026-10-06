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
  __nonaRegexpVm.scheduleUnreferencedTimeout=function(callback,delay){return schedule(callback,delay,[],false,true)};
  function queueMicrotask(callback){
    if(typeof callback!=='function')throw new TypeError('The "callback" argument must be of type function');
    var context=__nonaRegexpVm.asyncContext,snapshot=context?context.activeRecord:undefined;
    enqueueJob(function(){var previous=context?context.activeRecord:undefined;try{if(context&&snapshot!==previous)context.runCapturedNullary(snapshot,callback);else callback()}finally{if(context&&context.activeRecord!==previous)context.restoreRecord(previous)}})
  }
  function now(){return hostNow()-origin}
  var performance={};
  defineProperty(performance,'now',{value:now,writable:true,enumerable:true,configurable:true});
  function install(name,value){defineProperty(globalThis,name,{value:value,writable:true,enumerable:true,configurable:true})}
  install('setTimeout',setTimeout);install('setInterval',setInterval);
  install('clearTimeout',clearTimeout);install('clearInterval',clearInterval);
  install('queueMicrotask',queueMicrotask);install('performance',performance);
  function run(timer){
    if(timer.repeat){timer.when=hostNow()+timer.delay;timer.seq=++seq;push(timer)}
    else{deleteTimer(timer.id);count--;if(timer.referenced)referenced--}
    var context=__nonaRegexpVm.asyncContext,previous=context?context.activeRecord:undefined;
    try{if(context&&timer.context&&timer.context!==previous)context.runCaptured(timer.context,timer.callback,undefined,timer.args);else reflectApply(timer.callback,undefined,timer.args)}finally{if(context&&context.activeRecord!==previous)context.restoreRecord(previous)}
  }
  return function eventLoop(){
    drain();
    if(referenced===0)return;
    for(;;){
      if(heap.length===0)return;
      var timer=heap[0];
      if(timer.cancelled){pop();continue}
      var remaining=timer.when-hostNow();
      if(remaining>0){if(referenced===0)return;hostWait(ceil(remaining));continue}
      // Finish timers already due in this phase even if its last reference expires.
      var phaseTime=hostNow();
      while(heap.length>0){
        timer=heap[0];
        if(timer.cancelled){pop();continue}
        if(timer.when>phaseTime)break;
        pop();run(timer);drain()
      }
      if(referenced===0)return;
    }
  }
})(__nonaPromiseDrainJobs);
`;
