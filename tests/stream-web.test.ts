import { test } from "node:test";
import assert from "node:assert/strict";
import { runModulesOnHost } from "./helpers/host.js";

const names = [
    "ReadableStream",
    "ReadableStreamDefaultReader",
    "ReadableStreamBYOBReader",
    "WritableStream",
    "WritableStreamDefaultWriter",
];

// Node.js also exports TransformStream and more; only the identity with the
// globals is compared with the oracle.
const common = `const names=${JSON.stringify(names)};
for(const name of names)console.log(name,m[name]===globalThis[name]);`;

test("node:stream/web and stream/web export the Web stream globals (CommonJS)", () => {
    const source = `for(const m of [require('node:stream/web'),require('stream/web')]){${common}}`;
    const run = runModulesOnHost(
        { "main.mjs": "import './c.cjs';", "c.cjs": source },
        "main.mjs",
        { gcStress: true },
    );
    assert.equal(run.native.status, 0, run.native.stderr);
    assert.equal(run.native.stdout, run.oracle);
    assert.equal(run.native.stdout.includes("false"), false);
});

test("node:stream/web exports the Web stream globals (ESM)", () => {
    const source = `import * as m from 'node:stream/web';import d from 'node:stream/web';m.default;\nconst names=${JSON.stringify(names)};for(const name of names)console.log(name,m[name]===globalThis[name],d[name]===globalThis[name]);`;
    const run = runModulesOnHost({ "main.mjs": source }, "main.mjs", {
        gcStress: true,
    });
    assert.equal(run.native.status, 0, run.native.stderr);
    assert.equal(run.native.stdout, run.oracle);
    assert.equal(run.native.stdout.includes("false"), false);
});

test("nona:stream/web matches the globals and does not stub missing classes", () => {
    const source = `const m=require('nona:stream/web');
for(const name of ${JSON.stringify(names)})console.log(name,m[name]===globalThis[name]);
console.log(Object.keys(m).length,require('module').builtinModules.includes('stream/web'));`;
    const run = runModulesOnHost(
        { "main.mjs": "import './c.cjs';", "c.cjs": source },
        "main.mjs",
        { gcStress: true, oracleSource: "console.log('skip')" },
    );
    assert.equal(run.native.status, 0, run.native.stderr);
    assert.equal(
        run.native.stdout,
        names.map((name) => `${name} true\n`).join("") + "5 true\n",
    );
});
