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
process.stderr.write('raw\\n'); console.error('after raw', 'é', '\\u{1F600}');
for (let i = 0; i < 3; i++) { console.warn('w' + i); console.log('o' + i); }
`;

test("console.error and console.warn write to stderr, info and debug to stdout (#230)", () => {
    // The test checks stream routing, not GC: under gcStress the program took
    // over the 60 s native timeout on loaded Windows CI runners.
    const oracle = runOracle(source),
        result = runOnHost(source, { gcStress: false });
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
});
