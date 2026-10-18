import { RuntimeBuilder, slot, failIf } from "./abi.js";
import {
    selectNativeConstructPrototype,
    resolveDeferredConstructPrototype,
} from "./constructor-prototype.js";
import type { Assembler } from "../backend/machine/context.js";
import { rootedFn } from "./root-scope.js";
import { HeapKind, HeapLayout as H } from "./heap-layout.js";
import {
    ObjectLayout as O,
    PropertyLayout as P,
    PropertyAttributes as A,
} from "./object-layout.js";
import {
    emitNativeFunction,
    prependFunctionBuiltin,
    builtinPropertyRoots,
} from "./function-builtin.js";
import { stringLiteral } from "./value.js";
import {
    ArrayBufferKind,
    ArrayBufferLayout,
    SharedArrayBufferKind,
    SharedLengthHeader,
} from "./array-buffer-layout.js";

export { ArrayBufferKind, ArrayBufferLayout };
export const arrayBufferRoots = [
    "rt.arrayBufferByteLength.fn",
    "rt.ArrayBuffer.species.fn",
    "rt.arrayBufferCopy.fn",
    "rt.ArrayBuffer.isView.fn",
    "rt.arrayBufferDetach.fn",
    "rt.arrayBufferAlignment.fn",
    "rt.arrayBufferResizable.fn",
];
export const arrayBufferPropertyRoots = [
    "rt.arraybufferPrototype.byteLength",
    "rt.arraybufferPrototype.@@toStringTag",
    "rt.ArrayBuffer.@@species",
    ...arrayBufferRoots
        .slice(0, 2)
        .flatMap((name) => [name + ".name", name + ".length"]),
    ...builtinPropertyRoots(
        "rt.arrayBufferCopy.fn",
        "__nonaCopyInternal",
        "rt.ArrayBuffer",
    ),
    ...builtinPropertyRoots(
        "rt.ArrayBuffer.isView.fn",
        "isView",
        "rt.ArrayBuffer",
    ),
    ...builtinPropertyRoots(
        "rt.arrayBufferDetach.fn",
        "__nonaDetachInternal",
        "rt.ArrayBuffer",
    ),
    ...builtinPropertyRoots(
        "rt.arrayBufferAlignment.fn",
        "__nonaAlignmentInternal",
        "rt.ArrayBuffer",
    ),
    ...builtinPropertyRoots(
        "rt.arrayBufferResizable.fn",
        "__nonaResizableInternal",
        "rt.ArrayBuffer",
    ),
];

/**
 * The ArrayBuffer and SharedArrayBuffer constructor steps before the
 * allocation (ES2024 25.1.4.1, 25.2.3.1): ToIndex(length) into slot(72),
 * GetArrayBufferMaxByteLengthOption into slot(104) (-1 without one), the
 * length check, GetPrototypeFromConstructor, and then the allocation limit.
 * Expects the argument count in slot(48), the arguments in slot(56) and a
 * rooted 16-byte local at slot(80).
 */
export function emitBufferConstructLengths(
    a: Assembler,
    frame: number,
    intrinsic: string,
): void {
    const noOptions = a.unique("noOptions"),
        invalid = a.unique("invalid"),
        checked = a.unique("checked");
    a.mov("rax", 0);
    a.store(slot(72), "rax");
    a.mov("rax", -1);
    a.store(slot(104), "rax");
    a.load("rax", slot(48));
    a.test("rax", "rax");
    a.jcc("e", noOptions);
    a.load("rcx", slot(56));
    a.call("rt.arrayBufferToIndex");
    a.store(slot(72), "rax");
    a.load("rax", slot(48));
    a.cmp("rax", 2);
    a.jcc("b", noOptions);
    a.load("rdx", slot(56));
    a.load("rax", { base: "rdx", disp: 16 });
    a.cmp("rax", 5);
    a.jcc("ne", noOptions);
    a.lea("rcx", slot(80));
    a.add("rdx", 16);
    a.lea("r8", { rip: "rt.arrayBuffer.key.maxByteLength" });
    a.call("rt.getProperty");
    a.load("rax", slot(80));
    a.test("rax", "rax");
    a.jcc("e", noOptions);
    a.lea("rcx", slot(80));
    a.call("rt.arrayBufferToIndex");
    a.store(slot(104), "rax");
    a.load("r10", slot(72));
    a.cmp("r10", "rax");
    a.jcc("a", invalid);
    a.label(noOptions);
    resolveDeferredConstructPrototype(a, frame, intrinsic, 80);
    // Storage is reserved up front, so maxByteLength is subject to the same
    // allocation limit as the length.
    a.load("rax", slot(72));
    a.cmp("rax", 0x7fffffff);
    a.jcc("a", invalid);
    a.load("rax", slot(104));
    a.cmp("rax", 0x7fffffff);
    a.jcc("le", checked);
    a.label(invalid);
    a.call("rt.throwRangeError");
    a.label(checked);
}

