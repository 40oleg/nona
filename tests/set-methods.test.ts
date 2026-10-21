import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";
import { collectSourceUsage, lex } from "../src/frontend/lexer.js";
import { parse } from "../src/frontend/parser.js";
import { compile, hostTarget } from "../src/compiler.js";

// The ES2025 Set methods (#316), compared with Node.js under GC stress.
const programs: Record<string, string> = {
    "results for both relative sizes": `
const show=s=>"["+[...s].join(",")+"]";
const small=new Set([2,3]),big=new Set([1,2,3,4,5]),other=new Set([3,4,6]);
for(const [a,b] of [[small,big],[big,small],[big,other],[other,big],[small,new Set()],[new Set(),small],[big,big]])
  console.log(show(a.union(b)),show(a.intersection(b)),show(a.difference(b)),show(a.symmetricDifference(b)),a.isSubsetOf(b),a.isSupersetOf(b),a.isDisjointFrom(b));
const m=new Map([[3,"x"],[9,"y"]]);
console.log(show(big.union(m)),show(big.intersection(m)),show(small.difference(m)),show(big.symmetricDifference(m)),new Set([3]).isSubsetOf(m),big.isSupersetOf(m),small.isDisjointFrom(m));
const r=big.union(small);console.log(r!==big,show(big),Object.getPrototypeOf(r)===Set.prototype);`,
    "set-like protocol order": `
const log=[];
function setLike(values,size){return{
  get size(){log.push("size");return{valueOf(){log.push("valueOf");return size;}};},
  get has(){log.push("get has");return v=>{log.push("has "+v);return values.includes(v);};},
  get keys(){log.push("get keys");return()=>{log.push("keys");let i=0;return{
    get next(){log.push("get next");return()=>{log.push("next");return{get done(){log.push("done");return i>=values.length;},get value(){log.push("value");return values[i++];}};};},
    return(){log.push("return");return{};}};};}};}
const s=new Set([1,2,3]);
for(const name of ["union","intersection","difference","symmetricDifference","isSubsetOf","isSupersetOf","isDisjointFrom"])
  for(const [values,size] of [[[2,4],2],[[3,1,5,6],4],[[2],1]]){
    log.length=0;const result=s[name](setLike(values,size));
    console.log(name,size,result instanceof Set?[...result].join(","):result,log.join(" "));
  }`,
    "GetSetRecord errors": `
const s=new Set([1]),f=()=>{},keys=()=>[][Symbol.iterator]();
const cases=[undefined,null,1,"abc",[1],{size:undefined,has:f,keys},{size:NaN,has:f,keys},{size:"x",has:f,keys},{size:-1,has:f,keys},{size:-0.5,has:f,keys},
  {size:1n,has:f,keys},{size:Symbol(),has:f,keys},{size:1,has:1,keys},{size:1,has:f,keys:{}},{size:1,keys},{size:"2",has:f,keys},{size:Infinity,has:f,keys},{size:{valueOf(){return 1;}},has:f,keys}];
for(const name of ["union","intersection","difference","symmetricDifference","isSubsetOf","isSupersetOf","isDisjointFrom"]){
  const out=[];for(const c of cases){try{const r=s[name](c);out.push(r instanceof Set?"set "+r.size:r);}catch(e){out.push(e.constructor.name);}}
  console.log(name,out.join(" "));
}
const order=[];try{s.union({get size(){order.push("size");return -1;},get has(){order.push("has");return f;},get keys(){order.push("keys");return keys;}});}catch(e){order.push(e.constructor.name);}
try{s.union({get size(){order.push("size");return 1;},get has(){order.push("has");return 1;},get keys(){order.push("keys");return keys;}});}catch(e){order.push(e.constructor.name);}
console.log(order.join());`,
    "iterator protocol errors and closing": `
const s=new Set([1,2,3]);
const like=(next,ret,size=1)=>({size,has:()=>false,keys(){return{next,return:ret};}});
for(const name of ["union","intersection","difference","symmetricDifference","isSupersetOf","isDisjointFrom"]){
  const out=[];
  for(const bad of [()=>1,()=>"x",()=>undefined,1]){try{s[name](like(bad,undefined));out.push("ok");}catch(e){out.push(e.constructor.name);}}
  try{s[name]({size:1,has(){},keys(){return 1;}});out.push("ok");}catch(e){out.push(e.constructor.name);}
  console.log(name,out.join(" "));
}
const log=[];let n=0;
const values=v=>()=>({done:n>=v.length,value:v[n++]});
n=0;console.log(s.isSupersetOf(like(values([1,9,2]),function(){log.push("return "+n);return{};})),log.join());
n=0;console.log(s.isDisjointFrom(like(values([7,2,8]),function(){log.push("return "+n);return{};},0)),log.join());
n=0;console.log(s.isSupersetOf(like(values([1,2]),function(){log.push("not called");return{};})),log.join());
for(const ret of [1,function(){return 1;},function(){throw new RangeError("r");}]){n=0;try{s.isSupersetOf(like(values([9]),ret));}catch(e){console.log(e.constructor.name);}}
n=0;console.log(s.isSupersetOf(like(values([9]),null)));`,
    "mutation during has and keys": `
const show=s=>"["+[...s].join(",")+"]";
let s=new Set([1,2,3,4]);
let once=true;
console.log(show(s.intersection({size:10,has(v){if(v===1&&once){once=false;s.delete(2);s.add(5);s.delete(1);s.add(1);}return true;},keys(){}})),show(s));
s=new Set([1,2,3]);
console.log(s.isSubsetOf({size:5,has(v){if(v===1)s.add(9);return v!==9;},keys(){}}),show(s));
s=new Set([1,2,3]);
console.log(s.isDisjointFrom({size:5,has(v){if(v===1)s.delete(2);return v===2;},keys(){}}),show(s));
s=new Set([1,2,3]);
console.log(show(s.symmetricDifference({size:2,has(){},keys(){let i=0;return{next(){if(i===0)s.delete(3);return i<2?{done:false,value:[3,4][i++]}:{done:true};}};}})),show(s));`,
    "-0, species and non-Set receivers": `
const minus=new Set([1]).union({size:1,has(){},keys(){let d=false;return{next(){const r={done:d,value:-0};d=true;return r;}};}});
console.log(Object.is([...minus][1],0),[...new Set([0]).intersection({size:9,has(){return true;},keys(){}})].map(x=>Object.is(x,-0)).join());
const zero={size:1,has(v){return Object.is(v,0);},keys(){let d=false;return{next(){const r={done:d,value:-0};d=true;return r;}};}};
console.log([...new Set([5,6]).symmetricDifference(zero)].map(x=>Object.is(x,-0)?"-0":x).join(),[...new Set([0,1,2]).difference(zero)].join(),[...new Set([1,2,0]).intersection(zero)].map(x=>Object.is(x,-0)?"-0":x).join());
class MySet extends Set{static get [Symbol.species](){throw new Error("species");}}
const my=new MySet([1,2]);
for(const name of ["union","intersection","difference","symmetricDifference"]){const r=my[name](new Set([2,3]));console.log(name,Object.getPrototypeOf(r)===Set.prototype,r.constructor===Set,[...r].join());}
const p12=new Set([1,2]),p3=new Map([[3,0]]),p12b=new Set([1,2]);
const add=Set.prototype.add,has=Set.prototype.has;Set.prototype.add=()=>{throw new Error("add");};Set.prototype.has=()=>{throw new Error("has");};
console.log([...p12.union(p3)].join(),p12b.isSupersetOf({size:1,has(){},keys(){return [2][Symbol.iterator]();}}));
Set.prototype.add=add;Set.prototype.has=has;
for(const receiver of [new Map(),{},[],new WeakSet(),Set.prototype,1,"s",undefined,null])
  for(const name of ["union","isSubsetOf"]){try{Set.prototype[name].call(receiver,new Set());console.log("ok");}catch(e){console.log(name,e.constructor.name);}}
let touched=false;try{Set.prototype.union.call({},{get size(){touched=true;return 0;}});}catch(e){console.log(e.constructor.name,touched);}`,
    "property descriptors": `
for(const name of ["union","intersection","difference","symmetricDifference","isSubsetOf","isSupersetOf","isDisjointFrom"]){
  const fn=Set.prototype[name],d=Object.getOwnPropertyDescriptor(Set.prototype,name),l=Object.getOwnPropertyDescriptor(fn,"length"),n=Object.getOwnPropertyDescriptor(fn,"name");
  let constructs=true;try{new fn(new Set());}catch(e){constructs=e.constructor.name;}
  console.log(name,fn.name,fn.length,d.writable,d.enumerable,d.configurable,l.writable,l.enumerable,l.configurable,n.writable,n.enumerable,n.configurable,typeof fn,fn.hasOwnProperty("prototype"),Object.getPrototypeOf(fn)===Function.prototype,constructs);
}`,
};
for (const [name, source] of Object.entries(programs))
    test(`Set methods: ${name}`, () => {
        const expected = runOracle(source).stdout;
        const run = runOnHost(source);
        assert.equal(run.error, undefined);
        assert.equal(run.status, 0, run.stderr);
        assert.equal(run.stdout, expected);
    });

