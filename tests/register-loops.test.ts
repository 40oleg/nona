import { test } from "node:test";
import assert from "node:assert/strict";
import { compile } from "../src/compiler.js";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// Register loops (#424, src/backend/x64/register-loops.ts): int32 counters in
// GPRs, proven Number accumulators in XMM registers, written back as boxed
// Numbers at calls, safepoints and exits.

/** The register copy of fn's first planned loop (its `.r` blocks). */
function registerCopy(source: string, fn = "js.fn.0"): string {
    const result = compile(source, {
        fileName: "/app.js",
        target: "linux-x64",
        printAsm: true,
    });
    assert.ok(result.ok);
    const assembly = result.assembly!;
    const body = assembly.slice(
        assembly.indexOf(fn + ":"),
        assembly.indexOf(fn + ".end:"),
    );
    const start = body.search(/\.block\.\d+\.r:/);
    assert.ok(start >= 0, "the loop has a register copy");
    const rest = body.slice(start),
        end = rest.search(/\.block\.\d+(\.generic)?:/);
    return end >= 0 ? rest.slice(0, end) : rest;
}

test("an f64AddChain loop keeps its counter in a register", () => {
    const loop = registerCopy(
        "function f(t, n) { let s = 0; for (let i = 0; i < n; i++) s = s + t[i & 1023]; return s; }\nconsole.log(f(new Float64Array(1024), 10));\n",
    );
    // i < n compares integers, i++ is an add, i & 1023 and the typed-array
    // index use the register: no cvttsd2si round trip on the counter.
    assert.match(loop, /cmp r12, r13/);
    assert.match(loop, /add r12, 1\n/);
    assert.match(loop, /mov r10, r12/);
    assert.doesNotMatch(loop, /cvttsd2si/);
});

test("double accumulators stay in XMM registers without tag tests", () => {
    const loop = registerCopy(
        "function f(n) { let s = 0, q = 1; for (let i = 0; i < 1000; i++) { s = s * 0.5 + i; q = q / 3 - s; } return s + q + n; }\nconsole.log(f(1));\n",
    );
    assert.match(loop, /mulsd xmm[2-4], /);
    assert.match(loop, /subsd xmm[2-4], /);
    assert.doesNotMatch(loop, /cmp rax, 3/);
    assert.doesNotMatch(loop, /cvttsd2si/);
    assert.doesNotMatch(loop, /rt\.collect/);
});

test("register loops match Node.js on NaN, infinities, -0 and int32 bounds", () => {
    const source = `function chain(t, n) { let s = 0; for (let i = 0; i < n; i++) s = s + t[i & 1023]; return s; }
function mulx4(t, n) { let p0 = 1, p1 = 1, p2 = 1, p3 = 1;
  for (let i = 0; i < n; i += 4) { p0 = p0 * t[i & 1023]; p1 = p1 * t[(i + 1) & 1023]; p2 = p2 * t[(i + 2) & 1023]; p3 = p3 * t[(i + 3) & 1023]; }
  return p0 * p1 * (p2 * p3); }
function dbl(n) { let s = 0, q = 1; for (let i = 0; i < n; i++) { s = s * 0.5 + i; q = q / 3 - s; } return s + "," + q; }
function negz(n) { let z = -0; for (let i = 0; i < n; i++) z = z * 1; return Object.is(z, -0); }
function nan(n) { let x = 0; for (let i = 0; i < n; i++) x = x + 0 / 0; return x; }
function inf(n) { let x = 1; for (let i = 0; i < n; i++) x = x * 1e300; return x; }
function big(n) { let c = 0; for (let i = 2147483640; i < n; i++) c = c + (i & 7); return c; }
function sum(n) { let c = 0; for (let i = 0; i < n; i++) c += i; return c; }
function half(n) { let c = 0; for (let i = 0.5; i < n; i++) c += i; return c; }
function down(n) { let c = 0; for (let i = n; i > 0; i--) c = c ^ i; return c; }
function brk(n) { let i = 0; for (; i < n; i++) { if ((i & 15) === 9) break; } return i; }
function thr(n) { let i = 0; try { for (; i < n; i++) { if (i === 5) throw new Error("x" + i); } } catch (e) { return e.message + i; } return i; }
function alloc(n) { let s = 0; const a = []; for (let i = 0; i < n; i++) { s = s + i * 0.25; a.push({ v: s }); } return a.length + ":" + s + ":" + a[n - 1].v; }
const t = new Float64Array(1024);
for (let j = 0; j < 1024; j++) t[j] = 1 + (j % 7) / 1e6;
console.log(chain(t, 5000), mulx4(t, 4000), dbl(50), negz(10), nan(3), inf(5));
console.log(big(2147483650), big(2147483648.5), sum(100), sum(10.5), sum(NaN), sum("12"), sum(2 ** 31 + 3 > 0 ? 7 : 0));
console.log(half(10), down(100), down(-3), brk(100), thr(100), alloc(300));
console.log(chain([1, 2, 3], 10), chain("abc", 3), chain(t, 0));`;
    const run = runOnHost(source);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
});
