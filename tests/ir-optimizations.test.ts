import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost} from './helpers/host.js';
import {runOracle} from './helpers/oracle.js';
import {compileToIR} from '../src/compiler.js';

// IR clean-up after lowering (roadmap item 15): dead-zone checks of
// initialized bindings, copy forwarding, operations on proven Numbers,
// compare-and-branch fusion and the clearing/safepoint rules for blocks of
// inline operations. Every program runs under GC stress against Node.js.
const agree=(source:string)=>{
 const run=runOnHost(source);
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,runOracle(source).stdout);
};

test('dead-zone checks stay where a binding may be uninitialized',()=>agree(String.raw`
const out=[];
function early(){try{x;}catch(e){out.push(e.name)}let x=1;return x}
function inLoop(){for(let i=0;i<3;i++){try{if(i===1)y;}catch(e){out.push('loop '+i+' '+e.name)}}let y=2;return y}
function closure(){const read=()=>z;try{read()}catch(e){out.push('closure '+e.name)}let z=3;return read()}
function sw(k){switch(k){case 0:let v=1;return v;case 1:try{return v}catch(e){return e.name}}}
function* gen(){try{yield w}catch(e){out.push('gen '+e.name)}let w=4;yield w}
function caught(){let a;try{a=1;throw 0}catch(e){return a+1}}
out.push(early(),inLoop(),closure(),sw(0),sw(1),[...gen()].join(),caught());
let late;try{late=topLevel}catch(e){late=e.name}let topLevel=5;out.push(late,topLevel);
console.log(out.join('|'));
`));

test('Number operations keep JavaScript semantics when types change',()=>agree(String.raw`
const out=[];
function sum(n){let s=0;for(let i=0;i<n;i++)s=s+i;return s}
function change(){let s=0;for(let i=0;i<5;i++){s=s+i;if(i===2)s=String(s)}return s}
function big(){let b=1n;for(let i=0;i<3;i++)b=b*2n;return b}
function obj(){let o={valueOf(){return 7}};let t=0;for(let i=0;i<2;i++)t=t+o;return t}
function nan(){let x=NaN,r=[];r.push(x<1,x>1,x<=x,x>=x,x==x,x===x,x!=x,x!==x);let i=0;while(i!=3)i++;r.push(i);return r.join()}
function zero(){let z=-0;let c=0;for(;z<1;z++)c++;return Object.is(-0*1,-0)+' '+c+' '+(1/(-0+0))}
function updates(){let s='1';s++;let t='a';t++;let u=2**53;u++;let d=0.1;d+=0.2;let m=5;m--;return [s,t,u,d,m,-m].join()}
function float(){let f=0;for(let i=0;i<10;i++)f=f+0.1;return f}
out.push(sum(100),change(),String(big()),obj(),nan(),zero(),updates(),float());
console.log(out.join('|'));
`));

test('forwarded copies observe every later write',()=>agree(String.raw`
const out=[];
function swap(){let a=1,b=2;let t=a;a=b;b=t;return a+','+b}
function snapshot(){let a=1;const b=a;a=2;return b+','+a}
function mapped(x){const before=x;arguments[0]=9;return before+','+x}
function strictArgs(x){'use strict';const before=x;arguments[0]=9;return before+','+x}
function destructure(){let a=1,b=2;[a,b]=[b,a];return a+','+b}
function selfRef(){let s=1;s=s+s;s=s*s+s;return s}
function viaTry(){let v=1;try{v=2;throw 0}catch(e){v=v+1}finally{v=v*10}return v}
function closures(){let n=0;const inc=()=>{n=n+1};for(let i=0;i<3;i++)inc();return n}
out.push(swap(),snapshot(),mapped(1),strictArgs(1),destructure(),selfRef(),viaTry(),closures());
console.log(out.join('|'));
`));

test('a counting loop compiles to inline Number operations',()=>{
 const ir=compileToIR('function run(n){let s=0;for(let i=0;i<n;i++)s=s+i;return s}');
 const fn=ir.functions.find(f=>f.name==='run')!;
 const ops=fn.blocks.flatMap(block=>block.operations);
 assert.equal(ops.filter(op=>op.kind==='checkInitialized').length,0);
 const add=ops.find(op=>op.kind==='binary'&&op.operator==='+');
 assert.ok(add&&add.kind==='binary'&&add.numeric,'s + i is a Number addition');
 assert.ok(ops.some(op=>op.kind==='unary'&&op.operator==='increment'&&op.numeric),'i++ is a Number increment');
 // The parameter n is not known to be a Number, so i < n is not marked.
 assert.ok(ops.some(op=>op.kind==='binary'&&op.operator==='<'&&!op.numeric));
});
