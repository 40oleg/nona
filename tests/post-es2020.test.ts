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
    "change-by-copy array methods": `
const t=(f)=>{try{const r=f();console.log(Array.isArray(r)?JSON.stringify(r)+" "+r.length:r);}catch(e){console.log(e.constructor.name);}};
const a=[3,1,2];
t(()=>a.toSorted());t(()=>a.toSorted((x,y)=>y-x));t(()=>a.toReversed());t(()=>a.with(1,9));t(()=>a.with(-1,9));t(()=>a.toSpliced(1,1,"x","y"));
console.log(a.join());
t(()=>a.with(3,0));t(()=>a.with(-4,0));t(()=>a.with(1/0,0));t(()=>a.with());
t(()=>a.toSorted(null));t(()=>a.toSorted({}));t(()=>[].toSorted(1));t(()=>a.toSorted(undefined));
t(()=>a.toSpliced());t(()=>a.toSpliced(1));t(()=>a.toSpliced(-1));t(()=>a.toSpliced(1,-5,7));t(()=>a.toSpliced(0,100));t(()=>a.toSpliced(1,undefined,7));t(()=>a.toSpliced(undefined,undefined,7));
const h=[1,,3];
t(()=>h.toReversed());t(()=>h.toSorted());t(()=>h.with(0,5));t(()=>h.toSpliced(0,1));console.log(1 in h.toReversed(),1 in h.with(0,5));
t(()=>[,"b",undefined,"a"].toSorted());
const like={length:3,0:"c",1:"a",2:"b"};
const P=Array.prototype;
t(()=>P.toSorted.call(like));t(()=>P.toReversed.call(like));t(()=>P.with.call(like,0,"z"));t(()=>P.toSpliced.call(like,1,1));
t(()=>P.toSorted.call("cab"));t(()=>P.toReversed.call("abc"));t(()=>P.with.call({length:-1},0,1));t(()=>P.toReversed.call({}));t(()=>P.toReversed.call({length:"2",0:1,1:2}));
t(()=>P.toSorted.call(null));t(()=>P.toReversed.call(undefined));t(()=>P.with.call(null,0,0));t(()=>P.toSpliced.call(undefined));
t(()=>P.toReversed.call({length:2**32}));t(()=>P.toSorted.call({length:2**32}));t(()=>P.with.call({length:2**32},0,1));t(()=>P.toSpliced.call({length:2**32-1},0,0,1));t(()=>P.toSpliced.call({length:2**53-1},0,0,1));
t(()=>P.toSpliced.call({length:2**32},0,2**32,1));
class S extends Array{static get [Symbol.species](){throw new Error("species");}}
const s=S.from([3,1,2]);
t(()=>Object.getPrototypeOf(s.toSorted())===Array.prototype);t(()=>Object.getPrototypeOf(s.toReversed())===Array.prototype);t(()=>Object.getPrototypeOf(s.with(0,1))===Array.prototype);t(()=>Object.getPrototypeOf(s.toSpliced(0,1))===Array.prototype);
const log=[];
const obs=new Proxy({length:2,0:"b",1:"a"},{get(o,k){log.push("get "+String(k));return o[k];}});
P.toSorted.call(obs,(x,y)=>x<y?-1:1);P.with.call(obs,0,1);console.log(log.join());
Object.defineProperty(P,"7",{set(){console.log("setter");},configurable:true});
t(()=>[1,2,3,4,5,6,7,8,9].toReversed());t(()=>[1,2,3,4,5,6,7,8,9].toSorted());t(()=>[1,2,3,4,5,6,7,8,9].with(0,0));t(()=>[1,2,3,4,5,6,7,8,9].toSpliced(0,0,1));
delete P[7];
for(const [n,l] of [["toSorted",1],["toReversed",0],["toSpliced",2],["with",2]]){
const f=P[n],d=Object.getOwnPropertyDescriptor(P,n);
console.log(f.name,f.length,d.writable,d.enumerable,d.configurable,Object.hasOwn(f,"prototype"),Object.keys(P).includes(n),Object.getOwnPropertyDescriptor(f,"name").configurable);
try{new f();}catch(e){console.log(e.constructor.name);}}
console.log(JSON.stringify(Object.keys(P[Symbol.unscopables])),Object.getPrototypeOf(P[Symbol.unscopables]));
const ud=Object.getOwnPropertyDescriptor(P[Symbol.unscopables],"toSorted");console.log(ud.value,ud.writable,ud.enumerable,ud.configurable);
with([]){console.log(typeof toSorted,typeof toReversed,typeof toSpliced,typeof with_);}
var toSorted=1,toReversed=2,toSpliced=3;
with([]){console.log(toSorted,toReversed,toSpliced);}`,
    "AggregateError and Promise.any": `
const ae=new AggregateError([1,2],"msg",{cause:"c"});
console.log(ae.message,ae.errors.join(),ae.cause,ae.name,ae instanceof Error,Object.prototype.toString.call(ae),AggregateError.length,Object.getPrototypeOf(AggregateError)===Error,AggregateError("x").message,Object.keys(ae).length,String(ae));
class Sub extends AggregateError{}const s=new Sub([]);console.log(s instanceof Sub,s instanceof AggregateError,s.constructor.name);
const log=[];Promise.any([Promise.reject(1),Promise.resolve(2),3]).then(v=>log.push("any "+v));
Promise.any([Promise.reject(1),Promise.reject(2)]).catch(e=>log.push(e.constructor.name+" "+e.errors.join()));
Promise.any([]).catch(e=>log.push("empty "+e.errors.length));
setTimeout(()=>console.log(log.join("|")),0);`,
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
