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

test("util.inspect shows ArrayBuffer contents and weak collections", () =>
    expectOracle(`import util from 'node:util';
console.log(util.inspect(new Uint8Array([1, 2]).buffer));
console.log(util.inspect(new WeakMap()), util.inspect(new WeakSet()));
`));

test("util.inspect shows SharedArrayBuffer and empty ArrayBuffer", () =>
    expectOracle(`import util from 'node:util';
const s = new SharedArrayBuffer(3);
new Uint8Array(s).set([255, 0, 16]);
console.log(util.inspect(s));
console.log(util.inspect(new ArrayBuffer(0)));
`));

test("util.inspect truncates ArrayBuffer bytes by maxArrayLength", () =>
    expectOracle(`import util from 'node:util';
const b = new Uint8Array(105).map((_, i) => i).buffer;
console.log(util.inspect(b));
console.log(util.inspect(new ArrayBuffer(4), { maxArrayLength: 3 }));
console.log(util.inspect(new ArrayBuffer(4), { maxArrayLength: 0 }));
console.log(util.inspect(new ArrayBuffer(2), { maxArrayLength: 1 }));
`));

test("util.inspect shows buffers and weak collections nested in objects", () =>
    expectOracle(`import util from 'node:util';
const o = { b: new Uint8Array([9, 10]).buffer, m: new WeakMap(), s: new WeakSet() };
console.log(util.inspect(o));
console.log(util.inspect({ a: { b: new ArrayBuffer(1) } }, { depth: 0 }));
console.log(util.inspect({ a: { b: new ArrayBuffer(1) } }, { depth: 1 }));
`));
