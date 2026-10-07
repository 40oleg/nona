import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {runOnHost} from './helpers/host.js';

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
