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

test("assert.strict and assert/strict use strict equality", () =>
    expectOracle(`
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const a = require('assert/strict');
try { a.equal(1, '1'); console.log('no throw'); } catch (e) { console.log(e.name, e.operator); }
try { a.deepEqual({ x: 1 }, { x: '1' }); console.log('no throw'); } catch (e) { console.log(e.name, e.operator); }
try { require('assert').strict.notEqual(1, '1'); console.log('no throw'); } catch (e) { console.log(e.name); }
try { a.notDeepEqual({ x: 1 }, { x: '1' }); console.log('no throw'); } catch (e) { console.log(e.name); }
const legacy = require('assert');
console.log(a.strict === a, legacy.strict === a, legacy.strict !== legacy, typeof legacy.strict);
console.log(require('node:assert/strict') === a);
legacy.equal(1, '1');
legacy.deepEqual({ x: 1 }, { x: '1' });
try { a(0); } catch (e) { console.log(e.name, e.operator); }
console.log('legacy loose ok');
`));

test("node:assert/strict ES module exports strict functions", () =>
    expectOracle(`
import strictAssert, { equal, deepEqual, notEqual, strictEqual, strict } from 'node:assert/strict';
import assert from 'node:assert';
try { equal(1, '1'); console.log('no throw'); } catch (e) { console.log(e.name, e.operator); }
try { deepEqual([1], ['1']); console.log('no throw'); } catch (e) { console.log(e.name, e.operator); }
try { strictEqual(1, '1'); } catch (e) { console.log(e.name, e.operator); }
notEqual(1, '1');
try { strictAssert.equal(1, '1'); } catch (e) { console.log(e.name); }
console.log(strict === strictAssert, strictAssert === assert.strict);
assert.equal(1, '1');
console.log('legacy loose ok');
`));
