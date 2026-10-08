import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost} from './helpers/host.js';

// Function() with string-literal arguments is compiled ahead of time; see src/frontend/dynamic-functions.ts.
test('Function with literal source creates global-scope sloppy functions', () => {
 const run = runOnHost(`"use strict";
var g = Function("return this;")();
console.log(g === globalThis);
var add = new Function("a", "b", "return a + b;");
console.log(add(2, 3), add.name, add.length, String(add) === "function anonymous(a,b\\n) {\\nreturn a + b;\\n}");
console.log(add !== new Function("a", "b", "return a + b;"), Object.getPrototypeOf(add) === Function.prototype);
let top = 7;
function f() { var top = 1; return Function("return top")(); }
console.log(f(), Function("'use strict'; return this")(), Function()());
try { Function("a,a", "'use strict';"); console.log('no error'); } catch (e) { console.log(e instanceof SyntaxError); }
try { Function("a){", "}"); console.log('no error'); } catch (e) { console.log(e instanceof SyntaxError); }
try { Function("", "return 1 +;"); console.log('no error'); } catch (e) { console.log(e instanceof SyntaxError); }
try { Function(String("return 1")); } catch (e) { console.log(e.name); }
`);
 assert.equal(run.status, 0, run.stderr);
 assert.equal(run.stdout, 'true\n5 anonymous 2 true\ntrue true\n7 undefined undefined\ntrue\ntrue\ntrue\nEvalError\n');
});

test('a function that binds its own Function leaves only its own calls alone', () => {
 // lodash: the top level reads Function('return this')() and runInContext
 // declares var Function = context.Function.
 const run = runOnHost(`;(function () {
  var root = Function('return this')();
  function runInContext(context) {
    var Function = context.Function;
    return [typeof Function, (function () { return Function('return 1'); })()];
  }
  function parameter(Function) { return Function('p'); }
  function catches() { try { throw function () { return 'caught'; }; } catch (Function) { return Function('c'); } }
  function blocks() { { let Function = function (s) { return 'let ' + s; }; return Function('b'); } }
  console.log(root === globalThis, runInContext({Function: function (s) { return 'context ' + s; }}).join(),
    parameter(function (s) { return 'parameter ' + s; }), catches(), blocks(), Function('return 2')());
}());
`);
 assert.equal(run.status, 0, run.stderr);
 assert.equal(run.stdout, 'true function,context return 1 parameter p caught let b 2\n');
});

test('a program that binds its own Function is left alone', () => {
 const run = runOnHost(`function Function(s) { return 'shadowed ' + s; }
console.log(Function("x"));
`);
 assert.equal(run.status, 0, run.stderr);
 assert.equal(run.stdout, 'shadowed x\n');
});

test('GeneratorFunction/AsyncFunction with literal source compile ahead of time', () => {
 const run = runOnHost(`var GeneratorFunction = Object.getPrototypeOf(function*(){}).constructor;
var g = GeneratorFunction('x', 'y', 'yield x + y;'); console.log(g.name, g.length, g(1, 2).next().value);
var AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
new AsyncFunction('a', 'return await a;')(5).then(v => console.log('async', v));
try { GeneratorFunction('x = yield', ''); } catch (e) { console.log(e.name); }
(function(){ var GeneratorFunction = function(){ return 'shadowed'; }; console.log(GeneratorFunction('yield 1')); })();
`);
 assert.equal(run.status, 0, run.stderr);
 assert.equal(run.stdout, 'anonymous 2 3\nSyntaxError\nshadowed\nasync 5\n');
});

test('dynamic constructors reached through a variable compile ahead of time', () => {
 const run = runOnHost(`var G = function*(){}.constructor, F = Object.getPrototypeOf(function(){}).constructor;
try { G('import.meta'); } catch (e) { console.log(e.name); }
var g = G('a', 'yield a * 2'); console.log(g(4).next().value, Object.getPrototypeOf(g) === Object.getPrototypeOf(function*(){}));
console.log(F('a', 'return a + 1')(1));
`);
 assert.equal(run.status, 0, run.stderr);
 assert.equal(run.stdout, 'SyntaxError\n8 true\n2\n');
});

test('subclasses of the dynamic constructors construct from literal sources', () => {
 const run = runOnHost(`class Fn extends Function {}
var fn = new Fn('a', 'b', 'return a + b'); console.log(fn(2, 3), fn.length, fn.name, Object.getPrototypeOf(fn) === Fn.prototype);
var GeneratorFunction = Object.getPrototypeOf(function* () {}).constructor; class GFn extends GeneratorFunction {}
var g = new GFn('a', 'yield a * 2'); console.log(g(21).next().value, g instanceof GFn);
try { new Fn('a b', ''); } catch (e) { console.log(e.name); }
`);
 assert.equal(run.status, 0, run.stderr);
 assert.equal(run.stdout, '5 2 anonymous true\n42 true\nSyntaxError\n');
});
