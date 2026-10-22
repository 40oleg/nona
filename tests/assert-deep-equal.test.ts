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

const prelude = `
import assert from 'node:assert';
function check(name, fn) {
    try { fn(); console.log(name, 'ok'); }
    catch (e) { console.log(name, e.name); }
}
function eq(name, a, b) { check(name + ' deepEqual', () => assert.deepEqual(a, b)); check(name + ' notDeepEqual', () => assert.notDeepEqual(a, b)); }
`;

test("assert.deepEqual rejects different Maps, Sets, Dates and RegExps", () =>
    expectOracle(`${prelude}
eq('map', new Map([[1, 2]]), new Map([[3, 4]]));
eq('set', new Set([1]), new Set([2]));
eq('date', new Date(0), new Date(1000));
eq('regexp', /a/, /b/);
eq('regexp flags', /a/g, /a/i);
eq('map size', new Map([[1, 2]]), new Map());
eq('map vs set', new Map(), new Set());
eq('date vs object', new Date(0), {});
`));

test("assert.deepEqual accepts loosely equal collections, Dates and RegExps", () =>
    expectOracle(`${prelude}
eq('map loose value', new Map([[1, '1']]), new Map([[1, 1]]));
eq('set loose', new Set([1]), new Set(['1']));
eq('date', new Date(5), new Date(5));
eq('invalid date', new Date(NaN), new Date(NaN));
eq('regexp', /a+/gi, /a+/gi);
eq('set objects', new Set([{ a: 1 }, { b: 2 }]), new Set([{ b: 2 }, { a: '1' }]));
eq('set objects differ', new Set([{ a: 1 }]), new Set([{ a: 2 }]));
eq('map object keys', new Map([[{ k: 1 }, [1, 2]]]), new Map([[{ k: '1' }, [1, '2']]]));
eq('map object keys differ', new Map([[{ k: 1 }, 1]]), new Map([[{ k: 2 }, 1]]));
eq('map nested', { m: new Map([['x', new Set([1])]]) }, { m: new Map([['x', new Set([1])]]) });
eq('set duplicates', new Set([1, '2']), new Set(['1', 2]));
eq('set object unused', new Set([{ a: 1 }, { a: 1 }]), new Set([{ a: 1 }, { a: 2 }]));
`));

test("assert.deepEqual compares boxed primitives, typed arrays, buffers and errors", () =>
    expectOracle(`${prelude}
eq('number', new Number(1), new Number(2));
eq('number same', new Number(1), new Number(1));
eq('string', new String('a'), new String('b'));
eq('boxed kind', new Number(1), new String('1'));
eq('boxed vs primitive', new Number(1), 1);
eq('u8', new Uint8Array([1, 2]), new Uint8Array([1, 2]));
eq('u8 differ', new Uint8Array([1, 2]), new Uint8Array([1, 3]));
eq('u8 length', new Uint8Array([1, 2]), new Uint8Array([1]));
eq('u8 vs i8', new Uint8Array([1]), new Int8Array([1]));
eq('f64', new Float64Array([1, 2]), new Float64Array([1, 2]));
eq('f64 differ', new Float64Array([1, 2]), new Float64Array([1, 2.5]));
eq('f64 nan', new Float64Array([NaN]), new Float64Array([NaN]));
eq('f64 zero', new Float64Array([0]), new Float64Array([-0]));
eq('arraybuffer', new Uint8Array([1, 2]).buffer, new Uint8Array([1, 2]).buffer);
eq('arraybuffer differ', new Uint8Array([1, 2]).buffer, new Uint8Array([1, 3]).buffer);
eq('arraybuffer length', new ArrayBuffer(2), new ArrayBuffer(3));
eq('error message', new Error('a'), new Error('b'));
eq('error same', new Error('a'), new Error('a'));
eq('error name', new Error('a'), new TypeError('a'));
eq('error vs object', new Error('a'), { message: 'a', name: 'Error' });
`));

test("deepStrictEqual and isDeepStrictEqual compare ArrayBuffer contents", () =>
    expectOracle(`${prelude}
import util from 'node:util';
function buf(C, bytes) { const b = new C(bytes.length); new Uint8Array(b).set(bytes); return b; }
function strict(name, a, b) {
    check(name + ' deepStrictEqual', () => assert.deepStrictEqual(a, b));
    console.log(name, util.isDeepStrictEqual(a, b));
}
strict('equal', buf(ArrayBuffer, [1, 2]), buf(ArrayBuffer, [1, 2]));
strict('length', new ArrayBuffer(2), new ArrayBuffer(3));
strict('bytes', buf(ArrayBuffer, [1, 2]), buf(ArrayBuffer, [1, 3]));
strict('shared equal', buf(SharedArrayBuffer, [1, 2]), buf(SharedArrayBuffer, [1, 2]));
strict('shared bytes', buf(SharedArrayBuffer, [1, 2]), buf(SharedArrayBuffer, [1, 3]));
strict('shared length', new SharedArrayBuffer(1), new SharedArrayBuffer(4));
strict('shared vs plain', buf(ArrayBuffer, [1, 2]), buf(SharedArrayBuffer, [1, 2]));
`));

test("assert.deepEqual keeps ordinary object semantics and handles cycles", () =>
    expectOracle(`${prelude}
eq('primitives', 1, '1');
eq('nan', NaN, NaN);
eq('null', null, undefined);
eq('array vs object', [1], { 0: 1, length: 1 });
eq('arrays', [1, [2, '3']], [1, [2, 3]]);
eq('array length', [1], [1, 2]);
eq('objects', { a: 1, b: { c: '2' } }, { a: '1', b: { c: 2 } });
eq('keys', { a: 1 }, { b: 1 });
eq('prototype ignored', Object.create({ x: 1 }), {});
const s = Symbol('s');
eq('symbol keys', { [s]: 1 }, { [s]: '1' });
eq('symbol keys differ', { [s]: 1 }, { [s]: 2 });
const a = { n: 1 }; a.self = a;
const b = { n: 1 }; b.self = b;
eq('cycle', a, b);
const c = { n: 2 }; c.self = c;
eq('cycle differ', a, c);
const m1 = new Map(); m1.set('m', m1);
const m2 = new Map(); m2.set('m', m2);
eq('map cycle', m1, m2);
`));
