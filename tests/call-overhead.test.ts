import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";
import { compileToIR } from "../src/compiler.js";
import { generate } from "../src/backend/x64/codegen.js";
import { FrameDescriptor as FD } from "../src/runtime/frame-layout.js";

// Call overhead (#47): rt.invoke runs ordinary functions and arrows from a
// small frame, rt.invokeConstruct runs compiled constructors directly, `new`
// sites remember the constructor's prototype (rt.newInstanceCached), and
// rt.enterFrame clears only the slots live at entry. All of it must agree
// with the general paths, under GC stress (the default of runOnHost).
const agree = (source: string, gcStress = true) => {
    const run = runOnHost(source, { gcStress });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
};

const calls = String.raw`
'use strict';
const out=[];
const arrow=(a,b)=>a+b;
const fns=[];for(let i=0;i<5;i++){const k=i;fns.push(()=>k*2,function(){return this===undefined?'u':typeof this});}
out.push(arrow(1,2),fns.map(f=>f()).join());
const s=new Function('return this===globalThis?"global":typeof this');
out.push(s(),s.call(7),s.call(null),[1].map(s).join(),s.call('x'));
const sloppyThis=[s];out.push(sloppyThis[0](),({s}).s()===undefined);
class K{constructor(){this.v=1}m(){return this.v}static s(){return 's'}}
out.push(K.s());
try{K()}catch(e){out.push(e.constructor.name)}
const viaArray=[K];try{viaArray[0]()}catch(e){out.push(e.constructor.name)}
const bound=K.prototype.m.bind({v:'b'});out.push(bound(),[bound][0]());
function* g(){yield 1;yield 2}const gs=[g];out.push([...gs[0]()].join());
async function af(){return 'async'}[af][0]().then(v=>out.push(v));
const p=new Proxy(function(){return 'proxied'},{apply(){return 'trap'}});out.push(p(),[p][0]());
const o={who(){return 'o'}};const child=Object.create(o);out.push(child.who());
out.push(Math.max(1,2),Math.round(2.5),[3,1,2].sort().join(),'x'.repeat(3));
let missing;try{missing()}catch(e){out.push(e.constructor.name)}
try{({}).nope()}catch(e){out.push(e.constructor.name)}
const tails={t(n){return n===0?'tail':this.t(n-1)}};out.push(tails.t(3000));
const viaVar=[function tail(n){return n===0?'tail2':tail(n-1)}];out.push(viaVar[0](3000));
function defaults(a,b=a+1,...rest){return [a,b,rest.length,arguments.length].join(':')}
const d=[defaults];out.push(d[0](1),d[0](1,2,3,4),d[0]());
function many(a,b,c,d,e,f,g,h,i,j){return [a,b,c,d,e,f,g,h,i,j].join('')}
const m=[many];out.push(m[0](1,2,3),m[0](1,2,3,4,5,6,7,8,9,10));
const callbacks=[1,2,3].map((x,i,a)=>x+i+a.length);out.push(callbacks.join());
const lexical={v:'lex',m(){return [1].map(()=>this.v)[0]}};out.push(lexical.m());
Promise.resolve().then(()=>console.log(out.join('|')));
`;
test("calls through rt.invoke of every kind of callee agree with Node", () =>
    agree(calls));
test("calls through rt.invoke without GC stress", () => agree(calls, false));

test("sloppy functions get the global object or the receiver as this", () =>
    agree(String.raw`
const out=[];
function who(){return this===globalThis?'global':this===undefined?'undefined':typeof this}
const list=[who];
out.push(list[0](),list[0].call(null),list[0].call(undefined),list[0].call(1),list[0].call('s'),list[0].call({}));
const holder={who};out.push(holder.who());
const prim=Object.assign(Object.create(null),{who});out.push(prim.who());
console.log(out.join('|'));
`));

