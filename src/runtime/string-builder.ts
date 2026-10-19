import { RuntimeBuilder, slot, failIf } from "./abi.js";
import type { Assembler, Reg } from "../backend/machine/context.js";
import { ObjectLayout as O } from "./object-layout.js";
import { HeapKind, HeapLayout as H } from "./heap-layout.js";
import {
    ArrayBufferKind,
    ArrayBufferLayout as AB,
    TypedArrayKind,
    TypedArrayLayout as T,
} from "./array-buffer-layout.js";

/**
 * String builder for native code that assembles a result piece by piece.
 *
 * Builtins such as Array.prototype.join and JSON.stringify accumulated their
 * result with rt.concat, which allocates a fresh string for every piece: both
 * time and memory were quadratic in the output size, and because no
 * safepoint runs inside a builtin, the intermediate strings stayed alive
 * until it returned — joining twenty thousand parts needed gigabytes.
 *
 * A builder is a 32-byte record on the caller's stack {buffer, length,
 * capacity, utf8} over a raw-heap UTF-16 buffer that doubles when it fills;
 * the pieces are copied once, and rt.builderFinish allocates the managed
 * string of exactly the final length. The record holds no Values, so it
 * needs no roots, and `length` may simply be stored back to drop what was
 * appended after a mark (JSON.stringify does this for a property whose value
 * is omitted).
 *
 * With `utf8` set (#155) the same record collects UTF-8 bytes instead:
 * `length` and `capacity` count bytes, every append encodes what it is given
 * (a lone surrogate of a plain append as U+FFFD, as Buffer.from does; JSON
 * Quote writes them as \uXXXX escapes), and rt.builderFinishBytes turns the
 * result into a Uint8Array. Owners zero all four fields, then set `utf8`.
 */
export const BuilderLayout = {
    buffer: 0,
    length: 8,
    capacity: 16,
    utf8: 24,
    size: 32,
} as const;
const B = BuilderLayout;

/** Copies R9 UTF-16 units from R10 to R11; clobbers the volatile registers. */
const copyUnits = (a: Assembler) => {
    a.mov("rcx", "r11");
    a.mov("rdx", "r10");
    a.mov("r8", "r9");
    a.add("r8", "r8");
    a.call("rt.copyBytes");
};

/** Jumps to `target` when the builder at `builder` collects UTF-8 bytes. Clobbers RAX. */
export const ifUtf8Builder = (a: Assembler, builder: Reg, target: string) => {
    a.load("rax", { base: builder, disp: B.utf8 });
    a.test("rax", "rax");
    a.jcc("ne", target);
};

/**
 * Writes the UTF-8 sequence of `count` bytes for the code point in `cp` to
 * `dst` and advances it; `cp` is clobbered, `tmp` is scratch.
 */
export function emitUtf8Sequence(
    a: Assembler,
    count: 2 | 3 | 4,
    cp: Reg,
    tmp: Reg,
    dst: Reg,
): void {
    a.mov(tmp, cp);
    a.shr(tmp, 6 * (count - 1));
    a.or(tmp, { 2: 0xc0, 3: 0xe0, 4: 0xf0 }[count]);
    a.store({ base: dst }, tmp, 8);
    for (let i = 1; i < count - 1; i++) {
        a.mov(tmp, cp);
        a.shr(tmp, 6 * (count - 1 - i));
        a.and(tmp, 63);
        a.or(tmp, 0x80);
        a.store({ base: dst, disp: i }, tmp, 8);
    }
    a.and(cp, 63);
    a.or(cp, 0x80);
    a.store({ base: dst, disp: count - 1 }, cp, 8);
    a.add(dst, count);
}

