import { RuntimeBuilder, slot } from "./abi.js";
import type { Assembler, Reg } from "../backend/machine/context.js";
import { ArrayBufferLayout, TypedArrayLayout } from "./array-buffer-layout.js";

// Block kernels of typed arrays and ArrayBuffers (#253): an overlapping
// copy, a pattern fill and an element search, sixteen bytes per step where
// the element type allows it. Element types are 1 Uint8, 2 Int8,
// 3 Uint8Clamped, 4 Uint16, 5 Int16, 6 Uint32, 7 Int32, 8 Float32, 9 Float64,
// 10 BigInt64, 11 BigUint64 and 12 Float16 (only with the float16 part; a
// Float16 element is compared and converted as a number, never as its bits).

/** The 64-bit word repeating each width (1, 2 or 4 bytes) of an element. */
const repeat = {
    1: 0x0101010101010101n,
    2: 0x0001000100010001n,
    4: 0x0000000100000001n,
};

/**
 * Keeps the low `width` bytes of `value` (width in `widthReg`: 1, 2, 4 or 8)
 * and repeats them over the 64-bit register. Clobbers `scratch`.
 */
export function emitReplicate(
    a: Assembler,
    value: Reg,
    widthReg: Reg,
    scratch: Reg,
): void {
    const done = a.unique("replicated");
    for (const width of [1, 2, 4] as const) {
        const next = a.unique("replicate");
        a.cmp(widthReg, width);
        a.jcc("ne", next);
        a.shl(value, 64 - 8 * width);
        a.shr(value, 64 - 8 * width);
        a.mov(scratch, repeat[width]);
        a.imul(value, scratch);
        a.jmp(done);
        a.label(next);
    }
    a.label(done);
}

/** RAX the element type in, its width in bytes out. */
export function emitElementWidth(a: Assembler, float16 = false): void {
    const done = a.unique("width");
    if (float16) {
        const next = a.unique("notHalf");
        a.cmp("rax", 12);
        a.jcc("ne", next);
        a.mov("rax", 2);
        a.jmp(done);
        a.label(next);
    }
    for (const [last, width] of [
        [3, 1],
        [5, 2],
        [8, 4],
    ] as const) {
        const next = a.unique("wider");
        a.cmp("rax", last);
        a.jcc("a", next);
        a.mov("rax", width);
        a.jmp(done);
        a.label(next);
    }
    a.mov("rax", 8);
    a.label(done);
}

export function emitTypedArrayKernels(b: RuntimeBuilder): void {
    // RCX destination, RDX source, R8 byte count; the ranges may overlap
    // (memmove). Forward copies go to rt.copyBytes; a destination inside the
    // source range is copied backward, sixteen bytes per step. Clobbers RCX,
    // RDX, R8, R9 and XMM4.
    b.fn("rt.moveBytes", 56, (a) => {
        const forward = a.unique("forward"),
            vector = a.unique("vector"),
            bytes = a.unique("bytes"),
            done = a.unique("done");
        a.mov("rax", "rcx");
        a.sub("rax", "rdx");
        a.cmp("rax", "r8");
        a.jcc("ae", forward);
        a.label(vector);
        a.cmp("r8", 16);
        a.jcc("b", bytes);
        a.sub("r8", 16);
        a.mov("r9", "rdx");
        a.add("r9", "r8");
        a.loadXmm128("xmm4", { base: "r9" });
        a.mov("r9", "rcx");
        a.add("r9", "r8");
        a.storeXmm128({ base: "r9" }, "xmm4");
        a.jmp(vector);
        a.label(bytes);
        a.test("r8", "r8");
        a.jcc("e", done);
        a.sub("r8", 1);
        a.mov("r9", "rdx");
        a.add("r9", "r8");
        a.load("rax", { base: "r9" }, 8);
        a.mov("r9", "rcx");
        a.add("r9", "r8");
        a.store({ base: "r9" }, "rax", 8);
        a.jmp(bytes);
        a.label(forward);
        a.call("rt.copyBytes");
        a.label(done);
    });
    // RCX destination, RDX 64-bit pattern, R8 byte count: stores the pattern
    // over the range, sixteen bytes per step, then its leading bytes. The
    // range starts on an element and the pattern repeats the element, so
    // every store continues it. Clobbers RCX, RDX, R8 and XMM4.
    b.fn("rt.fillBytes", 56, (a) => {
        const vector = a.unique("vector"),
            word = a.unique("word"),
            bytes = a.unique("bytes"),
            done = a.unique("done");
        a.store(slot(40), "rdx");
        a.store(slot(48), "rdx");
        a.loadXmm128("xmm4", slot(40));
        a.label(vector);
        a.cmp("r8", 16);
        a.jcc("b", word);
        a.storeXmm128({ base: "rcx" }, "xmm4");
        a.add("rcx", 16);
        a.sub("r8", 16);
        a.jmp(vector);
        a.label(word);
        a.cmp("r8", 8);
        a.jcc("b", bytes);
        a.store({ base: "rcx" }, "rdx");
        a.add("rcx", 8);
        a.sub("r8", 8);
        a.label(bytes);
        a.test("r8", "r8");
        a.jcc("e", done);
        a.store({ base: "rcx" }, "rdx", 8);
        a.shr("rdx", 8);
        a.add("rcx", 1);
        a.sub("r8", 1);
        a.jmp(bytes);
        a.label(done);
    });
    emitFindElements(b);
}

