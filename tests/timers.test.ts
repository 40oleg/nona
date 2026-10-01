import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost} from './helpers/host.js';
import {runOracle} from './helpers/oracle.js';

function expectOracle(source:string):void {
 const native=runOnHost(source);
 assert.equal(native.error,undefined);
 assert.equal(native.status,0,native.stderr);
 assert.equal(native.stdout,runOracle(source).stdout);
}

test('timers run after microtasks in deadline and registration order',()=>expectOracle(`
console.log('sync start');
setTimeout(function(){ console.log('a', typeof performance.now()); }, 1);
setTimeout(function(x, y){ console.log('b', x, y, arguments.length); }, 0, 1, 2);
setTimeout(function(){ console.log('c'); }, NaN);
setTimeout(function(){ console.log('d'); }, -5);
Promise.resolve().then(function(){ console.log('job'); });
queueMicrotask(function(){ console.log('microtask'); });
console.log('sync end');
`));

test('timers scheduled from jobs and callbacks drain microtasks between callbacks',()=>expectOracle(`
setTimeout(function(){
  console.log('first');
  Promise.resolve().then(function(){ console.log('job after first'); });
  setTimeout(function(){ console.log('nested'); }, 0);
}, 0);
setTimeout(function(){ console.log('second'); }, 0);
Promise.resolve().then(function(){ setTimeout(function(){ console.log('from job'); }, 0); });
async function later(){ await null; console.log('async'); setTimeout(function(){ console.log('async timer'); }, 1); }
later();
`));

test('clearTimeout and self-clearing setInterval',()=>expectOracle(`
var cancelled = setTimeout(function(){ console.log('never'); }, 500);
setTimeout(function(){ clearTimeout(cancelled); console.log('cleared'); }, 1);
clearTimeout(setTimeout(function(){ console.log('never either'); }, 0));
clearTimeout(undefined); clearTimeout({}); clearInterval(12345);
var sameTick = setTimeout(function(){ console.log('same tick cancelled'); }, 0);
setTimeout(function(){ clearTimeout(sameTick); console.log('canceller'); }, 0);
setTimeout(function(){
  var n = 0, iv = setInterval(function(){ n++; console.log('tick', n); if (n === 3) clearInterval(iv); }, 2);
}, 600);
`));

test('timer argument validation and elapsed time',()=>expectOracle(`
try { setTimeout('code', 0); } catch (e) { console.log(e instanceof TypeError); }
try { queueMicrotask(1); } catch (e) { console.log(e instanceof TypeError); }
var start = Date.now(), t0 = performance.now();
setTimeout(function(){ console.log(Date.now() - start >= 40, performance.now() - t0 >= 39); }, 40);
clearTimeout(setTimeout(function(){ console.log('never'); }, 0));
`));

test('many timers survive GC stress and preserve order',()=>expectOracle(`
var out = [];
for (var i = 0; i < 40; i++) (function(i){ setTimeout(function(){ out.push(i); if (out.length === 40) console.log(out.join(',')); }, i % 2); })(i);
var ticks = 0, iv = setInterval(function(){ var garbage = []; for (var j = 0; j < 10; j++) garbage.push({j: j}); if (++ticks === 10) { clearInterval(iv); console.log('ticks', ticks); } }, 1);
`));

test('an uncaught exception in a timer callback fails the process',()=>{
 const native=runOnHost(`setTimeout(function(){ console.log('before'); throw new Error('boom'); }, 1); setTimeout(function(){ console.log('never'); }, 50);`);
 assert.equal(native.stdout,'before\n');
 assert.notEqual(native.status,0);
});

test('host primitives are not visible to user code',()=>expectOracle(`
console.log(typeof __nonaHostNow, typeof __nonaHostWait, typeof setTimeout, typeof clearInterval);
var d = Object.getOwnPropertyDescriptor(globalThis, 'setTimeout');
console.log(d.writable, d.enumerable, d.configurable);
`));
