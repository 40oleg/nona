import { test } from "node:test";
import assert from "node:assert/strict";
import {
    propagateCopies,
    coalesceMoves,
    definitions,
} from "../src/ir/copies.js";
import {
    analyzeLiveness,
    isLive,
    liveFloor,
    operationUses,
    pinnedLocalThreshold,
} from "../src/ir/liveness.js";
import type { FunctionIR, Operation, Terminator } from "../src/ir/model.js";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// Hand-built IR pins the production guards corresponding to verification/.
// These tests check the TypeScript pass; they do not prove its correspondence.
function block(operations: Operation[], value = 3): FunctionIR {
    return {
        id: "moves",
        name: "moves",
        parameterCount: 2,
        localCount: 0,
        slotCount: 5,
        maxArguments: 0,
        blocks: [{ id: 0, operations, terminator: { kind: "return", value } }],
    };
}
const add = (numeric = true): Operation => ({
    kind: "binary",
    dest: 2,
    operator: "+",
    left: 0,
    right: 1,
    numeric,
});
const copy: Operation = { kind: "copy", dest: 0, source: 2 };

test("copy forwarding substitutes equal slots at the point of use", () => {
    const fn = block([
        { kind: "copy", dest: 2, source: 0 },
        { kind: "binary", dest: 3, operator: "+", left: 2, right: 1 },
    ]);
    assert.deepEqual(propagateCopies(fn).blocks[0]!.operations, [
        { kind: "binary", dest: 3, operator: "+", left: 0, right: 1 },
    ]);
});

test("source redefinition invalidates an alias instead of changing its snapshot", () => {
    const fn = block([
        { kind: "copy", dest: 2, source: 0 },
        { kind: "constant", dest: 0, value: 9 },
        { kind: "binary", dest: 3, operator: "+", left: 2, right: 0 },
    ]);
    assert.deepEqual(
        propagateCopies(fn).blocks[0]!.operations,
        fn.blocks[0]!.operations,
    );
});

test("destination redefinition invalidates a forwarded return", () => {
    const fn = block(
        [
            { kind: "copy", dest: 2, source: 0 },
            { kind: "constant", dest: 2, value: 9 },
        ],
        2,
    );
    const optimized = propagateCopies(fn).blocks[0]!;
    assert.deepEqual(optimized.operations, [
        { kind: "constant", dest: 2, value: 9 },
    ]);
    assert.deepEqual(optimized.terminator, { kind: "return", value: 2 });
});

test("coalescing reads operands before overwriting an aliased destination", () => {
    const result = coalesceMoves(block([add(), copy], 0)).blocks[0]!;
    assert.deepEqual(result.operations, [
        {
            kind: "binary",
            dest: 0,
            operator: "+",
            left: 0,
            right: 1,
            numeric: true,
        },
    ]);
});

test("a temporary observed after the copy prevents coalescing", () => {
    const fn = block(
        [add(), copy, { kind: "storeGlobal", index: 0, source: 0 }],
        2,
    );
    assert.deepEqual(coalesceMoves(fn), fn);
});

test("a temporary observed in a successor block prevents coalescing", () => {
    const fn = block([add(), copy], 0);
    fn.blocks[0]!.terminator = { kind: "jump", target: 1 };
    fn.blocks.push({
        id: 1,
        operations: [{ kind: "storeGlobal", index: 0, source: 0 }],
        terminator: { kind: "return", value: 2 },
    });
    assert.deepEqual(coalesceMoves(fn), fn);
});

test("generic coercing operations are excluded from destination coalescing", () => {
    const fn = block([add(false), copy], 0);
    assert.deepEqual(coalesceMoves(fn), fn);
});

test("mapped arguments prevent slot alias propagation", () => {
    const fn = block([
        { kind: "newArguments", dest: 4, parameters: [0, 1] },
        { kind: "copy", dest: 2, source: 0 },
        { kind: "binary", dest: 3, operator: "+", left: 2, right: 1 },
    ]);
    assert.strictEqual(propagateCopies(fn), fn);
});

