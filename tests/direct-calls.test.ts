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
    assert.equal(
        invokes.filter((op) => op.kind === "invoke" && op.direct !== undefined)
            .length,
        1,
        "arrows and generators are not direct",
    );
});

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
        // The IIFE (js.fn.0) calls its non-captured helper through newFunction.
        assert.deepEqual(
            directCalls(source).filter(
                ({ fn }) => fn !== "js.main" && fn !== "js.fn.0",
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
