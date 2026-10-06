/** CI-only original fixtures. They never send a signal to the harness process. */
export const processSignalDeliveryProbe=String.raw`
var hits=0,keepalive=setInterval(function(){},100);
process.once('SIGTERM',function(name){hits++;console.log(name,hits,process.listenerCount('SIGTERM'));clearInterval(keepalive);setTimeout(function(){console.log('done',hits)},10);});
setTimeout(function(){process.kill(process.pid,'SIGTERM')},10);
`;
export const processSignalUnreferencedProbe=String.raw`
process.on('SIGTERM',function(){console.log('unexpected')});
console.log('registered');
`;
/** Compare stdout to the Node oracle on the same CI OS; standard signals may coalesce. */
export const processSignalBurstProbe=String.raw`
var hits=0,keepalive=setInterval(function(){},100);function listener(){hits++;if(hits===1)setTimeout(function(){process.off('SIGTERM',listener);clearInterval(keepalive);console.log('hits',hits)},10)}
process.on('SIGTERM',listener);
setTimeout(function(){for(var i=0;i<5;i++)process.kill(process.pid,'SIGTERM')},10);
`;
/** Runner expects OS SIGTERM termination, not successful exit. */
export const processSignalRestorationProbe=String.raw`
function listener(){console.log('unexpected')}
process.on('SIGTERM',listener);process.off('SIGTERM',listener);
setTimeout(function(){process.kill(process.pid,'SIGTERM')},10);
`;
/** Console-control delivery must be driven by a separate CI console group. */
export const processConsoleSignalProbe=String.raw`
import {define} from 'nona:ffi';
const getHandle=define('KERNEL32.dll','GetStdHandle','ptr(i32)'),setHandle=define('KERNEL32.dll','SetStdHandle','bool(i32,ptr)'),allocate=define('KERNEL32.dll','AllocConsole','bool()'),detach=define('KERNEL32.dll','FreeConsole','bool()'),send=define('KERNEL32.dll','GenerateConsoleCtrlEvent','bool(u32,u32)');
const out=getHandle(-11),err=getHandle(-12);detach();if(!allocate())throw Error('AllocConsole failed');if(!setHandle(-11,out)||!setHandle(-12,err))throw Error('SetStdHandle failed');
var keepalive=setInterval(function(){},50);
process.once('SIGBREAK',function(name){console.log(name);clearInterval(keepalive);detach()});
setTimeout(function(){if(!send(1,0))throw Error('GenerateConsoleCtrlEvent failed')},10);
`;