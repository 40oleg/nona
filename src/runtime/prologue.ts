import { RuntimeBuilder } from "./abi.js";
import type { Assembler } from "../backend/machine/context.js";
import { RootLayout as R } from "./heap-layout.js";
import { JsFrame as F, FrameDescriptor as D } from "./frame-layout.js";

/**
 * The end of every prologue: copies this (also into the super receiver slot)
 * and new.target from the caller's pointers into the slots after the value
 * slots, links the root record and returns into the function. RAX is the
 * frame's stack pointer, RBP the frame base and R10 the descriptor. A
 * function that reads none of them (`usesFrameThis` in src/ir/calls.ts) gets
 * the lean variant, which only clears the three slots for the collector
 * (callers still pass valid pointers; they are not read).
 */
function finishFrame(a: Assembler, copyThis: boolean): void {
    const frame = (disp: number) => ({
        base: "rbp" as const,
        disp: disp - F.bias,
    });
    // this, new.target and the super receiver follow the value slots.
    a.load("r9", { base: "r10", disp: D.thisSlot });
    a.add("r9", "rbp");
    if (copyThis) {
        a.load("r11", { base: "r10", disp: D.allocation });
        a.add("r11", "rax");
        a.load("rcx", { base: "r11", disp: F.incomingThis });
        a.load("r8", { base: "rcx" });
        a.load("rcx", { base: "rcx", disp: 8 });
        a.store({ base: "r9" }, "r8");
        a.store({ base: "r9", disp: 8 }, "rcx");
        a.store({ base: "r9", disp: 32 }, "r8");
        a.store({ base: "r9", disp: 40 }, "rcx");
        a.load("rcx", { base: "r11", disp: F.incomingNewTarget });
        a.load("r8", { base: "rcx" });
        a.load("rcx", { base: "rcx", disp: 8 });
        a.store({ base: "r9", disp: 16 }, "r8");
        a.store({ base: "r9", disp: 24 }, "rcx");
    } else {
        a.mov("r8", 0);
        a.movqToXmm("xmm0", "r8");
        for (const disp of [0, 16, 32])
            a.storeXmm128({ base: "r9", disp }, "xmm0");
    }
    // The frame's precise root record: the value slots, this, new.target and
    // the super receiver. The count is negative: the collector scans the
    // slots the stack map of the current call lists (gc.ts, stack-maps.ts).
    a.load("r11", { rip: "rt.gcRoots" });
    a.store({ base: "rax", disp: F.roots + R.next }, "r11");
    a.lea("r11", frame(F.values));
    a.store({ base: "rax", disp: F.roots + R.values }, "r11");
    a.load("r11", { base: "r10", disp: D.rootCount });
    a.store({ base: "rax", disp: F.roots + R.count }, "r11");
    a.load("r11", { base: "r10", disp: D.maps });
    a.store({ base: "rax", disp: F.maps }, "r11");
    a.lea("r11", { base: "rax", disp: F.roots });
    a.store({ rip: "rt.gcRoots" }, "r11");
    a.ret();
}

/** The frame of a function, as its descriptor (frame-layout.ts) has it. */
export interface DirectFrame {
    allocation: number;
    parameters: number;
    clear: number;
    slots: number;
    copyThis: boolean;
    /** The function's stack map table. */
    maps: string;
}
/**
 * Whether a function gets an inline direct entry (emitDirectEntry): a frame
 * below a page (no probes), parameters that have slots, and few of them and
 * of the other slots to clear, so that the unrolled code stays short.
 */
export function directEntryFits(frame: DirectFrame): boolean {
    return (
        frame.allocation < 4096 &&
        frame.parameters <= frame.slots &&
        frame.parameters <= 8 &&
        frame.clear - frame.parameters <= 8
    );
}
/**
 * The direct entry of a function (`<id>.direct`), for direct calls that pass
 * exactly its parameter count (src/ir/calls.ts): the prologue stub's work,
 * inline and with the descriptor's values as constants, and no stub call or
 * return-address move. RSP is the function's entry RSP; the frame is
 * allocated in place. A stack overflow takes the ordinary entry `fallback`,
 * whose stub throws on the caller's aligned stack. It ends with RSP and RBP
 * as the stubs leave them, before the function's first block.
 */
