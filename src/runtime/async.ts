import { RuntimeBuilder, slot, failIf } from "./abi.js";
import { rootedFn } from "./root-scope.js";
import { ObjectLayout as O, PropertyLayout as P } from "./object-layout.js";
import { stringLiteral } from "./value.js";
import {
    prependFunctionBuiltin,
    builtinPropertyRoots,
} from "./function-builtin.js";
import { emitPromiseNative, promiseIntrinsics } from "./promise-native.js";

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
// The promise intrinsics (#44): a promise is a PromiseKind object whose
// internal slots (promise-layout.ts) the prelude reads and writes through
// them; the job queue they work on is shared by every realm.
export const asyncPropertyRoots = promiseIntrinsics.flatMap(([symbol, name]) =>
    builtinPropertyRoots(symbol, name),
);
export const asyncRoots = [
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
    emitPromiseNative(b);
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
