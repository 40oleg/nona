import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOracle} from './helpers/oracle.js';
import {runOnHost} from './helpers/host.js';
import {compile} from '../src/compiler.js';

const cases:[string,string][]=[
 [
  "object environment resolution, unscopables, var and calls",
  "var x='global x', y='global y';\nvar o={x:'o.x', f(){ return this===o; }, [Symbol.unscopables]:{y:true}, y:'o.y'};\nwith(o){ console.log(x, y, f()); x='set'; var z=1; var x='via var'; }\nconsole.log(o.x, x, typeof z, o.z);\nfunction outer(){ var local=1; var obj={local:2}; with(obj){ return function(){ return local; }; } }\nconsole.log(outer()());\nvar p={}; with(p){ q=5; } console.log(typeof q, p.q);\nwith({a:1}){ console.log(delete a, typeof a); }\nvar n=0; with({get v(){n++;return n;}}){ v; v; } console.log(n);\ntry{ with(null){} }catch(e){ console.log(e instanceof TypeError); }\nwith([1,2,3]){ console.log(length, join('-')); }\nwith(Array.prototype){ console.log(typeof keys); }\n"
 ],
 [
  "closures capture the object environment",
  "function make(o){with(o){return [function(){return v;},function(x){v=x;}];}}var o={v:1},fs=make(o);console.log(fs[0]());fs[1](9);console.log(o.v,fs[0]());delete o.v;var v=\"outer\";console.log(fs[0]());"
 ],
 [
  "nested with and shadowing lets",
  "var a={x:\"a\"},b={y:\"b\"};with(a)with(b){console.log(x,y);let x2=x+y;console.log(x2);}with(a){let x=\"block\";console.log(x);}"
 ],
 [
  "compound assignment, update and typeof through with",
  "var o={n:1};with(o){n+=2;n++;++n;console.log(typeof n,typeof missing);}console.log(o.n);"
 ],
 [
  "for-in and destructuring targets inside with",
  "var o={k:0,a:0,b:0};with(o){for(var k in {p:1,q:2});var [a,b]=[1,2];({a,b}={a:3,b:4});}console.log(o.k,o.a,o.b,typeof k);"
 ],
 [
  "with values survive GC",
  "var o={s:\"keep\"};function f(){with(o){return function(){for(var i=0;i<20;i++)({t:\"\"+i});return s;};}}var g=f();o=null;for(var i=0;i<20;i++)({t:\"\"+i});console.log(g());"
 ]
];
for(const [name,source] of cases)test('with: '+name,()=>{
 const result=runOnHost(source);
 assert.equal(result.error,undefined);
 assert.equal(result.status,0,result.stderr);
 assert.equal(result.stdout,runOracle(source).stdout);
});
test('with: SetMutableBinding after the binding disappears follows ECMA-262',()=>{
 // V8 writes the outer binding here; the specification sets the property again.
 const result=runOnHost('var o={k:1};with(o){k=(delete o.k,7);}console.log(o.k,typeof k);');
 assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'7 undefined\n');
});
test('with: proxy traps follow the ECMA-262 object environment order',()=>{
 // V8 omits the HasProperty calls in GetBindingValue and SetMutableBinding.
 const result=runOnHost('var log=[],p=new Proxy({x:1},{has(t,k){log.push("has:"+String(k));return k in t;},get(t,k){log.push("get:"+String(k));return t[k];},set(t,k,v){log.push("set:"+String(k));t[k]=v;return true;}});with(p){x=x+1;}console.log(log.join());');
 assert.equal(result.status,0,result.stderr);
 assert.equal(result.stdout,'has:x,get:Symbol(Symbol.unscopables),has:x,get:Symbol(Symbol.unscopables),has:x,get:x,has:x,set:x\n');
});
for(const source of ['"use strict";with({}){}','function f(){"use strict";with({}){}}','with({})function f(){}','class A{m(){with({}){}}}'])
 test('with syntax error: '+JSON.stringify(source),()=>assert.equal(compile(source,{fileName:'t.js',target:'linux-x64'}).ok,false));
