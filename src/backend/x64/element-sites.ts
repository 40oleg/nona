import type { Assembler, Mem, Reg } from "./assembler.js";
import type { Operation } from "../../ir/model.js";
import { ObjectLayout as O } from "../../runtime/object-layout.js";
import { ElementsLayout } from "../../runtime/array-elements.js";
import {
    ArrayBufferLayout,
    TypedArrayKind,
    TypedArrayLayout,
} from "../../runtime/array-buffer-layout.js";

/** What the element and literal store paths need of the function being emitted (operations.ts). */
export interface SiteEmitter {
    a: Assembler;
    value(n: number): Mem;
    payload(n: number): Mem;
    pointer(reg: "rcx" | "rdx" | "r8" | "r9", n: number): void;
    /** Code emitted after the blocks, under the stack map of its origin. */
    pushCold(emit: () => void): void;
    /** The GPR that holds slot n as an integer inside a register loop (register-loops.ts). */
    integerKey?(n: number): Reg | undefined;
}
type PropertyOp = Extract<Operation, { kind: "property" }>;
type SetPropertyOp = Extract<Operation, { kind: "setProperty" }>;

// Prelude code (shared by every program) works on ordinary arrays: there the
// inline typed array test would only add size and a miss before every call.
const programCode = (fnId: string) => !fnId.startsWith("js.regexpVm.");

/**
 * The inline part of an element site with a Number key (#240), as the typed
 * array path of rt.elementGet / rt.elementSet (array-elements.ts): a typed
 * array over a fixed-length buffer that is not detached and an integer index
 * below its length, with -0 as 0. R10 = the typed array, RAX = the index,
 * R9 = the element type, R11 = the address of element 0; anything else jumps
 * to slow before any slot is written. Changes RCX and XMM0-1. A key held as
 * an integer in a register (register-loops.ts) is the index as it is: a
 * negative one fails the unsigned length test.
 */
function typedElement(
    s: SiteEmitter,
    object: number,
    key: number,
    slow: string,
    unchecked = false,
): void {
    const { a } = s,
        integer = s.integerKey?.(key);
    // In a loop versioned by src/ir/typed-loops.ts the guard has established
    // all of it but the integer conversion of the key.
    if (unchecked) {
        a.load("r10", s.payload(object));
        a.load("r11", { base: "r10", disp: TypedArrayLayout.buffer });
        if (integer) a.mov("rax", integer);
        else {
            a.movsd("xmm0", s.payload(key));
            a.cvttsd2si("rax", "xmm0");
        }
        a.load("r9", { base: "r10", disp: TypedArrayLayout.elementType });
        a.load("r11", { base: "r11", disp: ArrayBufferLayout.bytes });
        a.load("rcx", { base: "r10", disp: TypedArrayLayout.byteOffset });
        a.add("r11", "rcx");
        return;
    }
    a.load("rax", s.value(object));
    a.cmp("rax", 5);
    a.jcc("ne", slow);
    a.load("r10", s.payload(object));
    a.load("rax", { base: "r10", disp: O.kind });
    a.cmp("rax", TypedArrayKind);
    a.jcc("ne", slow);
    a.load("r11", { base: "r10", disp: TypedArrayLayout.buffer });
    a.load("rax", { base: "r11", disp: ArrayBufferLayout.maxByteLength });
    a.test("rax", "rax");
    a.jcc("ns", slow);
    a.load("rax", { base: "r11", disp: ArrayBufferLayout.detached });
    a.test("rax", "rax");
    a.jcc("ne", slow);
    if (integer) a.mov("rax", integer);
    else {
        a.movsd("xmm0", s.payload(key));
        a.cvttsd2si("rax", "xmm0");
        a.cvtsi2sd("xmm1", "rax");
        a.ucomisd("xmm0", "xmm1");
        a.jcc("ne", slow);
        a.jcc("p", slow);
    }
    a.load("r9", { base: "r10", disp: TypedArrayLayout.length });
    a.cmp("rax", "r9");
    a.jcc("ae", slow);
    a.load("r9", { base: "r10", disp: TypedArrayLayout.elementType });
    a.load("r11", { base: "r11", disp: ArrayBufferLayout.bytes });
    a.load("rcx", { base: "r10", disp: TypedArrayLayout.byteOffset });
    a.add("r11", "rcx");
}

