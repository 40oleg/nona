import { RuntimeBuilder, slot } from "./abi.js";
import { ObjectLayout as O } from "./object-layout.js";
import { ElementsLayout as EL } from "./array-elements.js";
import type { Assembler, Reg } from "../backend/machine/context.js";

/**
 * The strings of recent header fields (#403), for __nonaNetHeadLines.
 *
 * A client sends the same field names, and mostly the same values, on every
 * request: making two new strings per field cost more than parsing it. The
 * field cache is a direct-mapped table of the last field seen per name
 * (exact case), entry = {hash, name length, value length, the interned
 * lower-case name's index and hash (__nonaNetLowerNames fills them), the
 * name's bytes, the value's bytes}; the strings themselves are elements 2e
 * and 2e + 1 of an array the module keeps forever (`keep`), so they stay
 * alive while the entry names them. A field whose bytes equal the entry's
 * reuses its strings (strings are immutable); otherwise the new string
 * replaces the entry's. Names above 64 bytes and values above 160 bytes are
 * not cached.
 *
 * The memo: per field position i of the last head (up to 128), the name
 * string given out and its entry. __nonaNetLowerNames takes the lower-case
 * name of a raw name that is the memo's string at its position from the
 * entry, without hashing it. A memo record (string, e) is kept only while
 * entry e's name is that string: replacing an entry's name clears the memo.
 */
export const FieldCache = {
    entries: 128,
    entryBytes: 256,
    hash: 0,
    nameLength: 8,
    valueLength: 12,
    lowerIndex: 16,
    lowerHash: 24,
    name: 32,
    nameBytes: 64,
    value: 96,
    valueBytes: 160,
    /** The memo after the entries: 128 records {name string, entry}. */
    memo: 128 * 256,
    memoRecords: 128,
} as const;
const F = FieldCache;
const tableBytes = F.memo + 16 * F.memoRecords;
const hashFactor = 0x100000001b3n;

/** Jumps to `differ` unless the LEN bytes at SRC equal those at [BASE + disp]. Clobbers RAX, RCX, RDX. */
function sameBytes(
    a: Assembler,
    src: Reg,
    len: Reg,
    base: Reg,
    disp: number,
    differ: string,
) {
    const words = a.unique("words"),
        last = a.unique("last"),
        bytes = a.unique("bytes"),
        same = a.unique("same");
    const compareWord = () => {
        a.mov("rax", src);
        a.add("rax", "rcx");
        a.load("rax", { base: "rax" });
        a.mov("rdx", base);
        a.add("rdx", "rcx");
        a.cmpMemory("rax", { base: "rdx", disp });
        a.jcc("ne", differ);
    };
    a.mov("rcx", 0);
    a.cmp(len, 8);
    a.jcc("b", bytes);
    // Whole words, then the last eight bytes (overlapping the previous word).
    a.label(words);
    a.lea("rax", { base: "rcx", disp: 8 });
    a.cmp("rax", len);
    a.jcc("a", last);
    compareWord();
    a.add("rcx", 8);
    a.jmp(words);
    a.label(last);
    a.mov("rcx", len);
    a.sub("rcx", 8);
    compareWord();
    a.jmp(same);
    a.label(bytes);
    a.cmp("rcx", len);
    a.jcc("ae", same);
    a.mov("rax", src);
    a.add("rax", "rcx");
    a.load("rax", { base: "rax" }, 8);
    a.mov("rdx", base);
    a.add("rdx", "rcx");
    a.load("rdx", { base: "rdx", disp }, 8);
    a.cmp("rax", "rdx");
    a.jcc("ne", differ);
    a.add("rcx", 1);
    a.jmp(bytes);
    a.label(same);
}

