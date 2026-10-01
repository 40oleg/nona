import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost,runModulesOnHost} from './helpers/host.js';

// eval with source text known at compile time (src/frontend/eval-aot.ts).
const cases:[string,string,string][]=[
 ['completion values and the caller scope',
  "var x = 5; console.log(eval('1 + 2'), eval('x * 2'), eval('if (x) { \"a\" } else { \"b\" }'), eval('var q = 1'), eval('7; var r = 2'), eval(''), eval('for (var i = 0; i < 2; i++) i;'));",
  '3 10 a undefined 7 undefined 1\n'],
 ['sloppy var and function declarations reach the caller',
  "function f(a) { eval('var y = a + 1; function h() { return y * 2; }'); return [y, h(), typeof eval('y')]; } console.log(f(4).join()); console.log(typeof y, typeof h);",
  '5,10,number\nundefined undefined\n'],
 ['eval vars are configurable bindings',
  "function f() { eval('var v = 1'); var before = v; delete v; return [before, typeof v]; } console.log(f().join()); eval('var gv = 3'); var d = Object.getOwnPropertyDescriptor(globalThis, 'gv'); console.log(gv, d.configurable, d.enumerable);",
  '1,undefined\n3 true true\n'],
 ['strict eval keeps its declarations',
  "function f() { 'use strict'; eval('var s = 1; function t() {}'); return typeof s + typeof t; } console.log(f(), eval('\"use strict\"; var u = 2; u'), typeof u);",
  'undefinedundefined 2 undefined\n'],
 ['lexical declarations are local to the eval',
  "let k = 1; console.log(eval('let k = 2; k'), k); try { eval('let a; let a;'); } catch (e) { console.log(e.name); } function g() { let t = 1; try { eval('var t = 2'); } catch (e) { return e.name; } } console.log(g());",
  '2 1\nSyntaxError\nSyntaxError\n'],
 ['this, arguments, new.target and super',
  "function f() { return eval('[this.v, arguments.length, new.target === f]'); } console.log(f.call({v: 1}, 1, 2).join(), new f().join()); var o = {__proto__: {m() { return 'p'; }}, m() { return eval('super.m()'); }}; console.log(o.m()); class A { constructor() { this.a = 1; } } class B extends A { constructor() { eval('super()'); } } console.log(new B().a);",
  '1,2,false ,0,true\np\n1\n'],
 ['indirect eval runs in the global scope',
  "var v = 'global'; function f() { var v = 'local', e = eval; return [(0, eval)('v'), e('v'), globalThis.eval('typeof f'), eval('v')]; } console.log(f().join()); (0, eval)('var iv = 1; function ifn() { return this; }'); console.log(iv, ifn() === globalThis); try { (0, eval)('new.target'); } catch (e) { console.log(e.name); }",
  'global,global,function,local\n1 true\nSyntaxError\n'],
 ['a replaced or shadowed eval is an ordinary call',
  "function f(eval) { return eval('x'); } console.log(f(s => s + '!')); var saved = eval; eval = s => 'replaced ' + s; console.log(eval('1')); eval = saved; console.log(eval('1'));",
  'x!\nreplaced 1\n1\n'],
 ['nested eval, closures and source text',
  "function f() { var n = 1; var g = eval('(function inner() { return eval(\"n + 1\"); })'); return [g(), String(g), eval('eval(\"var z = 4\"); z')]; } console.log(f().join('|'));",
  '2|function inner() { return eval("n + 1"); }|4\n'],
 ['early and runtime errors in eval code',
  "try { eval('return 1'); } catch (e) { console.log(e.name); } try { eval('(') } catch (e) { console.log(e.name); } try { eval('throw new RangeError(\"r\")'); } catch (e) { console.log(e.name); } try { eval('\"use strict\"; with ({}) {}'); } catch (e) { console.log(e.name); }",
  'SyntaxError\nSyntaxError\nRangeError\nSyntaxError\n'],
 ['Annex B block functions in sloppy eval',
  "function f() { eval('{ function b() { return 1; } }'); return typeof b; } console.log(f()); eval('if (true) function c() { return 2; }'); console.log(c());",
  'function\n2\n'],
 ['eval in parameter initializers (var arguments: Test262, V8 differs)',
  "var f = (p = eval('var w = 1; w')) => [p, w]; console.log(f().join()); function g(p = eval('var arguments')) {} try { g(); } catch (e) { console.log(e.name); }",
  '1,1\nSyntaxError\n'],

 ['variables holding constant sources, eval?.() and Function in eval code',
  "var src = '1 + 1'; console.log(eval(src)); src = 'var cz = 3; cz * 2'; console.log(eval(src), cz); var dyn = String(5); try { eval(dyn); } catch (e) { console.log(e.name); } const a = 'g'; function f() { const a = 'l'; return [eval?.('a'), eval('a')]; } console.log(f().join(), eval('Function(\"x\", \"return x * 2\")')(4));",
  '2\n6 3\nEvalError\ng,l 8\n'],

 ['completion values through labels and finally',
  "console.log(eval('5; outer: do { while (true) { 6; continue outer; } } while (false)'), eval('99; do { -99; try { 39 } finally { 42; break; } } while (false);'), eval('1; try { 2 } finally { 3 }'), eval('99; do { try { 39 } finally { break; } } while (false);'));",
  '6 42 2 undefined\n'],
];
for(const [name,source,expected] of cases)test('eval-aot: '+name,()=>{
 const run=runOnHost(source);
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,expected);
});

test('eval-aot: module code (strict direct eval, indirect eval and Function see only the global scope)',()=>{
 const {native}=runModulesOnHost({'main.mjs':"var x = 1; let y = 2; console.log(eval('x + y'), (0, eval)('typeof y'), Function('return typeof y')(), eval('var z = 3; z'), typeof z); try { eval('import.meta'); } catch (e) { console.log(e.name); }"},'main.mjs');
 assert.equal(native.status,0,native.stderr);
 assert.equal(native.stdout,'3 undefined undefined 3 undefined\nSyntaxError\n');
});
