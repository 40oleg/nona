import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost} from './helpers/host.js';
import {runOracle} from './helpers/oracle.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {ClosureDescriptor,CallSiteDescriptor} from '../src/runtime/call-sites.js';

// Issue #166: creating a closure and making a general call are one static
// descriptor and one stub call (rt.newClosure, rt.invokeSite and friends)
// instead of an inline sequence per site.
const agree=(source:string,gcStress=true)=>{
 const run=runOnHost(source,{gcStress});
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,runOracle(source).stdout);
};

test('closure creation and general calls go through site descriptors',()=>{
 const program=generate(compileToIR(`
function outer(a,b){const k={m(){return a}};return [x=>x+a+b,function(){return b},k];}
const [f,g,k]=outer(1,2);const h=f;console.log(h(3),g(),k.m(),new Date(0).getTime());`));
 const user=program.fragments.filter(f=>f.section==='.text'&&/^js\.(fn\.\d+|main)$/.test(f.name));
 for(const fragment of user){
  for(const target of ['rt.newFunction','rt.newMethod','rt.initFunctionMetadata','rt.invoke','rt.invokeConstruct'])
   assert.ok(!fragment.fixups.some(f=>f.target===target),`${fragment.name} calls ${target} inline`);
 }
 const closures=program.fragments.filter(f=>/^closure\.\d+$/.test(f.name));
 assert.ok(closures.length>=4,'one descriptor per function literal');
 for(const descriptor of closures){
  assert.equal(descriptor.section,'.rdata');
  const captures=new DataView(descriptor.bytes.buffer,descriptor.bytes.byteOffset).getUint32(ClosureDescriptor.captures,true);
  assert.equal(descriptor.bytes.length,ClosureDescriptor.entries+4*captures);
 }
 const sites=program.fragments.filter(f=>/^site\.\d+$/.test(f.name));
 assert.ok(sites.length>=3);
 for(const site of sites){
  const argc=new DataView(site.bytes.buffer,site.bytes.byteOffset).getUint32(CallSiteDescriptor.argc,true);
  assert.ok([0,4].includes(site.bytes.length-(CallSiteDescriptor.entries+4*argc)),'operands and an optional new.target');
 }
 assert.ok(user.some(f=>f.fixups.some(x=>x.target==='rt.newClosure')));
 assert.ok(user.some(f=>f.fixups.some(x=>x.target.startsWith('rt.invokeSite'))));
 assert.ok(user.some(f=>f.fixups.some(x=>x.target.startsWith('rt.constructSite'))));
});

test('closures created through descriptors keep their flags, captures and metadata',()=>agree(String.raw`
'use strict';
const out=[];
function make(a,b){let c=a+b;const fns=[()=>a+c,function named(x,y){return x*b+c},async function af(p,q=1){return a},function*gen(){yield b;yield c},async function*ag(){yield a}];c++;return fns;}
const [arrow,named,af,gen,ag]=make(2,3);
out.push(arrow(),named(10),named.name,named.length,af.length,af.name,typeof af().then,[...gen()].join(),gen.name);
out.push(Object.getPrototypeOf(af)===Object.getPrototypeOf(async function(){}),Object.getPrototypeOf(gen)===Object.getPrototypeOf(function*(){}));
out.push('prototype' in arrow,'prototype' in named,'prototype' in af,'prototype' in gen,named.prototype.constructor===named);
for(const f of [arrow,af,gen,ag,{m(){}}.m]){try{new f();out.push('constructed')}catch(e){out.push(e instanceof TypeError)}}
out.push(named.toString(),arrow.toString(),String(gen));
class A{constructor(x){this.x=x}m(){return this.x}static s(){return 's'}get v(){return 7}set v(n){this.y=n}['comp'+1](){return 'c'}}
class B extends A{constructor(){super(5);this.f=()=>super.m()+this.x;this.nt=(()=>new.target===B)()}m(){return super.m()*2}}
const b=new B();b.v=9;
out.push(b.m(),b.f(),A.s(),b.v,b.y,b.comp1(),b.comp1.name,b.nt,A.prototype.m.name,Object.getOwnPropertyDescriptor(A.prototype,'v').get.name);
try{A()}catch(e){out.push(e instanceof TypeError)}
const key=Symbol('sym');
const o={k(){return super.hasOwnProperty('k')},['n'+2]:function(){},[key]:()=>1,get ['g'+'et'](){return 1}};
out.push(o.k(),o.n2.name,o[key].name);
const counters=[];for(let i=0;i<5;i++)counters.push(()=>i*i);
out.push(counters.map(f=>f()).join());
function thisArrow(){return (()=>this&&this.v)()}
out.push(thisArrow.call({v:4}),thisArrow.call(undefined));
let made=0;for(let i=0;i<300;i++){const h=(y=>z=>y+z+i)(i);made+=h(1)}
out.push(made);
Promise.resolve().then(async()=>{out.push(await af(1));for await(const v of ag())out.push('ag',v);console.log(out.join(';'))});
`));

test('general calls through site descriptors pass callee, receiver, arguments and new.target',()=>agree(String.raw`
'use strict';
const out=[];
const f=(...xs)=>xs.length+':'+xs.join();
const call=[f][0];
out.push(call(),call(1),call(1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20));
const o={v:1,m(a,b){return this.v+a+b}};const m=o.m;
out.push(o.m(2,3),o['m'](4,5),m.call({v:10},1,1),m.apply({v:20},[1,2]),m.bind({v:30},1)(2));
function Ctor(a,b){this.s=a+b;this.nt=new.target===Ctor}
const C=[Ctor][0];
out.push(JSON.stringify(new C(1,2)),JSON.stringify(Reflect.construct(C,[3,4])));
class P{constructor(x){this.x=x;this.t=new.target.name}}class Q extends P{constructor(){super(7)}}
const K=[Q][0];out.push(JSON.stringify(new K()));
const proxy=new Proxy(function(a){return a*2},{apply(t,thisArg,args){return 'proxied:'+t(...args)}});
out.push(proxy(21));
for(const bad of [undefined,null,1,'s',{}]){try{bad();out.push('called')}catch(e){out.push(e instanceof TypeError)}}
try{new (()=>1)()}catch(e){out.push('arrow',e instanceof TypeError)}
function sloppyThis(){return this}
out.push(typeof [sloppyThis][0]());
function even(n){return n===0?true:odd(n-1)}function odd(n){return n===0?false:even(n-1)}
const pick=[even][0];out.push(pick(1001));
const tail=n=>n===0?'tail done':tail2(n-1);const tail2=n=>tail(n);
out.push(tail(3000));
function throws(){throw new Error('boom')}
try{[throws][0](1,2)}catch(e){out.push(e.message)}
let acc=0;const add=(a,b)=>a+b;const fns=[add];for(let i=0;i<500;i++)acc=fns[0](acc,i);
out.push(acc);
console.log(out.join(';'));
`));

test('call sites without gcStress',()=>agree(String.raw`
const add=(a,b)=>a+b;const fns=[add,(a,b)=>a*b];let s=0;
for(let i=0;i<100000;i++){const g=fns[i&1];s=(s+g(i,3)+[x=>x][0](i))%1000003}
console.log(s);
`,false));
