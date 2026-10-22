import { RuntimeBuilder, slot } from "./abi.js";
import { ObjectLayout as O, ObjectFlags } from "./object-layout.js";
import { HeapLayout as H, HeapKind, ValueListLayout as V } from "./heap-layout.js";
import { ElementsLayout as EL, HoleTag } from "./array-elements.js";
import { ShapeLayout as S } from "./shapes.js";
import { emitShapedObjectHeader } from "./object-header.js";
import type { Assembler } from "../backend/machine/context.js";

/**
 * IncomingMessage.headers in one call (#403).
 *
 * The module builds the headers object of a request whose field names are
 * distinct with `out[name] = value` per field: each assignment is a shape
 * transition and a check of the prototype chain for a setter, about 700
 * instructions per field. A client sends the same fields in the same order on
 * every request, so the object ends up with the same shape every time.
 *
 * __nonaNetHeadersRemember(out, lower): records the shape of a headers object
 * the module has just built from the interned lower-case names (an array of
 * strings, __nonaNetLowerNames), when its keys are exactly those names in that
 * order and it is an ordinary extensible object with Object.prototype. The
 * record is one entry per name count modulo four, {shape, shape epoch}.
 *
 * __nonaNetHeaders(lower, raw): a new object with the recorded shape for
 * these names and the values raw[1], raw[3], ... in its slots, or undefined
 * when there is no valid record (the module then assigns the fields itself).
 * The shape alone fixes the keys and their order (shapes are immutable and
 * never freed); what the assignments could have done differently is decided
 * by Object.prototype (a setter or a read-only property for a name), so
 * remembering flags it ObjectFlags.cachedPrototype, and a record is valid
 * only at the shape epoch it was taken at (property-cache.ts: the epoch
 * advances when a flagged object's properties change, and at every
 * collection). Both are leaf functions: the object and its out-of-line
 * slots are allocated and filled before any safepoint.
 */
const memoEntries = 4;

