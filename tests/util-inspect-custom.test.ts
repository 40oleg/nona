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

test("util.inspect.custom receives options.stylize", () =>
    expectOracle(`
import util from 'node:util';
class Money { [util.inspect.custom](depth, options, inspect) { return options.stylize('$5', 'number'); } }
console.log(util.inspect(new Money()));
console.log(util.inspect({ [util.inspect.custom](d, o) { return typeof o.stylize; } }));
`));

test("options.stylize adds ANSI codes when colors is set", () =>
    expectOracle(`
import util from 'node:util';
const obj = { [util.inspect.custom](d, o) { return o.stylize('x', 'special') + o.stylize('y', 'nope'); } };
console.log(JSON.stringify(util.inspect(obj, { colors: true })));
console.log(JSON.stringify(util.inspect(obj, { colors: false })));
`));

test("util.inspect.custom receives the remaining depth and inspect", () =>
    expectOracle(`
import util from 'node:util';
const inner = { [util.inspect.custom](d, o, i) { return String(d) + ' ' + String(o.depth) + ' ' + typeof i; } };
console.log(util.inspect({ a: { b: inner } }, { depth: 5 }));
console.log(util.inspect(inner, { depth: 3 }));
`));