test("dead moves disappear while a live constant and its exact Number bits remain", () => {
    const fn = block([
        { kind: "constant", dest: 2, value: 999 },
        { kind: "constant", dest: 3, value: -0 },
    ]);
    const optimized = propagateCopies(fn).blocks[0]!;
    assert.equal(optimized.operations.length, 1);
    const op = optimized.operations[0]!;
    assert.equal(op.kind, "constant");
    assert.ok(op.kind === "constant" && Object.is(op.value, -0));
});

test("forwarded returns preserve NaN, negative zero and object identity without arithmetic", () => {
    const fn = block([{ kind: "copy", dest: 2, source: 0 }], 2);
    const optimized = propagateCopies(fn).blocks[0]!;
    assert.deepEqual(optimized.operations, []);
    assert.deepEqual(optimized.terminator, { kind: "return", value: 0 });
    const returnValue = (term: Terminator, slots: unknown[]) => {
        assert.equal(term.kind, "return");
        return term.kind === "return" ? slots[term.value] : undefined;
    };
    const object = { identity: 1 };
    for (const value of [-0, NaN, object]) {
        assert.ok(Object.is(returnValue(optimized.terminator, [value]), value));
    }
});

// #658 additions. The tests above retain the original model's production checks.
test("alias chains resolve before invalidation and maps reset at block boundaries", () => {
    const fn = block(
        [
            { kind: "copy", dest: 2, source: 0 },
            { kind: "copy", dest: 3, source: 2 },
            { kind: "copy", dest: 0, source: 3 },
            { kind: "storeGlobal", index: 0, source: 3 },
        ],
        3,
    );
    fn.blocks[0]!.terminator = { kind: "jump", target: 1 };
    fn.blocks.push({
        id: 1,
        operations: [{ kind: "storeGlobal", index: 1, source: 3 }],
        terminator: { kind: "return", value: 3 },
    });
    const result = propagateCopies(fn);
    assert.deepEqual(result.blocks[0]!.operations, [
        { kind: "copy", dest: 3, source: 0 },
        { kind: "storeGlobal", index: 0, source: 3 },
    ]);
    assert.deepEqual(result.blocks[1], fn.blocks[1]);
    const isolated = block([{ kind: "copy", dest: 2, source: 0 }], -1);
    isolated.blocks[0]!.terminator = { kind: "jump", target: 1 };
    isolated.blocks.push({
        id: 1,
        operations: [{ kind: "storeGlobal", index: 0, source: 2 }],
        terminator: { kind: "return", value: 2 },
    });
    assert.deepEqual(propagateCopies(isolated), isolated);
});

test("supported operand fields forward without discarding effects or unrewritten reads", () => {
    const examples: [Operation, Operation][] = [
        [
            { kind: "property", dest: 3, object: 2, key: 2, operation: "get" },
            { kind: "property", dest: 3, object: 0, key: 0, operation: "get" },
        ],
        [
            {
                kind: "setProperty",
                object: 2,
                key: 2,
                source: 2,
                define: false,
            },
            {
                kind: "setProperty",
                object: 0,
                key: 0,
                source: 0,
                define: false,
            },
        ],
        [
            {
                kind: "invoke",
                dest: 3,
                callee: 2,
                arguments: [2, 1],
                receiver: 2,
                newTarget: 2,
            },
            {
                kind: "invoke",
                dest: 3,
                callee: 0,
                arguments: [0, 1],
                receiver: 0,
                newTarget: 0,
            },
        ],
        [
            {
                kind: "newObject",
                dest: 3,
                array: false,
                length: 1,
                literal: { keys: [2], values: [2], strict: false },
            },
            {
                kind: "newObject",
                dest: 3,
                array: false,
                length: 1,
                literal: { keys: [2], values: [0], strict: false },
            },
        ],
        [
            {
                kind: "newObject",
                dest: 3,
                array: true,
                length: 1,
                elementValues: [2],
            },
            {
                kind: "newObject",
                dest: 3,
                array: true,
                length: 1,
                elementValues: [0],
            },
        ],
        [
            { kind: "isFunctionCode", dest: 3, callee: 2, target: "fn" },
            { kind: "isFunctionCode", dest: 3, callee: 0, target: "fn" },
        ],
        [
            { kind: "unary", dest: 3, argument: 2, operator: "-" },
            { kind: "unary", dest: 3, argument: 0, operator: "-" },
        ],
    ];
    for (const [original, expected] of examples) {
        const result = propagateCopies(
            block([{ kind: "copy", dest: 2, source: 0 }, original]),
        ).blocks[0]!.operations;
        assert.deepEqual(result.at(-1), expected);
        assert.equal(
            result.some((op) => op.kind === "copy"),
            original.kind === "newObject" && !!original.literal,
        );
    }
});

