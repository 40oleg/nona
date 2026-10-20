import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";
import { compileToIR } from "../src/compiler.js";
import { requireHostTarget } from "../src/target.js";
import type { FunctionIR, ModuleIR, Operation } from "../src/ir/model.js";
import {
    inlineDepthLimit,
    maxInlineCalleeSize,
    maxInlineCallerGrowth,
} from "../src/ir/inline.js";

// Guarded inlining of small known callees (#235): a direct call of a small
// plain function is replaced by its body behind the direct call's test, and
// the caller is folded again. Every program must behave exactly as before.
const agree = (source: string, options?: { gcStress?: boolean }) => {
    const run = runOnHost(source, options);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
};

const main = (ir: ModuleIR): FunctionIR =>
    ir.functions.find((fn) => fn.id === "js.main")!;
const operations = (fn: FunctionIR): Operation[] =>
    fn.blocks.flatMap((block) => block.operations);
const guards = (fn: FunctionIR) =>
    operations(fn).filter((op) => op.kind === "isFunctionCode");

test("greet('from Nona') folds to its string on the inlined path; the call is only the guard's fallback", () => {
    const fn = main(
        compileToIR(
            "function greet(name){return `Hello world, ${name}!`}console.log(greet('from Nona'))",
        ),
    );
    const ops = operations(fn);
    assert.ok(
        ops.some(
            (op) =>
                op.kind === "constant" &&
                op.value === "Hello world, from Nona!",
        ),
        "folded string",
    );
    assert.ok(
        !ops.some((op) => op.kind === "binary" || op.kind === "unary"),
        "no concatenation left",
    );
    const guard = fn.blocks.find(
        (block) =>
            block.terminator.kind === "branch" &&
            block.operations.at(-1)?.kind === "isFunctionCode",
    )!;
    assert.ok(guard, "guard block");
    const t = guard.terminator as Extract<
        typeof guard.terminator,
        { kind: "branch" }
    >;
    const calls = fn.blocks.filter((block) =>
        block.operations.some(
            (op) => op.kind === "invoke" && op.direct === "js.fn.0",
        ),
    );
    assert.deepEqual(
        calls.map((block) => block.id),
        [t.no],
        "only the fallback calls greet",
    );
});

test("square(12) folds to 144 on the inlined path", () => {
    const ops = operations(
        main(
            compileToIR(
                "function square(x){return x*x}console.log(square(12))",
            ),
        ),
    );
    assert.ok(ops.some((op) => op.kind === "constant" && op.value === 144));
    assert.ok(!ops.some((op) => op.kind === "binary"));
});

test("inlining is off on request (coverage and call statistics)", () => {
    const ir = compileToIR(
        "function square(x){return x*x}console.log(square(12))",
        undefined,
        undefined,
        requireHostTarget(),
        { inline: false },
    );
    assert.equal(guards(main(ir)).length, 0);
});

test("a callee over the size budget is not inlined", () => {
    const terms = Array.from(
        { length: maxInlineCalleeSize + 5 },
        (_, i) => `x*${i + 2}`,
    ).join("+");
    const ir = compileToIR(
        `function big(x){return ${terms}}function small(x){return x+1}console.log(big(globalThis.n),small(globalThis.n))`,
    );
    const targets = guards(main(ir)).map(
        (op) => op.kind === "isFunctionCode" && op.target,
    );
    assert.deepEqual(targets, ["js.fn.1"]);
});

test("a chain of calls is inlined to the depth limit only", () => {
    const n = 10,
        source =
            Array.from(
                { length: n },
                (_, i) =>
                    `function f${i}(x){return ${i === n - 1 ? "x" : `f${i + 1}(x)`}+1}`,
            ).join("") + "console.log(f0(globalThis.n))";
    const ir = compileToIR(source),
        fn = main(ir);
    assert.equal(guards(fn).length, inlineDepthLimit);
    // The inlined body of f0 still calls f1, not guarded again.
    assert.ok(
        operations(fn).some(
            (op) => op.kind === "invoke" && op.direct === "js.fn.1",
        ),
    );
    assert.equal(
        ir.functions.reduce((count, f) => count + guards(f).length, 0),
        n,
        "main and f0..f8 each inline their own callee once",
    );
});

test("callees using arguments, new.target, closures or try are not inlined", () => {
    const ir = compileToIR(
        "function a(){return arguments.length}function b(){return new.target}function c(x){return ()=>x}function d(){try{return g()}catch(e){return 1}}function g(){return 2}" +
            "console.log(a(1),b(),c(1),d())",
    );
    assert.deepEqual(
        guards(main(ir)).map((op) => op.kind === "isFunctionCode" && op.target),
        [],
    );
    // d's call of g is inlined (inside d's try).
    const d = ir.functions.find((fn) => fn.name === "d")!;
    assert.equal(guards(d).length, 1);
});

test("each caller and the module have growth budgets", () => {
    const calls = Array.from({ length: 400 }, () => "f(globalThis.n)").join(
        ",",
    );
    const fn = main(
        compileToIR(`function f(x){return x*x+x*3-x/2+1}console.log(${calls})`),
    );
    const count = guards(fn).length;
    assert.ok(count > 0 && count < 400, String(count));
    assert.ok(count * 7 <= maxInlineCallerGrowth, String(count));
});