/** Whether op is an element site whose inline path reads its key only as an index (typedElement). */
export function typedElementSite(
    fnId: string,
    op: Operation,
): op is PropertyOp | SetPropertyOp {
    if (!programCode(fnId)) return false;
    if (op.kind === "property")
        return (
            !!op.numericKey &&
            op.operation === "get" &&
            op.keyName === undefined &&
            !op.typedLength
        );
    return (
        op.kind === "setProperty" &&
        !!op.numericKey &&
        !op.define &&
        op.keyName === undefined &&
        op.literalElement === undefined &&
        op.literalSlot === undefined
    );
}

/**
 * `object[i]` with a Number i in program code: Float64 elements inline, Int32
 * and Uint8 ones out of line, everything else rt.elementGet (#240). False
 * when the site does not qualify (nothing is emitted).
 */
export function emitTypedElementGet(
    s: SiteEmitter,
    fnId: string,
    op: PropertyOp,
): boolean {
    if (
        !programCode(fnId) ||
        !op.numericKey ||
        op.operation !== "get" ||
        op.keyName !== undefined
    )
        return false;
    const { a } = s,
        slow = a.unique("elementSlow"),
        other = a.unique("elementOther"),
        number = a.unique("elementNumber"),
        done = a.unique("elementDone");
    typedElement(s, op.object, op.key, slow, op.unchecked);
    a.cmp("r9", 9);
    a.jcc("ne", other);
    a.shl("rax", 3);
    a.add("r11", "rax");
    a.movsd("xmm0", { base: "r11" });
    a.label(number);
    a.mov("rax", 3);
    a.store(s.value(op.dest), "rax");
    a.storesd(s.payload(op.dest), "xmm0");
    s.pushCold(() => {
        const uint8 = a.unique("elementUint8"),
            integer = a.unique("elementInteger");
        a.label(other);
        a.cmp("r9", 7);
        a.jcc("ne", uint8);
        a.shl("rax", 2);
        a.add("r11", "rax");
        a.loadSigned32("rax", { base: "r11" });
        a.jmp(integer);
        a.label(uint8);
        a.cmp("r9", 1);
        a.jcc("ne", slow);
        a.add("r11", "rax");
        a.load("rax", { base: "r11" }, 8);
        a.label(integer);
        a.cvtsi2sd("xmm0", "rax");
        a.jmp(number);
        a.label(slow);
        s.pointer("rcx", op.dest);
        s.pointer("rdx", op.object);
        s.pointer("r8", op.key);
        a.call("rt.elementGet");
        a.jmp(done);
    });
    a.label(done);
    return true;
}

/**
 * `object[i] = value` with a Number i and a Number value in program code:
 * Float64 elements inline, 8- and 32-bit integer ones (the low bits of the
 * truncated value) out of line, everything else (clamped and BigInt elements,
 * other values) rt.elementSet (#240). False when the site does not qualify.
 */