for (const [op, writes] of [
    [{ kind: "getIterator", iterator: 2, next: 3, object: 0 }, [2, 3]],
    [{ kind: "iteratorStep", dest: 2, done: 3, iterator: 0, next: 1 }, [2, 3]],
    [{ kind: "yieldDelegated", dest: 2, mode: 3, source: 0 }, [2, 3]],
] satisfies [Operation, number[]][]) {
    for (const dest of writes) {
        test(`${op.kind} invalidates alias keys and targets for definition ${dest}`, () => {
            assert.deepEqual(definitions(op), writes);
            for (const [key, source] of [
                [4, dest],
                [dest, 1],
            ]) {
                const fn = block(
                    [
                        { kind: "copy", dest: key!, source: source! },
                        op,
                        { kind: "storeGlobal", index: 0, source: key! },
                    ],
                    -1,
                );
                const result = propagateCopies(fn).blocks[0]!;
                assert.deepEqual(result.operations.at(-1), {
                    kind: "storeGlobal",
                    index: 0,
                    source: key!,
                });
                // All definitions are killed before uses are added back, including
                // a definition which is also an operand of the operation.
                const self =
                    op.kind === "getIterator"
                        ? { ...op, object: dest }
                        : op.kind === "iteratorStep"
                          ? { ...op, iterator: dest }
                          : { ...op, source: dest };
                assert.ok(operationUses(self).includes(dest));
                const observations: Operation[] = writes.map((source) => ({
                    kind: "storeGlobal",
                    index: 0,
                    source,
                }));
                const live = analyzeLiveness(
                    block([self, ...observations], -1),
                ).get(0)!;
                assert.ok(live.before[0]!.has(dest));
                for (const other of writes)
                    if (!operationUses(self).includes(other))
                        assert.ok(!live.before[0]!.has(other));
            }
        });
    }
}

test("unrewritten operands retain their copies while rewritten uses see old operands", () => {
    const fn = block(
        [
            { kind: "copy", dest: 2, source: 0 },
            { kind: "checkInitialized", slot: 2 },
            { kind: "binary", dest: 0, left: 2, right: 0, operator: "+" },
            { kind: "storeGlobal", index: 0, source: 2 },
        ],
        0,
    );
    assert.deepEqual(propagateCopies(fn).blocks[0]!.operations, [
        fn.blocks[0]!.operations[0],
        fn.blocks[0]!.operations[1],
        { kind: "binary", dest: 0, left: 0, right: 0, operator: "+" },
        fn.blocks[0]!.operations[3],
    ]);
});

for (const terminator of [
    { kind: "return", value: 2 },
    { kind: "throw", value: 2 },
    { kind: "branch", condition: 2, yes: 1, no: 1 },
    { kind: "switch", value: 2, low: 0, targets: [1], otherwise: 1 },
] satisfies Terminator[]) {
    test(`${terminator.kind} observes forwarded operands and keeps live producers`, () => {
        const fn = block([{ kind: "copy", dest: 2, source: 0 }]);
        fn.blocks[0]!.terminator = terminator;
        fn.blocks.push({
            id: 1,
            operations: [],
            terminator: { kind: "return", value: -1 },
        });
        const expected =
            terminator.kind === "branch"
                ? { ...terminator, condition: 0 }
                : { ...terminator, value: 0 };
        assert.deepEqual(propagateCopies(fn).blocks[0]!.terminator, expected);
        fn.blocks[0]!.operations = [add(), copy];
        assert.deepEqual(coalesceMoves(fn), fn);
    });
}

