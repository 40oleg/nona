import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile} from '../src/compiler.js';
import {runOnHost} from './helpers/host.js';
import {runOracle} from './helpers/oracle.js';

// ES2022 class elements (#106): public and private fields, private methods
// and accessors, static blocks and `#x in obj`, compared with Node.js under
// GC stress.
const agree=(source:string)=>{
 const run=runOnHost(source);
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,runOracle(source).stdout);
};

test('public fields are defined in order on the new instance',()=>agree(String.raw`
const log=[];
const key=(k)=>{log.push('key '+k);return k};
class A {
  a = (log.push('a'), 1);
  [key('b')] = this.a + 1;
  c;
  static s = (log.push('static s'), 'S');
  [key('d')] = function () {};
  e = () => this;
  f = class {};
  [Symbol.toStringTag] = 'A!';
  constructor(x = log.push('parameter')) { log.push('constructor ' + this.b); }
}
log.push('defined');
const a = new A();
console.log(log.join(','));
console.log(JSON.stringify(Object.getOwnPropertyNames(a)), a.c, a.d.name, a.e() === a, a.f.name, String(a), A.s);
console.log(JSON.stringify(Object.getOwnPropertyDescriptor(a, 'a')));
// Fields are defined, not assigned: setters on the prototype are not called.
class P { set x(v) { console.log('setter'); } }
class Q extends P { x = 1; }
console.log(Object.getOwnPropertyDescriptor(new Q(), 'x').value);
// A field cannot be added to a frozen this returned by the base constructor.
class Frozen { constructor() { return Object.freeze({}); } }
class Late extends Frozen { y = 1; }
try { new Late(); } catch (e) { console.log(e instanceof TypeError); }
`));

test('derived classes initialize their fields when super() returns',()=>agree(String.raw`
class Base { constructor() { this.order = ['base']; } }
class Derived extends Base {
  x = (this.order.push('field'), 'x');
  constructor() { const f = () => super(); f(); this.order.push('body'); }
}
class Default extends Derived { y = this.x + 'y'; }
const d = new Default();
console.log(d.order.join(), d.x, d.y);
class Twice extends Base { z = 1; constructor() { super(); try { super(); } catch (e) { console.log(e.constructor.name); } } }
new Twice();
// super.x in an initializer reads the parent prototype.
class Up { get who() { return 'up'; } }
class Down extends Up { who2 = super.who; }
console.log(new Down().who2);
`));

test('private fields, methods and accessors check the brand',()=>agree(String.raw`
class Counter {
  #count = 0;
  static #instances = 0;
  #step() { return 1; }
  get #value() { return this.#count; }
  set #value(v) { this.#count = v; }
  constructor() { Counter.#instances++; }
  inc() { this.#value = this.#value + this.#step(); this.#count++; this.#count += 2; return this.#count; }
  static instances() { return Counter.#instances; }
  static has(o) { return #count in o && #step in o; }
  static read(o) { return o.#count; }
  static optional(o) { return o?.#count; }
}
const c = new Counter();
console.log(c.inc(), c.inc(), Counter.instances(), Counter.has(c), Counter.has({}), Counter.optional(null), Counter.optional(c));
for (const action of [() => Counter.read({}), () => Counter.prototype.inc.call({}), () => Counter.has(1)]) {
  try { action(); } catch (e) { console.log(e.constructor.name); }
}
console.log(Object.keys(c).length, JSON.stringify(c), Reflect.ownKeys(c).length);
class Methods {
  #m() { return 'm'; }
  get #g() { return 'g'; }
  set #s(v) {}
  write() { try { this.#m = 1; } catch (e) { return e.constructor.name; } }
  readSetter() { try { return this.#s; } catch (e) { return e.constructor.name; } }
  writeGetter() { try { this.#g = 1; } catch (e) { return e.constructor.name; } }
  same(o) { return this.#m === o.#m; }
}
const m = new Methods();
console.log(m.write(), m.readSetter(), m.writeGetter(), m.same(new Methods()));
// Each evaluation of a class creates new private names.
const make = () => class { #v = 1; static get(o) { return o.#v; } };
const K1 = make(), K2 = make();
try { K1.get(new K2()); } catch (e) { console.log('distinct', e.constructor.name); }
console.log(K2.get(new K2()));
// A proxy does not forward private names.
class Target { #t = 1; static t(o) { return o.#t; } }
try { Target.t(new Proxy(new Target(), {})); } catch (e) { console.log('proxy', e.constructor.name); }
// Private fields can be stamped on any object returned by a base constructor.
class Stamp { constructor(o) { return o; } }
class Stamper extends Stamp { #mark = 'marked'; static mark(o) { return o.#mark; } }
const plain = {};new Stamper(plain);
console.log(Stamper.mark(plain), Object.keys(plain).length);
`));

