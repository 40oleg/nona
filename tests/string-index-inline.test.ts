import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";
import { compileToIR } from "../src/compiler.js";

// `s.charCodeAt(i)` and `s.charAt(i)` read the code unit inline when the
// callee is the intrinsic and the receiver a primitive string (issue #425);
// everything else is the call. Every site runs in a loop so the inline path
// is hot, under GC stress and without it, and is compared with Node.js.

function expectProgram(source: string): void {
    const expected = runOracle(source).stdout;
    for (const gcStress of [true, false]) {
        const native = runOnHost(source, { gcStress });
        assert.equal(native.error, undefined);
        assert.equal(native.status, 0, native.stderr);
        assert.equal(native.stdout, expected, `gcStress: ${gcStress}`);
    }
}

const show = `
function show(v) {
  if (typeof v === 'number') return Object.is(v, -0) ? '-0' : String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  return typeof v + ':' + String(v);
}`;

const cases: [string, string][] = [
    [
        "every unit of ASCII, BMP, surrogate and empty strings",
        `${show}
const inputs = ['', 'a', 'hello, world', 'Привет мир', '日本語テキスト', '\\uD83D\\uDE00x\\uD83C\\uDF89', 'a\\uD800b', '\\uDC00z', '\\uD800', '\\u00ff\\u0100\\u00e9'];
for (const s of inputs) {
  const codes = [], chars = [];
  for (let i = 0; i < s.length; i++) { codes.push(s.charCodeAt(i)); chars.push(s.charAt(i)); }
  for (let i = 1; i < s.length; i += 2) codes.push(s.charCodeAt(i));
  console.log(JSON.stringify(s), codes.join(','), JSON.stringify(chars), show(s.charCodeAt()), show(s.charAt()));
}`,
    ],
    [
        "positions that are not in-range integers",
        `${show}
const positions = [NaN, Infinity, -Infinity, -0, 0.5, 1.9, -1, -0.5, -0.9999, 4, 5, 3.999, 2 ** 32, 2 ** 53, -(2 ** 63), 1e308, Number.MIN_VALUE, -Number.MIN_VALUE];
for (const s of ['abcd', '\\u4e2d\\u6587\\uD83D\\uDE00', '']) {
  const rows = [];
  for (let round = 0; round < 3; round++)
    for (const p of positions) rows.push(show(s.charCodeAt(p)) + '/' + show(s.charAt(p)));
  console.log(rows.join(' '));
}`,
    ],
    [
        "positions that are not numbers",
        `${show}
const log = [];
const counted = { valueOf() { log.push('valueOf'); return 1; } };
const throwing = { valueOf() { throw new Error('from valueOf'); } };
const positions = ['1', '', ' 2 ', 'x', true, false, null, undefined, counted, [1], [], 1n];
const s = 'xyz';
const rows = [];
for (let round = 0; round < 2; round++)
  for (const p of positions) {
    try { rows.push(show(s.charCodeAt(p)) + '/' + show(s.charAt(p))); }
    catch (e) { rows.push(e.constructor.name); }
  }
try { s.charCodeAt(throwing); } catch (e) { rows.push(e.message); }
try { s.charAt(Symbol()); } catch (e) { rows.push(e.constructor.name); }
console.log(rows.join(' '), log.length);`,
    ],
    [
        "extra arguments are evaluated and ignored",
        `${show}
const s = 'abc';
let n = 0;
const rows = [];
for (let i = 0; i < 4; i++) rows.push(show(s.charCodeAt(i, n++)), show(s.charAt(i, n++)));
console.log(rows.join(' '), n);`,
    ],
    [
        "rope receivers",
        `
let s = '';
for (let i = 0; i < 200; i++) s = s + String.fromCharCode(65 + (i % 26)) + (i % 7 === 0 ? '\\u0416' : '');
let t = 'prefix-';
for (let i = 0; i < 50; i++) t += 'x' + i;
let sum = 0, chars = '';
for (let i = 0; i < s.length; i++) { sum += s.charCodeAt(i); if (i % 13 === 0) chars += s.charAt(i); }
let tsum = 0;
for (let i = 0; i <= t.length; i++) { const c = t.charCodeAt(i); if (c === c) tsum += c * (i + 1); }
console.log(s.length, sum, chars, t.length, tsum, JSON.stringify(t.charAt(t.length)));`,
    ],
    [
        "replacing and restoring the methods mid-loop",
        `
const s = 'hello';
const codeAt = String.prototype.charCodeAt, at = String.prototype.charAt;
const rows = [];
for (let i = 0; i < 12; i++) {
  if (i === 3) String.prototype.charCodeAt = function (p) { return 'patched:' + this + ':' + p; };
  if (i === 5) String.prototype.charAt = function (p) { return typeof this + p; };
  if (i === 7) String.prototype.charCodeAt = codeAt;
  if (i === 9) String.prototype.charAt = at;
  if (i === 10) String.prototype.charCodeAt = String.prototype.codePointAt;
  rows.push(s.charCodeAt(i % 6) + '|' + s.charAt(i % 6));
}
String.prototype.charCodeAt = codeAt;
console.log(rows.join(' '));
const swapped = 'abc';
String.prototype.charAt = codeAt;
console.log(swapped.charAt(1));
String.prototype.charAt = at;
console.log(swapped.charAt(1));`,
    ],
    [
        "String.prototype properties deleted, redefined and added between reads",
        `
const s = 'abc';
const codeAt = String.prototype.charCodeAt;
const rows = [];
for (let i = 0; i < 14; i++) {
  if (i === 2) delete String.prototype.charCodeAt;
  if (i === 4) Object.prototype.charCodeAt = function () { return 'object:' + typeof this; };
  if (i === 6) Object.defineProperty(String.prototype, 'charCodeAt', { get() { return () => 'getter'; }, configurable: true });
  if (i === 8) Object.defineProperty(String.prototype, 'charCodeAt', { value: codeAt, writable: true, configurable: true });
  if (i === 10) String.prototype.extra = function () { return this.length; };
  if (i === 12) delete String.prototype.extra;
  let r;
  try { r = s.charCodeAt(1); } catch (e) { r = e.constructor.name; }
  rows.push(r + ':' + (typeof s.extra) + ':' + (s.toUpperCase === String.prototype.toUpperCase) + ':' + typeof s.hasOwnProperty);
}
delete Object.prototype.charCodeAt;
console.log(rows.join(' '));`,
    ],
    [
        "String objects, other receivers and .call",
        `${show}
const receivers = [new String('wrap'), 12345, true, { charCodeAt(i) { return 'own' + i; }, charAt: (i) => 'arrow' + i }, Object.assign(new String('ab'), { charAt() { return 'shadow'; } }), [1, 2]];
const rows = [];
for (let round = 0; round < 2; round++)
  for (const r of receivers) {
    if (typeof r.charCodeAt === 'function') rows.push(show(r.charCodeAt(1)) + '/' + show(r.charAt(1)));
    rows.push(show(String.prototype.charCodeAt.call(r, 1)) + '/' + show(String.prototype.charAt.call(r, 1)));
  }
for (const r of [null, undefined]) {
  try { r.charCodeAt(0); } catch (e) { rows.push(e.constructor.name); }
  try { String.prototype.charAt.call(r, 0); } catch (e) { rows.push(e.constructor.name); }
}
String.prototype.own = function () { return this.charCodeAt(0) + this.charAt(1); };
rows.push('xyz'.own(), new String('pq').own());
console.log(rows.join(' '));`,
    ],
    [
        "the result slot may be the receiver or the position",
        `
let s = 'abcdef', i = 2;
for (let k = 0; k < 3; k++) { let t = s; t = t.charAt(k); console.log(t); }
for (let k = 0; k < 3; k++) { i = 'pqrs'.charCodeAt(i - 110 > 0 ? i - 110 : k); console.log(i); }`,
    ],
];
for (const [name, source] of cases)
    test(`inline charCodeAt/charAt: ${name}`, () => expectProgram(source));

test("member calls of charCodeAt/charAt with at most one argument are marked", () => {
    // The runtime's own JavaScript preludes have sites too: count the program's.
    const marked = (source: string) =>
        compileToIR(source)
            .functions.flatMap((f) => f.blocks)
            .flatMap((b) => b.operations)
            .filter((op) => op.kind === "invoke" && op.stringIndex).length;
    const base = marked(`const s = 'ab';
console.log(s.length);`);
    assert.equal(
        marked(
            `const s = 'ab';
const a = [1];
console.log(s.charCodeAt(0), s.charAt(), s['charAt'](1), s.charCodeAt(0, 1), s.charAt(...a), s?.charAt(0), s.codePointAt(0));`,
        ) - base,
        3,
    );
});