/** Copies the LEN bytes at SRC to [BASE + disp] (the same steps as sameBytes). Clobbers RAX, RCX, RDX. */
function copyBytes(a: Assembler, src: Reg, len: Reg, base: Reg, disp: number) {
    const words = a.unique("words"),
        last = a.unique("last"),
        bytes = a.unique("bytes"),
        done = a.unique("copied");
    const copyWord = () => {
        a.mov("rax", src);
        a.add("rax", "rcx");
        a.load("rax", { base: "rax" });
        a.mov("rdx", base);
        a.add("rdx", "rcx");
        a.store({ base: "rdx", disp }, "rax");
    };
    a.mov("rcx", 0);
    a.cmp(len, 8);
    a.jcc("b", bytes);
    a.label(words);
    a.lea("rax", { base: "rcx", disp: 8 });
    a.cmp("rax", len);
    a.jcc("a", last);
    copyWord();
    a.add("rcx", 8);
    a.jmp(words);
    a.label(last);
    a.mov("rcx", len);
    a.sub("rcx", 8);
    copyWord();
    a.jmp(done);
    a.label(bytes);
    a.cmp("rcx", len);
    a.jcc("ae", done);
    a.mov("rax", src);
    a.add("rax", "rcx");
    a.load("rax", { base: "rax" }, 8);
    a.mov("rdx", base);
    a.add("rdx", "rcx");
    a.store({ base: "rdx", disp }, "rax", 8);
    a.add("rcx", 1);
    a.jmp(bytes);
    a.label(done);
}

