import { RuntimeBuilder, slot, failIf } from "./abi.js";
import { rootedFn } from "./root-scope.js";
import { ObjectLayout as O, PropertyLayout as P } from "./object-layout.js";
import { stringLiteral } from "./value.js";
import {
    prependFunctionBuiltin,
    builtinPropertyRoots,
} from "./function-builtin.js";
import { HeapLayout as H, HeapKind } from "./heap-layout.js";
import { PromiseKind, PromiseLayout } from "./promise-layout.js";

// Runtime helpers implemented by the Promise prelude and called from IR.
export const preludeHelpers = [
    "getAsyncIterator",
    "withObject",
    "withHasBinding",
    "withGetBindingValue",
    "withSetMutableBinding",
    "createImportMeta",
    "createNamespace",
    "registerModule",
    "evaluateModule",
    "dynamicImport",
    "registerScript",
    "staticMethodKey",
    "privateName",
    "privateMethod",
    "privateBrand",
    "privateDefine",
    "privateGet",
    "privateSet",
    "privateIn",
    "initializeFields",
    "isEval",
    "evalDeclareVars",
    "evalGlobalDeclarations",
    "callWithGlobalThis",
    "endJson",
] as const;
// Intrinsic prototypes of async functions and async generators. Their
// methods and metadata are installed by the Promise prelude, which owns the
// job queue and the async drivers.
// One job queue per agent: every realm's Promise prelude shares the first one's.
// The promise intrinsics (#44): a promise is a PromiseKind object whose
// internal slots (promise-layout.ts) the prelude reads and writes through them.
const promiseIntrinsics = [
    ["rt.promiseCreateInternal", "__nonaPromiseCreateInternal", 1],
    ["rt.promiseGetInternal", "__nonaPromiseGetInternal", 2],
    ["rt.promiseSetInternal", "__nonaPromiseSetInternal", 3],
] as const;
export const asyncPropertyRoots = [
    ...builtinPropertyRoots(
        "rt.sharedQueueInternal",
        "__nonaSharedQueueInternal",
    ),
    ...promiseIntrinsics.flatMap(([symbol, name]) =>
        builtinPropertyRoots(symbol, name),
    ),
];
export const asyncRoots = [
    "rt.sharedQueueInternal",
    ...promiseIntrinsics.map(([symbol]) => symbol),
    "rt.asyncFunctionPrototype",
    "rt.asyncGeneratorFunctionPrototype",
    "rt.asyncGeneratorPrototype",
    "rt.asyncIteratorPrototype",
];

