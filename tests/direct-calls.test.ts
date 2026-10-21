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
console.log(out.join('|'));
`));

// GC stress collects before every operation, so a recursion as deep as the
// stack limit (~27000 frames) costs a collection per operation over a stack of
// that depth: more than two minutes (#434). The overflow itself is checked
// without gcStress; the frame walk of deep stacks is covered by rec(3000, 0).
test("lean direct calls overflow the stack with a RangeError", () => {
    const source = String.raw`
function deep(n){return n===0?0:1+deep(n-1)}
const out=[deep(1000)];
try{deep(1e7);out.push('no overflow')}catch(e){out.push(e instanceof RangeError)}
console.log(out.join('|'));
`;
    const run = runOnHost(source, { gcStress: false });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
});

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

// Captured function declarations (#239): a cell that only its declaration
// writes is read with the declaration's code label, and calls through it are
// direct.
const operations = (source: string) =>
    compileToIR(source).functions.flatMap((fn) =>
        fn.blocks.flatMap((block) =>
            block.operations.map((op) => ({ fn: fn.id, op })),
        ),
    );
const directCalls = (source: string, fn?: string) =>
    operations(source).filter(
        ({ fn: id, op }) =>
            op.kind === "invoke" &&
            op.direct !== undefined &&
            (fn === undefined || id === fn),
    );

test("calls to captured function declarations are annotated", () => {
    const source =
        "(function(){function h(x){return x+1}function s(x){'use strict';return x}" +
        "function u(a){return h(a)+s(a)}function n(){return function(){return h(1)}}" +
        "console.log(u(1),n()())})()";
    const ops = operations(source);
    // js.fn.0: the IIFE; h, s, u, n are js.fn.1-4, the inner function js.fn.5.
    for (const fn of ["js.fn.3", "js.fn.5"])
        assert.ok(
            ops.some(
                ({ fn: id, op }) =>
                    id === fn &&
                    op.kind === "readCell" &&
                    op.function === "js.fn.1",
            ),
            `readCell of h in ${fn}`,
        );
    const calls = (fn: string) =>
        ops
            .filter(({ fn: id, op }) => id === fn && op.kind === "invoke")
            .map(({ op }) =>
                op.kind === "invoke"
                    ? `${op.direct ?? "-"}:${op.directStrict ?? "-"}`
                    : "",
            );
    assert.deepEqual(calls("js.fn.3"), ["js.fn.1:false", "js.fn.2:true"]);
    assert.deepEqual(calls("js.fn.5"), ["js.fn.1:false"]);
});

test("captured bindings that something else may write stay generic", () => {
    const cases: Record<string, string> = {
        "reassigned in the owner":
            "(function(){function h(){return 1}function u(){return h()}h=function(){return 2};return u()})()",
        "reassigned in a closure":
            "(function(){function h(){return 1}function u(){return h()}function w(){h=null}return u()})()",
        "var initializer":
            "(function(){function h(){return 1}function u(){return h()}var h=3;return u()})()",
        "for-of var head":
            "(function(){function h(){return 1}function u(){return h()}for(var h of [function(){return 2}]);return u()})()",
        "for-of var pattern head":
            "(function(){function h(){return 1}function u(){return h()}for(var [h] of [[function(){return 2}]]);return u()})()",
        "for-in var head":
            "(function(){function h(){return 1}function u(){return h()}for(var h in {a:1});return typeof u})()",
        "assigned through eval":
            "(function(){function h(){return 1}function u(){return h()}eval('h = function(){return 2}');return u()})()",
        "eval var declaration":
            "(function(){function h(){return 1}function u(){eval('var h = 2');return h}return u()})()",
        "read inside with":
            "(function(o){function h(){return 1}function u(){with(o){return h()}}return u()})({})",
        "declared in a with body":
            "(function(o){with(o){function h(){return 1}}function u(){return h()}return u()})({})",
        "Annex B block function":
            "(function(){function h(){return 1}function u(){return h()}{function h(){return 2}}return u()})()",
        "duplicate declarations":
            "(function(){function h(){return 1}function h(){return 2}function u(){return h()}return u()})()",
        "generator and async":
            "(function(){function* h(){}async function a(){}function u(){h();a()}return u()})()",
    };
    for (const [name, source] of Object.entries(cases)) {
        const ops = operations(source);
        assert.ok(
            !ops.some(({ op }) => op.kind === "readCell" && op.function),
            `${name}: readCell`,
        );
        // Calls to a closure created in the same function (the IIFE, its
        // non-captured helper, the scope helper of a direct eval) are direct
        // through newFunction, not through a captured binding.
        const local = new Set(
            ops
                .filter(({ op }) => op.kind === "newFunction")
                .map(({ fn, op }) => `${fn}:${"dest" in op ? op.dest : ""}`),
        );
        assert.deepEqual(
            directCalls(source).filter(
                ({ fn, op }) =>
                    op.kind !== "invoke" || !local.has(`${fn}:${op.callee}`),
            ),
            [],
            name,
        );
    }
});

test("calls through captured declarations keep their semantics", () =>
    agree(String.raw`
const out=[];
(function(){
    function add(a,b){return a+b}
    function sloppyThis(){return this===globalThis}
    function strictThis(){'use strict';return this}
    function args(){return arguments.length+':'+Array.prototype.join.call(arguments,',')}
    function fib(n){return n<2?n:fib(n-1)+fib(n-2)}
    function rec(n){'use strict';if(n===0)return 'done';return rec(n-1)}
    function thrower(){throw new Error('boom')}
    function run(){
        out.push(add(1,2),add('a','b'),add(1),sloppyThis(),String(strictThis()),args(1,2,3),args(),fib(15),rec(5000));
        const o={m:sloppyThis,s:strictThis};out.push(o.m(),o.s()===o,strictThis.call(7),typeof sloppyThis.call(7));
        try{thrower()}catch(e){out.push(e.message)}
        return (function(){'use strict';return [add(2,3),strictThis(),sloppyThis()].join()})();
    }
    out.push(run());
})();
(function(){
    function h(){return 'h1'}
    function u(){return h()}
    out.push(u());h=function(){return 'h2'};out.push(u());
    function g(){return 'g1'}
    function v(){return g()}
    function w(){g=function(){return 'g2'}}
    out.push(v());w();out.push(v());
    function e(){return 'e1'}
    function x(){return e()}
    out.push(x());eval('e = function(){return "e2"}');out.push(x());
    function d(){return 'd1'}
    function d(){return 'd2'}
    function y(){return d()}
    out.push(y());
    function b(){return 'b1'}
    function z(){return b()}
    out.push(z());{function b(){return 'b2'}}out.push(z());
    function* gen(){yield 'gen'}
    async function as(){return 'async'}
    function q(){return [...gen()].join()+':'+(as() instanceof Promise)}
    out.push(q());
    function k(){return 'k1'}
    function r(){return k()}
    out.push(r());k=k.bind(null);out.push(r());
    function f(){return 'f1'}
    function t(){return f()}
    out.push(t());for(var f of [function(){return 'f2'}]);out.push(t());
    function j(){return 'j1'}
    function l(){return typeof j}
    for(var j in {a:1});out.push(l());
})();
(function(o){
    function m(){return 'outer'}
    function p(){with(o){return m()}}
    out.push(p());o.m=function(){return 'with'};out.push(p());
    with(o){function n(){return 'n'}}
    function s(){return typeof n==='function'?n():'none'}
    out.push(s());
})({});
console.log(out.join('|'));
`));