export function emitHttpFieldCache(b: RuntimeBuilder): void {
    b.data("rt.netFieldTable", new Uint8Array(8), ".data");
    // RCX the module's keep array Value* (or anything else: no cache) -> RAX
    // its element table when it is dense with 256 elements, else 0; the
    // table is allocated on first use.
    b.fn("rt.netFieldKeep", 56, (a) => {
        const none = a.unique("none"),
            done = a.unique("done"),
            have = a.unique("have"),
            ok = a.unique("allocated");
        a.load("rax", { base: "rcx" });
        a.cmp("rax", 5);
        a.jcc("ne", none);
        a.load("r10", { base: "rcx", disp: 8 });
        a.load("rax", { base: "r10", disp: O.kind });
        a.cmp("rax", 1);
        a.jcc("ne", none);
        a.load("r10", { base: "r10", disp: O.elements });
        a.test("r10", "r10");
        a.jcc("e", none);
        a.load("rax", { base: "r10", disp: EL.nodes });
        a.test("rax", "rax");
        a.jcc("ne", none);
        a.load("rax", { base: "r10", disp: EL.count });
        a.cmp("rax", 2 * F.entries);
        a.jcc("b", none);
        a.store(slot(40), "r10");
        a.load("rax", { rip: "rt.netFieldTable" });
        a.test("rax", "rax");
        a.jcc("ne", have);
        a.load("rcx", { rip: "rt.heap" });
        a.mov("rdx", 8);
        a.mov("r8", tableBytes);
        a.callImport("HeapAlloc");
        a.test("rax", "rax");
        a.jcc("ne", ok);
        a.call("rt.fail");
        a.label(ok);
        a.store({ rip: "rt.netFieldTable" }, "rax");
        a.label(have);
        a.load("rax", slot(40));
        a.jmp(done);
        a.label(none);
        a.mov("rax", 0);
        a.label(done);
    });
    // R10 bytes, R11 count, R8 the field's position, R9 the keep array's
    // element table (0: no cache) -> RAX the name's string record (new or
    // the cached one), RDX its entry (0: not cached).
    b.fn("rt.netFieldName", 88, (a) => {
        // Frame: 40 bytes, 48 count, 56 position, 64 keep, 72 entry, 80 hash.
        const plain = a.unique("plain"),
            miss = a.unique("miss"),
            done = a.unique("done"),
            words = a.unique("words"),
            tail = a.unique("tail"),
            hashed = a.unique("hashed"),
            fresh = a.unique("fresh"),
            memo = a.unique("memo");
        a.store(slot(40), "r10");
        a.store(slot(48), "r11");
        a.store(slot(56), "r8");
        a.store(slot(64), "r9");
        a.mov("rax", 0);
        a.store(slot(72), "rax");
        a.test("r9", "r9");
        a.jcc("e", plain);
        a.test("r11", "r11");
        a.jcc("e", plain);
        a.cmp("r11", F.nameBytes);
        a.jcc("a", plain);
        // The hash of the bytes, eight at a time.
        a.mov("rcx", 0);
        a.mov("r8", 0);
        a.label(words);
        a.lea("rax", { base: "rcx", disp: 8 });
        a.cmp("rax", "r11");
        a.jcc("a", tail);
        a.mov("rax", "r10");
        a.add("rax", "rcx");
        a.load("rax", { base: "rax" });
        a.add("r8", "rax");
        a.mov("r9", hashFactor);
        a.imul("r8", "r9");
        a.add("rcx", 8);
        a.jmp(words);
        a.label(tail);
        a.cmp("rcx", "r11");
        a.jcc("ae", hashed);
        a.mov("rax", "r10");
        a.add("rax", "rcx");
        a.load("rax", { base: "rax" }, 8);
        a.add("r8", "rax");
        a.mov("r9", hashFactor);
        a.imul("r8", "r9");
        a.add("rcx", 1);
        a.jmp(tail);
        a.label(hashed);
        a.mov("rdx", "r8");
        a.shr("rdx", 29);
        a.xor("rdx", "r8");
        a.or("rdx", 1);
        a.store(slot(80), "rdx");
        // R9 = the entry.
        a.mov("r9", "rdx");
        a.shr("r9", 7);
        a.and("r9", F.entries - 1);
        a.shl("r9", 8);
        a.load("rax", { rip: "rt.netFieldTable" });
        a.add("r9", "rax");
        a.store(slot(72), "r9");
        a.cmpMemory("rdx", { base: "r9", disp: F.hash });
        a.jcc("ne", miss);
        a.load("rax", { base: "r9", disp: F.nameLength }, 32);
        a.cmp("rax", "r11");
        a.jcc("ne", miss);
        sameBytes(a, "r10", "r11", "r9", F.name, miss);
        // Element 2e of keep: the string (anything else is a miss).
        a.load("rax", slot(72));
        a.load("rcx", { rip: "rt.netFieldTable" });
        a.sub("rax", "rcx");
        a.shr("rax", 3);
        a.load("rcx", slot(64));
        a.add("rcx", "rax");
        a.load("rax", { base: "rcx", disp: EL.values });
        a.cmp("rax", 4);
        a.jcc("ne", miss);
        a.load("rax", { base: "rcx", disp: EL.values + 8 });
        a.jmp(memo);
        // A new name for the entry: the memo no longer holds (an entry's
        // name changes), the value and the lower-case name are unknown.
        a.label(miss);
        a.load("r9", slot(72));
        a.load("rax", { base: "r9", disp: F.hash });
        a.test("rax", "rax");
        a.jcc("e", fresh);
        {
            const clear = a.unique("clear");
            a.load("rax", { rip: "rt.netFieldTable" });
            a.add("rax", F.memo);
            a.mov("rcx", F.memoRecords);
            a.mov("rdx", 0);
            a.label(clear);
            a.store({ base: "rax" }, "rdx");
            a.add("rax", 16);
            a.sub("rcx", 1);
            a.jcc("ne", clear);
        }
        a.label(fresh);
        a.load("r9", slot(72));
        a.mov("rax", 0);
        a.store({ base: "r9", disp: F.hash }, "rax");
        a.load("r10", slot(40));
        a.load("r11", slot(48));
        copyBytes(a, "r10", "r11", "r9", F.name);
        a.load("r9", slot(72));
        a.load("r11", slot(48));
        a.store({ base: "r9", disp: F.nameLength }, "r11", 32);
        a.mov("rax", -1);
        a.store({ base: "r9", disp: F.valueLength }, "rax", 32);
        a.store({ base: "r9", disp: F.lowerIndex }, "rax");
        a.load("r10", slot(40));
        a.call("rt.netLatin1String");
        // The new string is element 2e of keep, then the entry is valid.
        a.load("r9", slot(72));
        a.load("rcx", { rip: "rt.netFieldTable" });
        a.mov("rdx", "r9");
        a.sub("rdx", "rcx");
        a.shr("rdx", 3);
        a.load("rcx", slot(64));
        a.add("rcx", "rdx");
        a.mov("rdx", 4);
        a.store({ base: "rcx", disp: EL.values }, "rdx");
        a.store({ base: "rcx", disp: EL.values + 8 }, "rax");
        a.load("rdx", slot(80));
        a.store({ base: "r9", disp: F.hash }, "rdx");
        // Memo record for the position: RAX the string, entry in slot 72.
        a.label(memo);
        {
            const skip = a.unique("noMemo");
            a.load("rcx", slot(56));
            a.cmp("rcx", F.memoRecords);
            a.jcc("ae", skip);
            a.shl("rcx", 4);
            a.load("rdx", { rip: "rt.netFieldTable" });
            a.add("rcx", "rdx");
            a.store({ base: "rcx", disp: F.memo }, "rax");
            a.load("rdx", slot(72));
            a.store({ base: "rcx", disp: F.memo + 8 }, "rdx");
            a.label(skip);
        }
        a.load("rdx", slot(72));
        a.jmp(done);
        a.label(plain);
        a.call("rt.netLatin1String");
        a.mov("rdx", 0);
        a.label(done);
    });
    // R10 bytes, R11 count, R8 the name's entry (0: not cached), R9 the keep
    // array's element table -> RAX the value's string record.
    b.fn("rt.netFieldValue", 72, (a) => {
        // Frame: 40 bytes, 48 count, 56 entry, 64 keep.
        const plain = a.unique("plain"),
            miss = a.unique("miss"),
            done = a.unique("done");
        a.store(slot(40), "r10");
        a.store(slot(48), "r11");
        a.store(slot(56), "r8");
        a.store(slot(64), "r9");
        a.test("r8", "r8");
        a.jcc("e", plain);
        a.cmp("r11", F.valueBytes);
        a.jcc("a", plain);
        a.load("rax", { base: "r8", disp: F.valueLength }, 32);
        a.cmp("rax", "r11");
        a.jcc("ne", miss);
        sameBytes(a, "r10", "r11", "r8", F.value, miss);
        // Element 2e + 1 of keep.
        a.load("rax", slot(56));
        a.load("rcx", { rip: "rt.netFieldTable" });
        a.sub("rax", "rcx");
        a.shr("rax", 3);
        a.load("rcx", slot(64));
        a.add("rcx", "rax");
        a.load("rax", { base: "rcx", disp: EL.values + 16 });
        a.cmp("rax", 4);
        a.jcc("ne", miss);
        a.load("rax", { base: "rcx", disp: EL.values + 24 });
        a.jmp(done);
        a.label(miss);
        a.load("r8", slot(56));
        a.mov("rax", -1);
        a.store({ base: "r8", disp: F.valueLength }, "rax", 32);
        a.load("r10", slot(40));
        a.load("r11", slot(48));
        copyBytes(a, "r10", "r11", "r8", F.value);
        a.load("r10", slot(40));
        a.load("r11", slot(48));
        a.call("rt.netLatin1String");
        a.load("r8", slot(56));
        a.load("rcx", { rip: "rt.netFieldTable" });
        a.mov("rdx", "r8");
        a.sub("rdx", "rcx");
        a.shr("rdx", 3);
        a.load("rcx", slot(64));
        a.add("rcx", "rdx");
        a.mov("rdx", 4);
        a.store({ base: "rcx", disp: EL.values + 16 }, "rdx");
        a.store({ base: "rcx", disp: EL.values + 24 }, "rax");
        a.load("r11", slot(48));
        a.store({ base: "r8", disp: F.valueLength }, "r11", 32);
        a.jmp(done);
        a.label(plain);
        a.call("rt.netLatin1String");
        a.label(done);
    });
}
