import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runOnHost} from './helpers/host.js';
import {runOracle} from './helpers/oracle.js';
import {compileToIR} from '../src/compiler.js';

// Direct calls (roadmap item 16): a call to a function declaration known at
// compile time checks that the callee still runs that code and then calls it
// without rt.invoke. Every other callee must behave exactly as before.
const agree=(source:string)=>{
 const run=runOnHost(source);
 assert.equal(run.status,0,run.stderr);
 assert.equal(run.stdout,runOracle(source).stdout);
};

test('calls to known declarations keep this, arguments and reassignment semantics',()=>agree(String.raw`
const out=[];
function add(a,b){return a+b}
function sloppyThis(){return this===globalThis}
function strictThis(){'use strict';return this}
function args(){return arguments.length+':'+Array.prototype.join.call(arguments,',')}
function fib(n){return n<2?n:fib(n-1)+fib(n-2)}
function rec(n){'use strict';if(n===0)return 'done';return rec(n-1)}
out.push(add(1,2),add('a','b'),add(1),sloppyThis(),String(strictThis()),args(1,2,3),args(),fib(15),rec(5000));
const o={m:sloppyThis,s:strictThis};out.push(o.m(),o.s()===o);
function swap(){return 'first'}
out.push(swap());
swap=function(){return 'second'};out.push(swap());
globalThis.add=(a,b)=>a*b;out.push(add(3,4));
function bound(){return this.v}
bound=bound.bind({v:'bound'});out.push(bound());
function* gen(){yield 1}out.push([...gen()].join());
function outer(){function inner(x){return x*2}let t=0;for(let i=0;i<5;i++)t=t+inner(i);return t}
out.push(outer());
function thrower(){throw new Error('boom')}try{thrower()}catch(e){out.push(e.message)}
console.log(out.join('|'));
`));

test('a primitive receiver of a sloppy function is boxed through the general path',()=>agree(String.raw`
function kind(){return typeof this+':'+(this instanceof Number)}
Number.prototype.kind=kind;
function strictKind(){'use strict';return typeof this}
Number.prototype.strictKind=strictKind;
console.log((5).kind(),(5).strictKind(),kind.call('s'),strictKind.call(7));
`));

test('calls to declarations are annotated, other callees are not',()=>{
 const ir=compileToIR('function f(x){return x+1}const g=x=>x;function* h(){}let s=0;for(let i=0;i<3;i++){s=f(s);g(1);h()}');
 const invokes=ir.functions.flatMap(fn=>fn.blocks.flatMap(block=>block.operations)).filter(op=>op.kind==='invoke');
 assert.ok(invokes.some(op=>op.kind==='invoke'&&op.direct==='js.fn.0'&&op.directStrict===false),'f');
 assert.equal(invokes.filter(op=>op.kind==='invoke'&&op.direct!==undefined).length,1,'arrows and generators are not direct');
});
