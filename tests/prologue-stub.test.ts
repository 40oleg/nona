import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost} from './helpers/host.js';
import {runOracle} from './helpers/oracle.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {FrameDescriptor} from '../src/runtime/frame-layout.js';

// Issue #167: every compiled function starts with `lea r10,[descriptor]; call
// rt.enterFrame` instead of an inline prologue, and the safepoint at the start
// of a block tests one flag (rt.gcNeeded) that the allocator raises.
const agree=(source:string,gcStress=true)=>{
 const run=runOnHost(source,{gcStress});
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,runOracle(source).stdout);
};

test('functions share one prologue stub and keep a short inline prologue',()=>{
 const program=generate(compileToIR('function f(a,b){return a+b}class A{constructor(x){this.x=x}}class B extends A{constructor(){super(1)}}console.log(f(1,2),new B().x)'));
 assert.equal(program.fragments.filter(f=>f.name==='rt.enterFrame').length,1);
 const functions=program.fragments.filter(f=>f.section==='.text'&&/^js\.(fn\.\d+|main)$/.test(f.name));
 assert.ok(functions.length>=4);
 for(const fragment of functions){
  const descriptor=program.fragments.find(f=>f.name===fragment.name+'.frame');
  assert.ok(descriptor&&descriptor.section==='.rdata'&&descriptor.bytes.length===FrameDescriptor.size,fragment.name+' has a frame descriptor');
  assert.ok(fragment.fixups.some(f=>f.target==='rt.enterFrame'),fragment.name+' calls the stub');
  const firstBlock=Math.min(...Object.entries(fragment.symbols).filter(([s])=>/\.block\.\d+$/.test(s)).map(([,o])=>o));
  // lea (7) + call (5); a derived constructor adds its this cell.
  assert.ok(firstBlock<=12+40,`${fragment.name} prologue is ${firstBlock} bytes`);
 }
 const unwind=program.functions.find(f=>f.begin==='js.main')!;
 assert.equal(unwind.prologSize,12);assert.ok(unwind.stackAllocation>=240);
});

test('parameters, this and new.target reach their slots through the shared prologue',()=>agree(String.raw`
const out=[];
function f(a,b,c){return [a,b,c,arguments.length].join()}
out.push(f(),f(1),f(1,2),f(1,2,3),f(1,2,3,4,5));
function g(a=1,b=a*2){return a+b}
out.push(g(),g(5),g(undefined,7));
function sloppy(){return this===globalThis}
function strict(){'use strict';return this===undefined}
out.push(sloppy(),strict(),sloppy.call(1)===false,strict.call(1));
const o={v:3,m(x){return this.v*x},arrow(){return (y=>this.v+y)(1)}};
out.push(o.m(2),o.arrow());
function Ctor(x){this.x=x;this.nt=new.target===Ctor}
out.push(JSON.stringify(new Ctor(4)),Ctor.call({},5)===undefined);
class A{constructor(x,y){this.s=x+y}}
class B extends A{constructor(x){super(x,x);this.t=()=>this.s}}
out.push(new B(3).t(),new B().s!==new B().s);
function* gen(a,b){yield a;yield b;yield arguments.length}
out.push([...gen(1)].join(),[...gen(1,2,3)].join());
async function af(a,b=a*2){return a+b}
af(2).then(v=>out.push('async',v));
function rest(a,...r){return a+':'+r.join('|')}
out.push(rest(1),rest(1,2,3));
function rec(n){return n===0?0:1+rec(n-1)}
out.push(rec(200));
Promise.resolve().then(()=>console.log(out.join(';')));
`));

test('the stub turns stack overflow into a RangeError',()=>agree(String.raw`
function rec(n){return n===0?0:1+rec(n-1)}
console.log(rec(5000));
try{(function deep(n){return deep(n+1)+1})(0)}catch(e){console.log(e instanceof RangeError,e.message)}
try{(function deepArrow(){const d=()=>d();d()})()}catch(e){console.log(e instanceof RangeError)}
class A{constructor(){this.x=1}}class B extends A{constructor(){super();new B()}}
try{new B()}catch(e){console.log(e instanceof RangeError)}
`,false));

test('large frames are probed page by page',()=>{
 // 300 locals: more than fit in one 4 KiB page of 16-byte slots, with gcStress and without.
 const names=Array.from({length:300},(_,i)=>'v'+i);
 const source=`function big(a,b){let ${names.map((n,i)=>`${n}=a+${i}`).join(',')};let s=0;${names.map(n=>`s+=${n}`).join(';')};return s+b}
let total=0;for(let i=0;i<10;i++)total+=big(i,1);console.log(total,big(1),big());
function deepBig(n){let ${names.slice(0,260).map((v,i)=>`${v}=n+${i}`).join(',')};return n===0?${names[259]}:deepBig(n-1)+${names[0]}}
console.log(deepBig(30));`;
 const overflow=`${source}
try{(function f(n){let ${names.slice(0,260).map((v,i)=>`${v}=n+${i}`).join(',')};return f(n+1)+${names[259]}})(0)}catch(e){console.log(e instanceof RangeError,e.message)}`;
 // Overflowing the stack with large frames collects at every frame under
 // gcStress: too slow for the stress run, which keeps the deep recursion.
 agree(overflow,false);agree(source,true);
});

test('loops that only allocate reach the collector through the block safepoint flag',()=>{
 // No calls inside the loop: only the flag test at the block starts can
 // trigger a collection, and without one 64 MB of garbage would stay live.
 const source=String.raw`
let keep=null;
for(let i=0;i<400000;i++){const o={index:i,text:'item'+i,list:[i,i+1,i+2]};if(i%100000===0)keep=o;}
const used=process.memoryUsage().heapUsed;
console.log(keep.index,used<40*1024*1024?'bounded':'unbounded '+used);
`;
 const run=runOnHost(source,{gcStress:false});
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,'300000 bounded\n');
});
