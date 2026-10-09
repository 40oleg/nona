import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost} from './helpers/host.js';
import {runOracle} from './helpers/oracle.js';
import {compileToIR} from '../src/compiler.js';
import {generate} from '../src/backend/x64/codegen.js';
import {StackMapTable as M} from '../src/runtime/stack-maps.js';

// Issue #165: the collector scans the slots a function's stack map lists for
// its current call instead of every slot, and the generated code no longer
// clears dead slots before every operation that reaches the runtime.
const agree=(source:string,gcStress=true)=>{
 const run=runOnHost(source,{gcStress});
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,runOracle(source).stdout);
};

test('every function has a sorted stack map table that its frame descriptor references',()=>{
 const program=generate(compileToIR('function f(a){const x={a};const y=[x];const z=String(y.length);return z+a}\nconsole.log(f(1),f(2))'));
 const functions=program.fragments.filter(f=>f.section==='.text'&&/^js\.(fn\.\d+|main)$/.test(f.name));
 assert.ok(functions.length>=2);
 for(const fragment of functions){
  const table=program.fragments.find(f=>f.name===fragment.name+'.maps');
  assert.ok(table,fragment.name+' has a table');
  assert.equal(table.fixups[0]!.target,fragment.name);
  const descriptor=program.fragments.find(f=>f.name===fragment.name+'.frame')!;
  assert.ok(descriptor.fixups.some(f=>f.target===fragment.name+'.maps'),'the frame descriptor points at the table');
  const view=new DataView(table.bytes.buffer,table.bytes.byteOffset),count=view.getUint32(M.count,true),width=table.bytes[M.fieldWidth]!;
  assert.ok(count>0&&(width===2||width===4));
  let previous=-1;const calls=fragment.fixups.filter(f=>f.kind==='rel32'&&!f.target.startsWith(fragment.name+'$')&&!f.target.startsWith('literal.')&&!f.target.startsWith('constant.')).length;
  for(let i=0;i<count;i++){
   const offset:number=width===2?view.getUint16(M.entries+2*width*i,true):view.getUint32(M.entries+2*width*i,true);
   assert.ok(offset>previous&&offset<=fragment.bytes.length,'sorted offsets inside the function');previous=offset;
  }
  assert.ok(count<=calls,'at most one entry per call');
 }
 // f's temporaries die one after the other: some map lists fewer locations than another.
 const f=program.fragments.find(f=>f.name==='js.fn.0.maps')!,view=new DataView(f.bytes.buffer,f.bytes.byteOffset);
 const count=view.getUint32(M.count,true),width=f.bytes[M.fieldWidth]!,bitmapBytes=f.bytes[M.bitmapBytes]!,base=M.entries+2*width*count;
 const popcounts=new Set<number>();
 for(let at=base;at<f.bytes.length;at+=bitmapBytes){let bits=0;for(let b=0;b<bitmapBytes;b++)bits+=f.bytes[at+b]!.toString(2).split('1').length-1;popcounts.add(bits);}
 assert.ok(popcounts.size>1,'maps differ in the slots they list: '+[...popcounts].join());
});

test('dead temporaries do not keep their objects alive',()=>{
 // Each iteration's `t` dies at the end of the body; without stack maps (or
 // the clearing they replace) 2000 × 8 KB arrays would stay reachable.
 const source=String.raw`
function make(i){return {big:new Array(1000).fill(i)}}
let n=0;
for(let i=0;i<4000;i++){const t=make(i);n+=t.big.length;const u=make(i+1);n+=u.big[3];}
const used=process.memoryUsage().heapUsed;
console.log(n,used<24*1024*1024?'bounded':'unbounded '+used);
`;
 const run=runOnHost(source,{gcStress:false});
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,'12002000 bounded\n');
});

test('live values survive collections at every operation: calls, handlers, generators, async',()=>agree(String.raw`
const out=[];
function build(n){const o={n,s:'v'+n};const a=[o,{m:n*2}];if(n>0)a.push(build(n-1));return a}
const tree=build(6);out.push(JSON.stringify(tree).length);
function withHandlers(x){
 const before={x};let r='';
 try{const inner={y:x+1};if(x>2)throw new Error('e'+inner.y);r=inner.y+':'+before.x}
 catch(e){const after={z:e.message};r=after.z+':'+before.x}
 finally{r+='|'+before.x}
 return r;
}
out.push(withHandlers(1),withHandlers(5));
function* gen(a){const held={a,list:[a,a+1]};yield held.list.length;const more={b:a*2};yield held.a+more.b;const last={c:[held,more]};yield last.c.length}
out.push([...gen(3)].join());
async function af(a){const held={a};await null;const more=[held,{b:a}];await null;return more.length+held.a}
af(4).then(v=>out.push('async',v));
const results=[1,2,3].map(function(v){const tmp={v,sq:v*v};return [tmp.sq,this.k].join('/')},{k:'K'});
out.push(results.join());
class P{constructor(v){this.v={inner:v}}get w(){return this.v.inner}}
class Q extends P{constructor(v){const pre={v};super(pre.v*2);this.q=()=>this.w+pre.v}}
out.push(new Q(5).q());
let acc=0;for(const [k,v] of Object.entries({a:1,b:2,c:3})){const e={k,v};acc+=e.v+e.k.length}
out.push(acc);
Promise.resolve().then(()=>console.log(out.join(';')));
`));

test('a destination that was dead before its operation is reset, not scanned stale',()=>agree(String.raw`
// Each temporary location is reused by many later operations; the runtime
// writes into it while collections run before every operation.
const out=[];
function churn(n){
 let s=0;
 for(let i=0;i<n;i++){
  const a={i};const b=[a,a];const c=String(b.length)+a.i;s+=c.length;
  const d=new Map([[c,b]]);s+=d.size;const e=d.get(c)[1].i;s+=e;
  const f=Object.keys(a).concat([String(e)]);s+=f.length;
 }
 return s;
}
out.push(churn(30));
function nested(k){if(k===0)return {leaf:true};const child=nested(k-1);const wrap={child,k};return wrap}
out.push(JSON.stringify(nested(8)).length);
console.log(out.join(';'));
`));
