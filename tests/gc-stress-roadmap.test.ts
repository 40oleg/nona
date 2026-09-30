import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {runOnHost,runModulesOnHost} from './helpers/host.js';

// Roadmap 0.17–0.20: async functions/generators, modules and large objects
// under stress GC (a collection at every allocation), checked against V8.
function oracle(source:string):string {
 return spawnSync(process.execPath,['-e',source],{encoding:'utf8',timeout:20_000}).stdout;
}
const cases:[string,string][]=[
 ['async functions keep awaited objects and locals alive',
  "async function step(i) { const box = {i, list: [i, i + 1]}; await null; const other = {v: box.list[1]}; await Promise.resolve(other); return box.i + other.v; }\nasync function main() { let sum = 0; for (let i = 0; i < 20; i++) sum += await step(i); console.log('sum', sum); }\nmain().then(() => console.log('done'));"],
 ['async generators and for await with rejected and returned iterators',
  "async function* gen(n) { try { for (let i = 0; i < n; i++) { const o = {i}; yield await Promise.resolve(o); } } finally { console.log('closed'); } }\n(async () => { let s = ''; for await (const o of gen(5)) { s += o.i; if (o.i === 3) break; } console.log(s);\n const it = gen(3); await it.next(); try { await it.throw(new Error('boom')); } catch (e) { console.log(e.message); }\n const r = await Promise.allSettled([Promise.reject({x: 1}), (async () => ({y: 2}))()]); console.log(r.map(x => x.status).join());\n})();"],
 ['promise combinators and thenables allocate across microtasks',
  "const thenable = v => ({ then(r) { r({v}); } });\nPromise.all([1, 2, 3].map(async x => { await thenable(x); return {x: x * 2}; })).then(a => console.log(a.map(o => o.x).join()));\nPromise.race([new Promise(r => r({w: 'first'})), thenable('second')]).then(o => console.log(o.w || o.v));"],
 ['large arrays: element index tables survive collection, deletion and truncation',
  "const a = []; for (let i = 0; i < 300; i++) a.push({i});\nlet s = 0; for (let i = 0; i < a.length; i += 7) s += a[i].i; console.log(s, a.length);\ndelete a[150]; a.length = 200; console.log(150 in a, a[199].i, a[200], a.length); a[150] = {i: 'back'}; console.log(a[150].i);\nconst o = {}; for (let i = 0; i < 80; i++) o['k' + i] = i; delete o.k40; console.log(o.k79, 'k40' in o, Object.keys(o).length);\nlet many = []; for (let r = 0; r < 5; r++) { many = []; for (let i = 0; i < 60; i++) many[i] = i; } console.log(many.reduce((x, y) => x + y));"],
 ['generators suspended inside loops with large state',
  "function* g() { const big = []; for (let i = 0; i < 200; i++) big.push({i}); for (const o of big) yield o.i; }\nlet total = 0; for (const v of g()) total += v; console.log(total);"],
];
for(const [name,source] of cases)test('gc stress: '+name,()=>{
 const run=runOnHost(source);
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,oracle(source));
});

test('gc stress: module live bindings, namespaces and dynamic import',()=>{
 const {native,oracle:expected}=runModulesOnHost({
  'main.mjs':"import {count, bump, items} from './state.mjs';\nimport * as ns from './state.mjs';\nfor (let i = 0; i < 50; i++) bump({i});\nconsole.log(count, ns.count, items.length, items[49].i);\nimport('./late.mjs').then(m => { m.fill(100); console.log(m.data.length, ns.count); });\n",
  'state.mjs':"export let count = 0; export const items = [];\nexport function bump(o) { count++; items.push(o); }\n",
  'late.mjs':"import {bump} from './state.mjs';\nexport const data = [];\nexport function fill(n) { for (let i = 0; i < n; i++) { data.push({i}); bump({i}); } }\n",
 },'main.mjs');
 assert.equal(native.status,0,native.stderr);
 assert.equal(native.stdout,expected);
});

test('large arrays and objects are no longer quadratic',()=>{
 // 20k elements took minutes with linear property lookup; the index keeps it in seconds.
 const source="const a = []; for (let i = 0; i < 20000; i++) a.push(i); let s = 0; for (let i = 0; i < a.length; i++) s += a[i];\nconst o = {}; for (let i = 0; i < 5000; i++) o['p' + i] = i; let t = 0; for (let i = 0; i < 5000; i++) t += o['p' + i];\nconst c = a.slice(0, 10000).concat(a.slice(10000)); console.log(s, t, c.length, c[19999], Object.getOwnPropertyDescriptor(a, 'length').value);";
 const started=Date.now();
 const run=runOnHost(source,{gcStress:false});
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,oracle(source));
 assert.ok(Date.now()-started<45_000,'large array program took '+(Date.now()-started)+' ms');
});
