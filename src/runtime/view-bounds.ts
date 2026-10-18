import type { RuntimeBuilder } from "./abi.js";
import { slot } from "./abi.js";
import { float16ElementType } from "./float16.js";
import type { Assembler, Reg } from "../backend/machine/context.js";
import { ObjectLayout as O, ObjectFlags as OF } from "./object-layout.js";
import {
    ArrayBufferLayout,
    SharedArrayBufferKind,
    SharedLengthHeader,
    TypedArrayKind,
    TypedArrayLayout,
    DataViewLayout,
} from "./array-buffer-layout.js";

/**
 * Bounds of typed arrays and DataViews over resizable ArrayBuffers and
 * growable SharedArrayBuffers (ES2024 10.4.5.11-13, 25.3.1.2-4).
 *
 * rt.typedArrayBounds / rt.dataViewBounds take the view in R11 and return
 * R11 = 0 when it is usable, nonzero when its buffer is detached or the view
 * is out of bounds (IsTypedArrayOutOfBounds / IsViewOutOfBounds). For a view
 * of a resizable buffer they first store its current byteLength (and length)
 * in the view, 0 while it is out of bounds; for a growable SharedArrayBuffer
 * the buffer's byteLength is refreshed from the shared length word, as the
 * byteLength getter does. Every other register is preserved (flags are not):
 * call sites keep their values live across the call.
 */
export function emitViewBounds(b: RuntimeBuilder): void {
    emitOrdinaryPreventExtensions(b);
    for (const [name, fixed, typed] of [
        ["rt.typedArrayBounds", TypedArrayLayout.fixedByteLength, true],
        ["rt.dataViewBounds", DataViewLayout.fixedByteLength, false],
    ] as const) {
        b.fn(name, 40, (a) => {
            const saved = ["rax", "rcx", "rdx", "r8", "r9"] as const;
            saved.forEach((r, i) => a.store(slot(8 * i), r));
            const outside = a.unique("outside"),
                tracking = a.unique("tracking"),
                local = a.unique("local"),
                store = a.unique("store"),
                done = a.unique("done");
            a.mov("r8", "r11");
            // The element size as a shift count in RCX.
            a.mov("rcx", 0);
            if (typed) {
                const ready = a.unique("shift");
                a.load("rax", {
                    base: "r8",
                    disp: TypedArrayLayout.elementType,
                });
                for (const [limit, shift] of [
                    [4, 0],
                    [6, 1],
                    [9, 2],
                ] as const) {
                    a.mov("rcx", shift);
                    a.cmp("rax", limit);
                    a.jcc("b", ready);
                }
                a.mov("rcx", 3);
                a.cmp("rax", float16ElementType);
                a.jcc("ne", ready);
                a.mov("rcx", 1);
                a.label(ready);
            }
            a.load("r11", { base: "r8", disp: TypedArrayLayout.buffer });
            a.load("rax", { base: "r11", disp: ArrayBufferLayout.detached });
            a.test("rax", "rax");
            a.jcc("ne", outside);
            a.load("rax", {
                base: "r11",
                disp: ArrayBufferLayout.maxByteLength,
            });
            a.test("rax", "rax");
            // A fixed-length buffer: the fields hold the view's lengths.
            a.mov("r11", 0);
            a.jcc("s", done);
            a.load("r11", { base: "r8", disp: TypedArrayLayout.buffer });
            a.load("rax", { base: "r11", disp: O.kind });
            a.cmp("rax", SharedArrayBufferKind);
            a.jcc("ne", local);
            a.load("rax", { base: "r11", disp: ArrayBufferLayout.bytes });
            a.load("rax", { base: "rax", disp: -SharedLengthHeader });
            a.store({ base: "r11", disp: ArrayBufferLayout.byteLength }, "rax");
            a.label(local);
            a.load("r9", { base: "r11", disp: ArrayBufferLayout.byteLength });
            a.load("rdx", { base: "r8", disp: TypedArrayLayout.byteOffset });
            a.cmp("rdx", "r9");
            a.jcc("a", outside);
            a.load("rax", { base: "r8", disp: fixed });
            a.test("rax", "rax");
            a.jcc("s", tracking);
            a.add("rax", "rdx");
            a.cmp("rax", "r9");
            a.jcc("a", outside);
            a.load("rax", { base: "r8", disp: fixed });
            a.jmp(store);
            a.label(tracking);
            a.mov("rax", "r9");
            a.sub("rax", "rdx");
            if (typed) {
                a.shr("rax", "cl");
                a.shl("rax", "cl");
            }
            a.label(store);
            a.store({ base: "r8", disp: TypedArrayLayout.byteLength }, "rax");
            if (typed) {
                a.shr("rax", "cl");
                a.store({ base: "r8", disp: TypedArrayLayout.length }, "rax");
            }
            a.mov("r11", 0);
            a.jmp(done);
            a.label(outside);
            a.mov("rax", 0);
            a.store({ base: "r8", disp: TypedArrayLayout.byteLength }, "rax");
            if (typed)
                a.store({ base: "r8", disp: TypedArrayLayout.length }, "rax");
            a.mov("r11", 1);
            a.label(done);
            saved.forEach((r, i) => a.load(r, slot(8 * i)));
        });
    }
}

