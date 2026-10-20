import { test } from "node:test";
import assert from "node:assert/strict";
import { compileToIR } from "../src/compiler.js";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// Dead-zone checks of copies of parameters (#428): a plain parameter slot
// holds its argument (or undefined) from entry, so a `let` initialized from
// it needs no check; defaults and destructuring keep their checks.
const checks = (source: string, name: string) =>
    compileToIR(source)
        .functions.filter((fn) => fn.name === name)
        .flatMap((fn) => fn.blocks.flatMap((block) => block.operations))
        .filter((op) => op.kind === "checkInitialized").length;

test("a let copied from a plain parameter reads without a check", () => {
    assert.equal(
        checks(
            "function g(f, init, n) { let s = init; for (let i = 0; i < n; i++) s = f(s, i); return s; }\nconsole.log(g((a, b) => a + b, 0, 3));",
            "g",
        ),
        0,
    );
    // A top-level const read in the loop keeps its check: the analysis
    // counts a global as initialized only after this function's own store.
    assert.equal(
        checks(
            "const MASK = 7;\nfunction g(f, t, n, init) { let s = init; for (let i = 0; i < n; i++) s = f(s, t[i & MASK]); return s; }\nconsole.log(g((a, b) => a + b, [1, 2, 3, 4, 5, 6, 7, 8], 3, 0));",
            "g",
        ),
        1,
    );
    // Generators and async functions start with their arguments too.
    assert.equal(
        checks(
            "function* g(init, n) { let s = init; for (let i = 0; i < n; i++) yield s++; }\nconsole.log([...g(1, 3)].join());",
            "g",
        ),
        0,
    );
    assert.equal(
        checks(
            "async function g(init, n) { let s = init; for (let i = 0; i < n; i++) s += await i; return s; }\ng(1, 3).then(console.log);",
            "g",
        ),
        0,
    );
    // A default parameter puts every parameter in its dead zone first.
    assert.ok(
        checks(
            "function g(a, b = a) { let s = a; return s + b; }\nconsole.log(g(1));",
            "g",
        ) > 0,
    );
});

test("parameters in their dead zone still throw ReferenceError", () => {
    const source = `const results = [];
const attempt = (name, f) => { try { results.push(name + ":" + f()); } catch (e) { results.push(name + ":" + (e instanceof ReferenceError ? "ReferenceError" : e.constructor.name)); } };
attempt("default before", () => { function f(a = b, b) { return a; } return f(); });
attempt("default before passed", () => { function f(a = b, b) { return a; } return f(undefined, 2); });
attempt("default after", () => { function f(a, b = a, c = d, d) { return c; } return f(1); });
attempt("default after given", () => { function f(a, b = a, c = d, d) { return a + b + c; } return f(1, undefined, 3); });
attempt("destructured default", () => { function f({ x } = y, y) { return x; } return f(); });
attempt("destructured given", () => { function f({ x } = y, y) { return x; } return f({ x: 5 }); });
attempt("destructured rest", () => { function f(a, ...[b, c = a]) { let s = a; return s + b + c; } return f(1, 2); });
attempt("plain captured", () => { function f(a, b) { let s = a; const g = () => s + a + b; a = 10; return g(); } return f(1, 2); });
attempt("plain missing", () => { function f(a, b) { let s = b; return typeof s; } return f(1); });
attempt("plain rest", () => { function f(a, ...r) { let s = a; return s + r.length; } return f(1, 2, 3); });
attempt("generator", () => { function* g(init, n) { let s = init; for (let i = 0; i < n; i++) yield s++; } return [...g(1, 3)].join(); });
attempt("generator default", () => { function* g(a = b, b) { yield a; } return [...g()].join(); });
async function h(init, n) { let s = init; for (let i = 0; i < n; i++) s += await i; return s; }
async function hd(a = b, b) { return a; }
h(1, 3).then((v) => { results.push("async:" + v); return hd(); }).catch((e) => results.push("async default:" + (e instanceof ReferenceError))).then(() => console.log(results.join("\\n")));`;
    const run = runOnHost(source);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
    assert.match(run.stdout, /default before:ReferenceError/);
    assert.match(run.stdout, /default after:ReferenceError/);
    assert.match(run.stdout, /destructured default:ReferenceError/);
    assert.match(run.stdout, /async default:true/);
});
