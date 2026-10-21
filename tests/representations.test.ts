import { test } from "node:test";
import assert from "node:assert/strict";
import { compileToIR } from "../src/compiler.js";
import type {
    FunctionIR,
    InductionVariableIR,
    LoopRepresentationIR,
    Operation,
} from "../src/ir/model.js";

// Representation facts (src/ir/representations.ts, #424): int32 induction
// variables, int32/uint32 results of bit operations and the slots a loop may
// keep unboxed, with their escapes. The code generator does not use them
// yet; these checks pin the proofs on the IR.
const fn = (source: string, name = "f"): FunctionIR =>
    compileToIR(source).functions.find((f) => f.name === name)!;
const loops = (f: FunctionIR): LoopRepresentationIR[] =>
    f.representations ?? [];
const inductions = (source: string): InductionVariableIR[] =>
    loops(fn(source)).flatMap((loop) => loop.induction);
const marked = (f: FunctionIR, mark: "int32" | "uint32") =>
    f.blocks
        .flatMap((block) => block.operations)
        .filter(
            (op): op is Extract<Operation, { kind: "binary" | "unary" }> =>
                (op.kind === "binary" || op.kind === "unary") &&
                (op as { int32?: boolean; uint32?: boolean })[mark] === true,
        )
        .map((op) => op.operator);

test("a counted loop up to an int32 bound has an int32 induction variable", () => {
    const f = fn(
        "function f(n){n=n|0;let s=0;for(let i=0;i<n;i++)s=s+i*0.5;return s}",
    );
    const [i] = loops(f).flatMap((loop) => loop.induction);
    assert.ok(i);
    assert.equal(i.operator, "<");
    assert.equal(i.int32, true);
    assert.equal(i.entryCheck, undefined);
    assert.deepEqual(marked(f, "int32").sort(), ["increment", "|"]);
    const loop = loops(f)[0]!;
    assert.equal(
        loop.unboxed.find((u) => u.slot === i.slot)?.int32,
        true,
        "the counter is an int32 unboxed slot",
    );
});

test("constant bounds, downward loops and steps are checked against int32 limits", () => {
    assert.equal(
        inductions(
            "function f(){let s=0;for(let i=0;i<100;i++)s=s+i;return s}",
        )[0]?.int32,
        true,
    );
    const down = inductions(
        "function f(){let s=0;for(let i=10;i>=0;i-=2)s=s+i;return s}",
    )[0];
    assert.equal(down?.operator, ">=");
    assert.equal(down?.step, 2);
    assert.equal(down?.int32, true);
    assert.equal(
        inductions(
            "function f(){let s=0;for(let i=0;i<2147483647;i++)s=s+i;return s}",
        )[0]?.int32,
        true,
        "the last step reaches 2^31 - 1",
    );
    assert.equal(
        inductions(
            "function f(){let s=0;for(let i=0;i<2147483647;i+=2)s=s+i;return s}",
        ).length,
        0,
        "the last step of two passes 2^31 - 1",
    );
    assert.equal(
        inductions(
            "function f(){let s=0;for(let i=0;i<Infinity;i++)s=s+i;return s}",
        ).length,
        0,
    );
});

test("an unproven bound leaves a check on loop entry", () => {
    // The benchmark shape: n is a parameter, not a proven Number.
    const [i] = inductions(
        "const MASK=1023;function f(t,n){let s=0;for(let i=0;i<n;i++)s=s+t[i&MASK];return s}",
    );
    assert.equal(i?.int32, false);
    assert.deepEqual(i?.entryCheck, { max: 2 ** 31 - 1 });
});

test("a bound that may reach 2^31-1 with <= is not an int32 proof", () => {
    const [i] = inductions(
        "function f(n){n=n|0;let s=0;for(let i=0;i<=n;i++)s=s+i;return s}",
    );
    assert.equal(i?.int32, false);
    assert.deepEqual(i?.entryCheck, { max: 2 ** 31 - 2 });
    assert.equal(
        inductions(
            "function f(){let s=0;for(let i=0;i<=2147483647;i++)s=s+i;return s}",
        ).length,
        0,
    );
    const f = fn(
        "function f(n){n=n|0;let s=0;for(let i=0;i<=n;i++)s=s+i;return s}",
    );
    assert.deepEqual(marked(f, "int32"), ["|"], "the step is not marked");
});

test("a counter assigned in the body is not an induction variable", () => {
    assert.equal(
        inductions(
            "function f(n){n=n|0;let s=0;for(let i=0;i<n;i++){s=s+i;i=i*2}return s}",
        ).length,
        0,
    );
    assert.equal(
        inductions(
            "function f(n){n=n|0;let s=0;for(let i=0;i<n;i++){i++;s=s+i}return s}",
        ).length,
        0,
        "two steps per test",
    );
});

test("a fractional step, a call start and -0 are not int32 counters", () => {
    assert.equal(
        inductions(
            "function f(n){n=n|0;let s=0;for(let i=0;i<n;i+=0.5)s=s+i;return s}",
        ).length,
        0,
    );
    assert.equal(
        inductions(
            "function f(n,g){n=n|0;let s=0;for(let i=g();i<n;i++)s=s+i;return s}",
        ).length,
        0,
    );
    assert.equal(
        inductions("function f(){let s=0;for(let i=-0;i<10;i++)s=s+i;return s}")
            .length,
        0,
    );
    assert.equal(
        inductions(
            "function f(n){n=n|0;let s=0;for(let i=0;i>n;i++)s=s+i;return s}",
        ).length,
        0,
        "counting up while i > n",
    );
});

test("an inner loop starting at an int32 counter is proven too", () => {
    const facts = inductions(
        "function f(n){n=n|0;let s=0;for(let i=0;i<n;i++)for(let j=i;j<n;j++)s=s+j;return s}",
    );
    assert.equal(facts.length, 2);
    assert.ok(facts.every((i) => i.int32));
});

test("bit operations have int32 and uint32 results", () => {
    const f = fn(
        "function f(x){const a=x|0,b=~a,c=x>>>1,d=x&x;return a+b+c+d}",
    );
    assert.deepEqual(marked(f, "int32").sort(), ["|", "~"]);
    assert.deepEqual(marked(f, "uint32"), [">>>"]);
});

test("unboxed slots record where their values escape", () => {
    const f = fn(
        "function f(n,g){n=n|0;let s=0;for(let i=0;i<n;i++){s=s+i;g(s)}return s}",
    );
    const [loop] = loops(f);
    assert.ok(loop);
    const s = loop.escapes.find((e) => e.kind === "exit");
    assert.ok(s?.box, "the sum is live after the loop");
    assert.ok(
        loop.unboxed.some((u) => u.slot === s.slot && u.liveIn && u.written),
    );
    assert.ok(
        loop.escapes.some((e) => e.kind === "call" && e.box),
        "the call argument is boxed",
    );
    // A property read is not a Number: its slot is not eligible.
    const t = fn(
        "function f(t,n){n=n|0;let s=0;for(let i=0;i<n;i++)s=s+t[i];return s}",
    );
    const [tl] = loops(t);
    assert.ok(tl);
    assert.ok(
        tl.escapes.some((e) => e.kind === "key" && !e.box),
        "the counter is an element key",
    );
    assert.ok(
        !tl.unboxed.some((u) => u.slot === 2),
        "s (slot 2) may hold any value",
    );
});