/**
 * rt.findElements: RCX the first element, RDX the start index, R8 the index
 * where the search stops (the length forward, -1 backward), R9 the element's
 * bits for integer types (masked to the width), R10 the element type (plus 16
 * to look for NaN), R11 the step (1 or -1), XMM0 the number for float types.
 * Returns the index of the first element found in RAX, or -1. Integer types
 * searched forward compare sixteen bytes per step. Float types compare as
 * numbers: +0 finds -0 and NaN finds nothing, except in NaN mode.
 */
function emitFindElements(b: RuntimeBuilder): void {
    b.fn("rt.findElements", 56, (a) => {
        const notFound = a.unique("notFound"),
            done = a.unique("done"),
            scalar = a.unique("scalar");
        const scalarInt = {
            1: a.unique("int1"),
            2: a.unique("int2"),
            4: a.unique("int4"),
        };
        a.mov("rax", "rdx");
        a.cmp("r11", 1);
        a.jcc("ne", scalar);
        const kinds = [
            [1, 3, 1],
            [4, 5, 2],
            [6, 7, 4],
        ] as const;
        const vectorLabels = kinds.map(() => a.unique("vector"));
        kinds.forEach(([, last], i) => {
            a.cmp("r10", last);
            a.jcc("be", vectorLabels[i]!);
        });
        a.jmp(scalar);
        kinds.forEach(([, , width], i) => {
            const loop = a.unique("loop"),
                hit = a.unique("hit");
            a.label(vectorLabels[i]!);
            a.mov("rdx", "r9");
            a.mov("r10", repeat[width]);
            a.imul("rdx", "r10");
            a.store(slot(40), "rdx");
            a.store(slot(48), "rdx");
            a.loadXmm128("xmm4", slot(40));
            a.label(loop);
            a.mov("r10", "r8");
            a.sub("r10", "rax");
            a.cmp("r10", 16 / width);
            a.jcc("l", scalarInt[width]);
            a.mov("r10", "rax");
            a.shl("r10", Math.log2(width));
            a.add("r10", "rcx");
            a.loadXmm128("xmm5", { base: "r10" });
            if (width === 1) a.vectorEqual8("xmm5", "xmm4");
            else if (width === 2) a.vectorEqual16("xmm5", "xmm4");
            else a.vectorEqual32("xmm5", "xmm4");
            a.vectorMask("r10", "xmm5");
            a.test("r10", "r10");
            a.jcc("ne", hit);
            a.add("rax", 16 / width);
            a.jmp(loop);
            a.label(hit);
            a.bitScanForward("r10", "r10");
            a.shr("r10", Math.log2(a.vectorMaskBitsPerByte) + Math.log2(width));
            a.add("rax", "r10");
            a.jmp(done);
        });
        // One element per step, in either direction.
        const float32 = a.unique("float32"),
            float64 = a.unique("float64"),
            nan32 = a.unique("nan32"),
            nan64 = a.unique("nan64");
        a.label(scalar);
        for (const [kind, target] of [
            [3, scalarInt[1]],
            [5, scalarInt[2]],
            [7, scalarInt[4]],
            [8, float32],
            [9, float64],
            [24, nan32],
        ] as const) {
            a.cmp("r10", kind);
            a.jcc("be", target);
        }
        a.jmp(nan64);
        const loopOver = (
            label: string,
            width: 1 | 2 | 4 | 8,
            test: (next: string) => void,
        ): void => {
            const loop = a.unique("each"),
                next = a.unique("next");
            a.label(label);
            a.label(loop);
            a.cmp("rax", "r8");
            a.jcc("e", notFound);
            a.mov("r10", "rax");
            if (width > 1) a.shl("r10", Math.log2(width));
            a.add("r10", "rcx");
            test(next);
            a.label(next);
            a.add("rax", "r11");
            a.jmp(loop);
        };
        for (const width of [1, 2, 4] as const)
            loopOver(scalarInt[width], width, (next) => {
                a.load("rdx", { base: "r10" }, (8 * width) as 8 | 16 | 32);
                a.cmp("rdx", "r9");
                a.jcc("ne", next);
                a.jmp(done);
            });
        for (const [label, width, nan] of [
            [float32, 4, false],
            [float64, 8, false],
            [nan32, 4, true],
            [nan64, 8, true],
        ] as const)
            loopOver(label, width, (next) => {
                if (width === 4) {
                    a.load("rdx", { base: "r10" }, 32);
                    a.movqToXmm("xmm1", "rdx");
                    a.cvtss2sd("xmm1", "xmm1");
                } else a.movsd("xmm1", { base: "r10" });
                if (nan) {
                    a.ucomisd("xmm1", "xmm1");
                    a.jcc("np", next);
                } else {
                    a.ucomisd("xmm1", "xmm0");
                    a.jcc("p", next);
                    a.jcc("ne", next);
                }
                a.jmp(done);
            });
        a.label(notFound);
        a.mov("rax", -1);
        a.label(done);
    });
}

