import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";
import { compileToIR } from "../src/compiler.js";

// RegExp match indices (#307): the d flag, RegExp.prototype.hasIndices and
// the indices array of exec results.
function expectOracle(source: string, gcStress = true): void {
    const run = runOnHost(source, { gcStress });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
}

test("d flag on literals and the constructor, hasIndices and flags order", () =>
    expectOracle(`
const lit = /a/d, made = new RegExp('a', 'd'), all = new RegExp('x', 'yusmigd');
console.log(lit.hasIndices, made.hasIndices, /a/.hasIndices, /a/gd.hasIndices);
console.log(lit.flags, made.flags, all.flags, /x/dgimsuy.flags, /x/ygd.flags);
console.log(String(all), String(/b/gd), all.source, new RegExp(lit).flags, new RegExp(lit, 'g').flags);
const get = Object.getOwnPropertyDescriptor(RegExp.prototype, 'flags').get;
console.log(get.call({ hasIndices: 1, global: 1 }), get.call({ hasIndices: 0, sticky: 1 }));
for (const flags of ['dd', 'gdd', 'dgd'])
  try { new RegExp('a', flags); console.log('no error'); } catch (e) { console.log(e instanceof SyntaxError); }
`));

test("hasIndices getter descriptor and receivers", () =>
    expectOracle(`
const desc = Object.getOwnPropertyDescriptor(RegExp.prototype, 'hasIndices');
console.log(typeof desc.get, desc.set, desc.enumerable, desc.configurable);
console.log(desc.get.name, desc.get.length, RegExp.prototype.hasIndices);
for (const receiver of [{}, 1, undefined, Object.create(RegExp.prototype)])
  try { desc.get.call(receiver); console.log('no error'); } catch (e) { console.log(e instanceof TypeError); }
console.log(Object.getOwnPropertyNames(RegExp.prototype).includes('hasIndices'));
`));

test("indices of exec, match, matchAll and replace", () =>
    expectOracle(`
const show = (m) => m === null ? 'null' : JSON.stringify(m.indices) + ' ' + (m.indices && m.indices.groups);
console.log(show(/b/d.exec('abc')), show('xxabab'.match(/ab/d)), show(/b/.exec('abc')));
console.log('indices' in /b/.exec('abc'), 'indices' in /(b)/.exec('abc'));
console.log([...'a1b22c333'.matchAll(/\\d+/dg)].map((m) => m.indices[0].join('-')).join(' '));
console.log('a1b22'.replace(/\\d+/dg, function () { return '[' + arguments.length + ']'; }));
const re = /o/dg, seen = [];
let m;
while ((m = re.exec('foo boo')) !== null) seen.push(m.indices[0].join(':') + '@' + re.lastIndex);
console.log(seen.join(' '), re.lastIndex);
const sticky = /o/dy;
sticky.lastIndex = 1;
console.log(show(sticky.exec('foo')), sticky.lastIndex, show(sticky.exec('fox')), sticky.lastIndex);
`));

test("indices of captures, unmatched groups and named groups", () =>
    expectOracle(`
const m = /(a)(x)?(?:(b)|c)/d.exec('zzac');
console.log(m.indices.length, JSON.stringify(m.indices), m.indices[2], m.indices.groups, 2 in m.indices);
const n = /(?<year>\\d{4})-(?<month>\\d\\d)(?<day>-\\d\\d)?/d.exec('on 2024-05!');
console.log(JSON.stringify(n.indices), Object.getPrototypeOf(n.indices.groups));
console.log(Object.keys(n.indices.groups).join(), JSON.stringify(n.indices.groups), n.indices.groups.day);
console.log(Object.keys(n).join(), Object.keys(n.indices).join());
const d = Object.getOwnPropertyDescriptor(n, 'indices'), g = Object.getOwnPropertyDescriptor(n.indices, 'groups');
console.log(d.writable, d.enumerable, d.configurable, g.writable, g.enumerable, g.configurable);
console.log(Array.isArray(n.indices), Array.isArray(n.indices[1]), n.indices[1].length);
const u = /(\\u{1F600})(.)/du.exec('ab\\u{1F600}c');
console.log(JSON.stringify(u.indices), JSON.stringify(/(.)(.)/d.exec('\\u{1F600}').indices));
console.log(JSON.stringify(/(?<w>x)|(?<v>y)/d.exec('y').indices.groups));
`));

test("a repeated d flag in a literal is a syntax error", () => {
    assert.throws(
        () => compileToIR("/a/dd;"),
        /Invalid regular expression flags/,
    );
    assert.throws(
        () => compileToIR("/a/gdgd;"),
        /Invalid regular expression flags/,
    );
    compileToIR("/a/dgimsuy;");
});
