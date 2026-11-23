import { test } from "node:test";
import assert from "node:assert/strict";
import { compile } from "../src/compiler.js";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";
import { maskableDivisor } from "../src/backend/x64/integer-ops.js";

// Inline Number % for int32 operands (#238); everything else keeps the fmod
// semantics of rt.rem.
test("% of int32 values and the cases it leaves to the runtime match Node.js", () => {
    const source = `const values = [7, -7, 3, -3, 0, -0, 1, -1, 8, 2147483647, -2147483648, 2 ** 31, 2 ** 53, 0.5, -2.5, NaN, Infinity, -Infinity, 1e-300];
const out = [];
for (const x of values) for (const y of values) {
  const r = x % y;
  out.push(Object.is(r, -0) ? "-0" : String(r));
}
console.log(out.join(","));
const k = []; for (const x of [13, -13, 0, -0, 8, -8, 2.5, 1073741825]) k.push(String(x % 8), String(x % 1), String(x % 1024), Object.is(x % 8, -0));
console.log(k.join(","));
let ring = 0; for (let i = 0; i < 100; i++) ring = (ring + 7) % 10; console.log(ring);
const big = 10n % 3n, mixed = (() => { try { return 1n % 1; } catch (e) { return e.constructor.name; } })();
console.log(String(big), mixed, "7" % 3, ({ valueOf() { return 9; } }) % 4, null % 2, undefined % 2, [5] % 3, true % 2);`;
    const run = runOnHost(source);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
});

test("u % 8 of an unsigned value masks instead of dividing", () => {
    const result = compile(
        "function slot(x) { const u = x >>> 0; return u % 8; }\nconsole.log(slot(13));\n",
        { fileName: "/app.js", target: "linux-x64", printAsm: true },
    );
    assert.ok(result.ok);
    const assembly = result.assembly!;
    const body = assembly.slice(
        assembly.indexOf("js.fn.0:"),
        assembly.indexOf("js.fn.0.end:"),
    );
    assert.match(body, /and r10, 7$/m);
    // The division is only the fallback for negative dividends.
    assert.match(body, /idiv rcx/);
    // The hot path makes no call to rt.rem; it is in the cold block.
    const hot = body.split(/call rt\.rem/)[0]!;
    assert.match(hot, /and r10/);
});

// Runtime arguments keep the conversion/compare/range guards on the path.
// The corresponding Lean statements are in Nona.Numeric (#659).
test("numeric proof boundaries and literal mask guards match Node.js", (t) => {
    t.diagnostic(
        `numeric native target=${process.platform}-${process.arch}, ` +
            `node=${process.version}, revision=${process.env.GITHUB_SHA ?? "local working tree"}`,
    );
    const source = `function dynamic(x, y) { return x % y; }
function literals(x) { return [x % 1, x % 2, x % 1073741824,
  x % 0, x % -0, x % -1, x % 6, x % 1073741825, x % 2147483648, x % 1.5]; }
const values = [0, -0, 1, -1, 6, -6, 8, -8, 2147483647, -2147483648,
  2147483648, -2147483649, 1073741824, 1073741825, 1.5, 2.5, -1.5,
  2147483647.5, -2147483648.5,
  NaN, Infinity, -Infinity, 2 ** 63 - 1024, 2 ** 63, -(2 ** 63),
  -(2 ** 63) - 2048, Number.MAX_VALUE, Number.MIN_VALUE];
function show(x) { return Object.is(x, -0) ? "-0" : String(x); }
for (const x of values) {
  const row = [];
  for (const y of [0, -0, 1, -1, 2, -2, 6, 1073741824, 2147483647,
    -2147483648, 2147483648, -2147483649, 1.5, NaN, Infinity, -Infinity]) {
    row.push(show(dynamic(x, y)));
  }
  for (const r of literals(x)) row.push(show(r));
  console.log(row.join(","));
}`;
    const native = runOnHost(source);
    const oracle = runOracle(source);
    assert.equal(native.status, 0, native.stderr);
    assert.equal(oracle.status, 0, oracle.stderr);
    assert.equal(native.stdout, oracle.stdout);
});

