import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// `f.call(thisArg, ...args)` and `f.apply(thisArg, list)` sites (#47): when
// the callee is %Function.prototype.call% / %Function.prototype.apply% and
// `f` a plain function, `f` is called without the builtin; array literals
// passed to apply are not created. Function objects start with a complete
// key filter, so own-key checks on them must see every property added later.
const agree = (source: string) => {
    const run = runOnHost(source);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
};

test("call and apply sites over plain, bound, native, proxy and class targets", () =>
    agree(String.raw`
const out = [];
function sloppy(a, b) { return typeof this + ':' + (this === globalThis ? 'global' : String(this)) + ':' + a + ':' + b + ':' + arguments.length; }
function strict(a, b) { 'use strict'; return typeof this + ':' + String(this) + ':' + a + ':' + b + ':' + arguments.length; }
const arrow = (a, b) => typeof this + ':' + a + ':' + b;
const bound = sloppy.bind('B', 'x');
const proxy = new Proxy(strict, { apply(t, self, args) { return 'proxy:' + t.apply(self, args); } });
class K { m() { return 1; } }
function* gen(a) { yield a; yield this === undefined; }
const targets = [sloppy, strict, arrow, bound, proxy, Math.max, String.prototype.toUpperCase, gen];
const thisArgs = [null, undefined, 1, 'str', true, Symbol.iterator, { toString() { return 'obj'; } }];
for (let i = 0; i < 3; i++) {
    for (const f of targets) {
        for (const t of thisArgs) {
            let r1, r2, r3, r4;
            try { r1 = f.call(t, 1, 2); } catch (e) { r1 = 'E:' + e.constructor.name; }
            try { r2 = f.apply(t, [3, 4]); } catch (e) { r2 = 'E:' + e.constructor.name; }
            try { r3 = f.call(t); } catch (e) { r3 = 'E:' + e.constructor.name; }
            try { r4 = f.apply(t); } catch (e) { r4 = 'E:' + e.constructor.name; }
            const show = (r) => (typeof r === 'object' && r !== null ? JSON.stringify([...r]) : String(r));
            out.push([r1, r2, r3, r4].map(show).join(' | '));
        }
    }
}
for (const run of [() => K.call({}), () => K.apply({}, []), () => K.apply(null, [1, 2])])
    try { run(); out.push('no throw'); } catch (e) { out.push(e.constructor.name); }
console.log(out.join('\n'));
`));

test("apply argument lists: holes, array-likes, arguments, null, sparse and long arrays", () =>
    agree(String.raw`
const out = [];
function show() { return arguments.length + ':' + Array.prototype.map.call(arguments, (x) => String(x)).join(','); }
function viaArguments() { return show.apply(null, arguments); }
const holes = [1, , 3];
const long = Array.from({ length: 40 }, (_, i) => i);
const shrunk = [1, 2, 3, 4]; shrunk.length = 2;
const withProto = [7, , 9];
const lists = [
    holes, [], long, shrunk, null, undefined,
    { length: 3, 0: 'a', 2: 'c' }, { length: 0 }, 'xyz'.split(''), new Int8Array([5, 6]),
];
for (let i = 0; i < 3; i++) {
    for (const list of lists) {
        try { out.push(show.apply(null, list)); } catch (e) { out.push('E:' + e.constructor.name); }
    }
    out.push(viaArguments(1, 2, 3));
    out.push(viaArguments());
    Array.prototype[1] = 'inherited';
    out.push(show.apply(null, withProto));
    out.push(show.apply(null, [i, , i]));
    delete Array.prototype[1];
    for (const bad of [1, 'str', true])
        try { show.apply(null, bad); out.push('no throw'); } catch (e) { out.push(e.constructor.name); }
    let order = '';
    const r = show.apply((order += 't', null), [(order += 'a', 1), (order += 'b', 2)]);
    out.push(order + ' ' + r);
    let x = 1;
    out.push(show.apply(null, [x, (x = 2), x]));
}
console.log(out.join('\n'));
`));

test("an overwritten Function.prototype.call/apply and own call properties are honoured", () =>
    agree(String.raw`
const out = [];
function f(a) { return 'f' + a + (this && this.tag ? this.tag : ''); }
const g = function (a) { return 'g' + a; };
const sites = () => [f.call({ tag: 'T' }, 1), f.apply({ tag: 'U' }, [2]), g.call(null, 3), g.apply(null, [4])].join(',');
for (let i = 0; i < 5; i++) out.push(sites());
g.call = function (self, a) { return 'own call ' + a; };
g.apply = (self, list) => 'own apply ' + list;
out.push(sites());
delete g.call; delete g.apply;
out.push(sites());
const call = Function.prototype.call, apply = Function.prototype.apply;
Function.prototype.call = function (self, a) { return 'patched call ' + a; };
Function.prototype.apply = function (self, list) { return 'patched apply ' + list; };
out.push(sites());
Function.prototype.call = call;
Function.prototype.apply = apply;
out.push(sites());
Object.setPrototypeOf(g, { call() { return 'proto call'; }, apply() { return 'proto apply'; } });
out.push(sites());
const notFn = { call: Function.prototype.call, apply: Function.prototype.apply };
try { notFn.call(null); } catch (e) { out.push(e.constructor.name); }
try { notFn.apply(null, []); } catch (e) { out.push(e.constructor.name); }
out.push(Function.prototype.call.call(f, { tag: 'cc' }, 5));
out.push(Function.prototype.apply.call(f, { tag: 'ac' }, [6]));
console.log(out.join('\n'));
`));

test("function key filters see properties added, defined, deleted and redefined after warm-up", () =>
    agree(String.raw`
const out = [];
function f() { return 1; }
const arrow = () => 2;
class C { static s = 1; static m() {} }
const objs = [f, arrow, C, f.bind(null), function* () {}, async function () {}];
const keys = ['x', 'name', 'length', 'prototype', 'call', 'y', 's', 'm'];
const probe = () => objs.map((o) => keys.map((k) => (k in o ? 'i' : '-') + (Object.prototype.hasOwnProperty.call(o, k) ? 'o' : '-') + (o.hasOwnProperty(k) ? 'h' : '-')).join('')).join(' ');
for (let i = 0; i < 4; i++) out.push(probe());
for (const o of objs) o.x = 1;
out.push(probe());
for (const o of objs) Object.defineProperty(o, 'y', { value: 2, enumerable: false, configurable: true });
out.push(probe());
for (const o of objs) { delete o.x; delete o.name; }
out.push(probe());
for (const o of objs) {
    try { Object.defineProperty(o, 'length', { value: 42 }); } catch (e) { out.push(e.constructor.name); }
    try { Object.defineProperty(o, 'name', { get() { return 'got'; }, configurable: true }); } catch (e) { out.push(e.constructor.name); }
}
out.push(probe());
out.push(objs.map((o) => o.length + ':' + o.name + ':' + o.y + ':' + o.x).join(' '));
for (const o of objs) { delete o.length; o[Symbol.for('k')] = 1; o[0] = 'zero'; }
out.push(probe());
out.push(objs.map((o) => Object.getOwnPropertyNames(o).filter((k) => k !== 'caller' && k !== 'arguments').join(',') + '/' + (Symbol.for('k') in o) + (0 in o)).join(' '));
f.call = 5;
out.push(typeof f.call, 'call' in f, f.hasOwnProperty('call'));
console.log(out.join('\n'));
`));
