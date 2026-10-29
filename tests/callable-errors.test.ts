import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// #504: calls of non-callable values, `new` on non-constructors and class
// constructor calls without new throw TypeErrors with distinct messages.
const report = `function report(f) {
    try { f(); console.log("no error"); }
    catch (e) { console.log(e instanceof TypeError, e.message); }
}
`;

test("a class constructor called without new names the class, as Node.js does", () => {
    const source =
        report +
        `report(() => { class A {} A(); });
report(() => { const C = class {}; C(); });
report(() => { class A {} A.call(null); });
report(() => { class A {} A.apply(null, []); });
report(() => { class D extends Array {} D(); });
`;
    const run = runOnHost(source, { gcStress: true });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
});

test("an anonymous class constructor called without new has an empty name", () => {
    const source =
        report +
        `report(() => { (0, class {})(); });
report(() => { class N { static name = 1; } N(); });
report(() => { class G { static get name() { throw 1; } } G(); });
`;
    const run = runOnHost(source, { gcStress: true });
    assert.equal(run.status, 0, run.stderr);
    const message = "Class constructor  cannot be invoked without 'new'";
    assert.equal(run.stdout, `true ${message}\n`.repeat(3));
});

test("the issue's calls name the callee, as Node.js does", () => {
    const source = `try { const o = {}; o.foo(); } catch (e) { console.log(e.message); }
try { const f = () => 1; new f(); } catch (e) { console.log(e.message); }
try { class A {} A(); } catch (e) { console.log(e.message); }
`;
    const run = runOnHost(source, { gcStress: true });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(
        run.stdout,
        "o.foo is not a function\nf is not a constructor\n" +
            "Class constructor A cannot be invoked without 'new'\n",
    );
    assert.equal(run.stdout, runOracle(source).stdout);
});

// General, method, direct-call, Math.imul and charAt sites, and `new` sites.
test("calls of non-callable values name the callee text, as Node.js does", () => {
    const source =
        report +
        `function h() { return 1; }
globalThis.h = 1;
const a = { b: {} };
report(() => { a.b.c(); });
report(() => { a.b.c(1, 2, 3, 4, 5, 6); });
report(() => { a["b"].c(1); });
report(() => { class K { m() { this.x(); } } new K().m(); });
report(() => { let g; g(); });
report(() => { const p = {}; p(); });
report(() => { const n = 5; n(1, 2); });
report(() => { const o = { m: 1 }; o.m(); });
report(() => { h(); });
report(() => { h(1); });
report(() => { Math.imul = 3; Math.imul(2, 3); });
report(() => { const s = "s"; String.prototype.charAt = 2; s.charAt(0); });
report(() => { new a.b(); });
report(() => { const f = () => 1; new f(1, 2); });
report(() => { new h(); });
`;
    const run = runOnHost(source, { gcStress: true });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
});

test("calls whose callee has no static text throw the generic TypeError", () => {
    const source =
        report +
        `const o = { f() { return 1; } };
report(() => { (0, o.foo)(); });
report(() => { o.f()(); });
report(() => { o[1](); });
report(() => { o.foo(...[1]); });
report(() => { new Proxy({}, {})(); });
report(() => { Function.prototype.call.call({}); });
report(() => { new (o.f())(); });
report(() => { const f = () => 1; new f(...[1]); });
report(() => { new (new Proxy({}, {}))(); });
report(() => { new ((() => 1).bind())(); });
`;
    const run = runOnHost(source, { gcStress: true });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(
        run.stdout,
        "true value is not a function\n".repeat(6) +
            "true value is not a constructor\n".repeat(4),
    );
});
