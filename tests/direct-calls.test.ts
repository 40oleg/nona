import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";
import { compileToIR } from "../src/compiler.js";

// Direct calls (roadmap item 16): a call to a function declaration known at
// compile time checks that the callee still runs that code and then calls it
// without rt.invoke. Every other callee must behave exactly as before.
const agree = (source: string) => {
    const run = runOnHost(source);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
};

test("calls to known declarations keep this, arguments and reassignment semantics", () =>
    agree(String.raw`
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

test("a primitive receiver of a sloppy function is boxed through the general path", () =>
    agree(String.raw`
function kind(){return typeof this+':'+(this instanceof Number)}
Number.prototype.kind=kind;
function strictKind(){'use strict';return typeof this}
Number.prototype.strictKind=strictKind;
console.log((5).kind(),(5).strictKind(),kind.call('s'),strictKind.call(7));
`));

test("calls to declarations are annotated, other callees are not", () => {
    const ir = compileToIR(
        "function f(x){return x+1}const g=x=>x;function* h(){}let s=0;for(let i=0;i<3;i++){s=f(s);g(1);h()}",
    );
    const invokes = ir.functions
        .flatMap((fn) => fn.blocks.flatMap((block) => block.operations))
        .filter((op) => op.kind === "invoke");
    assert.ok(
        invokes.some(
            (op) =>
                op.kind === "invoke" &&
                op.direct === "js.fn.0" &&
                op.directStrict === false,
        ),
        "f",
    );
    assert.ok(
        invokes.some(
            (op) =>
                op.kind === "invoke" &&
                op.direct !== undefined &&
                op.direct !== "js.fn.0",
        ),
        "an arrow without this is direct",
    );
    assert.equal(
        invokes.filter((op) => op.kind === "invoke" && op.direct !== undefined)
            .length,
        2,
        "generators are not direct",
    );
});

// #47: a callee that reads neither this nor new.target gets the lean
// prologue and no receiver; a call that passes exactly the parameters enters
// at `<id>.direct` (an inline prologue).
test("direct calls mark callees without this and exact arity", () => {
    const ir = compileToIR(
        "function f(a,b){return a+b}function t(){return this}const g=()=>this;const h=x=>x;f(1,2);f(1);t();g();h(1);",
    );
    const invokes = ir.functions
        .flatMap((fn) => fn.blocks.flatMap((block) => block.operations))
        .filter((op) => op.kind === "invoke");
    const byTarget = (target: string) =>
        invokes.filter((op) => op.kind === "invoke" && op.direct === target);
    const f = byTarget("js.fn.0");
    assert.equal(f.length, 2);
    assert.ok(f.every((op) => op.kind === "invoke" && op.directNoThis));
    assert.deepEqual(
        f.map((op) => op.kind === "invoke" && !!op.directEntry),
        [true, false],
    );
    const t = byTarget("js.fn.1");
    assert.equal(t.length, 1);
    assert.ok(t[0]!.kind === "invoke" && !t[0]!.directNoThis);
    assert.ok(
        ir.functions.find((fn) => fn.id === "js.fn.0")!.directEntry,
        "f has a direct entry",
    );
    // The arrow that reads its lexical this is not direct.
    assert.equal(
        invokes.filter((op) => op.kind === "invoke" && op.direct).length,
        4,
    );
});

test("lean and exact-arity direct calls keep call semantics", () =>
    agree(String.raw`
'use strict';
const out=[];
function add(a,b){return a+b}
out.push(add(1,2),add(1),add(1,2,3),String(add()));
function usesThis(a){return typeof this+':'+a}
function usesArgs(a,b){return arguments.length+':'+[...arguments].join(',')}
function usesTarget(a){return (new.target===undefined)+':'+a}
out.push(usesThis(1),usesThis.call({},2),usesThis.apply(5,[3]),usesArgs(1,2),usesArgs(1),usesArgs(1,2,3),
  usesArgs.call(null,4,5),usesArgs.apply(null,[6]),usesTarget(1),String(new usesTarget(2) instanceof usesTarget));
function lean(a,b){return [a,b].join('/')}
out.push(lean.call('x',1,2),lean.apply(null,[3]),lean(4,5,6));
const o={m:lean,t:usesThis};out.push(o.m(7,8),o.t(9));
function rec(n,acc){return n===0?acc:rec(n-1,acc+n)}out.push(rec(3000,0));
function fact(n){if(n<2)return 1;return n*fact(n-1)}out.push(fact(20));
function thrower(a,b){if(a>b)throw new RangeError('bad '+a);return b}
let caught=0;for(let i=0;i<10;i++){try{thrower(i,5)}catch(e){caught++;if(!(e instanceof RangeError))throw e}}
out.push(caught);
function many(a,b){let c=a*2,d=b*3,e=c+d,f=e*e,g=[a,b,c,d,e,f];return g.join(',')}
out.push(many(1,2),many(3));
const arrow=(x,y)=>x+y;out.push(arrow(1,2),arrow(1));
function make(k){return function(x){return x+k}}
const p=make(1),q=make(10);out.push(p(1),q(1));
function deep(n){return n===0?0:1+deep(n-1)}
try{deep(1e7);out.push('no overflow')}catch(e){out.push(e instanceof RangeError)}
console.log(out.join('|'));
`));

test("sloppy lean and this-reading direct callees", () =>
    agree(String.raw`
const out=[];
function sloppyThis(a){return (this===globalThis)+':'+a}
function lean(a){return a*2}
out.push(sloppyThis(1),sloppyThis.call(undefined,2),sloppyThis.call(3,3).length,lean(4));
function outer(){
  function inner(a,b){return a-b}
  let s=0;for(let i=0;i<100;i++)s=inner(s,i);
  function shadow(){return 'outer'}
  {function shadow(){return 'block'}out.push(shadow())}
  return s;
}
out.push(outer());
function re(){return 'first'}
out.push(re());re=function(a){return 'second'+a};out.push(re(1));
function arrowsInside(a){const f=()=>this;return f()===undefined||f()===globalThis?'g:'+a:'o'}
out.push(arrowsInside(1),arrowsInside.call({},2));
try{tdz(1)}catch(e){out.push(e.constructor.name)}
const tdz=x=>x+1;out.push(tdz(1));
console.log(out.join('|'));
`));

test("direct calls with tail calls, allocation and large frames", () =>
    agree(String.raw`
'use strict';
const out=[];
function even(n){return n===0?true:odd(n-1)}
function odd(n){return n===0?false:even(n-1)}
out.push(even(1001),odd(7));
function alloc(a,b){const x={a,b,list:[a,b,String(a)+b]};return x}
let total=0;for(let i=0;i<2000;i++){const r=alloc(i,i+1);total+=r.list.length+r.a}
out.push(total);
function big(a,b){const t=[];${Array.from({ length: 300 }, (_, i) => `let v${i}=a+${i};t.push(v${i});`).join("")}return t.length+b}
out.push(big(1,2),big(1));
console.log(out.join('|'));
`));
