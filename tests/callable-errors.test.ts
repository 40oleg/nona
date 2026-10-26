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

test("calling a non-callable value throws a TypeError that says so", () => {
    const source =
        report +
        `report(() => { let u; u(); });
report(() => { const n = 5; n(); });
report(() => { const o = {}; o.foo(); });
report(() => { const o = {}; o(); });
report(() => { new Proxy({}, {})(); });
report(() => { Function.prototype.call.call({}); });
`;
    const run = runOnHost(source, { gcStress: true });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, "true value is not a function\n".repeat(6));
});

test("new on a non-constructor throws a TypeError that says so", () => {
    const source =
        report +
        `report(() => { const f = () => 1; new f(); });
report(() => { const o = { m() {} }; new o.m(); });
report(() => { async function af() {} new af(); });
report(() => { function* g() {} new g(); });
report(() => { const o = {}; new o(); });
report(() => { new (new Proxy({}, {}))(); });
report(() => { new ((() => 1).bind())(); });
report(() => { let u; new u(); });
`;
    const run = runOnHost(source, { gcStress: true });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, "true value is not a constructor\n".repeat(8));
});