/**
 * OrdinaryPreventExtensions of the object in R10, except that a typed array
 * that is not fixed-length (IsTypedArrayFixedLength: length-tracking, or a
 * view of a resizable ArrayBuffer) stays extensible (ES2024 10.4.5.4).
 * RAX = 1 when the object is now non-extensible, 0 otherwise; changes R11.
 */
function emitOrdinaryPreventExtensions(b: RuntimeBuilder): void {
    b.fn("rt.ordinaryPreventExtensions", 8, (a) => {
        const fixed = a.unique("fixed"),
            done = a.unique("done");
        a.load("rax", { base: "r10", disp: O.kind });
        a.cmp("rax", TypedArrayKind);
        a.jcc("ne", fixed);
        a.mov("rax", 0);
        a.load("r11", { base: "r10", disp: TypedArrayLayout.fixedByteLength });
        a.test("r11", "r11");
        a.jcc("s", done);
        a.load("r11", { base: "r10", disp: TypedArrayLayout.buffer });
        a.load("rax", { base: "r11", disp: O.kind });
        a.cmp("rax", SharedArrayBufferKind);
        a.jcc("e", fixed);
        a.mov("rax", 0);
        a.load("r11", { base: "r11", disp: ArrayBufferLayout.maxByteLength });
        a.test("r11", "r11");
        a.jcc("ns", done);
        a.label(fixed);
        a.load("rax", { base: "r10", disp: O.flags });
        a.or("rax", OF.nonExtensible);
        a.store({ base: "r10", disp: O.flags }, "rax");
        a.mov("rax", 1);
        a.label(done);
    });
}

/**
 * R11 = 0 when the typed array (or, with `dataView`, the DataView) in `view`
 * is usable, nonzero when its buffer is detached or it is out of bounds; its
 * length fields are current afterwards. Views of fixed-length buffers take
 * the inline path: the buffer's detached flag. Changes only R11 and the flags.
 */
export function emitViewCheck(a: Assembler, view: Reg, dataView = false): void {
    if (view === "r11") throw new Error("emitViewCheck: view in R11");
    const fixed = a.unique("fixedBuffer"),
        done = a.unique("viewChecked");
    a.load("r11", { base: view, disp: TypedArrayLayout.buffer });
    a.load("r11", { base: "r11", disp: ArrayBufferLayout.maxByteLength });
    a.test("r11", "r11");
    a.jcc("s", fixed);
    a.mov("r11", view);
    a.call(dataView ? "rt.dataViewBounds" : "rt.typedArrayBounds");
    a.jmp(done);
    a.label(fixed);
    a.load("r11", { base: view, disp: TypedArrayLayout.buffer });
    a.load("r11", { base: "r11", disp: ArrayBufferLayout.detached });
    a.label(done);
}

/**
 * The current byte length of the ArrayBuffer or SharedArrayBuffer in `buffer`
 * into `dst` (a growable SharedArrayBuffer refreshes it from the shared length
 * word). `dst` must differ from `buffer`; changes only `dst` and the flags.
 */
export function emitBufferLength(a: Assembler, buffer: Reg, dst: Reg): void {
    const ready = a.unique("bufferLength");
    a.load(dst, { base: buffer, disp: ArrayBufferLayout.maxByteLength });
    a.test(dst, dst);
    a.jcc("s", ready);
    a.load(dst, { base: buffer, disp: O.kind });
    a.cmp(dst, SharedArrayBufferKind);
    a.jcc("ne", ready);
    a.load(dst, { base: buffer, disp: ArrayBufferLayout.bytes });
    a.load(dst, { base: dst, disp: -SharedLengthHeader });
    a.store({ base: buffer, disp: ArrayBufferLayout.byteLength }, dst);
    a.label(ready);
    a.load(dst, { base: buffer, disp: ArrayBufferLayout.byteLength });
}
