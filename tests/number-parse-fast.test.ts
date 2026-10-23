import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// String-to-number conversion of decimals with up to 19 significant digits
// takes the Clinger or Eisel-Lemire fast path of rt.parseNumber (#466) and
// falls back to the exact path for ties, subnormals and overflow. Every
// conversion (Number, parseFloat, JSON.parse, unary +) must give the same
// bits as Node.js; the results are printed as hex so -0 and NaN are exact.
const prelude = `
const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
const hex = (x) => { f64[0] = x; return u32[1].toString(16) + ":" + u32[0].toString(16); };
const json = (s) => { try { return hex(JSON.parse(s)); } catch (e) { return "-"; } };
const show = (s) => console.log(JSON.stringify(s), hex(Number(s)), hex(parseFloat(s)), json(s), hex(+s));
`;

test("boundary decimal strings convert like Node.js", () => {
    const source = `${prelude}
const cases = [
    "1.7976931348623157e308", "1.7976931348623158e308", "1.7976931348623159e308",
    "2.4703282292062328e-324", "2.4703282292062327e-324", "4.9e-324", "5e-324",
    "2.2250738585072011e-308", "2.2250738585072014e-308", "2.225073858507201e-308",
    "9007199254740993", "9007199254740992.5e0", "9007199254740993e0", "9007199254740995",
    "18014398509481985", "9223372036854775807", "9999999999999999999", "18446744073709551615",
    "1.00000000000000011102230246251565404236316680908203125",
    "1.0000000000000001110223024625156540423631668090820312",
    "1e23", "8.98846567431158e307", "1e-400", "1e400", "-1e-400", "-1e400", "-0e5", "0e-500",
    "1.2345e5", "1.2345e100", "1.2345e300", "1.2345e-300", "6.02e-23", "-6.02e-23", "6.022140857e23",
    "1e-307", "1e-308", "1e-342", "1e-343", "1e308", "1e309", "1e-22", "1e22", "1e-23", "123e-22",
    "0.000123e-5", "123.456e+300", "  -4.5e-100  ", "1234567890123456789e-310", "1234567890.123456789e290",
    "0.00000000000000000000000000000000001", "1e100000", "1e-100000", "1e1000000", "1e+0000000000000000000000001",
    "0.1", "0.2", "0.3", "3.14159265358979323", "2.718281828459045e-5", "1e", "1e+", "e5", ".5e1", "5.e-1",
];
for (const s of cases) show(s);
for (let k = -330; k <= 310; k += 7) { show("1e" + k); show("-9.87654321e" + k); show("5e" + k); }
`;
    const expected = runOracle(source).stdout;
    const run = runOnHost(source, { gcStress: true });
    assert.equal(run.error, undefined);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, expected);
});

test("random decimal strings convert like Node.js", () => {
    const source = `${prelude}
let seed = 466;
const next = (n) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
for (let i = 0; i < 4000; i++) {
    const digits = 1 + next(19);
    let m = String(1 + next(9));
    for (let k = 1; k < digits; k++) m += next(10);
    const dot = next(3) === 0 ? next(digits + 1) : -1;
    if (dot >= 0) m = m.slice(0, dot) + "." + m.slice(dot);
    if (m[0] === ".") m = "0" + m;
    const e = next(681) - 350;
    show((next(4) === 0 ? "-" : "") + m + "e" + e);
}
`;
    const expected = runOracle(source).stdout;
    // The conversions do not allocate; GC stress would only slow the string building.
    const run = runOnHost(source, { gcStress: false });
    assert.equal(run.error, undefined);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, expected);
});