export function emitHttpHeadersNative(b: RuntimeBuilder): void {
    b.data("rt.netHeadersMemo", new Uint8Array(16 * memoEntries), ".data");
    // R10 = the element table of the dense array in the Value at R8 + DISP,
    // R11 = its length, or jump to bad. Clobbers RAX.
    const denseArray = (a: Assembler, disp: number, bad: string) => {
        a.load("rax", { base: "r8", disp });
        a.cmp("rax", 5);
        a.jcc("ne", bad);
        a.load("r10", { base: "r8", disp: disp + 8 });
        a.load("rax", { base: "r10", disp: O.kind });
        a.cmp("rax", 1);
        a.jcc("ne", bad);
        a.load("r11", { base: "r10", disp: O.length });
        a.load("r10", { base: "r10", disp: O.elements });
        a.test("r10", "r10");
        a.jcc("e", bad);
        a.load("rax", { base: "r10", disp: EL.nodes });
        a.test("rax", "rax");
        a.jcc("ne", bad);
        a.cmpMemory("r11", { base: "r10", disp: EL.count });
        a.jcc("ne", bad);
    };
    // RAX = the memo entry for R11 names. Clobbers R10.
    const memoEntry = (a: Assembler) => {
        a.mov("rax", "r11");
        a.and("rax", memoEntries - 1);
        a.shl("rax", 4);
        a.lea("r10", { rip: "rt.netHeadersMemo" });
        a.add("rax", "r10");
    };
    // Falls through when the keys of the shape at slot(SHAPE), from the last
    // one back, are the strings of the element table at slot(TABLE) (count
    // at slot(COUNT), which is the shape's count), else jumps to differ.
    // Uses slot(WALK) and slot(WALK + 8); clobbers every volatile register.
    const sameKeys = (
        a: Assembler,
        shape: number,
        table: number,
        count: number,
        walk: number,
        differ: string,
    ) => {
        const loop = a.unique("keys"),
            same = a.unique("sameKey"),
            done = a.unique("keysDone");
        a.load("rax", slot(shape));
        a.store(slot(walk), "rax");
        a.load("rax", slot(count));
        a.store(slot(walk + 8), "rax");
        a.label(loop);
        a.load("rax", slot(walk + 8));
        a.test("rax", "rax");
        a.jcc("e", done);
        a.sub("rax", 1);
        a.store(slot(walk + 8), "rax");
        a.shl("rax", 4);
        a.load("r10", slot(table));
        a.add("r10", "rax");
        a.load("rax", { base: "r10", disp: EL.values });
        a.cmp("rax", 4);
        a.jcc("ne", differ);
        a.load("rdx", { base: "r10", disp: EL.values + 8 });
        a.load("rcx", slot(walk));
        a.load("rcx", { base: "rcx", disp: S.key });
        a.cmp("rcx", "rdx");
        a.jcc("e", same);
        // Another record with the same text (a transition made before the
        // names were interned).
        a.call("rt.netSameUnits");
        a.test("rax", "rax");
        a.jcc("e", differ);
        a.label(same);
        a.load("rcx", slot(walk));
        a.load("rcx", { base: "rcx", disp: S.parent });
        a.store(slot(walk), "rcx");
        a.jmp(loop);
        a.label(done);
    };
    const undefinedResult = (a: Assembler) => {
        a.load("rcx", slot(40));
        a.mov("rax", 0);
        a.store({ base: "rcx" }, "rax");
        a.store({ base: "rcx", disp: 8 }, "rax");
    };

    b.fn("rt.netHeadersRemember.code", 88, (a) => {
        // Frame: 48 the shape, 56 the names' table, 64 their count, 72 walk.
        a.store(slot(40), "rcx");
        const done = a.unique("done");
        a.cmp("rdx", 2);
        a.jcc("b", done);
        a.load("rax", { base: "r8" });
        a.cmp("rax", 5);
        a.jcc("ne", done);
        a.load("r10", { base: "r8", disp: 8 });
        a.load("rax", { base: "r10", disp: O.kind });
        a.test("rax", "rax");
        a.jcc("ne", done);
        a.load("rax", { base: "r10", disp: O.flags });
        a.test("rax", "rax");
        a.jcc("ne", done);
        a.lea("rax", { rip: "rt.objectPrototype" });
        a.cmpMemory("rax", { base: "r10", disp: O.prototype });
        a.jcc("ne", done);
        a.load("rax", { base: "r10", disp: O.shape });
        a.test("rax", "rax");
        a.jcc("e", done);
        a.store(slot(48), "rax");
        denseArray(a, 16, done);
        a.store(slot(56), "r10");
        a.store(slot(64), "r11");
        a.test("r11", "r11");
        a.jcc("e", done);
        a.load("rax", slot(48));
        a.cmpMemory("r11", { base: "rax", disp: S.count });
        a.jcc("ne", done);
        sameKeys(a, 48, 56, 64, 72, done);
        a.load("r11", slot(64));
        memoEntry(a);
        a.load("r10", slot(48));
        a.store({ base: "rax" }, "r10");
        a.load("r10", { rip: "rt.shapeEpoch" });
        a.store({ base: "rax", disp: 8 }, "r10");
        // A property added to Object.prototype now advances the epoch.
        a.load("rax", { rip: "rt.objectPrototype", addend: O.flags });
        a.or("rax", ObjectFlags.cachedPrototype);
        a.store({ rip: "rt.objectPrototype", addend: O.flags }, "rax");
        a.label(done);
        undefinedResult(a);
    });

    b.fn("rt.netHeaders.code", 104, (a) => {
        // Frame: 48 the shape, 56 the names' table, 64 their count, 72 walk,
        // 88 the raw table, 96 the object.
        a.store(slot(40), "rcx");
        const bad = a.unique("bad"),
            done = a.unique("done");
        a.cmp("rdx", 2);
        a.jcc("b", bad);
        denseArray(a, 0, bad);
        a.store(slot(56), "r10");
        a.store(slot(64), "r11");
        a.test("r11", "r11");
        a.jcc("e", bad);
        a.add("r11", "r11");
        a.mov("r9", "r11");
        denseArray(a, 16, bad);
        a.cmp("r11", "r9");
        a.jcc("ne", bad);
        a.store(slot(88), "r10");
        // Every value present (a hole is left to the module).
        {
            const loop = a.unique("values"),
                end = a.unique("valuesEnd");
            a.lea("rcx", { base: "r10", disp: EL.values + 16 });
            a.shl("r11", 4);
            a.add("r11", "r10");
            a.add("r11", EL.values);
            a.label(loop);
            a.cmp("rcx", "r11");
            a.jcc("ae", end);
            a.load("rax", { base: "rcx" });
            a.cmp("rax", HoleTag);
            a.jcc("e", bad);
            a.add("rcx", 32);
            a.jmp(loop);
            a.label(end);
        }
        a.load("r11", slot(64));
        memoEntry(a);
        a.load("r10", { base: "rax", disp: 8 });
        a.cmpMemory("r10", { rip: "rt.shapeEpoch" });
        a.jcc("ne", bad);
        a.load("rax", { base: "rax" });
        a.test("rax", "rax");
        a.jcc("e", bad);
        a.cmpMemory("r11", { base: "rax", disp: S.count });
        a.jcc("ne", bad);
        a.store(slot(48), "rax");
        sameKeys(a, 48, 56, 64, 72, bad);
        // The object, every inline slot undefined for now.
        a.load("rdx", slot(48));
        a.load("rcx", { base: "rdx", disp: S.capacity });
        a.shl("rcx", 4);
        a.add("rcx", O.size);
        a.call("rt.allocRaw");
        a.load("rdx", slot(48));
        emitShapedObjectHeader(a, "rdx");
        a.store(slot(96), "rax");
        {
            const loop = a.unique("clear"),
                end = a.unique("cleared");
            a.load("r11", { base: "rdx", disp: S.capacity });
            a.shl("r11", 4);
            a.lea("r10", { base: "rax", disp: O.size });
            a.add("r11", "r10");
            a.mov("rcx", 0);
            a.label(loop);
            a.cmp("r10", "r11");
            a.jcc("ae", end);
            a.store({ base: "r10" }, "rcx");
            a.store({ base: "r10", disp: 8 }, "rcx");
            a.add("r10", 16);
            a.jmp(loop);
            a.label(end);
        }
        // The out-of-line slots, when there are more names than inline slots.
        {
            const inline = a.unique("inlineOnly");
            a.load("rcx", slot(64));
            a.load("rdx", slot(48));
            a.load("r10", { base: "rdx", disp: S.capacity });
            a.cmp("rcx", "r10");
            a.jcc("be", inline);
            a.sub("rcx", "r10");
            a.store(slot(72), "rcx");
            a.shl("rcx", 4);
            a.add("rcx", V.values);
            a.call("rt.allocRaw");
            a.mov("r10", HeapKind.valueList);
            a.store({ base: "rax", disp: H.kind - H.size }, "r10");
            a.load("r10", slot(72));
            a.store({ base: "rax", disp: V.count }, "r10");
            a.load("r10", slot(96));
            a.store({ base: "r10", disp: O.keys }, "rax");
            a.label(inline);
        }
        // Value i (raw[2 i + 1]) into slot i.
        {
            const loop = a.unique("fill"),
                inline = a.unique("inlineSlot"),
                store = a.unique("storeSlot"),
                end = a.unique("filled");
            a.load("r8", slot(96));
            a.load("r9", { base: "r8", disp: O.shape });
            a.load("r9", { base: "r9", disp: S.capacity });
            a.mov("rcx", 0);
            a.label(loop);
            a.cmpMemory("rcx", slot(64));
            a.jcc("ae", end);
            a.cmp("rcx", "r9");
            a.jcc("b", inline);
            a.mov("rax", "rcx");
            a.sub("rax", "r9");
            a.shl("rax", 4);
            a.load("rdx", { base: "r8", disp: O.keys });
            a.add("rax", "rdx");
            a.add("rax", V.values);
            a.jmp(store);
            a.label(inline);
            a.mov("rax", "rcx");
            a.shl("rax", 4);
            a.add("rax", "r8");
            a.add("rax", O.size);
            a.label(store);
            a.mov("r10", "rcx");
            a.shl("r10", 5);
            a.load("rdx", slot(88));
            a.add("r10", "rdx");
            a.load("r11", { base: "r10", disp: EL.values + 16 });
            a.store({ base: "rax" }, "r11");
            a.load("r11", { base: "r10", disp: EL.values + 24 });
            a.store({ base: "rax", disp: 8 }, "r11");
            a.add("rcx", 1);
            a.jmp(loop);
            a.label(end);
        }
        a.load("rcx", slot(40));
        a.mov("rax", 5);
        a.store({ base: "rcx" }, "rax");
        a.load("rax", slot(96));
        a.store({ base: "rcx", disp: 8 }, "rax");
        a.jmp(done);
        a.label(bad);
        undefinedResult(a);
        a.label(done);
    });
}