/** The [least, greatest] number of each integer element type. */
const integerRanges: Record<number, [number, number]> = {
    1: [0, 255],
    2: [-128, 127],
    3: [0, 255],
    4: [0, 65535],
    5: [-32768, 32767],
    6: [0, 4294967295],
    7: [-2147483648, 2147483647],
};

/**
 * The native path of %TypedArray%.prototype.includes, indexOf and lastIndexOf
 * for a Number searched in a typed array of Number elements: the elements are
 * compared in place by rt.findElements instead of being read as values. Other
 * searches (BigInt and Float16 arrays, values that are not Numbers) jump to
 * `generic`.
 * Slots: the receiver value at `receiver` (its object at +8), the searched
 * value at `search` and the start index at `start`, where a found index is
 * stored before the jump to `found`. The length read at the start of the
 * method may exceed the current one: elements past the end are undefined and
 * equal no Number.
 */
export function emitTypedSearch(
    a: Assembler,
    name: "includes" | "indexOf" | "lastIndexOf",
    slots: { receiver: number; search: number; start: number },
    labels: { generic: string; found: string; notFound: string },
): void {
    const { notFound } = labels;
    const ready = a.unique("searchReady"),
        integer = a.unique("integer"),
        masked = a.unique("masked");
    a.load("rax", slot(slots.search));
    a.cmp("rax", 3);
    a.jcc("ne", labels.generic);
    a.load("r10", slot(slots.receiver + 8));
    a.load("r11", { base: "r10", disp: TypedArrayLayout.elementType });
    a.cmp("r11", 10);
    a.jcc("ae", labels.generic);
    a.load("rcx", { base: "r10", disp: TypedArrayLayout.buffer });
    a.load("rax", { base: "rcx", disp: ArrayBufferLayout.detached });
    a.test("rax", "rax");
    a.jcc("ne", notFound);
    a.load("rcx", { base: "rcx", disp: ArrayBufferLayout.bytes });
    a.load("rax", { base: "r10", disp: TypedArrayLayout.byteOffset });
    a.add("rcx", "rax");
    a.load("rdx", slot(slots.start));
    a.load("r8", { base: "r10", disp: TypedArrayLayout.length });
    if (name === "lastIndexOf") {
        const inside = a.unique("inside");
        a.test("r8", "r8");
        a.jcc("e", notFound);
        a.cmp("rdx", "r8");
        a.jcc("b", inside);
        a.lea("rdx", { base: "r8", disp: -1 });
        a.label(inside);
        a.mov("r8", -1);
    } else {
        a.cmp("rdx", "r8");
        a.jcc("ae", notFound);
    }
    a.mov("r10", "r11");
    a.movsd("xmm0", slot(slots.search + 8));
    a.cmp("r10", 8);
    a.jcc("b", integer);
    a.ucomisd("xmm0", "xmm0");
    a.jcc("np", ready);
    // NaN: only includes finds it (SameValueZero), as a NaN element.
    if (name !== "includes") a.jmp(notFound);
    a.add("r10", 16);
    a.jmp(ready);
    a.label(integer);
    // The element's bits, when the number is one of the type's values.
    a.cvttsd2si("r9", "xmm0");
    a.cvtsi2sd("xmm1", "r9");
    a.ucomisd("xmm0", "xmm1");
    a.jcc("p", notFound);
    a.jcc("ne", notFound);
    for (const [kind, [least, greatest]] of Object.entries(integerRanges)) {
        const next = a.unique("type");
        const width = Number(kind) <= 3 ? 1 : Number(kind) <= 5 ? 2 : 4;
        a.cmp("r10", Number(kind));
        a.jcc("ne", next);
        a.mov("r11", least);
        a.cmp("r9", "r11");
        a.jcc("l", notFound);
        a.mov("r11", greatest);
        a.cmp("r9", "r11");
        a.jcc("g", notFound);
        a.shl("r9", 64 - 8 * width);
        a.shr("r9", 64 - 8 * width);
        a.jmp(masked);
        a.label(next);
    }
    a.label(masked);
    a.label(ready);
    a.mov("r11", name === "lastIndexOf" ? -1 : 1);
    a.call("rt.findElements");
    a.cmp("rax", -1);
    a.jcc("e", notFound);
    a.store(slot(slots.start), "rax");
    a.jmp(labels.found);
}
