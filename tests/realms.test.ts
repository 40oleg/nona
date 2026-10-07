import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {runOnHost} from './helpers/host.js';

// Programs compiled with extra realms get __nonaCreateRealm(), which returns
// the global object of a fresh realm. Node's vm contexts are realms too, so
// the same program runs under Node.js with a vm-backed __nonaCreateRealm.
const oracle=(source:string)=>spawnSync(process.execPath,['-e',"globalThis.__nonaCreateRealm=()=>require('vm').runInNewContext('globalThis');\n"+source],{encoding:'utf8',timeout:20_000}).stdout;
const check=(source:string,realms=1)=>{
 const run=runOnHost(source,{gcStress:true,realms});
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,oracle(source));
};

test('constructors fall back to the prototype intrinsic of new.target realm',()=>check(`
var other = __nonaCreateRealm();
// A bound function has no prototype property; its realm is its target's.
var C = other.Object.bind();
var p = Reflect.construct(Promise, [function () {}], C);
console.log(Object.getPrototypeOf(p) === other.Promise.prototype, Object.getPrototypeOf(p) === Promise.prototype);
var f = Reflect.construct(Function, [], C);
console.log(Object.getPrototypeOf(f) === other.Function.prototype, typeof f, f.name, f());
var a = Reflect.construct(Array, [], C);
console.log(Object.getPrototypeOf(a) === other.Array.prototype);
class Sub extends Promise {}
var s = Reflect.construct(Sub, [function () {}], C);
console.log(Object.getPrototypeOf(s) === other.Promise.prototype);
var D = function () {}; D.prototype = Object.prototype;
console.log(Object.getPrototypeOf(Reflect.construct(Promise, [function () {}], D)) === Object.prototype);
class Fn extends Function {}
console.log(Object.getPrototypeOf(new Fn()) === Fn.prototype, Object.getPrototypeOf(new Function()) === Function.prototype);
console.log(Object.getPrototypeOf(new Promise(function () {})) === Promise.prototype);
`));
