import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {runOnHost} from './helpers/host.js';

// #13: deleting an object's oldest keys was quadratic (a list walk from the
// newest key per deletion), and so were Array.prototype.shift and splice on
// large arrays (a generic Get, Set and HasProperty per moved element). The programs compare every
// observable result with Node.js, under GC stress where they stay small.
const fixture=(name:string)=>readFileSync(new URL('../../tests/fixtures/property-storage/'+name,import.meta.url),'utf8');
const oracle=(source:string)=>spawnSync(process.execPath,['-e',source],{encoding:'utf8',timeout:20_000}).stdout;

for(const name of ['delete-churn.js','shift-splice.js'])test('property storage under GC stress: '+name,()=>{
 const source=fixture(name);
 const run=runOnHost(source);
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,oracle(source));
});

// The programs time themselves, so compilation and a busy machine do not count.
test('deleting the oldest keys of a large object stays linear',()=>{
 // Quadratic, this took about a minute; linear, a fraction of a second.
 const source=`const started = Date.now();
const o = {}; for (let i = 0; i < 100000; i++) o['p' + i] = i; for (let i = 0; i < 100000; i++) delete o['p' + i];
console.log(Object.keys(o).length, Date.now() - started < 10000);`;
 const run=runOnHost(source,{gcStress:false});
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,oracle(source));
});

test('shift and splice of large dense arrays move their elements at once',()=>{
 // Element by element this took about a minute; as slot moves, about a second.
 const source=`const started = Date.now();
const a = []; for (let i = 0; i < 50000; i++) a.push(i); let s = 0; while (a.length) s += a.shift();
const b = []; for (let i = 0; i < 50000; i++) b.push(i); for (let i = 0; i < 25000; i++) b.splice(b.length >> 1, 1);
for (let i = 0; i < 2000; i++) b.splice(i, 0, -i - 1);
console.log(s, b.length, b[0], b[1], b[2001], b[b.length - 1], Date.now() - started < 15000);`;
 const run=runOnHost(source,{gcStress:false});
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,oracle(source));
});