export function emitDirectEntry(
    a: Assembler,
    frame: DirectFrame,
    fallback: string,
): void {
    const at = (disp: number) => ({
        base: "rbp" as const,
        disp: disp - F.bias,
    });
    const thisSlot = F.values + 16 * frame.slots;
    a.lea("rax", { base: "rsp", disp: -frame.allocation });
    a.cmpMemory("rax", { rip: "rt.stackLimit" });
    a.jcc("b", fallback);
    a.mov("rsp", "rax");
    a.store({ base: "rsp", disp: F.savedFrame }, "rbp");
    a.lea("rbp", { base: "rsp", disp: F.bias });
    a.store(at(F.result), "rcx");
    a.store(at(F.argc), "rdx");
    a.store(at(F.argv), "r8");
    a.store(at(F.callee), "r9");
    for (let i = 0; i < frame.parameters; i++)
        for (const half of [0, 8]) {
            a.movsd("xmm1", { base: "r8", disp: 16 * i + half });
            a.storesd(at(F.values + 16 * i + half), "xmm1");
        }
    const cleared = frame.clear - frame.parameters;
    if (cleared > 0 || !frame.copyThis) {
        a.mov("r11", 0);
        a.movqToXmm("xmm0", "r11");
    }
    for (let i = 0; i < cleared; i++)
        a.storeXmm128(at(F.values + 16 * (frame.parameters + i)), "xmm0");
    if (frame.copyThis) {
        const incoming = (disp: number) => ({
            base: "rsp" as const,
            disp: frame.allocation + disp,
        });
        a.load("rcx", incoming(F.incomingThis));
        a.load("r8", { base: "rcx" });
        a.load("rcx", { base: "rcx", disp: 8 });
        a.store(at(thisSlot), "r8");
        a.store(at(thisSlot + 8), "rcx");
        a.store(at(thisSlot + 32), "r8");
        a.store(at(thisSlot + 40), "rcx");
        a.load("rcx", incoming(F.incomingNewTarget));
        a.load("r8", { base: "rcx" });
        a.load("rcx", { base: "rcx", disp: 8 });
        a.store(at(thisSlot + 16), "r8");
        a.store(at(thisSlot + 24), "rcx");
    } else
        for (const disp of [0, 16, 32])
            a.storeXmm128(at(thisSlot + disp), "xmm0");
    a.load("r11", { rip: "rt.gcRoots" });
    a.store({ base: "rsp", disp: F.roots + R.next }, "r11");
    a.lea("r11", at(F.values));
    a.store({ base: "rsp", disp: F.roots + R.values }, "r11");
    a.mov("r11", -(frame.slots + 3));
    a.store({ base: "rsp", disp: F.roots + R.count }, "r11");
    a.lea("r11", { rip: frame.maps });
    a.store({ base: "rsp", disp: F.maps }, "r11");
    a.lea("r11", { base: "rsp", disp: F.roots });
    a.store({ rip: "rt.gcRoots" }, "r11");
}

/** Parameter counts with a prologue stub of their own (enterFrameStub). */
export const fixedPrologueParameters = 4;
/**
 * The prologue stub of a function: a function whose frame is smaller than a
 * page and whose only slots that start cleared are its parameters (at most
 * fixedPrologueParameters) uses the stub for its parameter count, which
 * copies them without a loop when the caller passed them all (and leaves
 * the call to the general stub otherwise); any other uses rt.enterFrame.
 */
export function enterFrameStub(
    parameters: number,
    clear: number,
    allocation: number,
    copyThis: boolean,
): string {
    const name = copyThis ? "rt.enterFrame" : "rt.enterFrameLean";
    return allocation < 4096 &&
        parameters <= fixedPrologueParameters &&
        clear === parameters
        ? name + parameters
        : name;
}

/**
 * rt.enterFrame: the prologue shared by every compiled JS function. A function
 * starts with `lea r10,[rip+descriptor]; call rt.enterFrame`; the stub builds
 * the frame described by the descriptor (frame-layout.ts) below the function's
 * return address and returns into the function with the frame in place.
 * Inlined, the same code was about 275 bytes per function.
 *
 * On entry RCX, RDX, R8 and R9 carry the function's arguments (result
 * pointer, argument count, argument vector, function object) and the fifth and
 * sixth arguments (this and new.target pointers) are on the stack above the
 * function's return address. The stub checks the stack limit, probes the
 * pages of a large frame, moves its own return address to the bottom of the
 * new frame (so that `ret` lands in the function with RSP at the frame and the
 * return predictor stays paired), saves RBP and sets it up, stores the
 * argument registers, clears the value slots, copies this, new.target and the
 * arguments the caller passed into their slots, and links the frame's root
 * record. It uses RAX, R11, XMM0, XMM1 and, once they are saved, RCX, R8, R9.
 */
export function emitPrologue(b: RuntimeBuilder): void {
    for (const copyThis of [true, false])
        emitPrologueStubs(
            b,
            copyThis ? "rt.enterFrame" : "rt.enterFrameLean",
            copyThis,
        );
}

