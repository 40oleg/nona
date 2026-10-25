import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// Reading or writing a property of undefined or null throws a TypeError that
// names the base and the key, as in Node.js (#503).
const report = String.raw`const t = (f) => {
  try { f(); console.log("no error"); }
  catch (e) { console.log(e.message, e instanceof TypeError, e.constructor === TypeError, Object.getPrototypeOf(e) === TypeError.prototype); }
};`;

test("get and set on undefined or null name the base and key", () => {
    const source =
        report +
        String.raw`
t(() => { let o; o.x; });
t(() => { let o = null; o.x = 1; });
t(() => null["k"]);
t(() => undefined[0]);
t(() => { let u; u.m(); });
t(() => { let u = null; u.m(1, 2); });
t(() => { let o; o.length; });
t(() => { let o; o[Symbol("sym")]; });
t(() => { let o = null; o[Symbol()] = 1; });
t(() => { const o = {}; o.x.y; });
t(() => { const o = {}; o.x.y = 2; });
t(() => { let o = null; o[1] = 2; });
t(() => { let o; let k = "dyn"; o[k] = 2; });
t(() => { let o; o[1.5]; });
t(() => { let o; o[true]; });
t(() => { "use strict"; let o; o.x = 1; });
t(() => { let o; o.x += 1; });
t(() => { let o; o.x++; });
t(() => { let o; o[2]--; });
t(() => { let o = null; let k = "z"; o[k] ??= 1; });
t(() => { let o; for (o.x of [1]); });
t(() => { let o; const k = { toString() { console.log("toString called"); return "k"; } }; o[k] += 1; });
t(() => { let o; o?.x; console.log("optional ok"); });
t(() => { [].x.y; });
t(() => { Object.prototype.missing.call(); });`;
    const run = runOnHost(source, { gcStress: true });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
});

// An object key is not converted (that could run user code): the message
// omits the key part, while Node.js prints the key as #<Object>.
test("an object key gives the message without the key", () => {
    const source =
        report +
        String.raw`
t(() => { let o; o[{}]; });
t(() => { let o = null; o[{ toString() { console.log("toString called"); return "k"; } }]; });`;
    const run = runOnHost(source, { gcStress: true });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(
        run.stdout,
        "Cannot read properties of undefined true true true\n" +
            "Cannot read properties of null true true true\n",
    );
});

test("other TypeErrors keep the generic message", () => {
    const source =
        report +
        String.raw`
t(() => { "x" in 1; });
t(() => { delete null.x; });`;
    const run = runOnHost(source, { gcStress: true });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(
        run.stdout,
        "Invalid operation true true true\nInvalid operation true true true\n",
    );
});
