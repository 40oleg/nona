import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// rt.strictEquals compares two strings itself (#257): the same record is
// equal, different lengths are unequal, and equal lengths compare their
// units 16 bytes per step, then 8, then one unit at a time. The runtime's
// own SameValueZero and strict-equality users (Array indexOf/includes, Map,
// typed array searches of non-Numbers) call it too. Programs run under GC
// stress against Node.js.
const agree = (source: string) => {
    const run = runOnHost(source);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
};

test("strict equality of strings of every length around the word and vector widths", () =>
    agree(String.raw`
const out = [];
const base = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
for (let n = 0; n <= 40; n++) {
  const s = base.slice(0, n), copy = s.split("").join("");
  let row = (s === copy ? "=" : "!") + (s !== copy ? "!" : "=");
  for (let i = 0; i < n; i++)
    for (const ch of ["\u0000", "A", "ÿ", "Ā", "￿", "\ud83d"]) {
      const t = s.slice(0, i) + ch + s.slice(i + 1);
      row += s === t ? "1" : "0";
      if ((s !== t) === (s === t)) row += "?";
    }
  row += s === s + "x" ? "1" : "0";
  row += (s + "x").slice(0, n) === s ? "1" : "0";
  out.push(row);
}
console.log(out.join("\n"));
`));

test("strict equality across value kinds and the runtime's own users", () =>
    agree(String.raw`
let rope = "";
for (let i = 0; i < 40; i++) rope += "ab";
const values = [undefined, null, true, false, 0, -0, 1, NaN, Infinity, "", "a", "ab", "abc", "string", "number", "object", "Ābc", rope, "ab".repeat(40), Symbol.iterator, 1n, 2n, 10n ** 30n, {}, [], () => 1];
const copies = values.map((v) => (typeof v === "string" ? v.split("").join("") : typeof v === "bigint" ? BigInt(String(v)) : v));
let out = "";
for (const a of values) for (const b of copies) out += (a === b ? 1 : 0) + "" + (a !== b ? 1 : 0);
const kinds = values.map((v) => typeof v);
let typed = "";
for (const k of kinds) typed += (k === "string" ? "s" : k === "number" ? "n" : k === "object" ? "o" : k === "bigint" ? "b" : "-");
const keys = [];
for (let i = 0; i < 40; i++) keys.push(("k" + i).repeat((i % 9) + 1));
const arr = keys.map((k) => k.split("").join(""));
let sum = 0;
for (const k of keys) sum += arr.indexOf(k) + (arr.includes(k + "") ? 1 : 0) + arr.lastIndexOf(k.slice(0));
const map = new Map(keys.map((k, i) => [k, i]));
for (const k of arr) sum += map.get(k.split("").join(""));
const set = new Set(arr);
for (const k of keys) sum += set.has(k + "") ? 1 : 0;
const big = new BigInt64Array([1n, 2n, 3n]);
console.log(out, typed, sum, [NaN].includes(NaN), [NaN].indexOf(NaN), [-0].includes(0), [0].indexOf(-0), big.indexOf(2n), big.includes("2"));
`));
