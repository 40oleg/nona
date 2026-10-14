import { test } from "node:test";
import assert from "node:assert/strict";
import { compile, compileToIR } from "../src/compiler.js";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// Dense integer switches dispatch through a jump table (#241).
const switches = (source: string) =>
    compileToIR(source).functions.flatMap((fn) =>
        fn.blocks
            .map((block) => block.terminator)
            .filter((t) => t.kind === "switch"),
    );

test("switch semantics with a jump table match Node.js", () => {
    const source = `function kind(c) {
  switch (c) {
    case 48: case 49: case 50: case 51: return "digit-low";
    case 52: return "four";
    case 53: case 54: return "five-six";
    case 55: let t = "seven"; return t;
    case "1": return "string one";
    case 57: return "nine";
    case 48: return "duplicate";
    default: return "other";
    case 60: return "after default";
  }
}
const inputs = [48, 49, 52, 53, 55, 56, 57, 58, 59, 60, 61, -0, 0, 1.5, 48.5, NaN, Infinity, -Infinity, "1", "48", 1n, 48n, null, undefined, true, { valueOf() { return 48; } }, 2 ** 31, -48, 2 ** 32 + 48];
console.log(inputs.map((v) => kind(v)).join(","));
function fall(n) { const out = []; switch (n) { case 1: out.push("a"); case 2: out.push("b"); break; case 3: out.push("c"); default: out.push("d"); case 4: out.push("e"); case 5: out.push("f"); } return out.join(""); }
console.log([0, 1, 2, 3, 4, 5, 6, 3.5, "3"].map(fall).join(","));
function neg(n) { switch (n) { case -2: return "m2"; case -1: return "m1"; case -0: return "z"; case 1: return "p1"; case +2: return "p2"; } return "x"; }
console.log([-2, -1, -0, 0, 1, 2, 3, -3].map(neg).join(","));
function tdz(n) { try { switch (n) { case 1: return x; case 2: let x = "two"; return x; case 3: return "3"; case 4: x = 4; return x; } } catch (e) { return e.constructor.name; } return "none"; }
console.log([1, 2, 3, 4, 5].map(tdz).join(","));
let s = 0; for (let i = 0; i < 64; i++) switch (i & 7) { case 0: s += 1; break; case 1: s += 2; break; case 2: s += 4; break; case 3: s += 8; break; case 7: s += 16; }
console.log(s);`;
    const run = runOnHost(source);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
    // kind, fall, neg, tdz and the loop: all dense integer switches.
    assert.equal(switches(source).length, 5);
});

test("only literal case tests and dense ranges use a table", () => {
    const effectful = `let log = ""; function k(v) { log += v; return v; }
function f(n) { switch (n) { case 1: return "a"; case k(2): return "b"; case 3: return "c"; case 4: return "d"; case 5: return "e"; } return "x"; }
console.log([1, 2, 3, 5, 9].map(f).join(","), log);`;
    assert.equal(switches(effectful).length, 0);
    const run = runOnHost(effectful);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(effectful).stdout);
    // Three cases, or a sparse range: the compare chain stays.
    assert.equal(
        switches("switch (Math.random()) { case 1: case 2: case 3: break; }")
            .length,
        0,
    );
    assert.equal(
        switches(
            "switch (Math.random()) { case 1: case 200: case 4000: case 60000: break; }",
        ).length,
        0,
    );
    assert.equal(
        switches(
            "switch (Math.random()) { case 1: case 2: case 3: case 4: case 'x': case null: case 2n: break; }",
        ).length,
        1,
    );
});

test("the table is an indirect jump in the assembly", () => {
    const result = compile(
        "function f(n) { switch (n) { case 0: return 'a'; case 1: return 'b'; case 2: return 'c'; case 3: return 'd'; } return 'e'; }\nconsole.log(f(2));\n",
        { fileName: "/app.js", target: "linux-x64", printAsm: true },
    );
    assert.ok(result.ok);
    assert.match(result.assembly!, /lea r11, \[rip\+js\.fn\.0\.switch\.\d+\]/);
    assert.match(result.assembly!, /jmp r11$/m);
});
