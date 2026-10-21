import { test } from "node:test";
import assert from "node:assert/strict";
import { expectProgram } from "./helpers/program.js";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";
import { compileToIR } from "../src/compiler.js";
import { collectSourceUsage } from "../src/frontend/lexer.js";

test("String.replaceAll handles string and RegExp searches", () =>
    expectProgram(
        `
  console.log('abab'.replaceAll('a','X'));
  console.log('abab'.replaceAll(/a/g,'X'));
  console.log('aba'.replaceAll('a',(match,index)=>match+index));
  console.log('ab'.replaceAll('','-'));
  console.log('aba'.replaceAll('a','$&$'+String.fromCharCode(96)));
  try{'aba'.replaceAll(/a/,'X')}catch(error){console.log(error.name)}
`,
        "XbXb\nXbXb\na0ba2\n-a-b-\nabaab\nTypeError\n",
    ));

test("RegExp subclass preserves its prototype and replace override", () =>
    expectProgram(
        `
  class CustomRegExp extends RegExp {
    [Symbol.replace](...args){return '!'+super[Symbol.replace](...args)}
  }
  var re=new CustomRegExp('a','g');
  console.log(re instanceof CustomRegExp,Object.getPrototypeOf(re)===CustomRegExp.prototype);
  console.log('aba'.replaceAll(re,'X'));
`,
        "true true\n!XbX\n",
    ));

// A literal replacement of a string search is one native scan and one copy
// into a result of the final length (#387); the other forms keep the prelude
// loop. Both run under GC stress against Node.js.
const literalReplaceAll = String.raw`
  const show = (s) => console.log(JSON.stringify(s));
  // Heap strings, not literals: the collector may move them.
  const big = "line 7 request 8 took 1ms\n".repeat(50000);
  const out = big.replaceAll("request ", "req#");
  console.log(out.length, out.slice(0, 40), out.slice(-30), out.split("req#").length);
  console.log(big.replaceAll("request ", "").length, big.replaceAll("request ", "REQUEST!").length);
  console.log(big.replaceAll("1ms\n", "\u0434\u0432\n").slice(0, 60));
  const base = "a-b".repeat(3) + "--";
  for (const [text, search, replacement] of [
    [base, "-", "+++"], [base, "-", ""], [base, "--", "="], [base, "-", "#"],
    [base, "zz", "?"], ["abc", "abcd", "?"], ["abc", "abc", "X"],
    ["aaaaa", "aa", "b"], ["xaax", "a", "a"], ["ab", "ab", ""],
    ["abcabc", "a", "<a>"], ["abcabc", "c", "<c>"],
    ["\u043f\u0440\u0438\u0432\u0435\u0442 \u043c\u0438\u0440", "\u0438", "\u{1F600}"],
    ["\u{1F600}x\u{1F600}", "\u{1F600}", "y"], ["\ud83dx", "\ud83d", "-"],
    ["a".repeat(37) + "ab" + "a".repeat(20) + "ab", "ab", "!"],
    ["aaaaaaab" + "aaaaaaab", "ab", "_"], ["0123456789abcdef".repeat(3), "789a", "|"],
    ["x".repeat(6) + "needle" + "x".repeat(6) + "needle", "needle", "N"],
    [base, "-", "$&$&"], [base, "-", "$$"], [base, "b", "[$" + "\x60]"],
    [base, "b", "[$']"], [base, "b", "$1$<n>$"], [base, "", "."], ["", "", "."], ["", "a", "."],
  ]) show(text.replaceAll(search, replacement));
  console.log(base.replaceAll("zz", "?") === base);
  show(base.replaceAll("-", (m, i, s) => m + i + s.length));
  show(base.replaceAll(/-+/g, "#"));
  show(base.replaceAll("-", { toString() { return "obj"; } }));
  show("1.5.1".replaceAll(1, 2));
  show(String.prototype.replaceAll.call(12321, "2", "0"));
  show(base.replace(/-/g, "+"));
  show(base.replace(/(-)(b)?/g, "[$1$2]"));
  show(base.replace("-", "+"));
  show(base.split("-").join("+"));
`;

test("replaceAll with a literal replacement matches Node.js under GC stress", () => {
    const run = runOnHost(literalReplaceAll);
    assert.equal(run.stderr, "");
    assert.equal(run.status, 0);
    assert.equal(run.stdout, runOracle(literalReplaceAll).stdout);
});

test("literal replaceAll without the RegExp engine linked", () => {
    const source = String.raw`
  const s = "k=v;".repeat(1000);
  const r = s.replaceAll("=", " => ");
  console.log(r.length, r.slice(0, 16), s.replaceAll("x", "y") === s);
  console.log(typeof globalThis.__nonaReplaceAllInternal);
`;
    // Linked as the program uses it: the replaceAll prelude without the engine.
    const { usage } = collectSourceUsage(() => compileToIR(source));
    assert.equal(usage.regexp, false);
    const run = runOnHost(source, { gcStress: true, link: usage });
    assert.equal(run.stderr, "");
    assert.equal(run.stdout, runOracle(source).stdout);
});
