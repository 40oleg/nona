import test from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// Primitive arguments only: Node formats them like String(), as console.log does here.
// runOracle replaces console.log, so its name and length are not compared.
const source = `
console.error('b'); console.log('after');
console.warn('w', 1, true); console.info('i', null); console.debug('d', undefined);
console.error(); console.warn();
const error = console.error, info = console.info; error('unbound', 2); info('unbound info');
const names = Object.getOwnPropertyNames(console).slice(1, 5);
console.log(names.join(), names.map(name => typeof console[name] + ' ' + console[name].name + ' ' + console[name].length).join());
console.log(Object.keys(console).slice(0, 5).join());
console.error('non-ascii', 'é', '\\u{1F600}');
for (let i = 0; i < 3; i++) { console.warn('w' + i); console.log('o' + i); }
`;
// Initializing process (with the host environment) under GC stress takes long
// enough to time out on CI runners (see process-io.test.ts), so the
// interleaving with process.stderr runs without it.
const rawSource = `
console.error('before raw'); process.stderr.write('raw\\n'); console.error('after raw', 'é', '\\u{1F600}');
console.log('o'); process.stdout.write('raw out\\n'); console.warn('w');
`;

function assertMatchesNode(
    source: string,
    options?: Parameters<typeof runOnHost>[1],
): void {
    const oracle = runOracle(source),
        result = runOnHost(source, options);
    assert.equal(
        result.status,
        0,
        JSON.stringify({
            stdout: result.stdout,
            stderr: result.stderr,
            error: result.error?.message,
        }),
    );
    assert.equal(result.stdout, oracle.stdout);
    assert.equal(result.stderr, oracle.stderr);
}

test("console.error and console.warn write to stderr, info and debug to stdout (#230)", () => {
    assertMatchesNode(source);
});

test("console streams interleave with process.stdout and process.stderr writes (#230)", () => {
    assertMatchesNode(rawSource, { gcStress: false });
});
