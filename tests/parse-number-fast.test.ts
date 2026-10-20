import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// rt.parseNumber converts short decimal literals (at most 19 significant
// digits, m <= 2^53, decimal exponent in [-22, 22]) with one exact multiply or
// divide (#402); everything else keeps the exact big-integer path.
test("Number(string) fast and exact paths match Node.js", () => {
    const source = `const show = (x) => Object.is(x, -0) ? "-0" : String(x);
const inputs = ["0", "-0", "+0", "-0.0", "0.0", "-0e5", "00012", "123", " 42 ", "\\u00a042\\ufeff", "\\n\\r\\u2028 7 \\u2029\\t", "\\u3000-3.5\\u3000",
  "1e22", "1e23", "-1e22", "1.5e-22", "1e-22", "1e-23", "9007199254740992", "9007199254740993", "-9007199254740993", "9007199254740991.5",
  "18446744073709551615", "12345678901234567890", "1234567890123456789", "9999999999999999999", "0.1", "0.3", "-0.3", "123.456e2",
  "123.456e-5", "1e308", "1e309", "4.9e-324", "1.", "5.", ".5", "-.5", ".", "1e", "1e+", "1e-", "+", "-", "", "   ", "12a", "1_0", "1..2",
  "1e2.5", "e5", ".e1", "0x1F", "0X1f", "0b101", "0o17", "-0x1", "+0x1", "0x", "0b2", "Infinity", "-Infinity", "+Infinity", "infinity",
  "1e400", "1e-400", "0.000000000000000000000000001", "100000000000000000000000", "1E5", "2e+3", "7e-0", "3e00000000000000000000001",
  "1e99999999999999999999", "0e99999999999999999999", "0.0000000000000000000001234", "123456789012345678e-20", "4503599627370497.5",
  "1.7976931348623157e308", "2.2250738585072014e-308", "0.1e1", "00000000000000000000000000001", "1.00000000000000000000"];
const out = [];
inputs.forEach((s, i) => out.push(i + " " + show(Number(s)) + " " + show(+s)));
console.log(out.join("\\n"));
console.log("5" * 2, "3" - 1, "0.5" / "0.25", -"7", "1e3" % 7, " 12 " * 1);`;
    const run = runOnHost(source);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
});

// rt.parseNumber neither allocates nor holds Values, so the seeded sweep runs
// without GC stress: under it, building thousands of strings takes minutes.
test("Number(string) matches Node.js on a seeded random decimal sweep", () => {
    const source = `const show = (x) => Object.is(x, -0) ? "-0" : String(x);
let seed = 12345;
const next = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0);
const digits = (n) => { let s = ""; for (let i = 0; i < n; i++) s += next() % 10; return s; };
const lines = [];
for (let i = 0; i < 3000; i++) {
  const r = next();
  let s = (r & 1) ? "-" : (r & 2) ? "+" : "";
  s += digits(1 + next() % (i % 3 === 0 ? 25 : 17));
  if (next() % 2) s += "." + digits(next() % 12);
  if (next() % 3 === 0) {
    const e = next() % 4;
    s += (next() % 2 ? "e" : "E") + (e === 0 ? "-" : e === 1 ? "+" : "");
    s += String(next() % (next() % 2 ? 30 : 400));
  }
  lines.push(s + " " + show(Number(s)));
}
console.log(lines.join("\\n"));`;
    const run = runOnHost(source, { gcStress: false });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
});
