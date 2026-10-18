import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";
import { expectProgram } from "./helpers/program.js";

// %TypedArray%.prototype.toReversed / toSorted / with (ES2023, #309),
// compared with Node.js under GC stress.
const programs: Record<string, string> = {
    "every element type": `
const S=x=>Array.from(x,v=>typeof v==="bigint"?v+"n":Object.is(v,-0)?"-0":String(v)).join();
for(const C of [Int8Array,Uint8Array,Uint8ClampedArray,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array]){
const a=new C([5,3,9,1,7]);const r=a.toReversed(),s=a.toSorted(),w=a.with(1,2),n=a.with(-1,4);
console.log(C.name,S(r),S(s),S(w),S(n),S(a),r.constructor===C,s!==a,w.constructor===C);}
for(const C of [BigInt64Array,BigUint64Array]){
const a=new C([5n,3n,9n,1n]);console.log(C.name,S(a.toReversed()),S(a.toSorted()),S(a.with(0,2n)),S(a.with(-2,7n)),S(a.toSorted((x,y)=>x>y?-1:1)),S(a));}
`,
    "float NaN and negative zero": `
const S=x=>Array.from(x,v=>Object.is(v,-0)?"-0":String(v)).join();
const f=new Float64Array([NaN,0,-0,3,-Infinity,NaN,-1]);
console.log(S(f.toSorted()),S(f.toReversed()),S(f.with(0,-0)),S(f.toSorted((a,b)=>b-a)),S(f));
console.log(S(new Float32Array([2,NaN,-0,0]).toSorted()),S(new Float32Array([1,2]).with(0,NaN)));`,
    comparators: `
const a=new Int32Array([3,1,2,10]);
console.log(Array.from(a.toSorted()),Array.from(a.toSorted(undefined)),Array.from(a.toSorted((x,y)=>y-x)),Array.from(a.toSorted(()=>NaN)),Array.from(a.toSorted((x,y)=>String(x-y))));
for(const bad of [null,0,"x",{},[],Symbol()]){try{a.toSorted(bad);console.log("no throw");}catch(e){console.log(e.constructor.name);}}
try{Int8Array.prototype.toSorted.call([],null);}catch(e){console.log("bad cmp first",e.constructor.name);}
try{Int8Array.prototype.toSorted.call([]);}catch(e){console.log("receiver",e.constructor.name);}
const log=[];new Int8Array([3,1,2]).toSorted((x,y)=>{log.push(x+":"+y);return x-y;});console.log(log.length>0);`,
    "with indexes and coercion": `
const a=new Uint8Array([1,2,3]);
console.log(Array.from(a.with(0,"7")),Array.from(a.with(2.9,300)),Array.from(a.with(-3,1)),Array.from(a.with("1",undefined)),Array.from(a.with(NaN,9)),Array.from(a.with(undefined,9)),Array.from(a.with(-0.5,8)));
for(const i of [3,-4,Infinity,-Infinity,100]){try{a.with(i,1);console.log("no throw");}catch(e){console.log(i,e.constructor.name);}}
const order=[];try{a.with({valueOf(){order.push("i");return 9;}},{valueOf(){order.push("v");return 1;}});}catch(e){order.push(e.constructor.name);}console.log(order.sort().join());
const b=new BigInt64Array(2);
for(const v of [1,"x",undefined,null,Symbol()]){try{b.with(0,v);console.log("no throw");}catch(e){console.log(e.constructor.name);}}
console.log(String(b.with(1,"5")),String(b.with(0,true)),String(new BigUint64Array(1).with(0,-1n)));
try{a.with(0,Symbol());}catch(e){console.log(e.constructor.name);}
console.log(Array.from(a));`,
    "invalid receivers": `
const fns=[Int8Array.prototype.toSorted,Int8Array.prototype.toReversed,Int8Array.prototype.with];
for(const f of fns)for(const r of [undefined,null,1,"s",{},[],new DataView(new ArrayBuffer(1)),new ArrayBuffer(1)]){try{f.call(r,0,0);console.log("no throw");}catch(e){console.log(f.name,e.constructor.name);}}`,
    "result type ignores species and constructor": `
class My extends Uint8Array{static get [Symbol.species](){throw new Error("species");}}
const m=new My([3,1,2]);m.constructor=function(){throw new Error("ctor");};
for(const r of [m.toSorted(),m.toReversed(),m.with(0,5)])console.log(Object.getPrototypeOf(r)===Uint8Array.prototype,r instanceof My,Array.from(r).join());
const t=new Int16Array([1,2]);Object.defineProperty(t,Symbol.toStringTag,{value:"Float64Array"});console.log(t.toReversed() instanceof Int16Array);
const sub=new Uint8Array(new ArrayBuffer(8),2,3);sub.set([9,8,7]);console.log(sub.toReversed().buffer.byteLength,sub.toSorted().byteOffset,Array.from(sub.with(0,1)));`,
    descriptors: `
for(const n of ["toSorted","toReversed","with"]){const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Int8Array.prototype),n);
console.log(n,typeof d.value,d.writable,d.enumerable,d.configurable,d.value.length,d.value.name,n in Int8Array.prototype,Object.hasOwn(Int8Array.prototype,n),Object.keys(Int8Array.prototype).length);
try{new d.value();}catch(e){console.log(e.constructor.name);}}
console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(Int8Array.prototype)).filter(k=>["toSorted","toReversed","with"].includes(k)).length);`,
    "receiver unchanged and empty arrays": `
const a=new Int8Array([3,1,2]);a.toSorted();a.toReversed();a.with(0,9);console.log(Array.from(a));
const e=new Float32Array(0);console.log(e.toSorted().length,e.toReversed().length,e.toSorted()!==e);try{e.with(0,1);}catch(x){console.log(x.constructor.name);}
console.log(Array.from(new Uint8ClampedArray([1,2]).with(0,300)),Array.from(new Uint8ClampedArray([1,2]).with(1,-5)));`,
    "program that names no typed array": `
console.log("with",typeof Object.prototype.with);`,
};
for (const [name, source] of Object.entries(programs))
    test(`TypedArray change-by-copy: ${name}`, () => {
        const expected = runOracle(source).stdout;
        const run = runOnHost(source);
        assert.equal(run.error, undefined);
        assert.equal(run.status, 0, run.stderr);
        assert.equal(run.stdout, expected);
    });

// Nona has no ArrayBuffer.prototype.transfer or resizable buffers yet: detach
// through the internal hook.
test("TypedArray change-by-copy: detached buffers", () =>
    expectProgram(
        `
const D=()=>{const d=new Uint8Array([3,2,1]);ArrayBuffer.__nonaDetachInternal(d.buffer);return d;};
const d=D();
for(const f of ["toSorted","toReversed","with"]){try{d[f](0,0);console.log("no throw");}catch(e){console.log(f,e.constructor.name);}}
const d2=new Uint8Array([1,2,3]);
try{d2.with(0,{valueOf(){ArrayBuffer.__nonaDetachInternal(d2.buffer);return 1;}});console.log("no throw");}catch(e){console.log("with",e.constructor.name);}
const d3=new Uint8Array([3,2,1]);let detached=false;
console.log(Array.from(d3.toSorted((x,y)=>{if(!detached){detached=true;ArrayBuffer.__nonaDetachInternal(d3.buffer);}return x-y;})),d3.length);
try{D().toSorted(null);}catch(e){console.log("bad cmp",e.constructor.name);}
`,
        "toSorted TypeError\ntoReversed TypeError\nwith TypeError\nwith RangeError\n1,2,3 0\nbad cmp TypeError\n",
    ));
