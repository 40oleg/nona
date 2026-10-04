import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost} from './helpers/host.js';
import {runOracle} from './helpers/oracle.js';

// #119: an object with a property index (more than 32 own properties) that
// also has dense elements: own lookups of named keys must still find them.
test('named lookups on an indexed object with dense elements',()=>{
 const source=String.raw`
Math[1] = true; Math.length = 2;
const out = [Array.prototype.indexOf.call(Math, true), 'PI' in Math, Reflect.has(Math, 'max'), Math.hasOwnProperty('abs')];
const o = {}; for (let i = 0; i < 40; i++) o['k' + i] = i;
o[3] = 'three';
out.push('k39' in o, o.k20, Object.keys(o).length, o[3], 'missing' in o);
Uint8Array.prototype.__proto__[42] = true;
out.push(Reflect.has(new Uint8Array(1), 'subarray'), Reflect.has(new Uint8Array(1), '42'));
console.log(out.join());
`;
 const run=runOnHost(source);
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,runOracle(source).stdout);
});
