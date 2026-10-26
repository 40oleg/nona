import { test } from "node:test";
import assert from "node:assert/strict";
import { runModulesOnHost } from "./helpers/host.js";

function expectOracle(source: string): void {
    for (const gcStress of [false, true]) {
        // Under GC stress the configuration cases take about 180 s on the
        // emulated win32-arm64 runner, the default allowance (#582).
        const run = runModulesOnHost({ "main.mjs": source }, "main.mjs", {
            gcStress,
            ...(gcStress ? { timeoutMs: 600_000 } : {}),
        });
        assert.equal(run.native.error, undefined);
        assert.equal(run.native.status, 0, run.native.stderr);
        assert.equal(run.oracleStatus, 0);
        assert.equal(run.native.stdout, run.oracle);
    }
}

const prelude = `
import { parseArgs } from 'node:util';
function t(name, config) {
    try { console.log(name, JSON.stringify(parseArgs(config))); }
    catch (e) { console.log(name, e.name, e.code, e.message); }
}
`;

test("util.parseArgs parses long, short and grouped options", () =>
    expectOracle(`${prelude}
const options = { foo: { type: 'boolean', short: 'f' }, bar: { type: 'string', short: 'b' }, baz: { type: 'boolean', short: 'z' } };
t('repro', { args: ['-f', '--bar', 'b', 'pos'], options: { foo: { type: 'boolean', short: 'f' }, bar: { type: 'string' } }, allowPositionals: true });
t('group', { args: ['-fz'], options });
t('group string', { args: ['-fzbvalue'], options });
t('short value', { args: ['-bvalue'], options });
t('short eq', { args: ['-b=value'], options });
t('short next', { args: ['-b', 'value'], options });
t('long eq', { args: ['--bar=a=b', '--foo'], options });
t('empty value', { args: ['--bar='], options });
t('terminator', { args: ['--foo', '--', '--bar', 'x'], options, allowPositionals: true });
t('positionals', { args: ['a', '-f', 'b'], options, allowPositionals: true });
t('last wins', { args: ['--bar', 'a', '--bar', 'b'], options });
t('none', { args: [], options });
t('no options', { args: [] });
`));

test("util.parseArgs supports multiple, default and allowNegative", () =>
    expectOracle(`${prelude}
const options = { v: { type: 'boolean', short: 'v', multiple: true }, f: { type: 'string', multiple: true, short: 'f' }, d: { type: 'string', default: 'dd' }, e: { type: 'boolean', default: true }, m: { type: 'string', multiple: true, default: ['x', 'y'] } };
t('multiple', { args: ['-vvv', '-f', 'a', '--f=b'], options });
t('default used', { args: [], options });
t('default overridden', { args: ['--d', 'z', '--no-e'], options, allowNegative: true });
t('negative', { args: ['--no-e'], options: { e: { type: 'boolean' } }, allowNegative: true });
t('negative then positive', { args: ['--no-e', '--e'], options: { e: { type: 'boolean' } }, allowNegative: true });
t('negative multiple', { args: ['--no-e'], options: { e: { type: 'boolean', multiple: true } }, allowNegative: true });
t('negative not allowed', { args: ['--no-e'], options: { e: { type: 'boolean' } } });
t('negative string', { args: ['--no-e'], options: { e: { type: 'string' } }, allowNegative: true });
t('negative value', { args: ['--no-e=1'], options: { e: { type: 'boolean' } }, allowNegative: true });
t('negative lenient', { args: ['--no-e'], options: {}, allowNegative: true, strict: false });
`));

test("util.parseArgs returns tokens", () =>
    expectOracle(`${prelude}
const options = { foo: { type: 'boolean', short: 'f' }, bar: { type: 'string', short: 'b' } };
t('tokens', { args: ['-fb', 'x', '--foo', '--bar=y', 'pos', '--', '-z'], options, allowPositionals: true, tokens: true });
t('tokens group', { args: ['-ffbv'], options, tokens: true });
t('tokens negative', { args: ['--no-foo'], options, allowNegative: true, tokens: true });
t('tokens lenient', { args: ['--unknown', 'v', '-x'], options, strict: false, tokens: true });
`));

test("util.parseArgs in non-strict mode accepts unknown options", () =>
    expectOracle(`${prelude}
t('unknown', { args: ['--zzz', '-q', '--yyy=1', 'pos'], strict: false });
t('string next', { args: ['--bar', '--foo'], options: { bar: { type: 'string' } }, strict: false });
t('string missing', { args: ['--bar'], options: { bar: { type: 'string' } }, strict: false });
t('boolean with value', { args: ['--foo=1'], options: { foo: { type: 'boolean' } }, strict: false });
t('no positionals', { args: ['a'], strict: false, allowPositionals: false });
`));

test("util.parseArgs reports usage errors with Node.js codes", () =>
    expectOracle(`${prelude}
const options = { foo: { type: 'boolean', short: 'f' }, bar: { type: 'string', short: 'b' } };
t('unknown long', { args: ['--zzz'], options });
t('unknown short', { args: ['-z'], options });
t('unknown positionals allowed', { args: ['--zzz'], options, allowPositionals: true });
t('unexpected positional', { args: ['pos'], options });
t('boolean with value', { args: ['--foo=1'], options });
t('string without value', { args: ['--bar'], options });
t('short string without value', { args: ['-b'], options });
t('ambiguous long', { args: ['--bar', '--foo'], options });
t('ambiguous short', { args: ['-b', '-f'], options });
t('dash value inline', { args: ['--bar=--foo'], options });
`));

test("util.parseArgs validates its configuration", () =>
    expectOracle(`${prelude}
t('args', { args: 'x' });
t('args object', { args: {} });
t('strict', { strict: 1 });
t('allowPositionals', { args: [], allowPositionals: 'y' });
t('tokens', { args: [], tokens: 1 });
t('allowNegative', { args: [], allowNegative: 1 });
t('options', { args: [], options: 5 });
t('option null', { args: [], options: { a: null } });
t('type missing', { args: [], options: { a: {} } });
t('type bad', { args: [], options: { a: { type: 'x' } } });
t('short type', { args: [], options: { a: { type: 'string', short: 1 } } });
t('short length', { args: [], options: { a: { type: 'string', short: 'ab' } } });
t('multiple', { args: [], options: { a: { type: 'string', multiple: 1 } } });
t('default type', { args: [], options: { a: { type: 'string', default: 1 } } });
t('default array', { args: [], options: { a: { type: 'string', default: [1] } } });
t('default multiple', { args: [], options: { a: { type: 'string', multiple: true, default: 'x' } } });
t('boolean default', { args: [], options: { a: { type: 'boolean', default: 'x' } } });
`));

test("util.parseArgs defaults args to the process arguments", () =>
    expectOracle(`${prelude}
const { values } = parseArgs({ options: {}, strict: false, allowPositionals: true });
console.log(typeof values, Object.getPrototypeOf(values));
`));
