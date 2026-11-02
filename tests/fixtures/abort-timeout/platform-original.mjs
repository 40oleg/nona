
const later=AbortSignal.timeout(1000);later.addEventListener('abort',()=>console.log('unexpected'));
const earlier=AbortSignal.timeout(1);earlier.addEventListener('abort',()=>console.log('timeout',earlier.reason.name));
setTimeout(()=>console.log('live',earlier.aborted,later.aborted),20);