export function emitAsync(b: RuntimeBuilder): void {
    const object = (name: string, prototype: string) =>
        b.bundle.fragments.push({
            name,
            section: ".data",
            alignment: 8,
            bytes: new Uint8Array(O.size),
            symbols: {},
            fixups: [
                {
                    offset: O.prototype,
                    kind: "va64",
                    target: prototype,
                    addend: 0,
                },
            ],
        });
    object("rt.asyncFunctionPrototype", "rt.functionPrototype");
    object("rt.asyncGeneratorFunctionPrototype", "rt.functionPrototype");
    object("rt.asyncIteratorPrototype", "rt.objectPrototype");
    object("rt.asyncGeneratorPrototype", "rt.asyncIteratorPrototype");
    for (const name of ["asyncFunctionStart", "asyncGeneratorStart"])
        b.bundle.fragments.push(stringLiteral("rt.str." + name, name));
    // Like rt.initializeGeneratorFunction, for async generator functions.
    b.fn("rt.initializeAsyncGeneratorFunction", 56, (a) => {
        a.load("rcx", { base: "rcx", disp: 8 });
        a.store(slot(40), "rcx");
        a.lea("rdx", { rip: "rt.str.prototype" });
        a.call("rt.findOwnProperty");
        a.load("rax", { base: "rax", disp: P.value + 8 });
        a.lea("r10", { rip: "rt.asyncGeneratorPrototype" });
        a.store({ base: "rax", disp: O.prototype }, "r10");
        a.mov("r10", 0);
        a.store({ base: "rax", disp: O.properties }, "r10");
        a.load("rax", slot(40));
        a.lea("r10", { rip: "rt.asyncGeneratorFunctionPrototype" });
        a.store({ base: "rax", disp: O.prototype }, "r10");
    });
    b.data("rt.sharedJobQueue", new Uint8Array(16), ".data");
    prependFunctionBuiltin(
        b,
        "rt.sharedQueueInternal",
        "__nonaSharedQueueInternal",
        1,
        "rt.functionPrototype",
    );
    // __nonaSharedQueueInternal(): the registered enqueue function; (fn): register it.
    b.fn("rt.sharedQueueInternal.code", 40, (a) => {
        const read = a.unique("read"),
            done = a.unique("done");
        a.test("rdx", "rdx");
        a.jcc("e", read);
        for (const offset of [0, 8]) {
            a.load("rax", { base: "r8", disp: offset });
            a.store({ rip: "rt.sharedJobQueue", addend: offset }, "rax");
        }
        a.mov("rax", 0);
        a.store({ base: "rcx" }, "rax");
        a.store({ base: "rcx", disp: 8 }, "rax");
        a.jmp(done);
        a.label(read);
        for (const offset of [0, 8]) {
            a.load("rax", { rip: "rt.sharedJobQueue", addend: offset });
            a.store({ base: "rcx", disp: offset }, "rax");
        }
        a.label(done);
    });
    emitPromiseIntrinsics(b);
    // rt.prelude.NAME: RCX output, RDX argc, R8 argv; calls __nonaRegexpVm.NAME.
    for (const name of preludeHelpers) {
        b.bundle.fragments.push(stringLiteral("rt.str.prelude." + name, name));
        rootedFn(
            b,
            "rt.prelude." + name,
            104,
            [
                { kind: "output", register: "rcx" },
                { kind: "range", register: "r8", count: "rdx" },
                { kind: "locals", offset: 64, count: 2 },
            ],
            (a) => {
                a.store(slot(40), "rcx");
                a.store(slot(48), "rdx");
                a.store(slot(56), "r8");
                a.mov("rax", 4);
                a.store(slot(80), "rax");
                a.lea("rax", { rip: "rt.str.prelude." + name });
                a.store(slot(88), "rax");
                a.load("rdx", { rip: "rt.regexpVmCell" });
                a.test("rdx", "rdx");
                failIf(a, "e", "rt.throwTypeError");
                a.lea("rcx", slot(64));
                a.lea("r8", slot(80));
                a.call("rt.getProperty");
                a.lea("rax", { rip: "rt.undefinedValue" });
                a.store(slot(32), "rax");
                a.load("rcx", slot(40));
                a.lea("rdx", slot(64));
                a.load("r8", slot(48));
                a.load("r9", slot(56));
                a.call("rt.invoke");
            },
        );
    }
    // RCX in/out Value*: the internal coroutine on entry, the public promise or
    // async generator on return. RDX: 2 async function, 3 async generator.
    rootedFn(
        b,
        "rt.startAsync",
        120,
        [
            { kind: "output", register: "rcx" },
            { kind: "locals", offset: 64, count: 3 },
        ],
        (a) => {
            a.store(slot(40), "rcx");
            a.store(slot(48), "rdx");
            for (const offset of [0, 8]) {
                a.load("rax", { base: "rcx", disp: offset });
                a.store(slot(96 + offset), "rax");
            }
            a.mov("rax", 4);
            a.store(slot(80), "rax");
            const generator = a.unique("generator"),
                keyReady = a.unique("keyReady");
            a.load("rax", slot(48));
            a.cmp("rax", 3);
            a.jcc("e", generator);
            a.lea("rax", { rip: "rt.str.asyncFunctionStart" });
            a.jmp(keyReady);
            a.label(generator);
            a.lea("rax", { rip: "rt.str.asyncGeneratorStart" });
            a.label(keyReady);
            a.store(slot(88), "rax");
            a.load("rdx", { rip: "rt.regexpVmCell" });
            a.test("rdx", "rdx");
            failIf(a, "e", "rt.throwTypeError");
            a.lea("rcx", slot(64));
            a.lea("r8", slot(80));
            a.call("rt.getProperty");
            a.lea("rax", { rip: "rt.undefinedValue" });
            a.store(slot(32), "rax");
            a.load("rcx", slot(40));
            a.lea("rdx", slot(64));
            a.mov("r8", 1);
            a.lea("r9", slot(96));
            a.call("rt.invoke");
        },
    );
}

