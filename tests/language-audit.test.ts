import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost} from './helpers/host.js';
import {compile} from '../src/compiler.js';

// Regressions found by the 2026-09 Test262 language audit (Linux x64 runner).
const cases:[string,string,string][]=[
 ['Annex B legacy octal literals and escapes',
  "console.log(010, 08, 09.5, 0777, '\\101\\8\\9', '\\400'.length, '\\08'.length);",
  '8 8 9.5 511 A89 2 2\n'],
 ['sloppy future reserved words and let identifiers',
  "var implements = 1, public = 2; var let; for (let in {k:1}); let = let + '!'; for (let; ;) break; console.log(implements + public, let);",
  '3 k!\n'],
 ['for-in heads: comma expression and destructuring target',
  "var x, a; for (x in null, {key: 0}) console.log(x); for ([a] in {z: 1}) console.log(a);",
  'key\nz\n'],
 ['destructuring catch parameters',
  "try { throw [1, {b: 2}]; } catch ([a, {b, c = a + b}]) { console.log(a, b, c); } try { throw {x: 5}; } catch ({x}) { var f = () => x; console.log(f()); }",
  '1 2 3\n5\n'],
 ['class declarations bind an immutable inner name',
  "class C { m() { return C; } static n() { C = 1; } } var cls = C; C = null; console.log(cls.prototype.m() === cls); try { cls.n(); } catch (e) { console.log(e.name); }",
  'true\nTypeError\n'],
 ['extends null, computed static prototype, derived return in try',
  "class F extends null {} console.log(Object.getPrototypeOf(F) === Function.prototype); try { class G { static ['prototype']() {} } } catch (e) { console.log(e.name); } class H extends class {} { constructor() { super(); try { return 0; } catch (e) { return; } } } try { new H(); } catch (e) { console.log(e.name); }",
  'true\nTypeError\nTypeError\n'],
 ['super() inside arrow functions of derived constructors',
  "class A { constructor(x) { this.x = x; } } class B extends A { constructor() { var f = () => super(7); f(); console.log(this.x); try { f(); } catch (e) { console.log(e.name); } } } new B();",
  '7\nReferenceError\n'],
 ['generator.return closes for-of and destructuring iterators',
  "var log = []; var it = { [Symbol.iterator]() { return this; }, next() { log.push('next'); return {done: false}; }, return() { log.push('return'); return {}; } };\nfunction* g() { for (var x of it) { yield x; } } var a = g(); a.next(); a.return(1);\nfunction* h() { var y; [ y = yield ] = it; } var b = h(); b.next(); b.return(2); console.log(log.join());",
  'next,return,next,return\n'],
 ['duplicate __proto__ is allowed in assignment patterns',
  "var x, y; ({__proto__: x, __proto__: y} = {}); console.log(x === Object.prototype, y === x);",
  'true true\n'],
 ['empty dynamic generator/async function constructors',
  "var GF = Object.getPrototypeOf(function* () {}).constructor; class G extends GF { constructor() { super(); } } var g = new G(); console.log(g instanceof G, g.name, typeof g().next); try { GF('yield 1'); } catch (e) { console.log(e.name); }",
  'true anonymous function\nEvalError\n'],
 ['class names from computed symbol keys and super() in optional chains',
  "var s = Symbol('t'), a = Symbol(); var o = {[s]: class {}, [a]: class {}}; console.log(o[s].name, JSON.stringify(o[a].name)); class A {} class B extends A { constructor() { console.log(super()?.x); } } new B();",
  '[t] ""\nundefined\n'],
 ['compound assignment checks the base, then converts a computed key once (V8 converts it again)',
  "let k=[1],o={1:3,2:4};o[k]+=(k[0]=2);console.log(o[1],o[2]);var n=0,key={toString(){n++;return 'a'}},p={a:1};p[key]++;console.log(p.a,n);",
  '5 4\n2 1\n'],
 ['super[key] reads the home prototype before converting the key once (V8 differs)',
  "let o={__proto__:{x:1},m(){return super[{toString(){Object.setPrototypeOf(o,{x:8});return 'x';}}];}};console.log(o.m());let n=0,p={__proto__:{x:3},m(){super[{toString(){return n++===0?'x':'y';}}]+=2;}};p.m();console.log(p.x,p.y,n);",
  '1\n5 undefined 1\n'],
 ['compound assignment on a null base throws TypeError before key conversion',
  "var k={toString(){console.log('key')}};try{var b=null;b[k]*=1}catch(e){console.log(e.name)}",
  'TypeError\n'],
 ['super.x compound assignment keeps the base read before the getter ran (V8 rereads it)',
  "let o={__proto__:{get x(){Object.setPrototypeOf(o,{x:20});return 3;}},m(){super.x+=4;}};o.m();console.log(o.x,Object.getOwnPropertyDescriptor(o,'x'));",
  '20 undefined\n'],
 ['TypedArray(iterable) collects the values before converting them',
  "let v = [0, {valueOf() { v.length = 0; return 100; }}, 2]; var t = new Int8Array(v); console.log(t.length, t[1], t[2]); var g = (function* () { yield 1n; throw new RangeError('stop'); })(); try { new BigInt64Array(g); } catch (e) { console.log(e.name); } console.log(new BigUint64Array({length: 2, 0: 5n, 1: '7'}).join());",
  '3 100 2\nRangeError\n5,7\n'],
 ['GetIterator does not require a callable next',
  "var i = { [Symbol.iterator]() { return { return() { console.log('closed'); return {}; } }; } }; function* g() { [ {}[ yield ] ] = i; } var it = g(); it.next(); it.return();",
  'closed\n'],
];
for(const [name,source,expected] of cases)test('language audit: '+name,()=>{
 const run=runOnHost(source);
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,expected);
});

