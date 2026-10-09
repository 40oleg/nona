import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {runOnHost} from './helpers/host.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import type {NamedFragment} from '../src/backend/pe/model.js';

// Programs compiled with extra realms get __nonaCreateRealm(), which returns
// the global object of a fresh realm. Node's vm contexts are realms too, so
// the same program runs under Node.js with a vm-backed __nonaCreateRealm.
const oracle=(source:string)=>spawnSync(process.execPath,['-e',"globalThis.__nonaCreateRealm=()=>require('vm').runInNewContext('globalThis');\n"+source],{encoding:'utf8',timeout:20_000}).stdout;
const check=(source:string,realms=1)=>{
 const run=runOnHost(source,{gcStress:true,realms});
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,oracle(source));
};

test('constructors fall back to the prototype intrinsic of new.target realm',()=>check(`
var other = __nonaCreateRealm();
// A bound function has no prototype property; its realm is its target's.
var C = other.Object.bind();
var p = Reflect.construct(Promise, [function () {}], C);
console.log(Object.getPrototypeOf(p) === other.Promise.prototype, Object.getPrototypeOf(p) === Promise.prototype);
var f = Reflect.construct(Function, [], C);
console.log(Object.getPrototypeOf(f) === other.Function.prototype, typeof f, f.name, f());
var a = Reflect.construct(Array, [], C);
console.log(Object.getPrototypeOf(a) === other.Array.prototype);
class Sub extends Promise {}
var s = Reflect.construct(Sub, [function () {}], C);
console.log(Object.getPrototypeOf(s) === other.Promise.prototype);
var D = function () {}; D.prototype = Object.prototype;
console.log(Object.getPrototypeOf(Reflect.construct(Promise, [function () {}], D)) === Object.prototype);
class Fn extends Function {}
console.log(Object.getPrototypeOf(new Fn()) === Fn.prototype, Object.getPrototypeOf(new Function()) === Function.prototype);
console.log(Object.getPrototypeOf(new Promise(function () {})) === Promise.prototype);
`));

test('functions created from another realm\'s Function run in that realm',()=>check(`
var shadow = 'main';
var other = __nonaCreateRealm();
var f = new other.Function('return this;');
console.log(f() === other, f.call(undefined) === other, f.call(null) === other, f.call(1) instanceof other.Number);
console.log(Object.getPrototypeOf(f) === other.Function.prototype, Object.getPrototypeOf(f.prototype) === other.Object.prototype, f.name);
var g = other.Function('a', 'b', 'return a + b;'); console.log(g(2, 3), g.length, g instanceof other.Function, g instanceof Function);
other.counter = 0; var inc = new other.Function('counter += 1; return typeof shadow;');
console.log(inc(), other.counter, typeof counter);
var made = new other.Function('return [{}, [], function () {}];')();
console.log(made instanceof other.Array, made[0] instanceof other.Object, made[2] instanceof other.Function);
var localArgs = function () { 'use strict'; return arguments; }();
var otherArgs = new other.Function('"use strict"; return arguments;')();
var otherArgs2 = new other.Function('"use strict"; return arguments;')();
var t1 = Object.getOwnPropertyDescriptor(localArgs, 'callee').get, t2 = Object.getOwnPropertyDescriptor(otherArgs, 'callee').get;
console.log(t1 !== t2, t2 === Object.getOwnPropertyDescriptor(otherArgs2, 'callee').get);
try { t2(); } catch (e) { console.log(e instanceof other.TypeError, e instanceof TypeError); }
try { new other.Function('return ('); } catch (e) { console.log(e instanceof other.SyntaxError, e instanceof SyntaxError); }
var host = { Function: function (x) { return [this === host, x]; } }; console.log(host.Function('x').join());
var C = other.Object.bind(); C.prototype = null;
var r = Reflect.construct(other.Function, ['return 7'], C);
console.log(r(), Object.getPrototypeOf(r) === other.Function.prototype, Object.getPrototypeOf(r.prototype) === other.Object.prototype);
var D = function () {}; D.prototype = Object.create(Function.prototype, {mark: {value: 'D'}});
var s = Reflect.construct(Function, ['return 8'], D); console.log(s(), s.mark);
console.log(globalThis.Function('return 40 + 2')());
`));

