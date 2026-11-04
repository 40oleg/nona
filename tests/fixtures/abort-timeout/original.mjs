import Default,{EventEmitter,errorMonitor,captureRejectionSymbol,defaultMaxListeners,once,on,getEventListeners,getMaxListeners,setMaxListeners,listenerCount} from 'node:events';

const early=AbortSignal.timeout(1),later=AbortSignal.timeout(1000);
early.addEventListener('abort',()=>console.log('timeout',early.reason.name));later.addEventListener('abort',()=>console.log('unexpected'));
setTimeout(()=>console.log('live',early.aborted,later.aborted),20);