/** rt.builderAppendInteger for UTF-16 units (width 2) or UTF-8 bytes (width 1). */
function emitAppendInteger(a: Assembler, width: 1 | 2): void {
    const wide = width === 2;
    a.store(slot(40), "rcx");
    a.store(slot(48), "rdx");
    a.mov("rdx", 17);
    a.call("rt.builderReserve");
    a.load("rcx", slot(40));
    a.load("r11", { base: "rcx", disp: B.length });
    if (wide) a.shl("r11", 1);
    a.load("rax", { base: "rcx", disp: B.buffer });
    a.add("r11", "rax");
    a.load("rax", slot(48));
    const positive = a.unique("positive");
    a.test("rax", "rax");
    a.jcc("ge", positive);
    a.mov("r10", 45);
    a.store({ base: "r11" }, "r10", wide ? 16 : 8);
    a.add("r11", width);
    a.neg("rax");
    a.label(positive);
    // R9 digits: the smallest count whose power of ten exceeds the value.
    const count = a.unique("count"),
        counted = a.unique("counted"),
        digit = a.unique("digit");
    a.mov("r9", 1);
    a.mov("r10", 10);
    a.mov("rdx", 10);
    a.label(count);
    a.cmp("rax", "r10");
    a.jcc("b", counted);
    a.imul("r10", "rdx");
    a.add("r9", 1);
    a.jmp(count);
    a.label(counted);
    a.mov("r8", "r9");
    if (wide) a.shl("r8", 1);
    a.add("r8", "r11");
    a.mov("r11", "r8");
    a.mov("r10", 10);
    a.label(digit);
    a.xor("rdx", "rdx");
    a.div("r10");
    a.add("rdx", 48);
    a.sub("r8", width);
    a.store({ base: "r8" }, "rdx", wide ? 16 : 8);
    a.test("rax", "rax");
    a.jcc("ne", digit);
    a.load("rcx", slot(40));
    a.load("rax", { base: "rcx", disp: B.buffer });
    a.sub("r11", "rax");
    if (wide) a.shr("r11", 1);
    a.store({ base: "rcx", disp: B.length }, "r11");
}