// References inside with are resolved before the value is computed (V8 differs; ECMA-262 13.15.2, 14.3.1.2).
test('language audit: with references resolve before the right-hand side',()=>{
 const run=runOnHost("var y = 0, t = {}; with (t) { y = (t.y = 2, 1); } console.log(t.y, y); var o = {v: 1}; with (o) { var v = delete o.v; } console.log(o.v, v);");
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,'2 1\ntrue undefined\n');
});

for(const [name,source] of [
 ['strict legacy octal','"use strict"; var x = 010;'],
 ['strict octal escape in a directive prologue','function f() { "\\01"; "use strict"; }'],
 ['strict future reserved word','"use strict"; var public = 1;'],
 ['lexically bound let','let let = 1;'],
 ['in inside a for initializer','for (a in [1]; 1;) break;'],
 ['duplicate catch pattern names','try {} catch ([a, a]) {}'],
 ['catch pattern and var with the same name','try {} catch ([a]) { var a; }'],
 ['accessor named constructor','class C { get constructor() {} }'],
 ['class named yield','class yield {}'],
 ['with in class heritage','class C extends (function () { with ({}); }) {}'],
 ['parenthesized literal assignment target','({}) = 1;'],
 ['arrow function assignment target','() => ({}) = 1;'],
 ['yield in generator arrow parameters','function* g() { (x = yield) => {}; }'],
 ['new import()',"new import('./x.js');"],
 ['duplicate __proto__ in an object literal','var o = {__proto__: null, __proto__: null};'],
 ['var in a for-of body repeating a let head name','for (let x of []) { var x; }'],
 ['let starting a for-of target','for (let of []) ;'],
 ['strict yield label','"use strict"; yield: 1;'],
 ['super() in an optional chain outside a derived constructor','class C { constructor() { super()?.a; } }'],
] as [string,string][])test('language audit early error: '+name,()=>{
 assert.equal(compile(source,{fileName:'early.js',target:'linux-x64'}).ok,false);
});