test("exception and loop successors keep temporary observations alive", () => {
    for (const exception of [false, true]) {
        const fn = block([add(), copy], -1);
        if (exception) fn.blocks[0]!.exceptionTarget = 1;
        else fn.blocks[0]!.terminator = { kind: "jump", target: 1 };
        fn.blocks.push({
            id: 1,
            operations: [{ kind: "storeGlobal", index: 0, source: 2 }],
            terminator: { kind: "jump", target: 0 },
        });
        assert.deepEqual(coalesceMoves(fn), fn);
        const constant = block([{ kind: "constant", dest: 2, value: 42 }], -1);
        constant.blocks = [
            { ...fn.blocks[0]!, operations: constant.blocks[0]!.operations },
            fn.blocks[1]!,
        ];
        assert.deepEqual(
            propagateCopies(constant).blocks[0]!.operations,
            constant.blocks[0]!.operations,
        );
    }
});

test("liveFloor pins locals but permits dead temporaries above the floor", () => {
    const count = Math.max(1, pinnedLocalThreshold + 1);
    assert.ok(Number.isSafeInteger(count));
    const fn = block(
        [
            { kind: "constant", dest: 0, value: 7 },
            { kind: "constant", dest: count, value: 8 },
        ],
        -1,
    );
    fn.localCount = count;
    fn.slotCount = count + 3;
    assert.equal(liveFloor(fn), count);
    assert.ok(isLive(new Set(), 0, liveFloor(fn)));
    assert.deepEqual(propagateCopies(fn).blocks[0]!.operations, [
        fn.blocks[0]!.operations[0],
    ]);
    fn.blocks[0]!.operations = [
        { kind: "constant", dest: 0, value: 7 },
        { kind: "copy", dest: count, source: 0 },
    ];
    assert.deepEqual(coalesceMoves(fn), fn);
    fn.blocks[0]!.operations = [
        { kind: "constant", dest: count, value: 7 },
        { kind: "copy", dest: count + 1, source: count },
    ];
    assert.deepEqual(coalesceMoves(fn).blocks[0]!.operations, [
        { kind: "constant", dest: count + 1, value: 7 },
    ]);
});

test("dead-write eligibility includes noncoercing tests but retains effects and generic conversion", () => {
    const removable: Operation[] = [
        { kind: "copy", dest: 2, source: 0 },
        { kind: "constant", dest: 2, value: 1 },
        { kind: "uninitialized", dest: 2 },
        { kind: "globalObject", dest: 2 },
        { kind: "isFunctionCode", dest: 2, callee: 0, target: "fn" },
        ...[
            "!",
            "typeof",
            "isNullish",
            "typeofIs:number",
            "typeofNot:string",
        ].map((operator) => ({
            kind: "unary" as const,
            dest: 2,
            argument: 0,
            operator,
        })),
        ...["===", "!=="].map((operator) => ({
            kind: "binary" as const,
            dest: 2,
            left: 0,
            right: 1,
            operator,
        })),
        add(),
        { kind: "unary", dest: 2, argument: 0, operator: "-", numeric: true },
    ];
    for (const op of removable)
        assert.deepEqual(
            propagateCopies(block([op], -1)).blocks[0]!.operations,
            [],
            JSON.stringify(op),
        );
    const retained: Operation[] = [
        add(false),
        { kind: "unary", dest: 2, argument: 0, operator: "-" },
        { kind: "binary", dest: 2, left: 0, right: 1, operator: "==" },
        { kind: "property", dest: 2, object: 0, key: 1, operation: "get" },
        { kind: "invoke", dest: 2, callee: 0, arguments: [1] },
        { kind: "loadGlobal", dest: 2, index: 0 },
    ];
    for (const op of retained)
        assert.deepEqual(
            propagateCopies(block([op], -1)).blocks[0]!.operations,
            [op],
        );
});