/** The general stub `name` and its fixed-parameter variants (`name` + count). */
function emitPrologueStubs(
    b: RuntimeBuilder,
    name: string,
    copyThis: boolean,
): void {
    b.raw(name, (a) => {
        const overflow = a.unique("overflow"),
            noProbe = a.unique("noProbe"),
            probe = a.unique("probe"),
            lastPage = a.unique("lastPage");
        const cleared = a.unique("cleared"),
            clear = a.unique("clear"),
            even = a.unique("even"),
            copied = a.unique("copied"),
            copy = a.unique("copy"),
            counted = a.unique("counted");
        const frame = (disp: number) => ({
            base: "rbp" as const,
            disp: disp - F.bias,
        });
        // RAX: the frame's stack pointer (the function's entry RSP less the allocation).
        a.lea("rax", { base: "rsp", disp: 8 });
        a.subMemory("rax", { base: "r10", disp: D.allocation });
        // Stack overflow becomes a RangeError instead of a crash (rt.stackLimit).
        a.cmpMemory("rax", { rip: "rt.stackLimit" });
        a.jcc("b", overflow);
        // Touch every page of a frame of 4 KiB or more, top down, as Windows guard
        // pages require; the return address goes one slot below the frame.
        a.load("r11", { base: "r10", disp: D.allocation });
        a.cmp("r11", 4096);
        a.jcc("b", noProbe);
        a.lea("r11", { base: "rsp", disp: 8 });
        a.label(probe);
        a.sub("r11", 4096);
        a.cmp("r11", "rax");
        a.jcc("b", lastPage);
        a.cmpByte({ base: "r11" }, 0);
        a.jmp(probe);
        a.label(lastPage);
        a.cmpByte({ base: "rax", disp: -8 }, 0);
        a.label(noProbe);
        a.load("r11", { base: "rsp" });
        a.lea("rsp", { base: "rax", disp: -8 });
        a.store({ base: "rsp" }, "r11");
        // RBP is preserved: saved in the frame, restored by the function's return.
        a.store({ base: "rax", disp: F.savedFrame }, "rbp");
        a.lea("rbp", { base: "rax", disp: F.bias });
        a.store(frame(F.result), "rcx");
        a.store(frame(F.argc), "rdx");
        a.store(frame(F.argv), "r8");
        a.store(frame(F.callee), "r9");
        // The first min(argc, parameters) arguments go to the parameter slots
        // (locations 0..n-1): R11 counts them, RCX the slots left to clear.
        a.load("r11", { base: "r10", disp: D.parameters });
        a.cmp("r11", "rdx");
        a.jcc("be", counted);
        a.mov("r11", "rdx");
        a.label(counted);
        a.load("rcx", { base: "r10", disp: D.clear });
        a.sub("rcx", "r11");
        a.lea("r9", frame(F.values));
        a.test("r11", "r11");
        a.jcc("e", copied);
        // Values are copied in two 8-byte halves: the caller stored them that way,
        // and a 16-byte load of two fresh 8-byte stores stalls on forwarding.
        a.label(copy);
        a.movsd("xmm1", { base: "r8" });
        a.storesd({ base: "r9" }, "xmm1");
        a.movsd("xmm1", { base: "r8", disp: 8 });
        a.storesd({ base: "r9", disp: 8 }, "xmm1");
        a.add("r8", 16);
        a.add("r9", 16);
        a.sub("r11", 1);
        a.jcc("ne", copy);
        a.label(copied);
        // The remaining slots up to the descriptor's clear count start as
        // undefined (frame-layout.ts): an odd slot first, then two per turn.
        a.test("rcx", "rcx");
        a.jcc("e", cleared);
        a.mov("r8", 0);
        a.movqToXmm("xmm0", "r8");
        a.mov("r8", "rcx");
        a.and("r8", 1);
        a.jcc("e", even);
        a.storeXmm128({ base: "r9" }, "xmm0");
        a.add("r9", 16);
        a.label(even);
        a.shr("rcx", 1);
        a.test("rcx", "rcx");
        a.jcc("e", cleared);
        a.label(clear);
        a.storeXmm128({ base: "r9" }, "xmm0");
        a.storeXmm128({ base: "r9", disp: 16 }, "xmm0");
        a.add("r9", 32);
        a.sub("rcx", 1);
        a.jcc("ne", clear);
        a.label(cleared);
        finishFrame(a, copyThis);
        // The frame was not allocated: the throw runs on the caller's aligned stack.
        a.label(overflow);
        a.call("rt.throwStackOverflow");
    });
    for (
        let parameters = 0;
        parameters <= fixedPrologueParameters;
        parameters++
    )
        b.raw(name + parameters, (a) => {
            const overflow = a.unique("overflow"),
                frame = (disp: number) => ({
                    base: "rbp" as const,
                    disp: disp - F.bias,
                });
            // Fewer arguments than parameters: the general stub supplies undefined.
            if (parameters > 0) {
                a.cmp("rdx", parameters);
                a.jcc("b", name);
            }
            a.lea("rax", { base: "rsp", disp: 8 });
            a.subMemory("rax", { base: "r10", disp: D.allocation });
            a.cmpMemory("rax", { rip: "rt.stackLimit" });
            a.jcc("b", overflow);
            a.load("r11", { base: "rsp" });
            a.lea("rsp", { base: "rax", disp: -8 });
            a.store({ base: "rsp" }, "r11");
            a.store({ base: "rax", disp: F.savedFrame }, "rbp");
            a.lea("rbp", { base: "rax", disp: F.bias });
            a.store(frame(F.result), "rcx");
            a.store(frame(F.argc), "rdx");
            a.store(frame(F.argv), "r8");
            a.store(frame(F.callee), "r9");
            for (let i = 0; i < parameters; i++)
                for (const half of [0, 8]) {
                    a.movsd("xmm1", { base: "r8", disp: 16 * i + half });
                    a.storesd(frame(F.values + 16 * i + half), "xmm1");
                }
            finishFrame(a, copyThis);
            a.label(overflow);
            a.call("rt.throwStackOverflow");
        });
}
