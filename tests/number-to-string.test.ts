import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// rt.formatNumber's integer fast path (|x| < 2^53, #427) and the boundaries
// where it hands over to Schubfach (#467).
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

// Schubfach (#467): shortest round-trip digits for every finite double. The
// generator is a seeded xorshift32 pair filling the two halves of a double's
// bit pattern; the output of each block of 1000 values is hashed, so a
// mismatch names the block without printing megabytes.
const RANDOM_DOUBLES = `
    const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
    let s0 = SEED, s1 = SEED ^ 0x9e3779b9;
    const x32 = (s) => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return s >>> 0; };
    function next() { s0 = x32(s0); s1 = x32(s1); u32[0] = s0; u32[1] = s1; return f64[0]; }
    function unit() { s0 = x32(s0); s1 = x32(s1); return (s1 * 2097152 + (s0 >>> 11)) / 9007199254740992; }
    function hash(h, t) { for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return h >>> 0; }
`;

for (const [seed, count, gcStress] of [
    [1, 300, true],
    [2, 100000, false],
    [3, 100000, false],
    [4, 100000, false],
] as const)
    test(`String(number) of ${count} random double bit patterns (seed ${seed})${gcStress ? " (gcStress)" : ""}`, () => {
        expectOracle(
            RANDOM_DOUBLES.replaceAll("SEED", String(seed)) +
                `
        const out = [];
        let h = 2166136261, n = 0, sample = "";
        while (n < ${count}) {
            const v = next();
            if (!Number.isFinite(v)) continue;
            const t = String(v);
            h = hash(h, t + ",");
            if (n % 997 === 0) sample += " " + t;
            if (++n % 1000 === 0) { out.push(h); h = 2166136261; }
        }
        out.push(h);
        console.log(out.join(" "));
        console.log(sample);
    `,
            gcStress,
        );
    });

test("String(number) of 50000 random fractions and products", () => {
    expectOracle(
        RANDOM_DOUBLES.replaceAll("SEED", "5") +
            `
        const out = [];
        let h = 2166136261;
        for (let i = 0; i < 50000; i++) {
            const r = unit();
            h = hash(h, String(r) + String(-r) + String(i * 1.1) + String(i * 0.1) + String(r * 1e-300) + String(r * 1e300));
            if (i % 500 === 499) { out.push(h); h = 2166136261; }
        }
        console.log(out.join(" "));
        console.log([1, 2, 3, 4].map(() => String(unit())).join(" "), 3 * 1.1, 0.1 + 0.2);
    `,
        false,
    );
});

test("String(number) at binary and decimal boundaries", () => {
    expectOracle(
        `
        const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
        function step(v, d) {
            f64[0] = v;
            let lo = u32[0] + d, hi = u32[1];
            if (lo > 0xffffffff) { lo = 0; hi++; } else if (lo < 0) { lo = 0xffffffff; hi--; }
            u32[0] = lo; u32[1] = hi;
            return f64[0];
        }
        const values = [5e-324, 1e-323, 2.2250738585072014e-308, 2.225073858507201e-308,
            Number.MAX_VALUE, Number.MIN_VALUE, Number.EPSILON, 1e21, 1e-7, 1e-6, 1e23, 9007199254740993, 2 ** 53 + 2];
        for (const v of [2.2250738585072014e-308, Number.MAX_VALUE, 1e21, 1e-7, 1e-6, 2 ** 53])
            values.push(step(v, -1), step(v, 1), step(v, 2));
        for (let e = -1074; e <= 1023; e++) {
            const v = 2 ** e;
            values.push(v, step(v, -1), step(v, 1));
        }
        for (let e = -323; e <= 308; e++) {
            const v = Number("1e" + e);
            values.push(v, step(v, -1), step(v, 1));
        }
        const out = [];
        for (const v of values) out.push(String(v), String(-v));
        for (let i = 0; i < out.length; i += 400) console.log(out.slice(i, i + 400).join(" "));
    `,
        false,
    );
});

test("JSON.stringify and template literals of doubles", () => {
    expectOracle(`
        const a = [];
        for (let i = 0; i < 200; i++) a.push(i * 1.1, -i / 7, 2 ** -i * 3, 1e300 / (i + 1), 5e-324 * i);
        console.log(JSON.stringify(a));
        console.log(JSON.stringify({ x: 0.1, y: -1.5e-9, z: [1e21, 123456789.123] }));
        console.log(a.slice(0, 50).map((v) => \`<\${v}>\`).join(""), \`\${0.1 + 0.2} \${-1 / 3} \${2 ** 70}\`);
    `);
});
