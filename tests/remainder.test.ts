import { test } from "node:test";
import assert from "node:assert/strict";
import { compile } from "../src/compiler.js";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

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
