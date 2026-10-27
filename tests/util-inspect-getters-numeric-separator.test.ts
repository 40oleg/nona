import { test } from "node:test";
import assert from "node:assert/strict";
import { runModulesOnHost } from "./helpers/host.js";

function expectOracle(source: string): void {
    for (const gcStress of [false, true]) {
        const run = runModulesOnHost({ "main.mjs": source }, "main.mjs", {
            gcStress,
        });
        assert.equal(run.native.error, undefined);
        assert.equal(run.native.status, 0, run.native.stderr);
        assert.equal(run.oracleStatus, 0);
        assert.equal(run.native.stdout, run.oracle);
    }
}

test("util.inspect getters and numericSeparator match the issue repro", () =>
    expectOracle(`import util from "node:util";
console.log(util.inspect({ get a() { return 1; }, get b() { return 2; }, set b(v) {} }, { getters: true }));
console.log(util.inspect(1234567.891, { numericSeparator: true }), util.inspect(123456789n, { numericSeparator: true }));
`));

test("util.inspect getters modes, errors and object values", () =>
    expectOracle(`import util from "node:util";
const o = {
    get a() { return "x"; },
    get b() { return 2; },
    set b(v) {},
    set c(v) {},
    get d() { const e = new Error("boom"); e.stack = "Error: boom"; throw e; },
    get e() { return { n: 1 }; },
    get f() { return null; },
    [Symbol("s")]: 1,
    get [Symbol("g")]() { return 5; },
};
for (const getters of [false, true, "get", "set"])
    console.log(util.inspect(o, { getters }));
console.log(util.inspect({ get x() { throw "bad"; }, set x(v) {} }, { getters: true }));
console.log(util.inspect({ get a() { throw null; }, get b() { throw undefined; }, get c() { throw 5; }, get d() { throw { m: { n: 1 } }; } }, { getters: true }));
console.log(util.inspect({ x: { get d() { throw { a: { b: 1 } }; } } }, { getters: true, depth: 1 }));
`));

test("util.inspect numericSeparator formats numbers and bigints", () =>
    expectOracle(`import util from "node:util";
const o = { numericSeparator: true };
for (const v of [-1234567, 1234, 123, 0.1234567, 1234567.1234567, -1234567.891, 123456789n, -123456789n, 12n, -0, NaN, Infinity, -Infinity, 1e21, 1.5e-10, -0.5, -0.0001234, 0.5, 0])
    console.log(util.inspect(v, o));
console.log(util.inspect([1000000, { a: 2000000n }, new Number(3000000)], o));
console.log(util.inspect(new Float64Array([1234567.5]), o));
`));
