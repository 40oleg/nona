import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost} from './helpers/host.js';
import {runOracle} from './helpers/oracle.js';
import {ObjectLayout as O} from '../src/runtime/object-layout.js';
import {HeapLayout as H} from '../src/runtime/heap-layout.js';

// Shapes (src/runtime/shapes.ts): plain objects keep named properties in
// slots described by a shared shape until something needs a property node.
// Every case runs under GC stress and is compared with Node.js.

function expectProgram(source:string):void {
 const native=runOnHost(source);
 assert.equal(native.error,undefined);
 assert.equal(native.status,0,native.stderr);
 assert.equal(native.stdout,runOracle(source).stdout);
}

const cases:[string,string][]=[
 ['literal order, overwrite and computed keys',`
const k = 'dyn'; const lit = {b: 1, a: 2, [k]: 3, b: 4};
console.log(Object.keys(lit).join(), lit.b, lit.dyn, JSON.stringify(lit));`],
 ['inline and out-of-line slots',`
const many = {};
for (let i = 0; i < 40; i++) many['p' + i] = i;
for (let i = 0; i < 40; i += 7) many['p' + i] *= 2;
let sum = 0; for (const key in many) sum += many[key];
console.log(sum, Object.keys(many).length, many.p38, many.p7, 'p39' in many, many.hasOwnProperty('p20'), Object.values(many).length);`],
 ['delete and re-add keep the order of a dictionary',`
const d = {x: 1, y: 2, z: 3}; delete d.y; d.y = 4; d.w = 5;
console.log(Object.keys(d).join(), d.y, 'y' in d, d.x);`],
 ['attributes, accessors and integrity levels',`
const g = {a: 1}; Object.defineProperty(g, 'hidden', {value: 2, enumerable: false}); g.b = 3;
console.log(Object.keys(g).join(), g.hidden, JSON.stringify(g));
const acc = {v: 1, get double() { return this.v * 2; }, set double(x) { this.v = x / 2; }};
acc.double = 10; console.log(acc.v, acc.double, Object.keys(acc).join());
const fr = Object.freeze({a: 1, b: 2}); fr.a = 9; console.log(fr.a, Object.isFrozen(fr));
const ne = {a: 1}; Object.preventExtensions(ne); ne.b = 2; ne.a = 3; console.log(JSON.stringify(ne), Object.isExtensible(ne));
const se = Object.seal({a: 1}); se.a = 2; delete se.a; se.c = 1; console.log(JSON.stringify(se));`],
 ['setters and readonly properties on the chain',`
const proto = {set s(v) { this._s = v * 10; }}; Object.defineProperty(proto, 'ro', {value: 1, writable: false});
const child = Object.create(proto); child.s = 2; child.ro = 5; child.n = 1;
console.log(child._s, child.ro, Object.keys(child).join(), child.hasOwnProperty('ro'));
const dataProto = {shared: 1}; const c2 = Object.create(dataProto); c2.shared = 2; console.log(c2.shared, dataProto.shared);`],
 ['a shaped prototype that changes after a cache saw it',`
const base = {hello() { return 'hi ' + this.name; }};
const objs = [];
for (let i = 0; i < 4; i++) { const o = Object.create(base); o.name = 'n' + i; objs.push(o); }
const greet = o => o.hello();
console.log(objs.map(greet).join());
base.hello = function () { return 'bye ' + this.name; };
console.log(objs.map(greet).join());
objs[1].hello = () => 'own';
console.log(objs.map(greet).join());
delete base.hello; base.hello = () => 'again';
console.log(objs.map(greet).join());`],
 ['classes, fields, super and getters',`
class A { constructor(x) { this.x = x; this.tag = 'A'; } get twice() { return this.x * 2; } m() { return this.x + 1; } }
class B extends A { constructor(x) { super(x); this.y = x * 3; } m() { return super.m() + this.y; } }
const arr = []; for (let i = 0; i < 12; i++) arr.push(i % 3 ? new A(i) : new B(i));
let total = 0; for (const o of arr) total += o.m() + o.twice + (o.y || 0);
console.log(total, Object.keys(arr[1]).join(), Object.keys(arr[0]).join());
class F { a = 1; b = this.a + 1; static s = 3; }
console.log(JSON.stringify(new F()), F.s);`],
 ['constructors that outgrow their inline slots',`
function Grow(n) { for (let i = 0; i < n; i++) this['f' + i] = i; }
const g1 = new Grow(3), g2 = new Grow(12), g3 = new Grow(12), g4 = new Grow(2);
console.log(Object.keys(g2).length, g3.f11, g4.f1, g4.f5, Object.keys(g4).join(), g1.f2);`],
 ['polymorphic reads and writes',`
const shapes = [{a: 1}, {b: 1, a: 2}, {c: 1, b: 2, a: 3}, {a: 4, z: 0}, Object.create({a: 5}), {get a() { return 6; }}];
let pa = 0; for (let r = 0; r < 6; r++) for (const s of shapes) pa += s.a;
const ws = shapes.slice(0, 4); for (let r = 0; r < 4; r++) for (const s of ws) s.a = (s.a || 0) + 1;
console.log(pa, ws.map(s => s.a).join());`],
 ['symbols, index keys and __proto__',`
const sym = Symbol('s'); const sy = {a: 1}; sy[sym] = 2; sy.b = 3; console.log(Object.keys(sy).join(), sy[sym], Object.getOwnPropertySymbols(sy).length);
const ix = {a: 1}; ix[0] = 'zero'; ix['1'] = 'one'; ix.b = 2; console.log(Object.keys(ix).join(), ix[0], ix[1]);
const pr = {a: 1, ['__proto__']: 7}; console.log(Object.keys(pr).join(), pr.__proto__);
const pl = {__proto__: {inherited: 1}, own: 2}; console.log(pl.inherited, Object.keys(pl).join());`],
 ['spread, assign, entries and JSON',`
const src = {p: 1, q: [1, 2], r: {s: 'x'}};
const spread = {...src, q: 'replaced', t: true};
const assigned = Object.assign({}, src, {u: null});
console.log(JSON.stringify(spread), JSON.stringify(assigned), JSON.stringify(Object.entries(src)));
const parsed = JSON.parse('{"k1":1,"k2":{"n":[1,2,3]},"k3":"v"}'); parsed.k4 = 4; console.log(JSON.stringify(parsed), Object.keys(parsed).join());`],
 ['own-property queries',`
const q = {a: 1, b: undefined};
console.log('a' in q, 'b' in q, 'c' in q, 'toString' in q, q.hasOwnProperty('b'), q.propertyIsEnumerable('a'), JSON.stringify(Object.getOwnPropertyDescriptor(q, 'a')));
for (const key in q) console.log(key);`],
 ['objects used as maps',`
const maps = []; for (let i = 0; i < 60; i++) { const m = {}; m['key' + (i % 30)] = i; m.common = i; maps.push(m); }
console.log(maps.reduce((s, m) => s + m.common + m['key' + (m.common % 30)], 0));
const dict = {}; for (let i = 0; i < 200; i++) dict['w' + i] = i; delete dict.w5; console.log(Object.keys(dict).length, dict.w199);`],
];
for(const [name,source] of cases)test(`shapes: ${name}`,()=>expectProgram(source));

test('a five-property object fits in 200 bytes with its heap header',()=>{
 // A shaped object is its header and one 16-byte slot per property.
 assert.ok(H.size+O.size+5*16<=200,`${H.size+O.size+5*16} bytes`);
});
