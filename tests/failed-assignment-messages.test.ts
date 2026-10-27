import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// Failed writes throw TypeErrors with the message of other engines (#511).
function expectOracle(source: string): void {
    const expected = runOracle(source).stdout;
    const run = runOnHost(source, { gcStress: true });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, expected);
}

test("assignment to const and class name names the operation", () =>
    expectOracle(`"use strict";
const t = (f) => { try { f(); } catch (e) { console.log(e.constructor === TypeError, e.message); } };
t(() => { const c = 1; c = 2; });
t(() => { const c = 1; c += 2; });
t(() => { class K { static m() { K = 1; } } K.m(); });
t(() => { const f = function g() { g = 1; }; f(); });
`));

test("setPrototypeOf cycles and non-extensible objects name the failure", () =>
    expectOracle(`
const t = (f) => { try { f(); console.log("no error"); } catch (e) { console.log(e.constructor === TypeError, e.message); } };
t(() => { const a = {}; Object.setPrototypeOf(a, Object.create(a)); });
t(() => { const a = {}; a.__proto__ = Object.create(a); });
t(() => { Object.setPrototypeOf(Object.preventExtensions({}), {}); });
`));
