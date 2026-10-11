import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost} from './helpers/host.js';
import {runOracle} from './helpers/oracle.js';
import {compileToIR} from '../src/compiler.js';
import type {FunctionIR,Operation} from '../src/ir/model.js';

// Number facts (src/ir/numbers.ts; #146 item 15): operators whose result is
// always a Number (or that throw), and `typeof x === 'number'` guards on
// branch edges. Programs run under GC stress against Node.js; the IR checks
// confirm which operations became inline Number operations.
const agree=(source:string)=>{
 const run=runOnHost(source);
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,runOracle(source).stdout);
};
const fn=(source:string,name:string):FunctionIR=>compileToIR(source).functions.find(f=>f.name===name)!;
const binaries=(f:FunctionIR,operator:string)=>f.blocks.flatMap(block=>block.operations).filter((op):op is Extract<Operation,{kind:'binary'}>=>op.kind==='binary'&&op.operator===operator);

test('Number results and typeof guards keep JavaScript semantics',()=>agree(String.raw`
const out=[];
const show=v=>typeof v==='number'&&Object.is(v,-0)?'-0':typeof v+':'+String(v);
function guarded(x){if(typeof x!=='number')return 'no';return x*2+1}
function positive(x){if(typeof x==='number'){const y=x+0.5;return y*y}return 'other'}
function reassigned(x){if(typeof x==='number'){x=String(x)}return x+1}
function inLoop(xs){let s=0;for(const x of xs){if(typeof x!=='number')continue;s=s+x}return s}
function afterGuardChange(x){if(typeof x!=='number')return 0;x=x+'';return x+1}
function unsigned(x){const u=x>>>0;return u+1}
function minus(x){const y=x-1;return y*y}
function plus(x){const y=+x;return y+y}
function times(x){const y=x*1;return y+'!'}
function bits(x){const y=x|0,z=~y;return y+z}
function mod(x){const r=x%3;return r+r}
function pow(x){const p=x**2;return p+1}
const objects=[{valueOf(){return 4}},{valueOf(){return '4'}},{toString(){return '7'}}];
const inputs=[3,-0,NaN,Infinity,'5','x',null,undefined,true,[],[2],...objects];
for(const f of [guarded,positive,reassigned,afterGuardChange,unsigned,minus,plus,times,bits,mod,pow])out.push(f.name+' '+inputs.map(v=>show(f(v))).join());
out.push(inLoop([1,'2',3,null,4.5]));
for(const f of [unsigned,minus,plus,bits,mod,pow,times]){
 for(const bad of [1n,Symbol('s'),{valueOf(){return 2n}}]){try{out.push(show(f(bad)))}catch(e){out.push(f.name+' '+e.name)}}
}
console.log(out.join('\n'));
`));

test('operations on guarded and Number-producing values are inline Number operations',()=>{
 const guarded=fn('function guarded(x){if(typeof x!=="number")return 0;return x*2+1}','guarded');
 assert.ok(binaries(guarded,'*').every(op=>op.numeric),'x*2 after the guard');
 assert.ok(binaries(guarded,'+').every(op=>op.numeric));
 const unsigned=fn('function unsigned(x){const u=x>>>0;return u+1}','unsigned');
 assert.ok(binaries(unsigned,'+')[0]!.numeric,'x>>>0 is a Number');
 const minus=fn('function minus(x){const y=x-1;return y*y}','minus');
 assert.ok(!binaries(minus,'-')[0]!.numeric,'x-1 itself keeps its generic code');
 assert.ok(binaries(minus,'*')[0]!.numeric,'its result is a Number');
});

test('values that may be strings, BigInts or reassigned are not Numbers',()=>{
 const sum=fn('function sum(x){const y=x+1;return y*2}','sum');
 assert.ok(!binaries(sum,'*')[0]!.numeric,'x+1 may be a string');
 const big=fn('function big(x){const y=-x;return y*2}','big');
 assert.ok(!binaries(big,'*')[0]!.numeric,'-x may be a BigInt');
 const reassigned=fn('function reassigned(x){if(typeof x==="number"){x=String(x)}return x+1}','reassigned');
 assert.ok(!binaries(reassigned,'+')[0]!.numeric);
 const other=fn('function other(x){if(typeof x==="string")return x*2;return 0}','other');
 assert.ok(!binaries(other,'*')[0]!.numeric,'only typeof "number" makes a Number');
 const wrongEdge=fn('function wrongEdge(x){if(typeof x==="number")return 0;return x*2}','wrongEdge');
 assert.ok(!binaries(wrongEdge,'*')[0]!.numeric,'x is not a Number where the test failed');
});
