import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost} from './helpers/host.js';
import {runOracle} from './helpers/oracle.js';
import {compileToIR} from '../src/compiler.js';
import {frameUses} from '../src/ir/calls.js';

// Call overhead (#47): ordinary calls, constructions and method lookups take
// inline paths (codegen.ts `invoke`, rt.newInstanceCached and the prefix of
// rt.getPropertyCached) that must agree with the general runtime paths.
const agree=(source:string)=>{
 const run=runOnHost(source);
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,runOracle(source).stdout);
};

test('ordinary calls of every kind of callee agree with Node',()=>agree(String.raw`
'use strict';
const out=[];
const arrow=(a,b)=>a+b;
const fns=[];for(let i=0;i<5;i++){const k=i;fns.push(()=>k*2,function(){return this===undefined?'u':typeof this});}
out.push(arrow(1,2),fns.map(f=>f()).join());
function sloppy(){return this===globalThis?'global':typeof this}
const s=new Function('return this===globalThis?"global":typeof this');
out.push(s(),s.call(7),s.call(null),[1].map(s).join());
class K{constructor(){this.v=1}m(){return this.v}static s(){return 's'}}
out.push(K.s());
try{K()}catch(e){out.push(e.constructor.name)}
const bound=K.prototype.m.bind({v:'b'});out.push(bound());
function* g(){yield 1;yield 2}out.push([...g()].join());
async function af(){return 'async'}af().then(v=>out.push(v));
const p=new Proxy(function(){return 'proxied'},{apply(){return 'trap'}});out.push(p());
const o={who(){return 'o'}};const child=Object.create(o);out.push(child.who());
out.push(Math.max(1,2),Math.round(2.5),[3,1,2].sort().join(),'x'.repeat(3));
let missing;try{missing()}catch(e){out.push(e.constructor.name)}
try{({}).nope()}catch(e){out.push(e.constructor.name)}
function tail(n){'use strict';return n===0?'tail':tail(n-1)}out.push(tail(5000));
function defaults(a,b=a+1,...rest){return [a,b,rest.length,arguments.length].join(':')}
out.push(defaults(1),defaults(1,2,3,4),defaults());
function many(a,b,c,d,e,f,g,h,i,j){return [a,b,c,d,e,f,g,h,i,j].join('')}
out.push(many(1,2,3),many(1,2,3,4,5,6,7,8,9,10));
Promise.resolve().then(()=>console.log(out.join('|')));
`));

test('arrows called directly read their lexical this and new.target',()=>agree(String.raw`
const out=[];
const o={x:1,m(){const f=()=>this.x;return f()+f()}};out.push(o.m());
function viaNew(){const t=()=>new.target===viaNew;out.push(t());}
new viaNew();viaNew();
class B{constructor(){this.v=5;const h=()=>this.v;out.push(h());}}
class D extends B{constructor(){const s=()=>super();s();out.push(this.v);}}
new D();
const plain=()=>typeof this;out.push(plain());
let swapped=()=>'arrow';out.push(swapped());swapped=function(){return 'function'};out.push(swapped());
console.log(out.join('|'));
`));

test('callees that ignore this are told nothing about it',()=>{
 const module=compileToIR(String.raw`
function ignores(a,b){return a+b}
function reads(){return this}
function target(){return new.target}
function capturesThis(){const f=()=>this;return f()}
const r=[ignores(1,2),reads(),target(),capturesThis()];
console.log(r.length);
`);
 const uses=new Map(module.functions.map(fn=>[fn.name,frameUses(fn)]));
 assert.deepEqual(uses.get('ignores'),{this:false,newTarget:false,superReceiver:false,fn:false,args:false});
 assert.equal(uses.get('reads')!.this,true);
 assert.equal(uses.get('target')!.newTarget,true);
 assert.equal(uses.get('capturesThis')!.this,true);
 const main=module.functions.find(fn=>fn.id==='js.main')!;
 const directs=main.blocks.flatMap(b=>b.operations).filter(op=>op.kind==='invoke'&&op.direct);
 assert.ok(directs.some(op=>op.kind==='invoke'&&op.direct?.length&&op.directIgnoresThis));
 assert.ok(directs.some(op=>op.kind==='invoke'&&op.direct?.length&&!op.directIgnoresThis));
});