test("the complete static divisor predicate keeps its exact bounds", () => {
    for (const value of [1, 2, 2 ** 30])
        assert.equal(maskableDivisor(value), value);
    for (const value of [
        0,
        -0,
        -1,
        6,
        1.5,
        2 ** 30 + 1,
        2 ** 31,
        NaN,
        Infinity,
        -Infinity,
        "2",
        undefined,
    ])
        assert.equal(maskableDivisor(value), undefined);
});

function remainderAssembly(divisor: string): string {
    const result = compile(
        `function rem(x, y) { return x % ${divisor}; }\nconsole.log(rem(8, 2));`,
        { fileName: "/app.js", target: "linux-x64", printAsm: true },
    );
    assert.ok(result.ok);
    const assembly = result.assembly!;
    const start = assembly.indexOf("js.fn.0:");
    const end = assembly.indexOf("js.fn.0.end:");
    assert.ok(start >= 0 && end > start);
    return assembly.slice(start, end);
}

test("dynamic remainder emits int32 admission, zero rejection and signed 64-bit division", () => {
    const body = remainderAssembly("y");
    const firstConversion = body.indexOf("cvttsd2si r10, xmm0");
    const early = body.slice(0, firstConversion);
    assert.ok(firstConversion > 0);
    assert.match(
        early,
        /movabs r11, -0x8000000000000000[\s\S]*?cmp rax, r11[\s\S]*?je /,
    );
    for (const reg of ["r10", "rcx"]) {
        // Removing the round trip, unordered rejection, or sign-extension
        // range guard would invalidate admission_exact's correspondence.
        assert.match(
            body,
            new RegExp(
                `cvttsd2si ${reg}, xmm0[\\s\\S]*?cvtsi2sd xmm1, ${reg}` +
                    `[\\s\\S]*?ucomisd xmm1, xmm0[\\s\\S]*?jp [\\s\\S]*?jne ` +
                    `[\\s\\S]*?mov r11, ${reg}[\\s\\S]*?shl r11, 0x20` +
                    `[\\s\\S]*?sar r11, 0x20[\\s\\S]*?cmp r11, ${reg}[\\s\\S]*?jne `,
            ),
        );
    }
    assert.match(body, /test rcx, rcx[\s\S]*?je /);
    // These bytes include REX.W: a 32-bit IDIV would trap on INT_MIN / -1.
    assert.match(body, /48 99\s+cqo/);
    assert.match(body, /48 f7 f9\s+idiv rcx/);
    assert.match(body, /mov r10, rdx/);
    assert.match(body, /test r10, r10[\s\S]*?jne /);
    assert.match(body, /test rax, rax[\s\S]*?js /);
    assert.match(body, /movabs rax, -0x8000000000000000[\s\S]*?movq xmm0, rax/);
});

test("literal masking is guarded by the dividend sign and exact static eligibility", () => {
    for (const [literal, mask] of [
        ["1", "0"],
        ["2", "1"],
        ["1073741824", "0x3fffffff"],
    ]) {
        const body = remainderAssembly(literal!);
        assert.match(body, new RegExp(`and r10, ${mask}$`, "m"));
        assert.match(body, /test r10, r10[\s\S]*?jl [\s\S]*?and r10/);
        assert.match(body, /cqo[\s\S]*?idiv rcx/);
    }
    for (const literal of [
        "0",
        "-0",
        "-1",
        "6",
        "1073741825",
        "2147483648",
        "1.5",
    ]) {
        const body = remainderAssembly(literal);
        assert.doesNotMatch(body, /and r10, /);
        assert.match(body, /cvttsd2si rcx, xmm0/);
        assert.match(body, /test rcx, rcx[\s\S]*?je /);
    }
});