test("a reassigned callee takes the guard's fallback", () =>
    agree(String.raw`
const out=[];
function swap(){return 'first'}
out.push(swap());
swap=function(){return 'second'};out.push(swap());
function viaGlobal(a){return a+1}
out.push(viaGlobal(1));
globalThis.viaGlobal=(a)=>a*10;out.push(viaGlobal(2));
function k(){return 1}
let t=0;for(let i=0;i<6;i++){if(i===3)k=function(){return 100};t=t+k()}
out.push(t);
function bound(){return this.v}
bound=bound.bind({v:'bound'});out.push(bound());
console.log(out.join('|'));
`));

test("this, arguments and new.target of inlined and guarded callees", () =>
    agree(String.raw`
const out=[];
function sloppyThis(){return this===globalThis}
function strictThis(){'use strict';return this===undefined}
function typeThis(){'use strict';return typeof this}
function args(){return arguments.length}
function nt(){return new.target===undefined}
function me(){return typeof me}
out.push(sloppyThis(),strictThis(),typeThis(),args(1,2,3),args(),nt(),new nt() instanceof nt,me());
const o={m:sloppyThis,s:strictThis};out.push(o.m(),o.s());
function outer(){const fe=function self(){return self};return fe()===fe}
out.push(outer());
console.log(out.join('|'));
`));

test("a throwing callee reaches the caller's catch and finally", () =>
    agree(String.raw`
const out=[];
function thrower(x){if(x)throw new Error('boom'+x);return 'ok'}
try{out.push(thrower(0));out.push(thrower(1));out.push('not here')}catch(e){out.push(e.message)}finally{out.push('fin')}
try{try{thrower(2)}finally{out.push('inner')}}catch(e){out.push('outer '+e.message)}
function f(){try{return thrower(3)}catch(e){return 'caught '+e.message}finally{out.push('f fin')}}
out.push(f());
function bad(o){return o.x.y}
try{bad({})}catch(e){out.push(e instanceof TypeError)}
function tdz(){let r=y;let y=1;return r}
try{tdz()}catch(e){out.push(e.name)}
function hoisted(){var r=typeof v;var v=1;return r+v}
function hoistedRead(){var r=v;var v=2;return String(r)}
out.push(hoisted(),hoistedRead(),hoisted());
function missing(){return notDeclaredAnywhere}
try{missing()}catch(e){out.push(e.name)}
console.log(out.join('|'));
`));

test("arguments are evaluated once, in order, also when unused or extra", () =>
    agree(String.raw`
const log=[];
function e(v){log.push('e'+v);return v}
function two(a,b){return a+':'+b}
function none(){return 'none'}
function unused(a,b,c){return 'u'}
log.push(two(e(1)),two(e(2),e(3),e(4)),none(e(5),e(6)),unused(e(7)));
function mut(a){a=a+1;return a}
let x=5;log.push(mut(x),x);
function same(a){return a}
let y=1;y=same(y+1);log.push(y);
function swap2(a,b){return b+a}
let p='p',q='q';p=swap2(p,q);log.push(p,q);
console.log(log.join(','));
`));

test("recursion, function identity and properties of inlined callees", () =>
    agree(String.raw`
function fib(n){return n<2?n:fib(n-1)+fib(n-2)}
function rec(n){'use strict';if(n===0)return 'done';return rec(n-1)}
function wrap(n){return fib(n)}
function named(a,b){return a+b}
function even(n){return n===0?true:odd(n-1)}
function odd(n){return n===0?false:even(n-1)}
console.log(fib(16),rec(3000),wrap(10),named(1,2),named.name,named.length,named.toString());
console.log(String(named)===Function.prototype.toString.call(named),named===named,even(10),odd(7));
`));

test("callers in loops, nested functions and async functions", () =>
    agree(String.raw`
function add(a,b){return a+b}
function sq(x){return x*x}
function loop(n){let s=0;for(let i=0;i<n;i++)s=add(s,sq(i));return s}
function outer(){function inner(x){return x*2}let t=0;for(let i=0;i<5;i++)t=add(t,inner(i));return t}
async function af(){await null;return add(1,2)}
af().then(v=>console.log('async',v));
const o={m(){return add(this===o,1)}};
console.log(loop(10),outer(),o.m());
for(let i=0;i<3;i++)console.log(sq(i),add('s',i));
`));

test("stack overflow of unbounded recursion through an inlined callee is unchanged", () =>
    agree(
        String.raw`
function deep(n){return n===0?0:1+deep(n-1)}
function step(n){return deep(n)}
let caught=0;
for(let i=0;i<2;i++){try{step(1e8)}catch(e){if(e instanceof RangeError)caught++}}
try{step(1e8)}catch(e){}finally{console.log('finally ran')}
console.log(caught,step(1000));
`,
        { gcStress: false },
    ));

test("proper tail calls in an inlined callee still run at constant depth", () => {
    const run = runOnHost(
        `"use strict";function count(n,acc){if(n===0)return acc;return next(n,acc)}function next(n,acc){return count(n-1,acc+1)}console.log(count(2000000,0))`,
        { gcStress: false },
    );
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, "2000000\n");
});