const constructions = String.raw`
'use strict';
const out=[];
function P(w){this.w=w}
P.prototype.area=function(){return this.w*this.w};
const items=[];for(let i=0;i<5;i++)items.push(new P(i));
out.push(items.map(p=>p.area()).join());
P.prototype={area(){return -1}};out.push(new P(3).area());
P.prototype=7;out.push(Object.getPrototypeOf(new P(1))===Object.prototype);
P.prototype={area(){return 'again'}};out.push(new P(1).area());
Object.defineProperty(P,'prototype',{value:{area(){return 'defined'}}});out.push(new P(1).area());
class Base{constructor(w){this.w=w}}
class Derived extends Base{constructor(w){super(w*2)}}
for(let i=0;i<3;i++)out.push(new Derived(i).w,new Derived(i) instanceof Base);
function Returns(){return {custom:true}}
out.push(new Returns().custom,new Returns() instanceof Returns);
function Primitive(){return 42}
out.push(new Primitive() instanceof Primitive);
const B2=Base.bind(null,'bound');out.push(new B2().w,new B2() instanceof Base);
try{new (()=>1)()}catch(e){out.push(e.constructor.name)}
try{new (function*(){})()}catch(e){out.push(e.constructor.name)}
try{new 3}catch(e){out.push(e.constructor.name)}
out.push(new Array(3).length,new Date(0).getTime(),new Map([[1,2]]).get(1),new (class extends Array{})(2).length);
let order=[];const T=new Proxy(class{constructor(){order.push('ctor')}},{construct(t,a,nt){order.push('trap');return Reflect.construct(t,a,nt)}});
new T();out.push(order.join());
out.push(new Promise(r=>r(1)) instanceof Promise);try{new Promise(5)}catch(e){out.push(e.constructor.name)}try{new Promise()}catch(e){out.push(e.constructor.name)}
class Sub extends Promise{}out.push(new Sub(r=>r(1)) instanceof Sub);
const Ctor=function(){};const proto={from:'proto'};Ctor.prototype=proto;
for(let i=0;i<3;i++)out.push(new Ctor().from);Ctor.prototype=null;out.push(Object.getPrototypeOf(new Ctor())===Object.prototype);
function NT(){out.push(new.target===NT)}new NT();Reflect.construct(NT,[]);
class Tail{constructor(){return make()}}function make(){return {made:1}}out.push(new Tail().made);
const ctors=[P,Base,Derived];for(const C of ctors)out.push(new C(2) instanceof C);
console.log(out.join('|'));
`;
test("new sites cache the constructor and its prototype", () =>
    agree(constructions));
test("new sites without GC stress", () => agree(constructions, false));

test("slots not live at entry are written before the collector scans them", () =>
    agree(String.raw`
const out=[];
function hoisted(flag){if(flag)var x={v:1};const junk=[{},{},{}];return [String(x&&x.v),junk.length].join()}
out.push(hoisted(true),hoisted(false));
function caught(n){let a,b;try{a={n};if(n>1)throw new Error('e'+n);b=[a]}catch(e){return [a.n,String(b),e.message].join()}return [a.n,b.length].join()}
out.push(caught(1),caught(2));
function loop(n){let acc=[];for(let i=0;i<n;i++){const t={i};let u;if(i%2)u=[t];acc.push(u?u[0].i:t.i)}return acc.join()}
out.push(loop(6));
function many(){let v0,v1,v2,v3,v4,v5,v6,v7,v8,v9;const r=[];for(let i=0;i<3;i++){r.push(v5);v5={i};r.push(String(v9))}return r.map(x=>x&&x.i).join()}
out.push(many());
function* gen(){let s;for(let i=0;i<3;i++){s=s?[s]:{i};yield JSON.stringify(s)}}
out.push([...gen()].join());
function args(a,b,c){const m=[a,b,c];return arguments.length+':'+m.map(String).join()}
out.push(args(),args(1),args(1,2,3,4));
console.log(out.join('|'));
`));

test("frame descriptors clear only the parameters and the slots live at entry", () => {
    const program = generate(
        compileToIR(
            "function f(a,b){let t=[a];let u=t.length;return u+b}\nfunction g(){if(Math.random()>2)var v={};return v}\nconsole.log(f(1,2),g());\n",
        ),
    );
    const field = (name: string, offset: number) =>
        Number(
            new DataView(
                program.fragments.find((f) => f.name === name)!.bytes.buffer,
            ).getBigInt64(offset, true),
        );
    // f: two parameters, temporaries written before they are read.
    assert.equal(field("js.fn.0.frame", FD.clear), 2);
    assert.ok(field("js.fn.0.frame", FD.slots) > 2);
    // g: v may be read before it is assigned.
    assert.ok(field("js.fn.1.frame", FD.clear) >= 1);
    assert.equal(
        field("js.fn.0.frame", FD.rootCount),
        -(field("js.fn.0.frame", FD.slots) + 3),
    );
});
