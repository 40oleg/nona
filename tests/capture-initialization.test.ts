import { test } from "node:test";
import assert from "node:assert/strict";
import { compileToIR } from "../src/compiler.js";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// Dead-zone checks of closure reads (#242): a capture whose cell is
// initialized wherever the closure is created needs no check.
const checks = (source: string, name: string) =>
    compileToIR(source)
        .functions.filter((fn) => fn.name === name)
        .flatMap((fn) => fn.blocks.flatMap((block) => block.operations))
        .filter((op) => op.kind === "checkInitialized").length;

test("a closure created after the initialization reads without a check", () => {
    assert.equal(
        checks(
            "function t() { const x = Math.random(); return () => x; }\nconsole.log(typeof t()());",
            "<anonymous>",
        ),
        0,
    );
    // Passed on: a closure created inside such a closure.
    assert.equal(
        checks(
            "function t() { let x = 1; return function outer() { return function inner() { return x; }; }; }\nconsole.log(t()()());",
            "inner",
        ),
        0,
    );
    // Created before the initialization: the check stays.
    assert.equal(
        checks(
            "function t() { const read = function early() { return x; }; let x = 1; return read; }\nconsole.log(t()());",
            "early",
        ),
        1,
    );
    assert.equal(
        checks(
            "function t() { return hoisted(); function hoisted() { return x; } let x = 1; }\ntry { t(); } catch (e) {}",
            "hoisted",
        ),
        1,
    );
});

test("closures that can run in the dead zone still throw ReferenceError", () => {
    const source = `const results = [];
const attempt = (name, f) => { try { results.push(name + ":" + f()); } catch (e) { results.push(name + ":" + e.constructor.name); } };
attempt("read before let", () => { const read = () => x; const r = read(); let x = 1; return r; });
attempt("read after let", () => { let x = 1; const read = () => x; return read(); });
attempt("hoisted declaration", () => { function f() { return y; } const r = f(); let y = 2; return r; });
attempt("hoisted after", () => { function f() { return y; } let y = 2; return f(); });
attempt("loop before binding", () => { const fs = []; for (let i = 0; i < 2; i++) { fs.push(() => z); if (i === 0) { try { fs[0](); } catch (e) { results.push("loop0:" + e.constructor.name); } } } let z = 3; return fs.map((f) => f()).join(""); });
attempt("loop bindings", () => { const fs = []; for (let i = 0; i < 3; i++) fs.push(() => i); return fs.map((f) => f()).join(""); });
attempt("switch scope", () => { switch (1) { case 0: let w = 5; case 1: { const g = () => w; return g(); } } });
attempt("switch after", () => { switch (0) { case 0: let w = 5; case 1: { const g = () => w; return g(); } } });
attempt("class heritage", () => { class C extends (() => D)() {} class D {} return typeof C; });
attempt("class field", () => { class C { f = () => K; } const c = new C(); const r = c.f(); const K = 1; return r; });
attempt("class field after", () => { const K = 7; class C { f = () => K; } return new C().f(); });
attempt("generator", () => { function* g() { yield () => v; } const it = g(); const f = it.next().value; const r = f(); let v = 4; return r; });
attempt("generator after", () => { let v = 4; function* g() { yield () => v; } return g().next().value(); });
attempt("class binding", () => { const make = () => new Q(); try { make(); } catch (e) { results.push("class:" + e.constructor.name); } class Q {} return typeof make(); });
console.log(results.join("\\n"));`;
    const run = runOnHost(source);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
});
