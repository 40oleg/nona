import { RuntimeBuilder, slot } from "./abi.js";

/** The most code units a first-unit set may hold (regexp-vm.js keeps to it). */
export const regexpScanUnits = 8;

/**
 * __nonaRegexpScan(string, start, units) (#258): the index of the first code
 * unit of `string` at or after `start` that occurs in the string `units`
 * (one to eight code units), or -1. The RegExp engine calls it before each
 * match attempt of an unanchored pattern whose matches can only start with
 * one of those units (the first-unit set computed by compile in
 * regexp-vm.js), instead of running the matcher at every position.
 *
 * Eight text units per step: the units of the set are broadcast once into
 * the frame, and each vector of the text is compared with every one of them
 * and the masks or-ed. Fewer than eight units at the end are compared one by
 * one.
 *
 * A leaf function with the builtin ABI (RCX out Value*, RDX argc, R8 argv):
 * it reads flat string records and a number, allocates nothing and calls
 * nothing. Other arguments return undefined; the caller then tries every
 * position as before.
 */
export function emitRegExpScan(b: RuntimeBuilder): void {
    // Frame: 32 output, 40 set length, 48.. the broadcast units (16 each).
    const vectors = 48;
    b.fn("rt.regexpScan.code", vectors + 16 * regexpScanUnits, (a) => {
        a.store(slot(32), "rcx");
        const bad = a.unique("bad"),
            done = a.unique("done"),
            vector = a.unique("vector"),
            tail = a.unique("tail"),
            hit = a.unique("hit"),
            found = a.unique("found"),
            missing = a.unique("missing");
        a.cmp("rdx", 3);
        a.jcc("b", bad);
        for (const index of [0, 2]) {
            a.load("rax", { base: "r8", disp: 16 * index });
            a.cmp("rax", 4);
            a.jcc("ne", bad);
        }
        a.load("rax", { base: "r8", disp: 16 });
        a.cmp("rax", 3);
        a.jcc("ne", bad);
        // R9 the set's units, RDX its length (1..8).
        a.load("r9", { base: "r8", disp: 40 });
        a.load("rdx", { base: "r9" });
        a.add("r9", 8);
        a.cmp("rdx", 0);
        a.jcc("e", bad);
        a.cmp("rdx", regexpScanUnits);
        a.jcc("a", bad);
        a.store(slot(40), "rdx");
        {
            const broadcast = a.unique("broadcast");
            a.mov("r10", 0);
            a.lea("r11", slot(vectors));
            a.label(broadcast);
            a.mov("rax", "r10");
            a.add("rax", "rax");
            a.add("rax", "r9");
            a.load("rax", { base: "rax" }, 16);
            a.vectorBroadcast16("xmm0", "rax");
            a.storeXmm128({ base: "r11" }, "xmm0");
            a.add("r11", 16);
            a.add("r10", 1);
            a.cmp("r10", "rdx");
            a.jcc("b", broadcast);
        }
        a.movsd("xmm0", { base: "r8", disp: 24 });
        a.cvttsd2si("rcx", "xmm0");
        a.cmp("rcx", 0);
        a.jcc("l", bad);
        // R10 the text's units, R11 its length, RCX the position.
        a.load("r10", { base: "r8", disp: 8 });
        a.load("r11", { base: "r10" });
        a.add("r10", 8);
        a.label(vector);
        a.lea("rax", { base: "rcx", disp: 8 });
        a.cmp("rax", "r11");
        a.jcc("a", tail);
        a.mov("rax", "rcx");
        a.add("rax", "rax");
        a.add("rax", "r10");
        a.vectorZero("xmm2");
        {
            const each = a.unique("each");
            a.lea("rdx", slot(vectors));
            a.load("r8", slot(40));
            a.label(each);
            a.loadXmm128("xmm1", { base: "rax" });
            a.loadXmm128("xmm0", { base: "rdx" });
            a.vectorEqual16("xmm1", "xmm0");
            a.vectorOr("xmm2", "xmm1");
            a.add("rdx", 16);
            a.sub("r8", 1);
            a.cmp("r8", 0);
            a.jcc("ne", each);
        }
        a.vectorMask("rdx", "xmm2");
        a.test("rdx", "rdx");
        a.jcc("ne", hit);
        a.add("rcx", 8);
        a.jmp(vector);
        a.label(hit);
        // The lowest set bit is in the first matching unit (two bytes each).
        a.bitScanForward("rdx", "rdx");
        a.shr("rdx", Math.log2(a.vectorMaskBitsPerByte) + 1);
        a.add("rcx", "rdx");
        a.jmp(found);
        // Fewer than eight units left: one at a time against each set unit.
        a.label(tail);
        {
            const each = a.unique("tailEach"),
                next = a.unique("next");
            a.cmp("rcx", "r11");
            a.jcc("ae", missing);
            a.mov("rax", "rcx");
            a.add("rax", "rax");
            a.add("rax", "r10");
            a.load("rax", { base: "rax" }, 16);
            a.mov("rdx", "r9");
            a.load("r8", slot(40));
            a.label(each);
            a.load("r11", { base: "rdx" }, 16);
            a.cmp("rax", "r11");
            a.jcc("e", found);
            a.add("rdx", 2);
            a.sub("r8", 1);
            a.cmp("r8", 0);
            a.jcc("ne", each);
            a.label(next);
            a.load("r11", { base: "r10", disp: -8 });
            a.add("rcx", 1);
            a.jmp(tail);
        }
        a.label(missing);
        a.mov("rcx", -1);
        a.label(found);
        a.cvtsi2sd("xmm0", "rcx");
        a.load("rcx", slot(32));
        a.mov("rax", 3);
        a.store({ base: "rcx" }, "rax");
        a.storesd({ base: "rcx", disp: 8 }, "xmm0");
        a.jmp(done);
        a.label(bad);
        a.load("rcx", slot(32));
        a.mov("rax", 0);
        a.store({ base: "rcx" }, "rax");
        a.store({ base: "rcx", disp: 8 }, "rax");
        a.label(done);
    });
}
