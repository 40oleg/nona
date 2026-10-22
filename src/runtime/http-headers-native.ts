import { RuntimeBuilder, slot } from "./abi.js";
import { ObjectLayout as O, ObjectFlags } from "./object-layout.js";
import {
    HeapLayout as H,
    HeapKind,
    ValueListLayout as V,
} from "./heap-layout.js";
import { ElementsLayout as EL, HoleTag } from "./array-elements.js";
import { ShapeLayout as S } from "./shapes.js";
import { emitShapedObjectHeader } from "./object-header.js";
import type { Assembler } from "../backend/machine/context.js";
import { FieldCache as F } from "./http-field-cache.js";

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
 *
 * __nonaNetLowerNames (below) gives the interned lower-case names: a name
 * is hashed and compared with its interned string four units at a time and
 * only allocated when it is not interned yet.
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

    // __nonaNetLowerNames(raw): for an array [name, value, ...] of strings
    // with dense elements whose names are all distinct (case-insensitively),
    // the array of the names with ASCII letters folded to lower case (the
    // keys of IncomingMessage.headers); undefined for anything else (a hole,
    // a node, a non-string, a repeated name), which the module handles
    // itself. Distinctness lets the module build the headers object without
    // reading it back per field.
    // The lower-case names are interned: the second argument is an array the
    // module keeps forever, and rt.netNameTable maps a name's hash to the
    // index of its string there (direct-mapped, 256 entries of {hash, index}),
    // so the same name gives the same string object on every request, and
    // the headers object's shape transitions compare keys by identity.
    // One block outside the collected heap, allocated on first use (not in
    // the image): the table (256 entries of 16 bytes), then the hashes of
    // the names of the request being folded (128 of 8 bytes).
    b.data("rt.netNameTable", new Uint8Array(8), ".data");
    const nameTableBytes = 16 * 256,
        nameBlockBytes = nameTableBytes + 8 * 128;
    b.fn("rt.netLowerNames.code", 168, (a) => {
        // Frame: 48 the elements table, 56 count, 64 index, 72 the array
        // Value (16 bytes), 88 a string Value (16 bytes), 104 the intern
        // array's object (0: none), 112 the folded units' hash, 120 the
        // folded string record, 136 the name's units, 144 their count, 152
        // the field cache entry to record the result in (0: none), 160 the
        // interned string's index.
        a.store(slot(40), "rcx");
        const bad = a.unique("bad"),
            done = a.unique("done"),
            loop = a.unique("loop"),
            end = a.unique("end"),
            element = a.unique("element");
        a.cmp("rdx", 1);
        a.jcc("b", bad);
        // Slot 104: the intern array's Value* (the second argument, in the
        // caller's argument area), or 0.
        {
            const chosen = a.unique("chosen");
            a.mov("r10", 0);
            a.cmp("rdx", 2);
            a.jcc("b", chosen);
            a.load("rax", { base: "r8", disp: 16 });
            a.cmp("rax", 5);
            a.jcc("ne", chosen);
            a.load("rax", { base: "r8", disp: 24 });
            a.load("rax", { base: "rax", disp: O.kind });
            a.cmp("rax", 1);
            a.jcc("ne", chosen);
            a.lea("r10", { base: "r8", disp: 16 });
            a.label(chosen);
            a.store(slot(104), "r10");
        }
        a.load("rax", { base: "r8" });
        a.cmp("rax", 5);
        a.jcc("ne", bad);
        a.load("r10", { base: "r8", disp: 8 });
        a.load("rax", { base: "r10", disp: O.kind });
        a.cmp("rax", 1);
        a.jcc("ne", bad);
        a.load("r10", { base: "r10", disp: O.elements });
        a.test("r10", "r10");
        a.jcc("e", bad);
        a.load("rax", { base: "r10", disp: EL.nodes });
        a.test("rax", "rax");
        a.jcc("ne", bad);
        a.store(slot(48), "r10");
        a.load("rax", { base: "r10", disp: EL.count });
        a.cmp("rax", 256);
        a.jcc("a", bad);
        // Pairs only: an odd count would name one more field than the
        // result array has elements.
        a.mov("rcx", "rax");
        a.and("rcx", 1);
        a.test("rcx", "rcx");
        a.jcc("ne", bad);
        a.store(slot(56), "rax");
        {
            const have = a.unique("haveTable"),
                ok = a.unique("allocated");
            a.load("rax", { rip: "rt.netNameTable" });
            a.test("rax", "rax");
            a.jcc("ne", have);
            a.load("rcx", { rip: "rt.heap" });
            a.mov("rdx", 8);
            a.mov("r8", nameBlockBytes);
            a.callImport("HeapAlloc");
            a.test("rax", "rax");
            a.jcc("ne", ok);
            a.call("rt.fail");
            a.label(ok);
            a.store({ rip: "rt.netNameTable" }, "rax");
            a.label(have);
            a.load("rax", slot(56));
        }
        {
            const empty = a.unique("empty"),
                made = a.unique("made");
            a.shr("rax", 1);
            a.jcc("e", empty);
            a.lea("rcx", slot(72));
            a.mov("rdx", "rax");
            a.call("rt.newArrayLiteral");
            a.jmp(made);
            a.label(empty);
            a.lea("rcx", slot(72));
            a.mov("rdx", 1);
            a.mov("r8", 0);
            a.call("rt.newObject");
            a.label(made);
        }
        a.mov("rax", 0);
        a.store(slot(64), "rax");
        a.label(loop);
        a.load("rax", slot(64));
        a.load("r9", slot(56));
        a.cmp("rax", "r9");
        a.jcc("ae", end);
        a.shl("rax", 4);
        a.load("r10", slot(48));
        a.add("r10", "rax");
        a.load("rax", { base: "r10", disp: EL.values });
        a.cmp("rax", 4);
        a.jcc("ne", bad);
        a.load("r10", { base: "r10", disp: EL.values + 8 });
        // A rope (strings.ts, ropeTag in the length word) is not a flat
        // record: leave those to the module.
        a.load("r11", { base: "r10" });
        a.mov("rax", "r11");
        a.shr("rax", 62);
        a.test("rax", "rax");
        a.jcc("ne", bad);
        // The name __nonaNetHeadLines gave out at this position from the
        // field cache: its entry has the lower-case name once it is known.
        {
            const noMemo = a.unique("noMemo"),
                fill = a.unique("fill");
            a.mov("rax", 0);
            a.store(slot(152), "rax");
            a.load("r9", { rip: "rt.netFieldTable" });
            a.test("r9", "r9");
            a.jcc("e", noMemo);
            a.load("rcx", slot(64));
            a.shr("rcx", 1);
            a.cmp("rcx", F.memoRecords);
            a.jcc("ae", noMemo);
            a.shl("rcx", 4);
            a.add("rcx", "r9");
            a.cmpMemory("r10", { base: "rcx", disp: F.memo });
            a.jcc("ne", noMemo);
            a.load("r9", { base: "rcx", disp: F.memo + 8 });
            a.load("rcx", { base: "r9", disp: F.lowerIndex });
            a.test("rcx", "rcx");
            a.jcc("s", fill);
            a.load("r8", slot(104));
            a.test("r8", "r8");
            a.jcc("e", noMemo);
            a.load("r8", { base: "r8", disp: 8 });
            a.load("r8", { base: "r8", disp: O.elements });
            a.test("r8", "r8");
            a.jcc("e", noMemo);
            a.cmpMemory("rcx", { base: "r8", disp: EL.count });
            a.jcc("ae", noMemo);
            a.shl("rcx", 4);
            a.add("r8", "rcx");
            a.load("rax", { base: "r8", disp: EL.values });
            a.cmp("rax", 4);
            a.jcc("ne", noMemo);
            a.load("rax", { base: "r8", disp: EL.values + 8 });
            a.store(slot(120), "rax");
            a.load("rdx", { base: "r9", disp: F.lowerHash });
            a.load("rcx", slot(64));
            a.shr("rcx", 1);
            a.shl("rcx", 3);
            a.load("r10", { rip: "rt.netNameTable" });
            a.add("r10", "rcx");
            a.store({ base: "r10", disp: nameTableBytes }, "rdx");
            a.jmp(element);
            a.label(fill);
            a.store(slot(152), "r9");
            a.label(noMemo);
        }
        a.lea("r10", { base: "r10", disp: 8 });
        a.store(slot(136), "r10");
        a.store(slot(144), "r11");
        // The folded name is only allocated when it is not interned yet.
        a.call("rt.netLowerHash");
        a.store(slot(112), "rdx");
        // RDX = the hash of the folded name: kept per name for the check below.
        a.load("rcx", slot(64));
        a.shr("rcx", 1);
        a.shl("rcx", 3);
        a.load("r10", { rip: "rt.netNameTable" });
        a.add("r10", "rcx");
        a.store({ base: "r10", disp: nameTableBytes }, "rdx");
        // Interning: the table entry for the hash names a string of the intern
        // array with the same units (reused), or the new string is added there.
        {
            const noIntern = a.unique("noIntern"),
                allocate = a.unique("allocate"),
                add = a.unique("add"),
                interned = a.unique("interned"),
                found = a.unique("found");
            // The interned index and hash into the field cache entry.
            const record = (index: "rax") => {
                const skip = a.unique("noRecord");
                a.load("r9", slot(152));
                a.test("r9", "r9");
                a.jcc("e", skip);
                a.store({ base: "r9", disp: F.lowerIndex }, index);
                a.load("rax", slot(112));
                a.store({ base: "r9", disp: F.lowerHash }, "rax");
                a.label(skip);
            };
            const fold = () => {
                a.load("r10", slot(136));
                a.load("r11", slot(144));
                a.call("rt.netLatin1LowerUnits");
                a.store(slot(120), "rax");
            };
            a.load("r9", slot(104));
            a.test("r9", "r9");
            a.jcc("e", allocate);
            a.mov("rcx", "rdx");
            a.and("rcx", 255);
            a.shl("rcx", 4);
            a.load("r8", { rip: "rt.netNameTable" });
            a.add("r8", "rcx");
            a.store(slot(128), "r8");
            a.load("r9", { base: "r9", disp: 8 });
            a.load("r9", { base: "r9", disp: O.elements });
            a.test("r9", "r9");
            a.jcc("e", add);
            a.cmpMemory("rdx", { base: "r8" });
            a.jcc("ne", add);
            a.load("rcx", { base: "r8", disp: 8 });
            a.store(slot(160), "rcx");
            a.cmpMemory("rcx", { base: "r9", disp: EL.count });
            a.jcc("ae", add);
            a.shl("rcx", 4);
            a.add("r9", "rcx");
            a.load("rax", { base: "r9", disp: EL.values });
            a.cmp("rax", 4);
            a.jcc("ne", add);
            a.load("rcx", { base: "r9", disp: EL.values + 8 });
            a.store(slot(120), "rcx");
            a.load("r10", slot(136));
            a.load("r11", slot(144));
            a.call("rt.netSameLowerUnits");
            a.test("rax", "rax");
            a.jcc("ne", found);
            a.label(add);
            fold();
            // Appended to the intern array (which the module keeps alive) and
            // remembered under the hash: R8 = the table entry.
            a.load("r8", slot(128));
            a.load("r9", slot(104));
            a.load("r9", { base: "r9", disp: 8 });
            a.load("rcx", { base: "r9", disp: O.length });
            a.cmp("rcx", 4096);
            a.jcc("ae", noIntern);
            a.store({ base: "r8", disp: 8 }, "rcx");
            a.load("rcx", slot(112));
            a.store({ base: "r8" }, "rcx");
            a.load("rax", { base: "r8", disp: 8 });
            record("rax");
            a.mov("r10", 4);
            a.store(slot(88), "r10");
            a.load("r10", slot(120));
            a.store(slot(96), "r10");
            a.load("rcx", slot(104));
            a.lea("rdx", slot(88));
            a.call("rt.appendArrayValue");
            a.jmp(noIntern);
            a.label(found);
            a.load("rax", slot(160));
            record("rax");
            a.jmp(interned);
            a.label(allocate);
            fold();
            a.label(noIntern);
            a.label(interned);
            a.load("rax", slot(120));
        }
        // Element i / 2 of the new array.
        a.label(element);
        a.load("r10", slot(80));
        a.load("r10", { base: "r10", disp: O.elements });
        a.load("r11", slot(64));
        a.shl("r11", 3);
        a.add("r10", "r11");
        a.mov("r11", 4);
        a.store({ base: "r10", disp: EL.values }, "r11");
        a.load("rax", slot(120));
        a.store({ base: "r10", disp: EL.values + 8 }, "rax");
        a.load("rax", slot(64));
        a.add("rax", 2);
        a.store(slot(64), "rax");
        a.jmp(loop);
        a.label(end);
        // Any two equal hashes: not distinct (a hash collision counts too).
        {
            const outer = a.unique("outer"),
                inner = a.unique("inner"),
                nextOuter = a.unique("nextOuter"),
                distinct = a.unique("distinct");
            a.load("r11", slot(56));
            a.shr("r11", 1);
            a.load("r9", { rip: "rt.netNameTable" });
            a.add("r9", nameTableBytes);
            a.mov("rcx", 0);
            a.label(outer);
            a.cmp("rcx", "r11");
            a.jcc("ae", distinct);
            a.mov("rax", "rcx");
            a.shl("rax", 3);
            a.add("rax", "r9");
            a.load("r10", { base: "rax" });
            a.lea("rdx", { base: "rcx", disp: 1 });
            a.label(inner);
            a.cmp("rdx", "r11");
            a.jcc("ae", nextOuter);
            a.mov("rax", "rdx");
            a.shl("rax", 3);
            a.add("rax", "r9");
            a.cmpMemory("r10", { base: "rax" });
            a.jcc("e", bad);
            a.add("rdx", 1);
            a.jmp(inner);
            a.label(nextOuter);
            a.add("rcx", 1);
            a.jmp(outer);
            a.label(distinct);
        }
        a.load("rcx", slot(40));
        for (const part of [0, 8]) {
            a.load("rax", slot(72 + part));
            a.store({ base: "rcx", disp: part }, "rax");
        }
        a.jmp(done);
        a.label(bad);
        undefinedResult(a);
        a.label(done);
    });
    // RCX, RDX two flat string records -> RAX 1 when they have the same units.
    b.fn("rt.netSameUnits", 40, (a) => {
        const differ = a.unique("differ"),
            same = a.unique("same"),
            loop = a.unique("loop"),
            done = a.unique("done");
        a.load("r10", { base: "rcx" });
        a.load("r11", { base: "rdx" });
        a.cmp("r10", "r11");
        a.jcc("ne", differ);
        a.mov("rax", "r10");
        a.shr("rax", 62);
        a.test("rax", "rax");
        a.jcc("ne", differ);
        a.mov("r8", 8);
        a.add("r10", "r10");
        a.add("r10", 8);
        a.label(loop);
        a.cmp("r8", "r10");
        a.jcc("ae", same);
        a.mov("rax", "rcx");
        a.add("rax", "r8");
        a.load("rax", { base: "rax" }, 16);
        a.mov("r11", "rdx");
        a.add("r11", "r8");
        a.load("r11", { base: "r11" }, 16);
        a.cmp("rax", "r11");
        a.jcc("ne", differ);
        a.add("r8", 2);
        a.jmp(loop);
        a.label(same);
        a.mov("rax", 1);
        a.jmp(done);
        a.label(differ);
        a.mov("rax", 0);
        a.label(done);
    });
    // Four 16-bit units in RAX, all below 0x80 (checked with nonAscii): the
    // same with A-Z folded to lower case. Clobbers RDX and R9.
    const nonAscii = 0xff80ff80ff80ff80n;
    const foldWord = (a: Assembler) => {
        a.mov("r9", 0x003f003f003f003fn);
        a.mov("rdx", "rax");
        a.add("rdx", "r9");
        a.mov("r9", 0x0025002500250025n);
        a.add("r9", "rax");
        a.not("r9");
        a.and("rdx", "r9");
        a.mov("r9", 0x0080008000800080n);
        a.and("rdx", "r9");
        a.shr("rdx", 2);
        a.or("rax", "rdx");
    };
    // RAX one unit: folded to lower case when it is A-Z.
    const foldUnit = (a: Assembler) => {
        const keep = a.unique("keep");
        a.cmp("rax", 0x41);
        a.jcc("b", keep);
        a.cmp("rax", 0x5a);
        a.jcc("a", keep);
        a.or("rax", 0x20);
        a.label(keep);
    };
    const hashFactor = 0x100000001b3n;
    // R10 code units (16-bit), R11 count -> RDX a hash of the units with
    // ASCII letters folded to lower case: four ASCII units at a time, then
    // one by one (the same text always takes the same steps).
    b.fn("rt.netLowerHash", 40, (a) => {
        const words = a.unique("words"),
            units = a.unique("units"),
            unit = a.unique("unit"),
            end = a.unique("hashed");
        a.mov("rcx", 0);
        a.mov("r8", 0);
        a.label(words);
        a.lea("rax", { base: "rcx", disp: 4 });
        a.cmp("rax", "r11");
        a.jcc("a", units);
        a.mov("rax", "rcx");
        a.add("rax", "rax");
        a.add("rax", "r10");
        a.load("rax", { base: "rax" });
        a.mov("r9", nonAscii);
        a.mov("rdx", "rax");
        a.and("rdx", "r9");
        a.jcc("ne", unit);
        foldWord(a);
        a.add("r8", "rax");
        a.mov("r9", hashFactor);
        a.imul("r8", "r9");
        a.add("rcx", 4);
        a.jmp(words);
        // One unit (in a word with a non-ASCII unit, or the last ones).
        a.label(unit);
        a.mov("rax", "rcx");
        a.add("rax", "rax");
        a.add("rax", "r10");
        a.load("rax", { base: "rax" }, 16);
        foldUnit(a);
        a.add("r8", "rax");
        a.mov("r9", hashFactor);
        a.imul("r8", "r9");
        a.add("rcx", 1);
        a.jmp(words);
        a.label(units);
        a.cmp("rcx", "r11");
        a.jcc("b", unit);
        a.label(end);
        a.mov("rdx", "r8");
        a.shr("rdx", 29);
        a.xor("rdx", "r8");
    });
    // RCX a string record, R10 code units (16-bit), R11 count -> RAX 1 when
    // the record is flat and has the units with ASCII letters folded to lower
    // case.
    b.fn("rt.netSameLowerUnits", 40, (a) => {
        const differ = a.unique("differ"),
            same = a.unique("same"),
            words = a.unique("words"),
            units = a.unique("units"),
            unit = a.unique("unit"),
            done = a.unique("done");
        a.cmpMemory("r11", { base: "rcx" });
        a.jcc("ne", differ);
        a.mov("r8", 0);
        a.label(words);
        a.lea("rax", { base: "r8", disp: 4 });
        a.cmp("rax", "r11");
        a.jcc("a", units);
        a.mov("rax", "r8");
        a.add("rax", "rax");
        a.add("rax", "r10");
        a.load("rax", { base: "rax" });
        a.mov("r9", nonAscii);
        a.mov("rdx", "rax");
        a.and("rdx", "r9");
        a.jcc("ne", unit);
        foldWord(a);
        a.mov("rdx", "r8");
        a.add("rdx", "rdx");
        a.add("rdx", "rcx");
        a.cmpMemory("rax", { base: "rdx", disp: 8 });
        a.jcc("ne", differ);
        a.add("r8", 4);
        a.jmp(words);
        a.label(unit);
        a.mov("rax", "r8");
        a.add("rax", "rax");
        a.add("rax", "r10");
        a.load("rax", { base: "rax" }, 16);
        foldUnit(a);
        a.mov("rdx", "r8");
        a.add("rdx", "rdx");
        a.add("rdx", "rcx");
        a.load("rdx", { base: "rdx", disp: 8 }, 16);
        a.cmp("rax", "rdx");
        a.jcc("ne", differ);
        a.add("r8", 1);
        a.jmp(words);
        a.label(units);
        a.cmp("r8", "r11");
        a.jcc("b", unit);
        a.label(same);
        a.mov("rax", 1);
        a.jmp(done);
        a.label(differ);
        a.mov("rax", 0);
        a.label(done);
    });
    // R10 code units (16-bit), R11 count -> RAX a new string with ASCII
    // letters folded to lower case.
    b.fn("rt.netLatin1LowerUnits", 72, (a) => {
        a.store(slot(40), "r10");
        a.store(slot(48), "r11");
        a.mov("rcx", "r11");
        a.add("rcx", "rcx");
        a.add("rcx", 8);
        a.call("rt.allocRaw");
        a.store(slot(56), "rax");
        a.load("r11", slot(48));
        a.store({ base: "rax" }, "r11");
        a.load("r10", slot(40));
        a.lea("r9", { base: "rax", disp: 8 });
        const loop = a.unique("fold"),
            end = a.unique("folded"),
            keep = a.unique("keep");
        a.mov("rcx", 0);
        a.label(loop);
        a.cmp("rcx", "r11");
        a.jcc("ae", end);
        a.mov("rdx", "rcx");
        a.add("rdx", "rdx");
        a.add("rdx", "r10");
        a.load("rdx", { base: "rdx" }, 16);
        a.cmp("rdx", 0x41);
        a.jcc("b", keep);
        a.cmp("rdx", 0x5a);
        a.jcc("a", keep);
        a.or("rdx", 0x20);
        a.label(keep);
        a.store({ base: "r9" }, "rdx", 16);
        a.add("r9", 2);
        a.add("rcx", 1);
        a.jmp(loop);
        a.label(end);
        a.load("rax", slot(56));
    });
}