test('cached own property nodes follow deletion, redefinition and reassignment',()=>agree(String.raw`
const out=[];
const big={};for(let i=0;i<40;i++)big['k'+i]=i;
big.hot=1;
function readHot(){return big.hot}
for(let i=0;i<3;i++)out.push(readHot());
big.hot=2;out.push(readHot());
delete big.hot;out.push(String(readHot()));
big.hot=3;out.push(readHot());
Object.defineProperty(big,'hot',{get(){return 'getter'},configurable:true});out.push(readHot());
Object.defineProperty(big,'hot',{value:4,writable:true,configurable:true});out.push(readHot());
const math=[];for(let i=0;i<3;i++)math.push(Math.round(1.5));
Math.round=x=>'patched';math.push(Math.round(1.5));delete Math.round;math.push(typeof Math.round);
out.push(math.join());
class C{static s(){return 'static'}}const C2=C;function callStatic(k){return k.s()}
out.push(callStatic(C),callStatic(C2));C.s=()=>'replaced';out.push(callStatic(C));
console.log(out.join('|'));
`));

test('new sites cache the constructor and its prototype',()=>agree(String.raw`
'use strict';
const out=[];
function P(w){this.w=w}
P.prototype.area=function(){return this.w*this.w};
const items=[];for(let i=0;i<5;i++)items.push(new P(i));
out.push(items.map(p=>p.area()).join());
P.prototype={area(){return -1}};out.push(new P(3).area());
P.prototype=7;out.push(Object.getPrototypeOf(new P(1))===Object.prototype);
class Base{constructor(w){this.w=w}}
class Derived extends Base{constructor(w){super(w*2)}}
for(let i=0;i<3;i++)out.push(new Derived(i).w);
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
try{new Promise(5)}catch(e){out.push(e.constructor.name)}
class Sub extends Promise{}out.push(new Sub(r=>r(1)) instanceof Sub);
const Ctor=function(){};const proto={from:'proto'};Ctor.prototype=proto;
for(let i=0;i<3;i++)out.push(new Ctor().from);Ctor.prototype=null;out.push(Object.getPrototypeOf(new Ctor())===Object.prototype);
console.log(out.join('|'));
`));

test('function objects keep a complete key filter for own and inherited reads',()=>agree(String.raw`
'use strict';
const out=[];
function f(a,b){return a+b}
const arrow=(x)=>x;class C{static s(){}}
for(let i=0;i<3;i++)out.push(f.length,f.name,typeof f.prototype,f.call(null,1,2),f.apply(null,[3,4]),arrow.length,arrow.name,arrow.prototype===undefined,C.name,C.length,C.s.name);
f.call=()=>'own call';out.push(f.call(null,1,2),f.apply(null,[1,2]));
f.extra=1;out.push(f.extra,f.hasOwnProperty('extra'),Object.keys(f).join());
delete f.extra;out.push(f.extra===undefined);
Object.defineProperty(f,'name',{value:'renamed'});out.push(f.name);
const g=f.bind(null,1);out.push(g.length,g.name,g.call(null,2));
console.log(out.join('|'));
`));

test('missing arguments and extra arguments reach parameters as before',()=>agree(String.raw`
function f(a,b,c){return [a,b,c,arguments.length].join(':')}
function g(a){return a}
function h(...r){return r.length}
const many=(a,b,c,d,e,f,g,h,i)=>[a,b,c,d,e,f,g,h,i].join(':');
console.log(f(),f(1),f(1,2),f(1,2,3),f(1,2,3,4),g(),g(1,2),h(),h(1,2,3),many(),many(1,2,3,4,5,6,7,8,9,10));
`));

test('cells read and written inline keep their semantics',()=>agree(String.raw`
let out=[];
function counter(){let n=0;return {inc(){n++;return n},get(){return n}}}
const c=counter();c.inc();c.inc();out.push(c.get());
let late;function reader(){return late}
try{out.push(reader())}catch(e){out.push(e.constructor.name)}
late=1;out.push(reader());
const fs=[];for(let i=0;i<3;i++){let k=i;fs.push(()=>k++);}
out.push(fs.map(f=>f()+f()).join());
function tdz(){const g=()=>x;try{g()}catch(e){out.push(e.constructor.name)}let x=1;return g()}
out.push(tdz());
console.log(out.join('|'));
`));
