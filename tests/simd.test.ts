import { test } from "node:test";
import assert from "node:assert/strict";
import { Assembler } from "../src/backend/x64/assembler.js";
import { Arm64Assembler } from "../src/backend/arm64/assembler.js";
import { expectProgram } from "./helpers/program.js";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// SIMD in the runtime (#253): the 128-bit vector operations of the machine
// model and the string routines that use them. Every program runs natively
// and must print what Node.js prints; the lengths go across the eight-unit
// vector width, with matches at every offset, unaligned starts and tails.

function words(bytes: Uint8Array): number[] {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return Array.from({ length: bytes.length / 4 }, (_, i) =>
        view.getUint32(i * 4, true),
    );
}

test("x64 vector operations encode SSE2 (and bsf/bsr)", () => {
    const a = new Assembler("vector");
    a.vectorEqual16("xmm1", "xmm2");
    a.vectorEqual8("xmm1", "xmm2");
    a.vectorOr("xmm3", "xmm4");
    a.vectorAnd("xmm3", "xmm4");
    a.vectorZero("xmm4");
    a.vectorBroadcast16("xmm5", "r9");
    a.vectorMask("rax", "xmm6");
    a.vectorMask("r10", "xmm6");
    a.bitScanForward("r10", "r11");
    a.bitScanReverse("r10", "r11");
    a.vectorEqual32("xmm1", "xmm2");
    // GNU as: pcmpeqw, pcmpeqb, por, pand, pxor, movd+pshuflw+pshufd,
    // pmovmskb eax and r10d, bsf, bsr, pcmpeqd.
    assert.equal(
        Buffer.from(a.finish().bytes).toString("hex"),
        "660f75ca660f74ca660febdc660fdbdc660fefe4" +
            "66410f6ee9f20f70ed00660f70ed00" +
            "660fd7c666440fd7d64d0fbcd34d0fbdd3" +
            "660f76ca",
    );
    assert.equal(a.vectorMaskBitsPerByte, 1);
    assert.equal(a.vectorMaskAll, 0xffffn);
});

test("ARM64 vector operations encode NEON with the same effect", () => {
    const a = new Arm64Assembler("vector");
    a.vectorEqual16("xmm1", "xmm2");
    a.vectorEqual8("xmm1", "xmm2");
    a.vectorOr("xmm3", "xmm4");
    a.vectorAnd("xmm3", "xmm4");
    a.vectorZero("xmm5");
    a.vectorBroadcast16("xmm5", "r8");
    a.vectorMask("r10", "xmm6");
    a.bitScanForward("r11", "r11");
    a.bitScanReverse("r11", "r11");
    a.vectorEqual32("xmm1", "xmm2");
    // llvm-mc: cmeq .8h, cmeq .16b, orr, and, movi .2d #0, dup .8h,
    // shrn #4 + fmov, rbit + clz, clz + eor #63 (r8 is x7, r10 x9, r11 x10),
    // cmeq .4s.
    assert.deepEqual(
        words(a.finish().bytes),
        [
            0x6e628c21, 0x6e228c21, 0x4ea41c63, 0x4e241c63, 0x6f00e405,
            0x4e020ce5, 0x0f0c84df, 0x9e6603e9, 0xdac0014a, 0xdac0114a,
            0xdac0114a, 0xd240154a, 0x6ea28c21,
        ],
    );
    assert.equal(a.vectorMaskBitsPerByte, 4);
    assert.equal(a.vectorMaskAll, 0xffffffffffffffffn);
});

