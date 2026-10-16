import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";
import { compile, hostTarget } from "../src/compiler.js";

// Small features newer than ES2020 (#69), compared with Node.js under GC stress.
const programs: Record<string, string> = {
    "numeric separators": `console.log(1_000_000,0xA_B+0b1_0+0o7_7,1_0.0_1,.1_2e1_0,String(1_0n),1e1_0);`,
    "logical assignment": `
let a=0,b=1,c=null,d,log=[];a||=5;b&&=7;c??=9;d??=(()=>1)();console.log(a,b,c,d);
let e="x";e||=log.push("no");e&&=log.push("yes");console.log(e,log.join());
const o={get p(){log.push("get");return 0;},set p(v){log.push("set "+v);}};o.p||=3;o.p&&=4;o.p??=5;console.log(log.join());
const q={n:null};q.n??=function(){};let f;f??=function(){};let g;g||=class{};console.log(q.n.name,f.name,g.name);
const arr=[0,1];let i=0;arr[i++]||=10;console.log(arr.join(),i);
try{(function(){"use strict";const fz=Object.freeze({x:0});fz.x||=2;})();}catch(err){console.log(err.constructor.name);}
const k=1;try{k&&=2;}catch(err){console.log(err.constructor.name);}let z=0;z??=1;console.log(z);`,
    "at, findLast, hasOwn, error cause": `
console.log([1,2,3].at(-1),[1,2,3].at(5),"abc".at(-2),new Int8Array([4,5]).at(-1),[1,2,3,4].findLast(x=>x%2),[1,2,3,4].findLastIndex(x=>x>9),new Uint8Array([1,2,3]).findLastIndex(x=>x<3));
console.log(Object.hasOwn({a:1},"a"),Object.hasOwn([],"length"),Object.hasOwn.length,Array.prototype.at.name,Array.prototype[Symbol.unscopables].findLast,Object.getOwnPropertyDescriptor(Array.prototype,"at").enumerable);
try{Object.hasOwn(null,"x");}catch(e){console.log(e.constructor.name);}try{[].findLast();}catch(e){console.log(e.constructor.name);}
const ec=new TypeError("m",{cause:1});console.log(ec.cause,Object.getOwnPropertyDescriptor(ec,"cause").enumerable,"cause" in new Error("x",{}),"cause" in new RangeError("x"));`,
    "AggregateError and Promise.any": `
const ae=new AggregateError([1,2],"msg",{cause:"c"});
console.log(ae.message,ae.errors.join(),ae.cause,ae.name,ae instanceof Error,Object.prototype.toString.call(ae),AggregateError.length,Object.getPrototypeOf(AggregateError)===Error,AggregateError("x").message,Object.keys(ae).length,String(ae));
class Sub extends AggregateError{}const s=new Sub([]);console.log(s instanceof Sub,s instanceof AggregateError,s.constructor.name);
const log=[];Promise.any([Promise.reject(1),Promise.resolve(2),3]).then(v=>log.push("any "+v));
Promise.any([Promise.reject(1),Promise.reject(2)]).catch(e=>log.push(e.constructor.name+" "+e.errors.join()));
Promise.any([]).catch(e=>log.push("empty "+e.errors.length));
setTimeout(()=>console.log(log.join("|")),0);`,
    "Object.groupBy and Map.groupBy": `
const show=v=>JSON.stringify(v);
const a=Object.groupBy([1,2,3,4,5],(x,i)=>x%2?"odd":"even");
console.log(show(a),Object.getPrototypeOf(a)===null,Object.keys(a).join());
console.log(show(Object.groupBy("a𝒜b𝒜",c=>c)),show(Object.groupBy(new Set([1,2,3]),x=>x>1)));
function*g(){yield 1;yield 2;yield 3;}
console.log(show(Object.groupBy(g(),(x,i)=>i)),show([...Map.groupBy(g(),x=>x%2)]));
const sym=Symbol("s"),ts={toString(){return "ts";}};
const c=Object.groupBy([1,2,3,4],x=>[0,sym,ts,1.5,null][x]);
console.log(Object.getOwnPropertyNames(c).join(),c[sym].join(),c.ts.join(),c["1.5"].join(),c["null"].join());
console.log(Object.keys(Object.groupBy([-0,0],x=>x)).join(),show(Object.groupBy([2,1],x=>x)));
const m=Map.groupBy([-0,0,NaN,NaN,"x",1],x=>x);
console.log(m instanceof Map,m.size,[...m.keys()].map(k=>Object.is(k,-0)?"-0":String(k)).join(),show([...m.values()]));
const ks=Symbol("k"),vk=Object.groupBy([1],()=>({[Symbol.toPrimitive](){return ks;}}));console.log(Object.getOwnPropertySymbols(vk).length);
const o1={},o2={};const m2=Map.groupBy([o1,o2,o1],x=>x);console.log(m2.size,m2.get(o1).length,[...Map.groupBy([3,1,2],x=>-x).keys()].join());
const ps=Map.prototype.set,MM=Map;Map.prototype.set=function(){throw new Error("patched");};
try{console.log(Map.groupBy([1,2],x=>x).size);}catch(e){console.log("bad",e.message);}
Map.prototype.set=ps;
for(const f of [()=>Object.groupBy(null,x=>x),()=>Map.groupBy(undefined,x=>x),()=>Object.groupBy([1]),()=>Map.groupBy([1],{}),()=>Object.groupBy(5,x=>x),()=>Map.groupBy({},x=>x)])
try{f();console.log("no throw");}catch(e){console.log(e.constructor.name);}
function it(log){return{[Symbol.iterator](){return{i:0,next(){return{value:this.i++,done:false};},return(){log.push("return");return{};}};}};}
let log=[];try{Object.groupBy(it(log),()=>{throw new RangeError("cb");});}catch(e){log.push(e.constructor.name);}
try{Map.groupBy(it(log),()=>{throw new EvalError("cb");});}catch(e){log.push(e.constructor.name);}
try{Object.groupBy(it(log),()=>({toString(){throw new SyntaxError("k");}}));}catch(e){log.push(e.constructor.name);}
try{Object.groupBy(it(log),()=>({[Symbol.toPrimitive](){return {};}}));}catch(e){log.push(e.constructor.name);}
console.log(log.join());
for(const [o,n] of [[Object,"Object"],[Map,"Map"]]){const d=Object.getOwnPropertyDescriptor(o,"groupBy");
console.log(n,d.writable,d.enumerable,d.configurable,o.groupBy.name,o.groupBy.length,Function.prototype.toString.call(o.groupBy).includes("native code"));}
let seen=[];Object.groupBy([5,6],function(){seen.push(this===undefined,arguments.length);return "k";});console.log(seen.join());
const d2=Object.getOwnPropertyDescriptor(a,"odd");console.log(d2.writable,d2.enumerable,d2.configurable,Array.isArray(a.odd));`,
};
for (const [name, source] of Object.entries(programs))
    test(`post-ES2020: ${name}`, () => {
        const expected = runOracle(source).stdout;
        const run = runOnHost(source);
        assert.equal(run.error, undefined);
        assert.equal(run.status, 0, run.stderr);
        assert.equal(run.stdout, expected);
    });
for (const source of [
    "0_1",
    "1__2",
    "1_",
    "0x_1",
    "1._1",
    "1_.1",
    "1e_1",
    "08_1",
    "01_1",
    "({a}) ||= 1",
    "[a] &&= 1",
    "f() ??= 1",
])
    test(`post-ES2020 early error: ${source}`, () => {
        assert.equal(
            compile(source + ";", { fileName: "e.js", target: hostTarget }).ok,
            false,
        );
    });