export function emitStringBuilder(b: RuntimeBuilder): void {
    // RCX builder (zeroed by its owner), RDX units (bytes in UTF-8 mode) to
    // make room for.
    b.fn("rt.builderReserve", 88, (a) => {
        const done = a.unique("done"),
            grow = a.unique("grow"),
            fits = a.unique("fits"),
            noOld = a.unique("noOld"),
            allocBytes = a.unique("allocBytes"),
            copyBytes = a.unique("copyBytes");
        a.load("rax", { base: "rcx", disp: B.length });
        a.add("rax", "rdx");
        a.load("r10", { base: "rcx", disp: B.capacity });
        a.cmp("rax", "r10");
        a.jcc("be", done);
        a.store(slot(40), "rcx");
        a.store(slot(48), "rax");
        a.cmp("r10", 128);
        a.jcc("ae", grow);
        a.mov("r10", 128);
        a.label(grow);
        a.cmp("r10", "rax");
        a.jcc("ae", fits);
        a.shl("r10", 1);
        a.jmp(grow);
        a.label(fits);
        a.store(slot(56), "r10");
        a.mov("r8", "r10");
        ifUtf8Builder(a, "rcx", allocBytes);
        a.shl("r8", 1);
        a.label(allocBytes);
        a.load("rcx", { rip: "rt.heap" });
        a.mov("rdx", 0);
        a.callImport("HeapAlloc");
        a.test("rax", "rax");
        failIf(a, "e");
        a.store(slot(64), "rax");
        a.load("rcx", slot(40));
        a.load("r10", { base: "rcx", disp: B.buffer });
        a.store(slot(72), "r10");
        a.load("r9", { base: "rcx", disp: B.length });
        ifUtf8Builder(a, "rcx", copyBytes);
        a.shl("r9", 1);
        a.label(copyBytes);
        a.load("rcx", slot(64));
        a.mov("rdx", "r10");
        a.mov("r8", "r9");
        a.call("rt.copyBytes");
        a.load("r8", slot(72));
        a.test("r8", "r8");
        a.jcc("e", noOld);
        a.load("rcx", { rip: "rt.heap" });
        a.mov("rdx", 0);
        a.callImport("HeapFree");
        a.label(noOld);
        a.load("rcx", slot(40));
        a.load("rax", slot(64));
        a.store({ base: "rcx", disp: B.buffer }, "rax");
        a.load("rax", slot(56));
        a.store({ base: "rcx", disp: B.capacity }, "rax");
        a.label(done);
    });
    // RCX builder, RDX string record: appends its code units.
    // Short pieces that fit are copied here a unit at a time (no reserve call,
    // no copy call): separators, keys and small values are most pieces.
    b.fn("rt.builderAppend", 56, (a) => {
        const slow = a.unique("slow"),
            loop = a.unique("loop"),
            bytes = a.unique("bytes"),
            done = a.unique("done");
        ifUtf8Builder(a, "rcx", bytes);
        a.load("r9", { base: "rdx" });
        a.cmp("r9", 8);
        a.jcc("a", slow);
        a.load("r11", { base: "rcx", disp: B.length });
        a.lea("rax", { base: "r11" });
        a.add("rax", "r9");
        a.load("r10", { base: "rcx", disp: B.capacity });
        a.cmp("rax", "r10");
        a.jcc("a", slow);
        a.store({ base: "rcx", disp: B.length }, "rax");
        a.shl("r11", 1);
        a.load("rax", { base: "rcx", disp: B.buffer });
        a.add("r11", "rax");
        a.lea("r10", { base: "rdx", disp: 8 });
        a.label(loop);
        a.test("r9", "r9");
        a.jcc("e", done);
        a.load("rax", { base: "r10" }, 16);
        a.store({ base: "r11" }, "rax", 16);
        a.add("r10", 2);
        a.add("r11", 2);
        a.sub("r9", 1);
        a.jmp(loop);
        a.label(slow);
        a.store(slot(40), "rcx");
        a.store(slot(48), "rdx");
        a.load("rdx", { base: "rdx" });
        a.call("rt.builderReserve");
        a.load("rcx", slot(40));
        a.load("rdx", slot(48));
        a.load("r9", { base: "rdx" });
        a.lea("r10", { base: "rdx", disp: 8 });
        a.load("r11", { base: "rcx", disp: B.length });
        a.mov("rax", "r11");
        a.add("rax", "r9");
        a.store({ base: "rcx", disp: B.length }, "rax");
        a.shl("r11", 1);
        a.load("rax", { base: "rcx", disp: B.buffer });
        a.add("r11", "rax");
        copyUnits(a);
        a.jmp(done);
        a.label(bytes);
        a.call("rt.builderAppendUtf8");
        a.label(done);
    });
    // RCX builder in UTF-8 mode, RDX string record: appends the string's UTF-8
    // encoding (a lone surrogate as U+FFFD). A unit takes at most three bytes.
    b.fn("rt.builderAppendUtf8", 56, (a) => {
        a.store(slot(40), "rcx");
        a.store(slot(48), "rdx");
        a.load("rax", { base: "rdx" });
        a.mov("rdx", "rax");
        a.add("rdx", "rax");
        a.add("rdx", "rax");
        a.call("rt.builderReserve");
        a.load("rcx", slot(40));
        a.load("r11", { base: "rcx", disp: B.length });
        a.load("rax", { base: "rcx", disp: B.buffer });
        a.add("r11", "rax");
        a.load("rdx", slot(48));
        a.load("r9", { base: "rdx" });
        a.lea("r10", { base: "rdx", disp: 8 });
        const loop = a.unique("loop"),
            end = a.unique("end"),
            next = a.unique("next"),
            two = a.unique("two"),
            three = a.unique("three"),
            bmp = a.unique("bmp"),
            lone = a.unique("lone");
        a.label(loop);
        a.test("r9", "r9");
        a.jcc("e", end);
        a.load("rax", { base: "r10" }, 16);
        a.cmp("rax", 0x80);
        a.jcc("ae", two);
        a.store({ base: "r11" }, "rax", 8);
        a.add("r11", 1);
        a.jmp(next);
        a.label(two);
        a.cmp("rax", 0x800);
        a.jcc("ae", three);
        emitUtf8Sequence(a, 2, "rax", "r8", "r11");
        a.jmp(next);
        a.label(three);
        a.cmp("rax", 0xd800);
        a.jcc("b", bmp);
        a.cmp("rax", 0xdbff);
        a.jcc("a", lone);
        a.cmp("r9", 2);
        a.jcc("b", lone);
        a.load("r8", { base: "r10", disp: 2 }, 16);
        a.cmp("r8", 0xdc00);
        a.jcc("b", lone);
        a.cmp("r8", 0xdfff);
        a.jcc("a", lone);
        a.sub("rax", 0xd800);
        a.shl("rax", 10);
        a.add("rax", "r8");
        a.add("rax", 0x10000 - 0xdc00);
        emitUtf8Sequence(a, 4, "rax", "r8", "r11");
        a.add("r10", 2);
        a.sub("r9", 1);
        a.jmp(next);
        a.label(lone);
        a.cmp("rax", 0xdfff);
        a.jcc("a", bmp);
        a.mov("rax", 0xfffd);
        a.label(bmp);
        emitUtf8Sequence(a, 3, "rax", "r8", "r11");
        a.label(next);
        a.add("r10", 2);
        a.sub("r9", 1);
        a.jmp(loop);
        a.label(end);
        a.load("rcx", slot(40));
        a.load("rax", { base: "rcx", disp: B.buffer });
        a.sub("r11", "rax");
        a.store({ base: "rcx", disp: B.length }, "r11");
    });
    // RCX builder, RDX code unit: appends one unit. In UTF-8 mode the unit is
    // ASCII (callers pass separators and punctuation) and takes one byte.
    b.fn("rt.builderAppendUnit", 56, (a) => {
        const bytes = a.unique("bytes"),
            done = a.unique("done");
        {
            const slow = a.unique("slow");
            ifUtf8Builder(a, "rcx", bytes);
            a.load("r11", { base: "rcx", disp: B.length });
            a.load("rax", { base: "rcx", disp: B.capacity });
            a.cmp("r11", "rax");
            a.jcc("ae", slow);
            a.lea("rax", { base: "r11", disp: 1 });
            a.store({ base: "rcx", disp: B.length }, "rax");
            a.shl("r11", 1);
            a.load("rax", { base: "rcx", disp: B.buffer });
            a.add("r11", "rax");
            a.store({ base: "r11" }, "rdx", 16);
            a.jmp(done);
            a.label(slow);
        }
        a.store(slot(40), "rcx");
        a.store(slot(48), "rdx");
        a.mov("rdx", 1);
        a.call("rt.builderReserve");
        a.load("rcx", slot(40));
        a.load("r11", { base: "rcx", disp: B.length });
        a.lea("rax", { base: "r11", disp: 1 });
        a.store({ base: "rcx", disp: B.length }, "rax");
        a.shl("r11", 1);
        a.load("rax", { base: "rcx", disp: B.buffer });
        a.add("r11", "rax");
        a.load("r8", slot(48));
        a.store({ base: "r11" }, "r8", 16);
        a.jmp(done);
        a.label(bytes);
        {
            const ready = a.unique("ready");
            a.load("r11", { base: "rcx", disp: B.length });
            a.load("rax", { base: "rcx", disp: B.capacity });
            a.cmp("r11", "rax");
            a.jcc("b", ready);
            a.store(slot(40), "rcx");
            a.store(slot(48), "rdx");
            a.mov("rdx", 1);
            a.call("rt.builderReserve");
            a.load("rcx", slot(40));
            a.load("rdx", slot(48));
            a.load("r11", { base: "rcx", disp: B.length });
            a.label(ready);
            a.lea("rax", { base: "r11", disp: 1 });
            a.store({ base: "rcx", disp: B.length }, "rax");
            a.load("rax", { base: "rcx", disp: B.buffer });
            a.add("r11", "rax");
            a.store({ base: "r11" }, "rdx", 8);
        }
        a.label(done);
    });
    // RCX builder, RDX signed integer with |x| < 2^53: appends its decimal
    // digits (the same text Number::toString produces for it).
    b.fn("rt.builderAppendInteger", 56, (a) => {
        const bytes = a.unique("bytes"),
            done = a.unique("done");
        ifUtf8Builder(a, "rcx", bytes);
        emitAppendInteger(a, 2);
        a.jmp(done);
        a.label(bytes);
        emitAppendInteger(a, 1);
        a.label(done);
    });
    // RCX builder, RDX result Value*: the accumulated string; the builder is
    // released and zeroed.
    b.fn("rt.builderFinish", 72, (a) => {
        a.store(slot(40), "rcx");
        a.store(slot(48), "rdx");
        a.load("rcx", { base: "rcx", disp: B.length });
        a.store(slot(56), "rcx");
        a.shl("rcx", 1);
        a.add("rcx", 8);
        a.call("rt.allocRaw");
        a.store(slot(64), "rax");
        a.load("r9", slot(56));
        a.store({ base: "rax" }, "r9");
        a.lea("r11", { base: "rax", disp: 8 });
        a.load("rcx", slot(40));
        a.load("r10", { base: "rcx", disp: B.buffer });
        copyUnits(a);
        const noBuffer = a.unique("noBuffer");
        a.load("rcx", slot(40));
        a.load("r8", { base: "rcx", disp: B.buffer });
        a.test("r8", "r8");
        a.jcc("e", noBuffer);
        a.load("rcx", { rip: "rt.heap" });
        a.mov("rdx", 0);
        a.callImport("HeapFree");
        a.label(noBuffer);
        a.load("rcx", slot(40));
        a.mov("rax", 0);
        for (const offset of [B.buffer, B.length, B.capacity])
            a.store({ base: "rcx", disp: offset }, "rax");
        a.load("rdx", slot(48));
        a.mov("rax", 4);
        a.store({ base: "rdx" }, "rax");
        a.load("rax", slot(64));
        a.store({ base: "rdx", disp: 8 }, "rax");
    });
    // RCX builder in UTF-8 mode, RDX result Value*: a fresh Uint8Array over a
    // fixed-length ArrayBuffer holding exactly the accumulated bytes; the
    // builder's buffer is released and the builder zeroed. Nothing here
    // reaches a safepoint, so the new objects need no roots.
    b.fn("rt.builderFinishBytes", 88, (a) => {
        a.store(slot(40), "rcx");
        a.store(slot(48), "rdx");
        a.load("rcx", { base: "rcx", disp: B.length });
        a.store(slot(56), "rcx");
        a.call("rt.allocRaw");
        a.store(slot(64), "rax");
        a.mov("rcx", "rax");
        a.load("r10", slot(40));
        a.load("rdx", { base: "r10", disp: B.buffer });
        a.load("r8", slot(56));
        a.call("rt.copyBytes");
        const noBuffer = a.unique("noBuffer");
        a.load("rcx", slot(40));
        a.load("r8", { base: "rcx", disp: B.buffer });
        a.test("r8", "r8");
        a.jcc("e", noBuffer);
        a.load("rcx", { rip: "rt.heap" });
        a.mov("rdx", 0);
        a.callImport("HeapFree");
        a.label(noBuffer);
        a.load("rcx", slot(40));
        a.mov("rax", 0);
        for (const offset of [B.buffer, B.length, B.capacity, B.utf8])
            a.store({ base: "rcx", disp: offset }, "rax");
        const header = (kind: number, prototype: string) => {
            a.mov("r10", HeapKind.object);
            a.store({ base: "rax", disp: H.kind - H.size }, "r10");
            a.mov("r10", kind);
            a.store({ base: "rax", disp: O.kind }, "r10");
            a.mov("r10", 0);
            for (const offset of [O.properties, O.length, O.shape, O.flags])
                a.store({ base: "rax", disp: offset }, "r10");
            a.lea("r10", { rip: prototype });
            a.store({ base: "rax", disp: O.prototype }, "r10");
        };
        a.mov("rcx", AB.size);
        a.call("rt.alloc");
        header(ArrayBufferKind, "rt.arraybufferPrototype");
        a.load("r10", slot(64));
        a.store({ base: "rax", disp: AB.bytes }, "r10");
        a.load("r10", slot(56));
        a.store({ base: "rax", disp: AB.byteLength }, "r10");
        a.mov("r10", 0);
        a.store({ base: "rax", disp: AB.detached }, "r10");
        a.mov("r10", -1);
        a.store({ base: "rax", disp: AB.maxByteLength }, "r10");
        a.store(slot(72), "rax");
        a.mov("rcx", T.size);
        a.call("rt.alloc");
        header(TypedArrayKind, "rt.uint8arrayPrototype");
        a.load("r10", slot(72));
        a.store({ base: "rax", disp: T.buffer }, "r10");
        a.mov("r10", 0);
        a.store({ base: "rax", disp: T.byteOffset }, "r10");
        a.load("r10", slot(56));
        for (const offset of [T.byteLength, T.length, T.fixedByteLength])
            a.store({ base: "rax", disp: offset }, "r10");
        a.mov("r10", 1);
        a.store({ base: "rax", disp: T.elementType }, "r10");
        a.load("rdx", slot(48));
        a.mov("r10", 5);
        a.store({ base: "rdx" }, "r10");
        a.store({ base: "rdx", disp: 8 }, "rax");
    });
}
