import { test } from "node:test";
import assert from "node:assert/strict";
import { runModulesOnHost } from "./helpers/host.js";

function expectOracle(source: string, modes = [false, true]): void {
    for (const gcStress of modes) {
        const run = runModulesOnHost({ "main.mjs": source }, "main.mjs", {
            gcStress,
        });
        assert.equal(run.native.error, undefined);
        assert.equal(run.native.status, 0, run.native.stderr);
        assert.equal(run.oracleStatus, 0);
        assert.equal(run.native.stdout, run.oracle);
    }
}

test("util.inspect truncates strings longer than the default maxStringLength", () =>
    expectOracle(`import util from 'node:util';
const s = util.inspect('x'.repeat(20000));
console.log(s.length, s.slice(-30));
console.log(util.inspect('x'.repeat(10000)).length);
console.log(util.inspect.defaultOptions.maxStringLength);
`));

test("util.inspect honors an explicit maxStringLength", () =>
    expectOracle(`import util from 'node:util';
console.log(util.inspect('abcdef', { maxStringLength: 2 }));
console.log(util.inspect('abcdef', { maxStringLength: 5 }));
console.log(util.inspect('abcdef', { maxStringLength: 6 }));
console.log(util.inspect('', { maxStringLength: 0 }));
console.log(util.inspect('abc', { maxStringLength: 0 }));
console.log(util.inspect('abc', { maxStringLength: -3 }));
console.log(util.inspect(new String('abcdef'), { maxStringLength: 3 }));
`));

test("util.inspect truncates nested strings but not keys", () =>
    expectOracle(`import util from 'node:util';
const o = { longkey: 'abcdef', list: ['abcdef', 1], m: new Map([['abcdef', 'uvwxyz']]), s: new Set(['abcdef']) };
console.log(util.inspect(o, { maxStringLength: 3 }));
console.log(util.inspect({ abcdefghij: 1 }, { maxStringLength: 3 }));
console.log(util.inspect(['abcdef'], { maxStringLength: 1 }));
console.log(util.format('%O|%s', { a: 'abcdef' }, 'abcdef'));
`));

test("util.inspect disables truncation for null and Infinity", () =>
    expectOracle(
        `import util from 'node:util';
const long = 'x'.repeat(20000);
console.log(util.inspect(long, { maxStringLength: null }).length);
console.log(util.inspect(long, { maxStringLength: Infinity }).length);
console.log(util.inspect([long], { maxStringLength: null }).length);
`,
        [false],
    ));
