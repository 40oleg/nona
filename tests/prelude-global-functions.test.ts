import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {runOnHost} from './helpers/host.js';

const cases: [string, string, string][] = [
 ['process pipeline', `
console.log([1, 2, 3].map(process).join(','));
function process(value) { return value * 2; }
console.log(globalThis.process === process);
const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'process');
console.log(descriptor.writable, descriptor.enumerable, descriptor.configurable);
console.log(delete globalThis.process, process(4));
`, '2,4,6\ntrue\ntrue true false\nfalse 8\n'],
 ['timer and text codec declarations', `
function setTimeout(value) { return value + 1; }
function setInterval(value) { return value + 2; }
function clearTimeout(value) { return value + 3; }
function clearInterval(value) { return value + 4; }
function queueMicrotask(value) { return value + 5; }
function TextEncoder(value) { return value + 6; }
function TextDecoder(value) { return value + 7; }
console.log(setTimeout(1), setInterval(1), clearTimeout(1), clearInterval(1), queueMicrotask(1), TextEncoder(1), TextDecoder(1));
for (const name of ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'queueMicrotask', 'TextEncoder', 'TextDecoder']) {
 const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
 console.log(name, descriptor.writable, descriptor.enumerable, descriptor.configurable, delete globalThis[name]);
}
`, '2 3 4 5 6 7 8\n' + ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'queueMicrotask', 'TextEncoder', 'TextDecoder'].map(name => name + ' true true false false\n').join('')],
 ['native constructor repeated declaration and assignment', `
console.log(Number(2), globalThis.Number === Number);
function Number(value) { return value + 1; }
function Number(value) { return value + 2; }
const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Number');
console.log(descriptor.writable, descriptor.enumerable, descriptor.configurable);
Number = function(value) { return value + 3; };
console.log(Number(2), globalThis.Number(2), delete globalThis.Number);
`, '4 true\ntrue true false\n5 5 false\n'],
];

for (const [name, source, expected] of cases) {
 // Capture the writer before evaluating declarations that replace process.
 const oracle = spawnSync(process.execPath, ['-e', 'const write=process.stdout.write.bind(process.stdout);console.log=(...args)=>write(args.map(String).join(" ")+"\\n");require("node:vm").runInThisContext(' + JSON.stringify(source) + ');'], {encoding:'utf8', timeout:5000, windowsHide:true});
 assert.ifError(oracle.error);
 assert.equal(oracle.status, 0, oracle.stderr);
 assert.equal(oracle.stdout, expected);
 for (const gcStress of [false, true]) test(`script global function: ${name}, gcStress=${gcStress}`, () => {
  const native = runOnHost(source, {gcStress});
  assert.ifError(native.error);
  assert.equal(native.status, 0, native.stderr);
  assert.equal(native.stdout.replace(/\r\n/g, '\n'), expected);
  assert.equal(native.stderr, '');
 });
}
