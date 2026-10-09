import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost} from './helpers/host.js';
import {runOracle} from './helpers/oracle.js';
import {compileToIR} from '../src/compiler.js';
import type {Operation} from '../src/ir/model.js';

// Static shapes for object literals with constant keys (#194): a literal
// whose keys are all known at compile time gets its final shape once per
// site and stores its values into the slots directly. Every case runs with
// and without GC stress and is compared with Node.js.

function expectProgram(source:string):void {
 const expected=runOracle(source).stdout;
 for(const gcStress of [true,false]){
  const native=runOnHost(source,{gcStress});
  assert.equal(native.error,undefined);
  assert.equal(native.status,0,native.stderr);
  assert.equal(native.stdout,expected,`gcStress: ${gcStress}`);
 }
}

function literalKeys(source:string):(string[]|undefined)[] {
 const result:(string[]|undefined)[]=[];
 for(const fn of compileToIR(source).functions)for(const block of fn.blocks)for(const op of block.operations as Operation[])
  if(op.kind==='newObject'&&!op.array&&op.slots!==undefined)result.push(op.keys);
 return result;
}

test('literal shapes: which literals get a static shape',()=>{
 assert.deepEqual(literalKeys(`const k='c';const s={};
  [{a:1,b:2,a:3}, {x:1,m(){},'q r':2,$:3}, {}, {[k]:1}, {...s,a:1}, {get a(){return 1}}, {__proto__:null,a:1}, {'__proto__':1}, {0:1,a:2}, {'':1}, {'1x':1}];`),
  [undefined,['a','b'],['x','m','q r','$'],undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined]);
});

const cases:[string,string][]=[
 ['duplicate keys keep the first position and the last value',`
const side = [];
const o = {a: side.push('a'), b: side.push('b'), a: side.push('a2'), c: 0, b: 'B'};
console.log(side.join(), JSON.stringify(o), Object.keys(o).join());`],
 ['literals in a loop share a shape with assignment-built objects',`
const list = [];
for (let i = 0; i < 300; i++) list.push(i % 2 ? {x: i, y: i * 2, tag: 't' + i} : (() => { const o = {}; o.x = i; o.y = i * 2; o.tag = 't' + i; return o; })());
let sum = 0; for (const p of list) sum += p.x + p.y + p.tag.length;
for (const p of list) p.y = p.x;
console.log(sum, list.reduce((s, p) => s + p.y, 0), JSON.stringify(list[7]), JSON.stringify(list[8]));`],
 ['methods, arrows and classes get their names and home objects',`
const base = {greet() { return 'base'; }};
const o = {greet() { return 'own+' + super.greet(); }, f: () => 1, g: function () {}, k: class {}, n: 1};
Object.setPrototypeOf(o, base);
console.log(o.greet(), o.greet.name, o.f.name, o.g.name, o.k.name, o.n);`],
 ['objects stay ordinary afterwards: add, delete, freeze, define',`
const mk = i => ({a: i, b: i + 1, c: i + 2});
const x = mk(1); x.d = 4; delete x.b; x.b = 5;
const y = Object.freeze(mk(2)); y.a = 9;
const z = mk(3); Object.defineProperty(z, 'a', {enumerable: false});
const w = mk(4); w[Symbol.iterator] = null; w[0] = 'zero';
console.log(JSON.stringify(x), JSON.stringify(y), Object.isFrozen(y), Object.keys(z).join(), z.a, Object.keys(w).join(), JSON.stringify(mk(5)));`],
 ['values that throw or allocate while the literal is built',`
let n = 0;
const boom = () => { if (++n === 3) throw new Error('boom'); return n; };
const made = [];
for (let i = 0; i < 5; i++) { try { made.push({a: boom(), big: new Array(50).fill(i).join(''), b: [i, {inner: i}], c: 'x'.repeat(i)}); } catch (e) { made.push(e.message); } }
console.log(JSON.stringify(made));`],
 ['generators and await suspend inside a literal',`
function* gen() { const o = {a: yield 1, b: yield 2, c: 3}; return o; }
const it = gen(); it.next(); it.next('A'); console.log(JSON.stringify(it.next('B').value));
(async () => { const o = {p: await 1, q: await Promise.resolve(2)}; console.log(JSON.stringify(o)); })();`],
 ['many keys, quoted keys and keys that look like other things',`
const big = {k0:0,k1:1,k2:2,k3:3,k4:4,k5:5,k6:6,k7:7,k8:8,k9:9,k10:10,k11:11,k12:12,k13:13,k14:14,k15:15,k16:16,k17:17,k18:18,k19:19};
const odd = {'quoted key': 1, length: 2, constructor: 3, toString: 4, hasOwnProperty: 5, 'é': 6, '-1': 7, 'x\\u0000y': 8};
console.log(Object.keys(big).length, big.k19, JSON.stringify(odd), odd.length, Object.keys(odd).join('|').length, String(odd.toString));`],
 ['literals passed through JSON, spread and Object.assign',`
const recs = []; for (let i = 0; i < 50; i++) recs.push({id: i, name: 'r' + i, ok: i % 3 === 0, nested: {v: i}});
const copy = recs.map(r => ({...r, extra: true}));
const merged = Object.assign({}, recs[4], {name: 'm'});
console.log(JSON.stringify(recs[49]), JSON.stringify(copy[2]), JSON.stringify(merged), JSON.parse(JSON.stringify(recs)).length);`],
];
for(const [name,source] of cases)test(`literal shapes: ${name}`,()=>expectProgram(source));