const cases: [string, string][] = [
    [
        "comparison and equality of strings around the vector width",
        `const out = [];
const base = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
for (let len = 0; len <= 40; len++) {
  const s = base.slice(0, len);
  for (let i = 0; i <= len; i++)
    for (const ch of ["\\u0000", "a", "\\u00ff", "\\u0100", "\\uffff", "\\ud83d"]) {
      const t = s.slice(0, i) + ch + s.slice(i + 1), u = s.slice(0, i);
      out.push((s === t ? 1 : 0) + (s < t ? 2 : 0) + (s > t ? 4 : 0), (s === u ? 1 : 0) + (s < u ? 2 : 0) + (u < s ? 4 : 0));
    }
}
const m = new Map();
for (let i = 0; i < 50; i++) m.set(base.repeat(3) + i, i);
let sum = 0;
for (let i = 0; i < 50; i++) sum += m.get(base.repeat(3) + i);
console.log(out.length, out.reduce((a, b) => (a * 31 + b) % 1000000007, 7), sum, ["b" + base, "a" + base, base + "a", base].sort().join("|").length);`,
    ],
    [
        "indexOf, includes and lastIndexOf at every offset",
        `const r = [];
const base = "abcabdabcabeabcabfxyz\\u00e9\\u0100\\ud83d\\ude00abcab";
for (let n = 0; n < 70; n += 3) {
  const t = base.repeat(4).slice(0, n);
  for (const p of ["a", "ab", "abc", "abf", "z\\u00e9", "\\u0100a", "\\ude00", "q", "cab", t.slice(n >> 1), t, t + "x", ""])
    for (const from of [undefined, 0, 1, 7, 8, 9, n - 1, n, n + 3, -2])
      r.push(t.indexOf(p, from), t.includes(p, from) ? 1 : 0, t.lastIndexOf(p, from));
}
let h = 7;
for (const v of r) h = (h * 31 + v + 2) % 1000000007;
console.log(r.length, h);`,
    ],
    [
        "split, replaceAll, slice and substring copies",
        `const r = [];
const base = "ab cd  ef\\u00e9 gh\\ud83d\\ude00 ij  kl mn op qr st uv wx yz";
for (let n = 0; n < base.length; n++) {
  const t = base.slice(0, n);
  for (const sep of [" ", "  ", "ab", "z", "\\u00e9", "\\ude00", "qq", t, t + "!"])
    r.push(t.split(sep).join("|"), t.split(sep, 2).length, t.replaceAll(sep || "x", "#"));
}
const long = "0123456789abcdefghij\\u00e9\\u0100\\ud83d\\ude00KLMNOPQRSTUVWXYZ".repeat(3);
for (let i = 0; i < long.length; i += 3)
  for (let j = i; j <= long.length; j += 5) r.push(long.slice(i, j), long.substring(j, i), long.substr(i, j - i));
r.push(...(/(\\d+)([a-j]+)/.exec(long) || []));
const s = r.join("~");
let h = 7;
for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000000007;
console.log(r.length, s.length, h);`,
    ],
    [
        "typed array fill, copyWithin, set, slice and searches",
        `const types = [Uint8Array, Int8Array, Uint8ClampedArray, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array];
let h = 7;
const mix = (v) => { h = (h * 31 + (typeof v !== "number" ? 3 : Object.is(v, -0) ? 99991 : v !== v ? 77777 : Math.round(v * 1000) % 1000003)) % 1000000007; };
for (const T of types)
  for (const n of [0, 1, 7, 16, 17, 33]) {
    const a = new T(n);
    for (let i = 0; i < n; i++) a[i] = (i * 37) % 251 - 60 + (T === Float64Array ? 0.5 : 0);
    for (const v of [5, -1, 300, 1.5, -0, NaN, -3e9])
      for (const [s, e] of [[undefined, undefined], [3, -2], [-5, undefined], [9, 4]]) { const b = a.slice(); b.fill(v, s, e); b.forEach(mix); }
    for (const [t, s, e] of [[0, 1], [1, 0], [3, 0, 20], [17, 1], [2, -9, -1]]) { const b = a.slice(); b.copyWithin(t, s, e); b.forEach(mix); }
    if (n > 3) { a[n - 1] = NaN; a[2] = -0; }
    for (const p of [0, -60, 17, 190, 189.5, 255, -1, 300, -0, NaN, "17", undefined, 2 ** 32 - 60])
      for (const f of [undefined, 2, 16, -3, -100]) mix(a.indexOf(p, f)), mix(a.lastIndexOf(p, f === undefined ? Infinity : f)), mix(a.includes(p, f) ? 1 : 0);
    const c = new T(n + 5);
    c.set(a, 2); c.set(a.subarray(1, 4)); c.forEach(mix);
    new T(c.buffer).set(c.subarray(3, 3 + Math.min(n, 8)), 1); c.forEach(mix);
    new Float64Array(n + 1).fill(1).set(a, 1);
  }
const u = new Uint8Array(new ArrayBuffer(40), 3, 30); u.fill(7); u.copyWithin(5, 0, 20); u.set(u.subarray(2, 12), 0);
console.log(h, Array.from(new Uint8Array(u.buffer)).join(""));`,
    ],
];

for (const [name, source] of cases)
    test("SIMD strings: " + name, () => {
        const oracle = runOracle(source);
        assert.equal(oracle.status, 0, oracle.stderr);
        expectProgram(source, oracle.stdout);
    });

test("SIMD strings keep their results under GC stress", () => {
    const source = `const t = "xyz".repeat(30) + "needle" + "\\u0100".repeat(9);
const parts = [];
for (let i = 0; i < 40; i++) parts.push(t.slice(i, i + 50), t.indexOf("needle", i), t.lastIndexOf("y", 80 - i), t.includes("dle\\u0100"), t.split("z").length, t.slice(i) === t.slice(i, t.length));
console.log(parts.join(","));`;
    const oracle = runOracle(source);
    assert.equal(oracle.status, 0, oracle.stderr);
    const run = runOnHost(source);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, oracle.stdout);
});