test("Set methods are linked only for programs that name them", () => {
    const linked = (source: string) =>
        collectSourceUsage(() => parse(lex(source))).usage.preludes.setMethods;
    assert.equal(linked("const s = new Set([1]); s.add(2); s.has(1);"), false);
    for (const source of [
        "a.union(b)",
        "a.intersection(b)",
        "a.difference(b)",
        "a.symmetricDifference(b)",
        "a.isSubsetOf(b)",
        "a.isSupersetOf(b)",
        "a.isDisjointFrom(b)",
        'a["union"](b)',
    ])
        assert.equal(linked(source), true, source);
    const parts = (source: string) => {
        const result = compile(source, {
            fileName: "/app.js",
            target: hostTarget,
            reportLink: true,
        });
        assert.ok(result.ok);
        return result.linked!.map((entry) => entry.part);
    };
    assert.ok(
        !parts("console.log(new Set([1]).has(1));").includes("setMethods"),
    );
    assert.ok(
        parts("console.log(new Set([1]).union(new Set()));").includes(
            "setMethods",
        ),
    );
});

// V8 copies the receiver before it calls keys() in union and walks the receiver
// instead of the copy in difference; ES2025 does neither.
test("Set methods: receiver copies follow the ES2025 step order", () => {
    const run = runOnHost(`
const show=s=>"["+[...s].join(",")+"]";
// union: keysIter (step 4) is created before resultSetData copies O (step 5).
let s=new Set([1,2]);
console.log(show(s.union({size:1,has(){},keys(){s.add(7);let d=false;return{next(){const r={done:d,value:8};d=true;return r;}};}})),show(s));
// difference with thisSize <= other.size walks resultSetData, not O.
s=new Set([1,2,3,4]);
console.log(show(s.difference({size:10,has(v){s.clear();return v%2===0;},keys(){}})),show(s));`);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, "[1,2,7,8] [1,2,7]\n[1,3] []\n");
});
