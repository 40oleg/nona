import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost} from './helpers/host.js';

// Annex B.1.3 and B.2.1-B.2.4 (src/runtime/annexb-builtins-source.ts, lexer).
test('Annex B escape/unescape, substr, HTML methods, setYear, toGMTString', () => {
 const run = runOnHost(`console.log(escape("a b\\u0100\\u00e9@*"), unescape("%41%u0042%zz%u12"), "abcdef".substr(-3, 2), "abc".substr(1), "x".anchor('a"b'), "x".big(), "x".link("u"));
var d = new Date(2000, 5, 15); d.setYear(99); console.log(d.getFullYear(), d.getMonth(), d.getDate(), new Date(NaN).setYear(2001) === new Date(2001, 0, 1).getTime());
console.log(Date.prototype.toGMTString === Date.prototype.toUTCString, String.prototype.substr.length, escape.name, Object.keys(globalThis).indexOf('escape'));
var log = ''; escape({toString() { log += 'toString'; return {}; }, valueOf() { log += 'valueOf'; return 'v'; }}); console.log(log);
`);
 assert.equal(run.status, 0, run.stderr);
 assert.equal(run.stdout, 'a%20b%u0100%E9@* AB%zz%u12 de bc <a name="a&quot;b">x</a> <big>x</big> <a href="u">x</a>\n1999 5 15 true\ntrue 2 escape -1\ntoStringvalueOf\n');
});

test('Annex B HTML-like comments in scripts', () => {
 const run = runOnHost('var x = 1; <!-- ignored\nx = 2;\n--> also ignored\nconsole.log(x);');
 assert.equal(run.status, 0, run.stderr);
 assert.equal(run.stdout, '2\n');
});
