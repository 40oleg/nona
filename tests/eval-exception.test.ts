import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// The documented eval exception (docs/es2020-contract.md, roadmap 0.19).
test("eval: reflection, non-string arguments and empty sources", () => {
    const run =
        runOnHost(`const d = Object.getOwnPropertyDescriptor(globalThis, 'eval');
console.log(typeof eval, eval.name, eval.length, d.writable, d.enumerable, d.configurable, Object.getPrototypeOf(eval) === Function.prototype);
const o = {}; console.log(eval(o) === o, eval(42), eval(), eval(' \\n\\t'), (0, eval)(''));
try { new eval('1'); } catch (e) { console.log(e.name); }`);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(
        run.stdout,
        "function eval 1 true false true true\ntrue 42 undefined undefined undefined\nTypeError\n",
    );
});

test("eval and Function with run-time sources throw EvalError", () => {
    const run =
        runOnHost(`for (const f of [() => eval(String(1) + ' + 1'), () => (0, eval)(['var x'][0]), () => Function('a', 'return' + ' a'), () => new Function(String(1))]) {
 try { f(); console.log('no error'); } catch (e) { console.log(e.name, e.message.startsWith('Nona compiles ahead of time')); } }`);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(
        run.stdout,
        "EvalError true\nEvalError true\nEvalError true\nEvalError true\n",
    );
});

test("eval: Function.prototype.toString is native code", () => {
    const source = `console.log(String(eval));
console.log(Function.prototype.toString.call(eval) === String(eval));`;
    const run = runOnHost(source);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
});

test("eval: compile-time forms run, invalid literal source is a SyntaxError at the call", () => {
    const run =
        runOnHost(`console.log(eval('1 + 2'), eval(\`3 + 4\`), eval('"a" + "b"'));
console.log(typeof eval('(function () {})'));
let reached = false;
try { reached = true; eval('var 1x'); console.log('no error'); } catch (e) { console.log(reached, e.name); }
try { (0, eval)('let let'); } catch (e) { console.log(e.name); }`);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(
        run.stdout,
        "3 7 ab\nfunction\ntrue SyntaxError\nSyntaxError\n",
    );
});

test("eval and $262.evalScript: spread and substituted templates are run-time sources", () => {
    const run = runOnHost(`const args = ['1'];
let name = 'x'; name += 'y';
for (const f of [() => eval(...args), () => eval(\`\${name} + 1\`), () => eval(name)]) {
 try { f(); console.log('no error'); } catch (e) { console.log(e.name, e.message); }
}`);
    assert.equal(run.status, 0, run.stderr);
    const message =
        "Nona compiles ahead of time: eval and Function need source text known at compile time";
    assert.equal(
        run.stdout,
        `EvalError ${message}\nEvalError ${message}\nEvalError ${message}\n`,
    );
});

test("dynamic constructors: spread arguments and run-time sources throw EvalError with their messages", () => {
    const run = runOnHost(`const args = ['a', 'return a'];
const GF = Object.getPrototypeOf(function* () {}).constructor;
const AF = Object.getPrototypeOf(async function () {}).constructor;
for (const f of [() => Function(...args), () => new Function(...args), () => GF(String('yield 1')), () => AF('a', String('return a'))]) {
 try { f(); console.log('no error'); } catch (e) { console.log(e.name, e.message); }
}`);
    assert.equal(run.status, 0, run.stderr);
    const message =
        "Nona compiles ahead of time: eval and Function need source text known at compile time";
    assert.equal(
        run.stdout,
        `EvalError ${message}\n`.repeat(2) +
            "EvalError Nona compiles ahead of time: GeneratorFunction needs source text known at compile time\n" +
            "EvalError Nona compiles ahead of time: AsyncFunction needs source text known at compile time\n",
    );
});