test("coalescing requires eligibility, adjacency, matching source and distinct destination", () => {
    for (const producer of [
        { kind: "constant", dest: 2, value: -0 },
        add(),
        { kind: "unary", dest: 2, argument: 0, operator: "-", numeric: true },
    ] satisfies Operation[]) {
        assert.deepEqual(
            coalesceMoves(block([producer, copy], 0)).blocks[0]!.operations,
            [{ ...producer, dest: 0 }],
        );
        for (const ops of [
            [producer, { kind: "storeGlobal", index: 0, source: 1 }, copy],
            [producer, { kind: "copy", dest: 0, source: 1 }],
            [producer, { kind: "copy", dest: 2, source: 2 }],
        ] satisfies Operation[][])
            assert.deepEqual(
                coalesceMoves(block(ops, 0)).blocks[0]!.operations,
                ops,
            );
    }
    for (const producer of [
        { kind: "uninitialized", dest: 2 },
        { kind: "unary", dest: 2, argument: 0, operator: "typeof" },
        { kind: "binary", dest: 2, left: 0, right: 1, operator: "===" },
    ] satisfies Operation[])
        assert.deepEqual(
            coalesceMoves(block([producer, copy], 0)).blocks[0]!.operations,
            [producer, copy],
        );
    // newArguments is a propagation bypass, not a coalescing guard.
    const args: Operation = {
        kind: "newArguments",
        dest: 4,
        parameters: [0, 1],
    };
    assert.deepEqual(
        coalesceMoves(block([args, add(), copy], 0)).blocks[0]!.operations,
        [args, { ...add(), dest: 0 }],
    );
});

test("DCE recomputes liveness for at most four rounds, leaving a longer dead chain", () => {
    // Unary test operands are not aliases; each round exposes one more
    // dead producer. Copy chains would be forwarded before DCE instead.
    const operations: Operation[] = [{ kind: "constant", dest: 0, value: 1 }];
    for (let dest = 1; dest <= 5; dest++)
        operations.push({
            kind: "unary",
            dest,
            argument: dest - 1,
            operator: "!",
        });
    const fn = block(operations, -1);
    fn.slotCount = 6;
    const first = propagateCopies(fn);
    assert.deepEqual(first.blocks[0]!.operations, operations.slice(0, 2));
    assert.deepEqual(propagateCopies(first).blocks[0]!.operations, []);
});

test("native move observations match Node for mutation, coercion, identity and signed zero", () => {
    const source = String.raw`
const trace=[];
function snapshot(x){const a=x,b=a;x=99;return b}
function coercion(){let x=1;const o={valueOf(){trace.push('convert:'+x);x=7;return 3}};const old=x; o+1; -o; o==3; return old+','+x}
function mutate(){const o={n:1};const a=o,b=a;a.n=8;return [b===o,b.n,snapshot(o)===o].join(',')}
function mapped(x){const old=x;arguments[0]=9;return old+','+x}
function edges(){let x=2,old=x;try{x=5;throw 0}catch(e){trace.push('catch:'+old+','+x)}for(let i=0;i<3;i++)x=x+i;return x}
function numbers(x){let y=x;const z=y;return [Object.is(z,-0),1/z,z!==z].join(',')}
function iterators(){const out=[];const source={ [Symbol.iterator](){let n=0;return {next(){trace.push('next:'+n);return {value:++n,done:n>2}}}}};const [first,second]=source;function* gen(){yield* [first,second]}for(const x of gen())out.push(x);return out.join(',')}
console.log(coercion(),mutate(),mapped(1),edges(),numbers(-0),numbers(NaN),iterators(),trace.join('|'));
`;
    const oracle = runOracle(source);
    assert.equal(oracle.status, 0, oracle.stderr);
    const native = runOnHost(source);
    assert.equal(native.status, 0, native.stderr);
    assert.equal(native.stdout, oracle.stdout);
});
