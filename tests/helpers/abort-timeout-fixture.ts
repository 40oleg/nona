// Explicit #632 phase contracts. The historical input is pinned separately in
// tests/fixtures/abort-timeout/original.mjs; do not reconstruct it from this file.
export const timeoutImports = `import Default,{EventEmitter,errorMonitor,captureRejectionSymbol,defaultMaxListeners,once,on,getEventListeners,getMaxListeners,setMaxListeners,listenerCount} from 'node:events';\n`;

export const timeoutFuture = `
let later;
// The process listener strongly retains the OUTER binding through process exit.
process.on('exit',()=>{if(!later)throw new Error('missing retained timeout signal')});
const early=AbortSignal.timeout(1);
early.addEventListener('abort',()=>console.log('timeout',early.reason.name));
setTimeout(()=>{
 later=AbortSignal.timeout(1000);
 later.addEventListener('abort',()=>console.log('unexpected'));
 console.log('live',early.aborted,later.aborted);
},20);
`;

export const timeoutAllDue = `
const early=AbortSignal.timeout(1),later=AbortSignal.timeout(1000);
early.addEventListener('abort',()=>console.log('timeout',early.reason.name));later.addEventListener('abort',()=>console.log('unexpected'));
setTimeout(()=>console.log('live',early.aborted,later.aborted),20);
// No event-loop yield: the original 1000 ms deadline must pass during setup.
const pauseStart=Date.now();
const pauseResult=Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1100);
if(pauseResult!=='timed-out'||Date.now()-pauseStart<1100)throw new Error('all-due setup pause was not established');
`;

export const timeoutExpected = "timeout TimeoutError\nlive true false\n";
export const timeoutAllDueExpected = timeoutExpected + "unexpected\n";
export const timeoutContracts = [
    { name: "future-unref", body: timeoutFuture, expected: timeoutExpected },
    { name: "all-due", body: timeoutAllDue, expected: timeoutAllDueExpected },
] as const;
