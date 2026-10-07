import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost} from './helpers/host.js';
import {runOracle} from './helpers/oracle.js';

// A function with more locals than liveness.ts pinnedLocalThreshold keeps its
// locals live everywhere (bundles such as typescript.js wrap thousands of
// declarations in one function; tracking them per operation made liveness,
// slot assignment, initialization and Number inference quadratic). These
// programs exercise such functions against Node.js (the first under GC
// stress; the second without, as a collection before each of its operations
// scans thousands of slots).
const agree=(source:string,gcStress=true)=>{
 const run=runOnHost(source,{gcStress});
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,runOracle(source).stdout);
};
const locals=(count:number)=>Array.from({length:count},(_,i)=>`var v${i} = ${i};`).join('\n');

test('a function with many locals keeps closures, loops and handlers right',()=>agree(`
(() => {
  ${locals(300)}
  var out = [];
  var o = {K: () => v7, L: function () { return v8 + 1; }, [v3 + 'x']: 5};
  for (var name in o) out.push(name);
  for (var item of [v1, v2, v3]) out.push(item);
  try { out.push(o.K(), o.L()); throw new Error('e' + v9); } catch (e) { out.push(e.message); } finally { out.push('finally'); }
  var total = 0;
  for (var i = 0; i < 100; i++) { if (i < v5) total += i; total += v2; }
  function* g() { yield v10; yield v11; }
  out.push(total, [...g()].join(), typeof v299, v299 * 2);
  let late = 1; { let inner = late + v4; out.push(inner); }
  console.log(out.join(','));
})();
`));

test('a module with thousands of top-level declarations compiles in linear time',()=>agree(`
var __export = (target, all) => { for (var name in all) Object.defineProperty(target, name, {get: all[name], enumerable: true}); };
var api = {};
((module) => {
  ${locals(3000)}
  __export(api, {${Array.from({length:3000},(_,i)=>`K${i}: () => v${i}`).join(', ')}});
})({});
console.log(Object.keys(api).length, api.K0, api.K1234, api.K2999);
`,false));