function emitPromiseIntrinsics(b: RuntimeBuilder): void {
    for (const [symbol, name, length] of promiseIntrinsics)
        prependFunctionBuiltin(b, symbol, name, length, "rt.functionPrototype");
    // __nonaPromiseCreateInternal(prototype): a new pending promise whose
    // prototype is the argument (null unless it is an object).
    rootedFn(
        b,
        "rt.promiseCreateInternal.code",
        72,
        [
            { kind: "output", register: "rcx" },
            { kind: "range", register: "r8", count: "rdx" },
        ],
        (a) => {
            a.store(slot(40), "rcx");
            a.store(slot(48), "rdx");
            a.store(slot(56), "r8");
            a.mov("rcx", PromiseLayout.size);
            a.call("rt.alloc");
            a.mov("r10", HeapKind.object);
            a.store({ base: "rax", disp: H.kind - H.size }, "r10");
            a.mov("r10", PromiseKind);
            a.store({ base: "rax", disp: O.kind }, "r10");
            const ready = a.unique("prototypeReady");
            a.mov("r10", 0);
            a.load("rdx", slot(48));
            a.test("rdx", "rdx");
            a.jcc("e", ready);
            a.load("r11", slot(56));
            a.load("rdx", { base: "r11" });
            a.cmp("rdx", 5);
            a.jcc("ne", ready);
            a.load("r10", { base: "r11", disp: 8 });
            a.label(ready);
            a.store({ base: "rax", disp: O.prototype }, "r10");
            a.load("rcx", slot(40));
            a.mov("r10", 5);
            a.store({ base: "rcx" }, "r10");
            a.store({ base: "rcx", disp: 8 }, "rax");
        },
    );
    // Loads the slot number (argument 1, a Number) into R11 and the promise
    // (argument 0) into R10; jumps to notPromise when argument 0 is not one.
    const promiseAndSlot = (
        a: import("../backend/machine/context.js").Assembler,
        notPromise: string,
    ) => {
        a.load("rax", { base: "r8", disp: 16 });
        a.cmp("rax", 3);
        failIf(a, "ne", "rt.throwTypeError");
        a.movsd("xmm0", { base: "r8", disp: 24 });
        a.cvttsd2si("r11", "xmm0");
        a.load("rax", { base: "r8" });
        a.cmp("rax", 5);
        a.jcc("ne", notPromise);
        a.load("r10", { base: "r8", disp: 8 });
        a.load("rax", { base: "r10", disp: O.kind });
        a.cmp("rax", PromiseKind);
        a.jcc("ne", notPromise);
    };
    // __nonaPromiseGetInternal(value, slot): slot 0 is the state bits of a
    // promise (promise-layout.ts), or -1 when value is not a promise; 1 the
    // value, 2 and 3 the first and last pending reaction.
    b.fn("rt.promiseGetInternal.code", 40, (a) => {
        const notPromise = a.unique("notPromise"),
            state = a.unique("state"),
            number = a.unique("number"),
            done = a.unique("done");
        a.cmp("rdx", 2);
        failIf(a, "b", "rt.throwTypeError");
        promiseAndSlot(a, notPromise);
        a.test("r11", "r11");
        a.jcc("e", state);
        a.cmp("r11", 3);
        failIf(a, "a", "rt.throwTypeError");
        a.shl("r11", 4);
        a.add("r10", "r11");
        for (const part of [0, 8]) {
            a.load("rax", { base: "r10", disp: PromiseLayout.value - 16 + part });
            a.store({ base: "rcx", disp: part }, "rax");
        }
        a.jmp(done);
        a.label(state);
        a.load("rax", { base: "r10", disp: PromiseLayout.state });
        a.jmp(number);
        a.label(notPromise);
        a.test("r11", "r11");
        failIf(a, "ne", "rt.throwTypeError");
        a.mov("rax", -1);
        a.label(number);
        a.cvtsi2sd("xmm0", "rax");
        a.mov("rax", 3);
        a.store({ base: "rcx" }, "rax");
        a.storesd({ base: "rcx", disp: 8 }, "xmm0");
        a.label(done);
    });
    // __nonaPromiseSetInternal(promise, slot, value): slot as above; the
    // state (slot 0) is a Number.
    b.fn("rt.promiseSetInternal.code", 40, (a) => {
        const notPromise = a.unique("notPromise"),
            state = a.unique("state"),
            done = a.unique("done");
        a.mov("rax", 0);
        a.store({ base: "rcx" }, "rax");
        a.store({ base: "rcx", disp: 8 }, "rax");
        a.cmp("rdx", 3);
        failIf(a, "b", "rt.throwTypeError");
        promiseAndSlot(a, notPromise);
        a.test("r11", "r11");
        a.jcc("e", state);
        a.cmp("r11", 3);
        failIf(a, "a", "rt.throwTypeError");
        a.shl("r11", 4);
        a.add("r10", "r11");
        for (const part of [0, 8]) {
            a.load("rax", { base: "r8", disp: 32 + part });
            a.store(
                { base: "r10", disp: PromiseLayout.value - 16 + part },
                "rax",
            );
        }
        a.jmp(done);
        a.label(state);
        a.load("rax", { base: "r8", disp: 32 });
        a.cmp("rax", 3);
        failIf(a, "ne", "rt.throwTypeError");
        a.movsd("xmm0", { base: "r8", disp: 40 });
        a.cvttsd2si("rax", "xmm0");
        a.store({ base: "r10", disp: PromiseLayout.state }, "rax");
        a.jmp(done);
        a.label(notPromise);
        a.call("rt.throwTypeError");
        a.label(done);
    });
}
