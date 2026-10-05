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
  var heap=[],active=new Map(),count=0,nextId=1,seq=0,origin=hostNow();
  __nonaRegexpVm.hasPendingTimers=function(){return count!==0};
  __nonaRegexpVm.activeTimerResources=function(){var resources=[];for(var i=0;i<count;i++)resources.push('Timeout');return resources};
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
  function schedule(callback,delay,args,repeat){
    if(typeof callback!=='function')throw new TypeError('The "callback" argument must be of type function');
    var d=delayOf(delay),id=nextId++;
    var timer={id:id,when:hostNow()+d,seq:++seq,delay:d,callback:callback,args:args,repeat:repeat,cancelled:false};
    setTimer(id,timer);count++;push(timer);
    return id
  }
  function rest(list){var args=[];for(var i=2;i<list.length;i++)append(args,list[i]);return args}
  function cancel(id){
    if(typeof id!=='number'&&typeof id!=='string')return;
    var timer=getTimer(toNumber(id));
    if(timer===undefined)return;
    timer.cancelled=true;deleteTimer(timer.id);count--;compact()
  }
  function setTimeout(callback,delay){return schedule(callback,delay,rest(arguments),false)}
  function setInterval(callback,delay){return schedule(callback,delay,rest(arguments),true)}
  function clearTimeout(id){cancel(id)}
  function clearInterval(id){cancel(id)}
  function queueMicrotask(callback){
    if(typeof callback!=='function')throw new TypeError('The "callback" argument must be of type function');
    enqueueJob(function(){callback()})
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
    else{deleteTimer(timer.id);count--}
    try{reflectApply(timer.callback,undefined,timer.args)}catch(error){if(typeof __nonaRegexpVm.dispatchUncaught!=='function')throw error;__nonaRegexpVm.dispatchUncaught(error,'uncaughtException')}
  }
  return function eventLoop(){
    drain();
    for(;;){
      var pendingIO=typeof __nonaRegexpVm.hasPendingIO==='function'&&__nonaRegexpVm.hasPendingIO();
      var readableIO=typeof __nonaRegexpVm.hasReadableIO==='function'&&__nonaRegexpVm.hasReadableIO();
      if(readableIO&&(count>0||pendingIO)){__nonaRegexpVm.pumpIO();drain();pendingIO=__nonaRegexpVm.hasPendingIO();readableIO=__nonaRegexpVm.hasReadableIO()}
      if(count===0){heap=[];if(pendingIO){hostWait(5);continue}return}
      var timer=heap[0];
      if(timer.cancelled){pop();continue}
      var remaining=timer.when-hostNow();
      if(remaining>0){hostWait(readableIO?Math.min(5,ceil(remaining)):ceil(remaining));continue}
      pop();run(timer);drain()
    }
  }
})(__nonaPromiseDrainJobs);
`;
