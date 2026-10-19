import { slot } from "./abi.js";
import type { Assembler } from "../backend/machine/context.js";

// Vector scans for the first unit of a substring pattern (#253), shared by
// indexOf, includes and lastIndexOf (string-builtins.ts), split
// (string-split.ts) and replaceAll (string-replace-all.ts).

/**
 * The scan of a backward substring search (lastIndexOf, #253): moves the
 * position slot down to the nearest position, at or before it, whose code
 * unit is the pattern's first unit, eight units per step; below eight it
 * leaves the position for the scalar comparison, and it jumps to `notFound`
 * when the window that ends at position 7 has no match. Same slots and
 * registers as skipToFirstUnit.
 */
export function skipBackToFirstUnit(
    a: Assembler,
    position: number,
    notFound: string,
): void {
    const scan = a.unique("backScan"),
        hit = a.unique("backHit"),
        done = a.unique("backDone");
    a.load("r9", slot(88));
    a.load("r9", { base: "r9", disp: 8 }, 16);
    a.vectorBroadcast16("xmm4", "r9");
    a.load("rax", slot(position));
    a.label(scan);
    a.cmp("rax", 7);
    a.jcc("b", done);
    // The eight units that end at the position.
    a.lea("r9", { base: "rax", disp: -7 });
    a.shl("r9", 1);
    a.load("rdx", slot(72));
    a.add("rdx", 8);
    a.add("rdx", "r9");
    a.loadXmm128("xmm5", { base: "rdx" });
    a.vectorEqual16("xmm5", "xmm4");
    a.vectorMask("r9", "xmm5");
    a.test("r9", "r9");
    a.jcc("ne", hit);
    // Position 7 was the last window: no position at or below it matches.
    a.cmp("rax", 8);
    a.jcc("b", notFound);
    a.sub("rax", 8);
    a.jmp(scan);
    a.label(hit);
    // The highest set bit is in the last matching unit.
    a.bitScanReverse("r9", "r9");
    a.shr("r9", Math.log2(a.vectorMaskBitsPerByte) + 1);
    a.sub("rax", 7);
    a.add("rax", "r9");
    a.label(done);
    a.store(slot(position), "rax");
}

/**
 * The scan of a forward substring search (#253): moves the position slot to
 * the next position, at or after it, whose code unit is the pattern's first
 * unit, eight units per step, and jumps to `notFound` once no position up to
 * the last possible one (text length less pattern length) is left. Within
 * eight units of the end it leaves the position for the scalar comparison.
 * The position slot always holds the position reached.
 * The slots hold the position, the text and pattern records (the pattern is
 * not empty) and their lengths. Uses RAX, RDX, R9-R11, XMM4 and XMM5.
 */
/** Slots of position, text record, text length, pattern record, pattern length. */
export type ScanSlots = [number, number, number, number, number];

export function skipToFirstUnit(
    a: Assembler,
    slots: ScanSlots,
    notFound: string,
): void {
    const [position, text, textLength, pattern, patternLength] = slots;
    const scan = a.unique("scan"),
        hit = a.unique("hit"),
        done = a.unique("scanDone"),
        exhausted = a.unique("exhausted"),
        scanned = a.unique("scanned");
    a.load("rax", slot(position));
    a.mov("r9", "rax");
    a.shl("r9", 1);
    a.load("rdx", slot(text));
    a.add("rdx", 8);
    a.add("rdx", "r9");
    a.load("r9", slot(pattern));
    a.load("r9", { base: "r9", disp: 8 }, 16);
    a.vectorBroadcast16("xmm4", "r9");
    a.load("r11", slot(textLength));
    a.mov("r10", "r11");
    a.subMemory("r10", slot(patternLength));
    a.label(scan);
    a.cmp("rax", "r10");
    a.jcc("a", exhausted);
    a.lea("r9", { base: "rax", disp: 8 });
    a.cmp("r9", "r11");
    a.jcc("a", done);
    a.loadXmm128("xmm5", { base: "rdx" });
    a.vectorEqual16("xmm5", "xmm4");
    a.vectorMask("r9", "xmm5");
    a.test("r9", "r9");
    a.jcc("ne", hit);
    a.add("rax", 8);
    a.add("rdx", 16);
    a.jmp(scan);
    a.label(hit);
    // The lowest set bit is the first matching byte; a unit is two bytes.
    a.bitScanForward("r9", "r9");
    a.shr("r9", Math.log2(a.vectorMaskBitsPerByte) + 1);
    a.add("rax", "r9");
    a.label(done);
    a.store(slot(position), "rax");
    a.jmp(scanned);
    // No position is left: the position slot says so too (split reads it).
    a.label(exhausted);
    a.store(slot(position), "rax");
    a.jmp(notFound);
    a.label(scanned);
}
