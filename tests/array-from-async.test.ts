import { test } from "node:test";
import assert from "node:assert/strict";
import { runOracle } from "./helpers/oracle.js";
import { runNative } from "./helpers/native.js";
import { compileToIR } from "../src/compiler.js";
import { generate } from "../src/backend/x64/codegen.js";
import { linkHost } from "./helpers/program.js";

function expectStress(source: string): void {
    const run = runNative(
        linkHost(generate(compileToIR(source), { gcStress: true })),
    );
    assert.equal(run.error, undefined);
    assert.equal(run.status, 0, run.stderr.toString());
    assert.equal(run.stdout.toString(), runOracle(source).stdout);
}

test("Array.fromAsync over async iterables, sync iterables and array-likes", () =>
    expectStress(`
 async function* gen(){yield 1;yield Promise.resolve(2);yield 3}
 Array.fromAsync(gen()).then(a=>console.log("async",a.join(),Array.isArray(a)));
 Array.fromAsync(new Set([Promise.resolve("a"),"b"])).then(a=>console.log("sync",a.join()));
 Array.fromAsync([Promise.resolve(1),2]).then(a=>console.log("array",a.join()));
 Array.fromAsync({length:3,0:Promise.resolve("x"),1:"y"}).then(a=>console.log("like",a.length,a[0],a[1],2 in a));
 Array.fromAsync("ab").then(a=>console.log("string",a.join()));
 console.log(Array.fromAsync.name,Array.fromAsync.length,typeof Array.fromAsync([]).then);
`));

test("Array.fromAsync mapping function, thisArg and await order", () =>
    expectStress(`
 var log=[];
 Array.fromAsync([1,2,3],async function(v,k){log.push("map"+k);return v*this.m+k},{m:10}).then(a=>log.push("done "+a.join()));
 Promise.resolve().then(()=>log.push("t1")).then(()=>log.push("t2")).then(()=>log.push("t3")).then(()=>log.push("t4")).then(()=>log.push("t5")).then(()=>log.push("t6")).then(()=>console.log(log.join("|")));
 Array.fromAsync({length:2,0:1,1:2},v=>v+1).then(a=>console.log("like",a.join()));
 async function* g(){log.push("g0");yield 1;log.push("g1");yield 2}
 Array.fromAsync(g(),v=>Promise.resolve(v*2)).then(a=>console.log("gen",a.join()));
`));

test("Array.fromAsync constructs this when it is a constructor", () =>
    expectStress(`
 class C{constructor(...args){this.args=args}}
 Array.fromAsync.call(C,[1,2]).then(r=>console.log(r instanceof C,r.args.length,r.length,r[0],r[1]));
 Array.fromAsync.call(C,{length:2,0:"a",1:"b"}).then(r=>console.log(r instanceof C,JSON.stringify(r.args),r.length));
 Array.fromAsync.call({},[1]).then(r=>console.log(Array.isArray(r),r.length));
 Array.fromAsync.call(()=>1,[1]).then(r=>console.log(Array.isArray(r),r.length));
 Array.fromAsync.call(undefined,[5]).then(r=>console.log(Array.isArray(r)));
`));

test("Array.fromAsync rejects on invalid arguments", () =>
    expectStress(`
 for (var bad of [[[1],1],[[1],{}],[null],[undefined],[[1],"x"]]) {
  try{
   var p=Array.fromAsync(...bad);
   console.log(p instanceof Promise);
   p.then(()=>console.log("resolved"),e=>console.log("rejected",e.name));
  }catch(e){console.log("threw",e.name)}
 }
 Array.fromAsync({[Symbol.asyncIterator]:1}).catch(e=>console.log(e.name));
 Array.fromAsync({[Symbol.iterator]:1}).catch(e=>console.log(e.name));
 Array.fromAsync(1).then(a=>console.log(a.length));
`));

test("Array.fromAsync closes the iterator when mapping or the iterator fails", () =>
    expectStress(`
 function iter(log,failAt){
  var i=0;
  return {[Symbol.iterator](){return{
   next(){i++;if(i===failAt)throw new Error("next");return{value:i,done:i>5}},
   return(){log.push("return");return{}}
  }}}
 }
 var l1=[];
 Array.fromAsync(iter(l1,0),v=>{if(v===2)throw new Error("map");return v}).catch(e=>console.log(e.message,l1.join()));
 var l2=[];
 Array.fromAsync(iter(l2,0),v=>Promise.reject(new Error("rej"+v))).catch(e=>console.log(e.message,l2.join()));
 var l4=[];
 Array.fromAsync(iter(l4,0)).then(a=>console.log(a.join(),l4.join()||"none"));
 var closed=0;
 var ai={[Symbol.asyncIterator](){var n=0;return{next(){return Promise.resolve({value:n++,done:n>3})},return(){closed++;return Promise.resolve({})}}}};
 Array.fromAsync(ai,v=>{if(v===1)throw new Error("stop");return v}).catch(e=>console.log(e.message,closed));
 Array.fromAsync({length:3,0:1,1:Promise.reject(new Error("elt")),2:3}).catch(e=>console.log(e.message));
`));