export function emitTypedElementSet(
    s: SiteEmitter,
    fnId: string,
    op: SetPropertyOp,
): boolean {
    if (
        !programCode(fnId) ||
        !op.numericKey ||
        op.define ||
        op.keyName !== undefined
    )
        return false;
    const { a } = s,
        slow = a.unique("elementSlow"),
        other = a.unique("elementOther"),
        done = a.unique("elementDone");
    a.load("rax", s.value(op.source));
    a.cmp("rax", 3);
    a.jcc("ne", slow);
    typedElement(s, op.object, op.key, slow, op.unchecked);
    a.movsd("xmm0", s.payload(op.source));
    a.cmp("r9", 9);
    a.jcc("ne", other);
    a.shl("rax", 3);
    a.add("r11", "rax");
    a.storesd({ base: "r11" }, "xmm0");
    s.pushCold(() => {
        const byte = a.unique("elementByte");
        // NaN, infinities and magnitudes from 2^63 (the indefinite integer)
        // go to the stub.
        const truncate = () => {
            a.cvttsd2si("r10", "xmm0");
            a.mov("rax", 0x8000000000000000n);
            a.cmp("r10", "rax");
            a.jcc("e", slow);
        };
        a.label(other);
        a.cmp("r9", 6);
        a.jcc("b", byte);
        a.cmp("r9", 7);
        a.jcc("a", slow);
        a.shl("rax", 2);
        a.add("r11", "rax");
        truncate();
        a.store({ base: "r11" }, "r10", 32);
        a.jmp(done);
        a.label(byte);
        a.cmp("r9", 2);
        a.jcc("a", slow);
        a.add("r11", "rax");
        truncate();
        a.store({ base: "r11" }, "r10", 8);
        a.jmp(done);
        a.label(slow);
        s.pointer("rcx", op.object);
        s.pointer("rdx", op.key);
        s.pointer("r8", op.source);
        a.mov("r9", op.strict ? 2 : 0);
        a.call("rt.elementSet");
        a.jmp(done);
    });
    a.label(done);
    return true;
}

/**
 * `object.length` of a typed array in a loop versioned by
 * src/ir/typed-loops.ts: the guard found the intrinsic getter and a
 * fixed-length attached buffer, so it is the view's length field. False when
 * the read is no such one.
 */
export function emitTypedLength(s: SiteEmitter, op: PropertyOp): boolean {
    if (!op.typedLength) return false;
    const { a } = s;
    a.load("r10", s.payload(op.object));
    a.load("rax", { base: "r10", disp: TypedArrayLayout.length });
    a.cvtsi2sd("xmm0", "rax");
    a.mov("rax", 3);
    a.store(s.value(op.dest), "rax");
    a.storesd(s.payload(op.dest), "xmm0");
    return true;
}

/**
 * The initial definition of an element of an array literal created with its
 * table (#48) is stored into its slot; a definition in an object literal with
 * known keys stores its slot directly while the object still has the site's
 * shape (`site`, the literal's record). Otherwise rt.setProperty. False when
 * the operation is no such definition.
 */
export function emitLiteralStore(
    s: SiteEmitter,
    op: SetPropertyOp,
    arrayLiteral: boolean,
    site: string | undefined,
): boolean {
    const element = op.literalElement !== undefined && arrayLiteral;
    if (!element && (op.literalSlot === undefined || site === undefined))
        return false;
    const { a } = s,
        slow = a.unique(element ? "elementSlow" : "literalSlow"),
        done = a.unique(element ? "elementDone" : "literalDone");
    if (element) {
        const index = op.literalElement!,
            offset = ElementsLayout.values + 16 * index;
        a.load("r10", s.payload(op.object));
        a.load("r10", { base: "r10", disp: O.elements });
        a.test("r10", "r10");
        a.jcc("e", slow);
        a.load("rax", { base: "r10", disp: ElementsLayout.capacity });
        a.cmp("rax", index);
        a.jcc("be", slow);
        a.load("rax", s.value(op.source));
        a.store({ base: "r10", disp: offset }, "rax");
        a.load("rax", s.payload(op.source));
        a.store({ base: "r10", disp: offset + 8 }, "rax");
    } else {
        const offset = O.size + 16 * op.literalSlot!;
        a.load("r10", s.payload(op.object));
        a.load("r11", { base: "r10", disp: O.shape });
        a.load("rax", { rip: site! });
        a.cmp("r11", "rax");
        a.jcc("ne", slow);
        a.load("rax", s.value(op.source));
        a.store({ base: "r10", disp: offset }, "rax");
        a.load("rax", s.payload(op.source));
        a.store({ base: "r10", disp: offset + 8 }, "rax");
    }
    s.pushCold(() => {
        a.label(slow);
        s.pointer("rcx", op.object);
        s.pointer("rdx", op.key);
        s.pointer("r8", op.source);
        a.mov("r9", (op.define ? 1 : 0) | (op.strict ? 2 : 0));
        a.call("rt.setProperty");
        a.jmp(done);
    });
    a.label(done);
    return true;
}
