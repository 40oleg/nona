import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {runOnHost} from './helpers/host.js';

// #13: deleting an object's oldest keys was quadratic (a list walk from the
// newest key per deletion). The programs compare every
// observable result with Node.js, under GC stress where they stay small.
const fixture=(name:string)=>readFileSync(new URL('../../tests/fixtures/property-storage/'+name,import.meta.url),'utf8');
const oracle=(source:string)=>spawnSync(process.execPath,['-e',source],{encoding:'utf8',timeout:20_000}).stdout;

for(const name of ['delete-churn.js'])test('property storage under GC stress: '+name,()=>{
 const source=fixture(name);
 const run=runOnHost(source);
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,oracle(source));
});

test('deleting the oldest keys of a large object stays linear',()=>{
 const source=`const o = {}; for (let i = 0; i < 100000; i++) o['p' + i] = i; for (let i = 0; i < 100000; i++) delete o['p' + i];
console.log(Object.keys(o).length);`;
 const started=Date.now();
 const run=runOnHost(source,{gcStress:false});
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,oracle(source));
 // Quadratic, this took about a minute; linear, a fraction of a second.
 assert.ok(Date.now()-started<20_000,'took '+(Date.now()-started)+' ms');
});