test('static fields and blocks run in order with the class as this',()=>agree(String.raw`
const log = [];
class S {
  static a = (log.push('a'), 1);
  static { log.push('block ' + this.a); this.b = this.a + 1; }
  static c = S.b + 1;
  static #d = 4;
  static { var local = S.#d; log.push('second block ' + local); }
  static ['e'] = this.c;
  static f = () => this;
}
console.log(log.join(), S.a, S.b, S.c, S.e, S.f() === S, typeof local);
class Named { static n = function () {}; static m = class {}; static ['comp' + 1] = () => {}; static #p = function () {}; static p() { return Named.#p.name; } }
console.log(Named.n.name, Named.m.name, Named.comp1.name, Named.p());
try { class Bad { static [(() => 'prototype')()] = 1; } } catch (e) { console.log(e.constructor.name); }
const fromExpression = class { static self = this; };
console.log(fromExpression.self === fromExpression);
`));

test('a class with thousands of private names compiles and runs',()=>{
 const count=3000,names=Array.from({length:count},(_,i)=>'#p'+i);
 const source='class Many {'+names.map((name,i)=>name+' = '+i+';').join('\n')+'\nstatic #s() { return 1; }'+
  '\nsum() { return this.'+names[0]+' + this.'+names[count-1]+' + Many.#s(); } }\nconsole.log(new Many().sum());\n';
 const run=runOnHost(source,{gcStress:false});
 assert.equal(run.status,0,run.stderr);assert.equal(run.stdout,String(count)+'\n');
});

const earlyErrors=[
 'class A { constructor = 1; }',
 'class A { "constructor"; }',
 'class A { static prototype = 1; }',
 'class A { static constructor; }',
 'class A { #x; #x; }',
 'class A { #x; get #x() {} }',
 'class A { get #x() {} get #x() {} }',
 'class A { static get #x() {} set #x(v) {} }',
 'class A { #constructor; }',
 'class A { m() { this.#y; } }',
 'this.#x;',
 'class A { #x; m() { delete this.#x; } }',
 'class A { #x; m() { delete this?.#x; } }',
 'class A { x = arguments; }',
 'class A { x = () => arguments; }',
 'class A { static { arguments; } }',
 'class A { static { return; } }',
 'class A { static { await; } }',
 'class A extends B { x = super(); }',
 'class A { #x; m() { #x; } }',
 'class A { #x; m() { 1 + #x in this; } }',
 'class A { x = 1 y = 2 }',
 'class A { #x; m() { super.#x; } }',
 'class A extends (class { m(o) { return o.#x; } }) { #x; }',
];
for(const source of earlyErrors)test('class element early error: '+source,()=>{
 assert.equal(compile(source,{fileName:'early.js',target:'linux-x64'}).ok,false);
});

const accepted=[
 'class A { static; get; set; async; static static; }',
 'class A { get\n x() {} }',
 'class A { x\n y }',
 'class A { "a" = 1; 2 = 3; [4]; }',
 'class A { #x; m() { return class { y = this; m(o) { return o.#x; } }; } }',
 'class A { x = function () { return arguments; }; }',
 'class A { static get #x() {} static set #x(v) {} }',
];
for(const source of accepted)test('class elements accepted: '+JSON.stringify(source),()=>{
 const result=compile(source,{fileName:'accepted.js',target:'linux-x64'});
 assert.ok(result.ok,result.ok?'':JSON.stringify(result.diagnostics));
});