test('objects of another realm survive and are collected with this realm\'s',()=>check(`
var other = __nonaCreateRealm();
// JSON.parse, Array.from and the collections of the other realm allocate with that realm's runtime.
var text = JSON.stringify(Array.from({length: 40}, function (_, i) { return {i: i, s: 'x' + i, inner: [i]}; }));
var keep = [], sum = 0;
for (var round = 0; round < 6; round++) { var batch = other.JSON.parse(text); if (round % 2 === 0) keep.push(batch); }
for (var k = 0; k < keep.length; k++) for (var j = 0; j < keep[k].length; j++) sum += keep[k][j].i + keep[k][j].inner[0];
console.log(keep.length, sum, keep[0][39].s, keep[0] instanceof other.Array, keep[0][0] instanceof other.Object);
var copies = other.Array.from(keep[0], function (o) { return [o.s]; });
console.log(copies.length, copies[39][0]);
var weak = new other.WeakMap(), keys = [];
for (var w = 0; w < 30; w++) { var key = {w: w}; if (w % 3 === 0) keys.push(key); weak.set(key, [w]); }
console.log(keys.every(function (key) { return weak.get(key)[0] === key.w; }));
var map = new other.Map(); for (var m = 0; m < 50; m++) map.set('k' + m, {m: m});
console.log(map.size, map.get('k49').m);
`));

// #198: realm cloning copies every runtime data fragment that is not listed as
// shared (src/backend/realms.ts). Code that is not cloned - the collector and
// the compiled JS functions, which every realm runs - must not use a realm's
// own copy, or it misses state made by another realm's runtime: the shapes of
// #157 were collected while in use this way.
test('code shared by every realm uses no realm-specific runtime data',()=>{
 const program=generate(compileToIR(`var other = __nonaCreateRealm();
var g = new other.Function('"use strict"; return function* () { yield 1; };')();
console.log(g().next().value);`),{realms:1});
 const owner=new Map<string,NamedFragment>();
 for(const fragment of program.fragments){owner.set(fragment.name,fragment);for(const symbol of Object.keys(fragment.symbols))owner.set(symbol,fragment);}
 const perRealm=new Set(program.fragments.filter(f=>f.name.startsWith('R1$')).map(f=>f.name.slice(3)));
 const realmData=(target:string)=>{const fragment=owner.get(target);return fragment&&fragment.section==='.data'&&perRealm.has(fragment.name)?fragment.name:undefined;};
 // The collector, apart from the root marking it runs once per realm.
 const reached=new Set<NamedFragment>(),collector=new Set<string>(),pending=['rt.collect'];
 while(pending.length){
  const fragment=owner.get(pending.pop()!);
  if(!fragment||reached.has(fragment)||fragment.name==='rt.gcMarkRealm'||fragment.name.startsWith('R1$'))continue;
  reached.add(fragment);
  if(fragment.section!=='.text'){const name=realmData(fragment.name);if(name)collector.add(name);continue;}
  for(const fixup of fragment.fixups)pending.push(fixup.target);
 }
 assert.deepEqual([...collector],[]);
 const functions=new Set<string>();
 for(const fragment of program.fragments)if(fragment.section==='.text'&&(fragment.name.startsWith('js.fn.')||fragment.name.startsWith('js.module.')))
  for(const fixup of fragment.fixups){const name=realmData(fixup.target);if(name?.startsWith('rt.'))functions.add(name);}
 assert.deepEqual([...functions],[]);
});

test('generators and tail calls of another realm run on the shared stacks',()=>check(`
var other = __nonaCreateRealm();
var make = other.Function('return function* (n) { for (var i = 0; i < n; i++) yield {i: i}; };')();
var total = 0, live = [];
for (var round = 0; round < 40; round++) { var it = make(3); total += it.next().value.i + it.next().value.i; if (round % 4 === 0) live.push(it); }
for (var k = 0; k < live.length; k++) total += live[k].next().value.i;
console.log(total, live.length, live[0] instanceof other.Object, Object.getPrototypeOf(make) === other.Function.prototype);
var call = new other.Function('f', 'x', '"use strict"; return f({v: x}, [x], "x" + x);');
var sum = 0; for (var c = 0; c < 200; c++) sum += call(function (o, a, s) { return o.v + a[0] + s.length; }, c);
console.log(sum);
`));