export function emitArrayBufferPrototype(b: RuntimeBuilder): void {
    const bytes = new Uint8Array(O.size);
    b.bundle.fragments.push({
        name: "rt.arraybufferPrototype",
        section: ".data",
        alignment: 8,
        bytes,
        symbols: {},
        fixups: [
            {
                offset: O.prototype,
                kind: "va64",
                target: "rt.objectPrototype",
                addend: 0,
            },
        ],
    });
}

export function emitArrayBuffer(b: RuntimeBuilder): void {
    // RCX Value*: ToIndex into RAX. The caller checks the allocation limit
    // after the steps that come before the allocation.
    b.fn("rt.arrayBufferToIndex", 56, (a) => {
        const zero = a.unique("zero"),
            invalid = a.unique("invalid"),
            done = a.unique("done");
        a.mov("rdx", "rcx");
        a.lea("rcx", slot(32));
        a.call("rt.toNumber");
        a.movsd("xmm0", slot(40));
        a.ucomisd("xmm0", "xmm0");
        a.jcc("p", zero);
        a.mov("rax", -1);
        a.cvtsi2sd("xmm1", "rax");
        a.ucomisd("xmm0", "xmm1");
        a.jcc("be", invalid);
        a.mov("rax", 0x1fffffffffffffn);
        a.cvtsi2sd("xmm1", "rax");
        a.ucomisd("xmm0", "xmm1");
        a.jcc("a", invalid);
        a.cvttsd2si("rax", "xmm0");
        a.jmp(done);
        a.label(zero);
        a.mov("rax", 0);
        a.jmp(done);
        a.label(invalid);
        a.call("rt.throwRangeError");
        a.label(done);
    });
    b.bundle.fragments.push(
        stringLiteral("rt.arrayBuffer.maxByteLengthText", "maxByteLength"),
    );
    const maxByteLengthKey = new Uint8Array(16);
    maxByteLengthKey[0] = 4;
    b.bundle.fragments.push({
        name: "rt.arrayBuffer.key.maxByteLength",
        section: ".rdata",
        alignment: 8,
        bytes: maxByteLengthKey,
        symbols: {},
        fixups: [
            {
                offset: 8,
                kind: "va64",
                target: "rt.arrayBuffer.maxByteLengthText",
                addend: 0,
            },
        ],
    });
    // __nonaResizableInternal(buffer) returns maxByteLength, or -1 for a
    // fixed-length buffer; a detached buffer gives -2 (fixed length) or -3
    // (resizable). __nonaResizableInternal(buffer, length) sets the length of
    // a resizable ArrayBuffer or grows a growable SharedArrayBuffer to an
    // integer in 0..maxByteLength that the caller validated, and returns false
    // when another agent already grew the SharedArrayBuffer past it.
    prependFunctionBuiltin(
        b,
        "rt.arrayBufferResizable.fn",
        "__nonaResizableInternal",
        2,
        "rt.ArrayBuffer",
    );
    b.fn("rt.arrayBufferResizable.fn.code", 56, (a) => {
        const buffer = a.unique("buffer"),
            resize = a.unique("resize"),
            report = a.unique("report"),
            grow = a.unique("grow"),
            retry = a.unique("retry"),
            grown = a.unique("grown"),
            yes = a.unique("yes"),
            no = a.unique("no"),
            done = a.unique("done");
        a.store(slot(40), "rcx");
        a.test("rdx", "rdx");
        failIf(a, "e", "rt.throwTypeError");
        a.load("rax", { base: "r8" });
        a.cmp("rax", 5);
        failIf(a, "ne", "rt.throwTypeError");
        a.load("r10", { base: "r8", disp: 8 });
        a.load("rax", { base: "r10", disp: O.kind });
        a.cmp("rax", ArrayBufferKind);
        a.jcc("e", buffer);
        a.cmp("rax", SharedArrayBufferKind);
        failIf(a, "ne", "rt.throwTypeError");
        a.label(buffer);
        a.cmp("rdx", 2);
        a.jcc("ae", resize);
        a.load("rax", { base: "r10", disp: ArrayBufferLayout.maxByteLength });
        a.load("r11", { base: "r10", disp: ArrayBufferLayout.detached });
        a.test("r11", "r11");
        a.jcc("e", report);
        a.test("rax", "rax");
        a.mov("rax", -2);
        a.jcc("s", report);
        a.mov("rax", -3);
        a.label(report);
        a.cvtsi2sd("xmm0", "rax");
        a.mov("rax", 3);
        a.store({ base: "rcx" }, "rax");
        a.storesd({ base: "rcx", disp: 8 }, "xmm0");
        a.jmp(done);
        a.label(resize);
        a.load("rax", { base: "r10", disp: ArrayBufferLayout.detached });
        a.test("rax", "rax");
        failIf(a, "ne", "rt.throwTypeError");
        a.load("r11", { base: "r10", disp: ArrayBufferLayout.maxByteLength });
        a.test("r11", "r11");
        failIf(a, "s", "rt.throwTypeError");
        a.load("rax", { base: "r8", disp: 16 });
        a.cmp("rax", 3);
        failIf(a, "ne", "rt.throwTypeError");
        a.movsd("xmm0", { base: "r8", disp: 24 });
        a.cvttsd2si("rdx", "xmm0");
        a.test("rdx", "rdx");
        failIf(a, "s", "rt.throwRangeError");
        a.cmp("rdx", "r11");
        failIf(a, "a", "rt.throwRangeError");
        a.load("rax", { base: "r10", disp: O.kind });
        a.cmp("rax", SharedArrayBufferKind);
        a.jcc("e", grow);
        // The storage is reserved: only the bytes that become visible again
        // are cleared, since views of the old length may have written them.
        a.load("r8", { base: "r10", disp: ArrayBufferLayout.byteLength });
        a.store({ base: "r10", disp: ArrayBufferLayout.byteLength }, "rdx");
        a.cmp("rdx", "r8");
        a.jcc("be", yes);
        a.load("rcx", { base: "r10", disp: ArrayBufferLayout.bytes });
        a.add("rcx", "r8");
        a.sub("rdx", "r8");
        a.mov("r8", "rdx");
        a.mov("rdx", 0);
        a.call("rt.fillBytes");
        a.jmp(yes);
        // Agents share the length word: it only grows, by compare-and-swap.
        a.label(grow);
        a.load("r9", { base: "r10", disp: ArrayBufferLayout.bytes });
        a.label(retry);
        a.load("rax", { base: "r9", disp: -SharedLengthHeader });
        a.cmp("rdx", "rax");
        a.jcc("b", no);
        a.jcc("e", grown);
        a.mov("r11", "rax");
        a.atomicCompareExchange(
            { base: "r9", disp: -SharedLengthHeader },
            "rdx",
            64,
        );
        a.cmp("rax", "r11");
        a.jcc("ne", retry);
        a.label(grown);
        a.store({ base: "r10", disp: ArrayBufferLayout.byteLength }, "rdx");
        a.label(yes);
        a.mov("r11", 1);
        const answer = a.unique("answer");
        a.jmp(answer);
        a.label(no);
        a.mov("r11", 0);
        a.label(answer);
        a.load("rcx", slot(40));
        a.mov("rax", 2);
        a.store({ base: "rcx" }, "rax");
        a.store({ base: "rcx", disp: 8 }, "r11");
        a.label(done);
    });
    // Returns the byte offset that aligns an ArrayBuffer's backing address.
    // No call can allocate here, and the owning ArrayBuffer retains the whole block.
    prependFunctionBuiltin(
        b,
        "rt.arrayBufferAlignment.fn",
        "__nonaAlignmentInternal",
        2,
        "rt.ArrayBuffer",
    );
    b.fn("rt.arrayBufferAlignment.fn.code", 40, (a) => {
        a.cmp("rdx", 2);
        failIf(a, "b", "rt.throwTypeError");
        a.load("rax", { base: "r8" });
        a.cmp("rax", 5);
        failIf(a, "ne", "rt.throwTypeError");
        a.load("r10", { base: "r8", disp: 8 });
        a.load("rax", { base: "r10", disp: O.kind });
        a.cmp("rax", ArrayBufferKind);
        failIf(a, "ne", "rt.throwTypeError");
        a.load("rax", { base: "r8", disp: 16 });
        a.cmp("rax", 3);
        failIf(a, "ne", "rt.throwTypeError");
        a.movsd("xmm0", { base: "r8", disp: 24 });
        a.cvttsd2si("r11", "xmm0");
        a.sub("r11", 1);
        a.load("rax", { base: "r10", disp: ArrayBufferLayout.bytes });
        a.neg("rax");
        a.and("rax", "r11");
        a.cvtsi2sd("xmm0", "rax");
        a.mov("rax", 3);
        a.store({ base: "rcx" }, "rax");
        a.storesd({ base: "rcx", disp: 8 }, "xmm0");
    });
    prependFunctionBuiltin(
        b,
        "rt.arrayBufferDetach.fn",
        "__nonaDetachInternal",
        1,
        "rt.ArrayBuffer",
    );
    b.fn("rt.arrayBufferDetach.fn.code", 40, (a) => {
        a.test("rdx", "rdx");
        failIf(a, "e", "rt.throwTypeError");
        a.load("rax", { base: "r8" });
        a.cmp("rax", 5);
        failIf(a, "ne", "rt.throwTypeError");
        a.load("r10", { base: "r8", disp: 8 });
        a.load("rax", { base: "r10", disp: O.kind });
        a.cmp("rax", ArrayBufferKind);
        failIf(a, "ne", "rt.throwTypeError");
        a.mov("rax", 0);
        a.store({ base: "r10", disp: ArrayBufferLayout.byteLength }, "rax");
        a.mov("rax", 1);
        a.store({ base: "r10", disp: ArrayBufferLayout.detached }, "rax");
        a.mov("rax", 0);
        a.store({ base: "rcx" }, "rax");
        a.store({ base: "rcx", disp: 8 }, "rax");
    });
    prependFunctionBuiltin(
        b,
        "rt.ArrayBuffer.isView.fn",
        "isView",
        1,
        "rt.ArrayBuffer",
    );
    b.fn("rt.ArrayBuffer.isView.fn.code", 40, (a) => {
        a.mov("rax", 2);
        a.store({ base: "rcx" }, "rax");
        a.mov("rax", 0);
        a.store({ base: "rcx", disp: 8 }, "rax");
        const done = a.unique("done");
        a.test("rdx", "rdx");
        a.jcc("e", done);
        a.load("rax", { base: "r8" });
        a.cmp("rax", 5);
        a.jcc("ne", done);
        a.load("rax", { base: "r8", disp: 8 });
        a.load("rax", { base: "rax", disp: O.kind });
        a.cmp("rax", 12);
        const yes = a.unique("yes");
        a.jcc("e", yes);
        a.cmp("rax", 13);
        a.jcc("ne", done);
        a.label(yes);
        a.mov("rax", 1);
        a.store({ base: "rcx", disp: 8 }, "rax");
        a.label(done);
    });
    prependFunctionBuiltin(
        b,
        "rt.arrayBufferCopy.fn",
        "__nonaCopyInternal",
        4,
        "rt.ArrayBuffer",
    );
    b.fn("rt.arrayBufferCopy.fn.code", 88, (a) => {
        a.cmp("rdx", 4);
        failIf(a, "b", "rt.throwTypeError");
        a.load("rax", { base: "r8" });
        a.cmp("rax", 5);
        failIf(a, "ne", "rt.throwTypeError");
        a.load("r10", { base: "r8", disp: 8 });
        a.load("rax", { base: "r10", disp: O.kind });
        a.cmp("rax", ArrayBufferKind);
        const sourceReady = a.unique("sourceReady");
        a.jcc("e", sourceReady);
        a.cmp("rax", SharedArrayBufferKind);
        failIf(a, "ne", "rt.throwTypeError");
        a.label(sourceReady);
        a.store(slot(40), "r10");
        a.load("rax", { base: "r10", disp: ArrayBufferLayout.detached });
        a.test("rax", "rax");
        failIf(a, "ne", "rt.throwTypeError");
        a.load("rax", { base: "r8", disp: 16 });
        a.cmp("rax", 5);
        failIf(a, "ne", "rt.throwTypeError");
        a.load("r10", { base: "r8", disp: 24 });
        a.load("rax", { base: "r10", disp: O.kind });
        a.cmp("rax", ArrayBufferKind);
        const targetReady = a.unique("targetReady");
        a.jcc("e", targetReady);
        a.cmp("rax", SharedArrayBufferKind);
        failIf(a, "ne", "rt.throwTypeError");
        a.label(targetReady);
        a.store(slot(48), "r10");
        a.load("rax", { base: "r10", disp: ArrayBufferLayout.detached });
        a.test("rax", "rax");
        failIf(a, "ne", "rt.throwTypeError");
        for (const [source, target] of [
            [32, 56],
            [48, 64],
        ] as const) {
            a.load("rax", { base: "r8", disp: source });
            a.cmp("rax", 3);
            failIf(a, "ne", "rt.throwTypeError");
            a.movsd("xmm0", { base: "r8", disp: source + 8 });
            a.cvttsd2si("rax", "xmm0");
            a.test("rax", "rax");
            failIf(a, "s", "rt.throwRangeError");
            a.store(slot(target), "rax");
        }
        a.mov("rax", 0);
        a.store(slot(72), "rax");
        const noTargetOffset = a.unique("noTargetOffset");
        a.cmp("rdx", 5);
        a.jcc("b", noTargetOffset);
        a.load("rax", { base: "r8", disp: 64 });
        a.cmp("rax", 3);
        failIf(a, "ne", "rt.throwTypeError");
        a.movsd("xmm0", { base: "r8", disp: 72 });
        a.cvttsd2si("rax", "xmm0");
        a.test("rax", "rax");
        failIf(a, "s", "rt.throwRangeError");
        a.store(slot(72), "rax");
        a.label(noTargetOffset);
        a.load("rax", slot(56));
        a.load("r11", slot(64));
        a.add("rax", "r11");
        failIf(a, "b", "rt.throwRangeError");
        a.load("r10", slot(40));
        a.load("r10", { base: "r10", disp: ArrayBufferLayout.byteLength });
        a.cmp("rax", "r10");
        failIf(a, "a", "rt.throwRangeError");
        a.load("rax", slot(64));
        a.load("r11", slot(72));
        a.add("rax", "r11");
        failIf(a, "b", "rt.throwRangeError");
        a.load("r10", slot(48));
        a.load("r10", { base: "r10", disp: ArrayBufferLayout.byteLength });
        a.cmp("rax", "r10");
        failIf(a, "a", "rt.throwRangeError");
        a.load("rdx", slot(40));
        a.load("rdx", { base: "rdx", disp: ArrayBufferLayout.bytes });
        a.load("r11", slot(56));
        a.add("rdx", "r11");
        a.load("r8", slot(48));
        a.load("r8", { base: "r8", disp: ArrayBufferLayout.bytes });
        a.load("r11", slot(72));
        a.add("r8", "r11");
        // One block copy (#253). rt.copyBytes keeps the byte-by-byte order
        // the specification gives overlapping ranges of one buffer.
        a.store(slot(80), "rcx");
        a.mov("rcx", "r8");
        a.load("r8", slot(64));
        a.call("rt.copyBytes");
        a.load("rcx", slot(80));
        a.mov("rax", 0);
        a.store({ base: "rcx" }, "rax");
        a.store({ base: "rcx", disp: 8 }, "rax");
    });
    b.bundle.fragments.push(stringLiteral("rt.arrayBufferTag", "ArrayBuffer"));
    const tag = new Uint8Array(P.size);
    tag[P.value] = 4;
    tag[P.attributes] = A.configurable;
    const prototype = b.bundle.fragments.find(
        (f) => f.name === "rt.arraybufferPrototype",
    )!;
    const tagHead = prototype.fixups.find((f) => f.offset === O.properties)!;
    b.bundle.fragments.push({
        name: "rt.arraybufferPrototype.@@toStringTag",
        section: ".data",
        alignment: 8,
        bytes: tag,
        symbols: {},
        fixups: [
            { offset: P.next, kind: "va64", target: tagHead.target, addend: 0 },
            {
                offset: P.key,
                kind: "va64",
                target: "rt.Symbol.toStringTag.value",
                addend: 0,
            },
            {
                offset: P.value + 8,
                kind: "va64",
                target: "rt.arrayBufferTag",
                addend: 0,
            },
        ],
    });
    tagHead.target = "rt.arraybufferPrototype.@@toStringTag";
    emitNativeFunction(
        b,
        "rt.ArrayBuffer.species.fn",
        "get [Symbol.species]",
        0,
    );
    const species = new Uint8Array(P.size);
    species[P.attributes] = A.accessor | A.configurable;
    species[P.getter] = 5;
    const constructor = b.bundle.fragments.find(
        (f) => f.name === "rt.ArrayBuffer",
    )!;
    const speciesHead = constructor.fixups.find(
        (f) => f.offset === O.properties,
    )!;
    b.bundle.fragments.push({
        name: "rt.ArrayBuffer.@@species",
        section: ".data",
        alignment: 8,
        bytes: species,
        symbols: {},
        fixups: [
            {
                offset: P.next,
                kind: "va64",
                target: speciesHead.target,
                addend: 0,
            },
            {
                offset: P.key,
                kind: "va64",
                target: "rt.Symbol.species.value",
                addend: 0,
            },
            {
                offset: P.getter + 8,
                kind: "va64",
                target: "rt.ArrayBuffer.species.fn",
                addend: 0,
            },
        ],
    });
    speciesHead.target = "rt.ArrayBuffer.@@species";
    b.fn("rt.ArrayBuffer.species.fn.code", 40, (a) => {
        a.load("rdx", slot(80));
        for (const offset of [0, 8]) {
            a.load("rax", { base: "rdx", disp: offset });
            a.store({ base: "rcx", disp: offset }, "rax");
        }
    });
    emitNativeFunction(b, "rt.arrayBufferByteLength.fn", "get byteLength", 0);
    const property = new Uint8Array(P.size);
    property[P.attributes] = A.accessor | A.configurable;
    property[P.getter] = 5;
    b.bundle.fragments.push(
        stringLiteral("rt.arraybufferPrototype.byteLength.key", "byteLength"),
    );
    const owner = b.bundle.fragments.find(
        (f) => f.name === "rt.arraybufferPrototype",
    )!;
    const head = owner.fixups.find((f) => f.offset === O.properties);
    b.bundle.fragments.push({
        name: "rt.arraybufferPrototype.byteLength",
        section: ".data",
        alignment: 8,
        bytes: property,
        symbols: {},
        fixups: [
            ...(head
                ? [
                      {
                          offset: P.next,
                          kind: "va64" as const,
                          target: head.target,
                          addend: 0,
                      },
                  ]
                : []),
            {
                offset: P.key,
                kind: "va64",
                target: "rt.arraybufferPrototype.byteLength.key",
                addend: 0,
            },
            {
                offset: P.getter + 8,
                kind: "va64",
                target: "rt.arrayBufferByteLength.fn",
                addend: 0,
            },
        ],
    });
    if (head) head.target = "rt.arraybufferPrototype.byteLength";
    else
        owner.fixups.push({
            offset: O.properties,
            kind: "va64",
            target: "rt.arraybufferPrototype.byteLength",
            addend: 0,
        });
    b.fn("rt.arrayBufferByteLength.fn.code", 40, (a) => {
        a.load("rdx", slot(80));
        a.load("rax", { base: "rdx" });
        a.cmp("rax", 5);
        failIf(a, "ne", "rt.throwTypeError");
        a.load("rdx", { base: "rdx", disp: 8 });
        a.load("rax", { base: "rdx", disp: O.kind });
        a.cmp("rax", ArrayBufferKind);
        failIf(a, "ne", "rt.throwTypeError");
        a.load("rax", { base: "rdx", disp: ArrayBufferLayout.byteLength });
        a.cvtsi2sd("xmm0", "rax");
        a.mov("rax", 3);
        a.store({ base: "rcx" }, "rax");
        a.storesd({ base: "rcx", disp: 8 }, "xmm0");
    });
    b.fn("rt.ArrayBuffer.code", 40, (a) => a.call("rt.throwTypeError"));
    rootedFn(
        b,
        "rt.ArrayBuffer.construct",
        168,
        [
            { kind: "output", register: "rcx" },
            { kind: "range", register: "r8", count: "rdx" },
            { kind: "locals", offset: 80, count: 1 },
        ],
        (a, frame) => {
            a.store(slot(40), "rcx");
            a.store(slot(48), "rdx");
            a.store(slot(56), "r8");
            emitBufferConstructLengths(a, frame, "rt.arraybufferPrototype");
            // rt.alloc returns zeroed memory: the bytes start as zeros without a
            // second pass over them. A resizable buffer reserves its maximum.
            a.load("rcx", slot(104));
            a.test("rcx", "rcx");
            const reserve = a.unique("reserve");
            a.jcc("ns", reserve);
            a.load("rcx", slot(72));
            a.label(reserve);
            a.call("rt.alloc");
            a.store(slot(64), "rax");
            a.mov("rcx", ArrayBufferLayout.size);
            a.call("rt.alloc");
            a.mov("r10", HeapKind.object);
            a.store({ base: "rax", disp: H.kind - H.size }, "r10");
            a.mov("r10", ArrayBufferKind);
            a.store({ base: "rax", disp: O.kind }, "r10");
            a.mov("r10", 0);
            for (const offset of [O.properties, O.length, O.shape, O.flags])
                a.store({ base: "rax", disp: offset }, "r10");
            selectNativeConstructPrototype(a, frame, "rt.arraybufferPrototype");
            a.store({ base: "rax", disp: O.prototype }, "r10");
            a.load("r10", slot(64));
            a.store({ base: "rax", disp: ArrayBufferLayout.bytes }, "r10");
            a.load("r10", slot(72));
            a.store({ base: "rax", disp: ArrayBufferLayout.byteLength }, "r10");
            a.mov("r10", 0);
            a.store({ base: "rax", disp: ArrayBufferLayout.detached }, "r10");
            a.load("r10", slot(104));
            a.store(
                { base: "rax", disp: ArrayBufferLayout.maxByteLength },
                "r10",
            );
            a.load("rcx", slot(40));
            a.mov("r10", 5);
            a.store({ base: "rcx" }, "r10");
            a.store({ base: "rcx", disp: 8 }, "rax");
        },
    );
}
