import type { Assembler, Mem } from "../machine/context.js";
import type { Operation } from "../../ir/model.js";
import { ObjectLayout as O } from "../../runtime/object-layout.js";
import {
    literalSiteGeneric,
    maxInlineCapacity,
    emptyLiteralCapacity,
} from "../../runtime/shapes.js";
import { emitShapedObjectHeader } from "../../runtime/object-header.js";
import {
    ElementsLayout,
    arrayLiteralBytes,
    emitArrayLiteralCell,
} from "../../runtime/array-elements.js";

// Single-pass literal creation (#48), shared by the code generator
// (operations.ts).

/** The frame accessors of the function being emitted. */
export interface LiteralFrame {
    a: Assembler;
    value: (n: number) => Mem;
    payload: (n: number) => Mem;
    pointer: (reg: "rcx" | "rdx" | "r8" | "r9", n: number) => void;
    pushCold: (emit: () => void) => void;
}

/**
 * An object literal whose values are already evaluated: a resolved site's
 * object is allocated with the site's constant cell size and written once,
 * header, the values in their slots and undefined in the spare slots, before
 * anything can reach a collection. An unresolved or generic site defines the
 * keys one by one.
 */
function emitObjectLiteral(
    { a, value, payload, pointer, pushCold }: LiteralFrame,
    site: string,
    capacity: number,
    dest: number,
    literal: { keys: number[]; values: number[]; strict: boolean },
): void {
    const generic = a.unique("literalGeneric"),
        done = a.unique("literalDone");
    a.load("rax", { rip: site });
    a.cmp("rax", literalSiteGeneric);
    a.jcc("be", generic);
    a.mov("rcx", O.size + 16 * capacity);
    a.call("rt.allocRaw");
    a.load("r11", { rip: site });
    emitShapedObjectHeader(a, "r11");
    for (let i = 0; i < capacity; i++) {
        const at = O.size + 16 * i;
        if (i < literal.values.length) {
            a.load("r10", value(literal.values[i]!));
            a.store({ base: "rax", disp: at }, "r10");
            a.load("r10", payload(literal.values[i]!));
        } else {
            a.mov("r10", 0);
            a.store({ base: "rax", disp: at }, "r10");
        }
        a.store({ base: "rax", disp: at + 8 }, "r10");
    }
    a.store(payload(dest), "rax");
    a.mov("rax", 5);
    a.store(value(dest), "rax");
    pushCold(() => {
        a.label(generic);
        pointer("rcx", dest);
        a.lea("rdx", { rip: site });
        a.call("rt.newLiteralObject");
        literal.keys.forEach((key, i) => {
            pointer("rcx", dest);
            pointer("rdx", key);
            pointer("r8", literal.values[i]!);
            a.mov("r9", 1 | (literal.strict ? 2 : 0));
            a.call("rt.setProperty");
        });
        a.jmp(done);
    });
    a.label(done);
}

/** A small array literal whose elements are evaluated: one cell with its table, written in one pass. */
function emitArrayLiteral(
    { a, value, payload }: LiteralFrame,
    dest: number,
    length: number,
    elements: number[],
): void {
    a.mov("rcx", arrayLiteralBytes(length));
    a.call("rt.allocRaw");
    emitArrayLiteralCell(a, length);
    elements.forEach((source, i) => {
        const at = O.size + ElementsLayout.values + 16 * i;
        a.load("r10", value(source));
        a.store({ base: "rax", disp: at }, "r10");
        a.load("r10", payload(source));
        a.store({ base: "rax", disp: at + 8 }, "r10");
    });
    a.store(payload(dest), "rax");
    a.mov("rax", 5);
    a.store(value(dest), "rax");
}

/** The `newObject` operation: an object or array literal, or an empty object or array. */
export function emitNewObject(
    frame: LiteralFrame,
    op: Extract<Operation, { kind: "newObject" }>,
    site: string | undefined,
): void {
    const { a, pointer } = frame,
        capacity = Math.min(
            Math.max(op.slots ?? 0, emptyLiteralCapacity),
            maxInlineCapacity,
        );
    // An object literal with known keys (#194): a per-site record whose shape
    // the first evaluation resolves; its objects start with it.
    if (site && op.keys && op.literal)
        return emitObjectLiteral(frame, site, capacity, op.dest, op.literal);
    if (site && op.keys && !op.array) {
        pointer("rcx", op.dest);
        a.lea("rdx", { rip: site });
        a.call("rt.newLiteralObject");
        return;
    }
    if (op.array && op.elements && op.elementValues)
        return emitArrayLiteral(frame, op.dest, op.length, op.elementValues);
    if (op.array && op.elements) {
        pointer("rcx", op.dest);
        a.mov("rdx", op.length);
        a.call("rt.newArrayLiteral");
        return;
    }
    pointer("rcx", op.dest);
    a.mov("rdx", op.array ? 1 : 0);
    a.mov("r8", op.length);
    if (op.slots !== undefined && !op.array) {
        a.mov("r9", capacity);
        a.call("rt.newObjectSlots");
    } else a.call("rt.newObject");
}
