import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// rt.formatNumber's integer fast path (|x| < 2^53, #427) and the boundaries
// where it hands over to the decimal and general paths.
function expectOracle(source: string, gcStress = true) {
    const run = runOnHost(source, { gcStress });
    assert.equal(run.stderr, "");
    assert.equal(run.status, 0);
    assert.equal(run.stdout, runOracle(source).stdout);
}

test("String(number) of zeros through every conversion", () => {
    expectOracle(`
        const z = -0, p = 0;
        console.log(String(z), z.toString(), \`\${z}\`, '' + z, z + '', String(p), p.toString(10));
        console.log(Object.keys({ [-0]: 1, [0.0]: 2 }).join(","), [z, p].join(","));
        const o = {}; o[z] = 1; console.log(Object.keys(o)[0], (-0).toFixed(0), (-0).toPrecision(1));
    `);
});

test("String(number) at integer digit-count and sign boundaries", () => {
    expectOracle(`
        const values = [1, 9, 10, 99, 100, 101, 999, 1000, 12345, 65535, 65536];
        for (let p = 1, i = 0; i <= 16; i++, p *= 10) values.push(p, p - 1, p + 1);
        values.push(2147483647, 2147483648, 4294967295, 4294967296, 4294967297);
        values.push(9007199254740991, 9007199254740992, 9007199254740994, 18014398509481984);
        values.push(1e21 - 65536, 999999999999999900000, 1e21, 1e21 + 131072, 1.7976931348623157e308);
        const out = [];
        for (const v of values) out.push(String(v), String(-v), \`\${-v}\`, '' + v);
        out.push(String(-2147483648), (-2147483648).toString(), String(-9007199254740991));
        console.log(out.join(" "));
    `);
});

test("String(number) of non-integers and specials is unchanged", () => {
    expectOracle(`
        const values = [NaN, Infinity, -Infinity, 0.5, -1.25, 123.456, 1e-7, 5e-324,
            -5e-324, 0.1, 1.5, 2 ** 52 + 0.5, 4503599627370495.5, -4503599627370495.5,
            1e-6, 123456789.125, 9007199254740991.5];
        console.log(values.map((v) => [String(v), v.toString(), '' + v].join(",")).join(" "));
    `);
});

// Collecting on every allocation makes thousands of conversions slow; the
// loop runs once under gcStress with a few hundred values and once without.
for (const [count, gcStress] of [
    [300, true],
    [3000, false],
] as const)
    test(`String(number) of ${count} pseudo-random integers below 2^53${gcStress ? " (gcStress)" : ""}`, () => {
        expectOracle(
            `
        let seed = 12345, out = [];
        const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
        for (let i = 0; i < ${count}; i++) {
            const bits = next() % 54;
            let v = Math.floor((next() / 2147483648 + next() / 4611686018427387904) * 2 ** bits);
            if (v > 9007199254740991) v = 9007199254740991;
            if (i & 1) v = -v;
            out.push(String(v));
            if (out.length === 500) { console.log(out.join(" ")); out = []; }
        }
        console.log(out.join(" "));
    `,
            gcStress,
        );
    });

test("Number.prototype.toString radices and toFixed/toPrecision around integers", () => {
    expectOracle(`
        const values = [0, -0, 1, -1, 7, 100, -12345, 2147483647, 4294967296, 9007199254740991, 1e21, 255.5];
        const out = [];
        for (const v of values)
            out.push(v.toString(), v.toString(10), v.toString(2), v.toString(16), v.toString(36),
                v.toFixed(0), v.toFixed(2), v.toPrecision(1), v.toPrecision(21), v.toExponential());
        console.log(out.join(" "));
    `);
});
