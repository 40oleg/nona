import { RuntimeBuilder, slot, failIf } from "./abi.js";
import { rootedFn } from "./root-scope.js";
import type { Assembler, Mem, Reg } from "../backend/machine/context.js";
import {
    ObjectLayout as O,
    ObjectFlags as OF,
    PropertyLayout as P,
    PropertyAttributes as A,
} from "./object-layout.js";
import { HeapLayout as H, HeapKind } from "./heap-layout.js";
import { HandlerLayout as EH, preservedGp, preservedXmm } from "./exception-layout.js";
import { FunctionKind } from "./functions.js";
import {
    PromiseKind,
    PromiseLayout as L,
    PromiseLists as Q,
    PromiseState as S,
    promiseValueSlots,
} from "./promise-layout.js";
import { prependFunctionBuiltin } from "./function-builtin.js";

/** The promise intrinsics (#44), installed on Function.prototype for the
 * Promise prelude and deleted by proxy-cleanup.js: symbol, name, length. */
export const promiseIntrinsics = [
    ["rt.promiseCreateInternal", "__nonaPromiseCreateInternal", 1],
    ["rt.promiseGetInternal", "__nonaPromiseGetInternal", 2],
    ["rt.promiseSetInternal", "__nonaPromiseSetInternal", 3],
    ["rt.promiseReactInternal", "__nonaPromiseReactInternal", 6],
    ["rt.promiseThenInternal", "__nonaPromiseThenInternal", 4],
    ["rt.promiseUpdateInternal", "__nonaPromiseUpdateInternal", 3],
    ["rt.promiseTakeInternal", "__nonaPromiseTakeInternal", 1],
    ["rt.promiseRunInternal", "__nonaPromiseRunInternal", 0],
    ["rt.promiseConfigInternal", "__nonaPromiseConfigInternal", 3],
] as const;

const list = (offset: number): Mem => ({
    rip: "rt.promiseLists",
    addend: offset,
});

/** Appends the promise object at NODE (kept) to the list whose head and tail
 * Values are at head(0)/head(8) and tail(0)/tail(8). Clobbers RAX and R11. */
function appendNode(
    a: Assembler,
    head: (part: number) => Mem,
    tail: (part: number) => Mem,
    node: Reg,
): void {
    const empty = a.unique("emptyList"),
        linked = a.unique("linked");
    a.mov("rax", 0);
    a.store({ base: node, disp: L.next }, "rax");
    a.store({ base: node, disp: L.next + 8 }, "rax");
    a.load("rax", tail(0));
    a.test("rax", "rax");
    a.jcc("e", empty);
    a.load("r11", tail(8));
    a.mov("rax", 5);
    a.store({ base: "r11", disp: L.next }, "rax");
    a.store({ base: "r11", disp: L.next + 8 }, node);
    a.jmp(linked);
    a.label(empty);
    a.mov("rax", 5);
    a.store(head(0), "rax");
    a.store(head(8), node);
    a.label(linked);
    a.mov("rax", 5);
    a.store(tail(0), "rax");
    a.store(tail(8), node);
}
/** Appends NODE to one of the agent-wide lists (PromiseLists). */
function appendToList(a: Assembler, offset: number, node: Reg): void {
    appendNode(
        a,
        (part) => list(offset + part),
        (part) => list(offset + 16 + part),
        node,
    );
}
/** Removes the head of the list at OFFSET into R10 and jumps to EMPTY when
 * there is none. Clobbers RAX and R11. */
function popList(a: Assembler, offset: number, empty: string): void {
    const more = a.unique("more");
    a.load("rax", list(offset));
    a.test("rax", "rax");
    a.jcc("e", empty);
    a.load("r10", list(offset + 8));
    a.load("rax", { base: "r10", disp: L.next });
    a.load("r11", { base: "r10", disp: L.next + 8 });
    a.store(list(offset), "rax");
    a.store(list(offset + 8), "r11");
    a.test("rax", "rax");
    a.jcc("ne", more);
    a.store(list(offset + 16), "rax");
    a.store(list(offset + 24), "rax");
    a.label(more);
    a.mov("rax", 0);
    a.store({ base: "r10", disp: L.next }, "rax");
    a.store({ base: "r10", disp: L.next + 8 }, "rax");
}
/** Copies the Value at FROM to TO through RAX. */
function copyValue(a: Assembler, to: Mem, from: Mem): void {
    for (const part of [0, 8]) {
        a.load("rax", offsetBy(from, part));
        a.store(offsetBy(to, part), "rax");
    }
}
function offsetBy(mem: Mem, part: number): Mem {
    return "rip" in mem
        ? { ...mem, addend: (mem.addend ?? 0) + part }
        : { ...mem, disp: (mem.disp ?? 0) + part };
}
/** Writes undefined to COUNT Values from MEM. Clobbers RAX. */
function clearValues(a: Assembler, base: Reg, disp: number, count: number) {
    a.mov("rax", 0);
    for (let i = 0; i < count * 2; i++)
        a.store({ base, disp: disp + 8 * i }, "rax");
}

export function emitPromiseNative(b: RuntimeBuilder): void {
    // Agent-wide (src/backend/realms.ts): every realm queues jobs on one list.
    b.data("rt.promiseLists", new Uint8Array(Q.size), ".data");
    // Nonzero while some realm tracks async contexts (async_hooks): every
    // reaction then runs in the prelude.
    b.data("rt.promiseTracking", new Uint8Array(8), ".data");
    // Per realm: %Promise%, %Promise.prototype% and the original
    // %Promise%[@@species] getter (__nonaPromiseConfigInternal).
    b.data("rt.promiseRealm", new Uint8Array(48), ".data");
    // The shape epoch at which the nodes of %Promise.prototype%.constructor and
    // %Promise%[@@species] were found (none yet: all ones), then the nodes.
    const protect = new Uint8Array(24);
    protect.fill(0xff, 0, 8);
    b.data("rt.promiseProtect", protect, ".data");
    for (const [symbol, name, length] of promiseIntrinsics)
        prependFunctionBuiltin(b, symbol, name, length, "rt.functionPrototype");
    // __nonaPromiseCreateInternal(prototype): a new pending promise whose
    // prototype is the argument (null unless it is an object).
    rootedFn(
        b,
        "rt.promiseCreateInternal.code",
        72,
        [
            { kind: "output", register: "rcx" },
            { kind: "range", register: "r8", count: "rdx" },
        ],
        (a) => {
            a.store(slot(40), "rcx");
            a.store(slot(48), "rdx");
            a.store(slot(56), "r8");
            a.mov("rcx", L.size);
            a.call("rt.alloc");
            a.mov("r10", HeapKind.object);
            a.store({ base: "rax", disp: H.kind - H.size }, "r10");
            a.mov("r10", PromiseKind);
            a.store({ base: "rax", disp: O.kind }, "r10");
            const ready = a.unique("prototypeReady");
            a.mov("r10", 0);
            a.load("rdx", slot(48));
            a.test("rdx", "rdx");
            a.jcc("e", ready);
            a.load("r11", slot(56));
            a.load("rdx", { base: "r11" });
            a.cmp("rdx", 5);
            a.jcc("ne", ready);
            a.load("r10", { base: "r11", disp: 8 });
            a.label(ready);
            a.store({ base: "rax", disp: O.prototype }, "r10");
            a.load("rcx", slot(40));
            a.mov("r10", 5);
            a.store({ base: "rcx" }, "r10");
            a.store({ base: "rcx", disp: 8 }, "rax");
        },
    );
    // Loads the slot number (argument 1, a Number) into R11 and the promise
    // (argument 0) into R10; jumps to notPromise when argument 0 is not one.
    const promiseAndSlot = (
        a: Assembler,
        notPromise: string,
    ) => {
        a.load("rax", { base: "r8", disp: 16 });
        a.cmp("rax", 3);
        failIf(a, "ne", "rt.throwTypeError");
        a.movsd("xmm0", { base: "r8", disp: 24 });
        a.cvttsd2si("r11", "xmm0");
        a.load("rax", { base: "r8" });
        a.cmp("rax", 5);
        a.jcc("ne", notPromise);
        a.load("r10", { base: "r8", disp: 8 });
        a.load("rax", { base: "r10", disp: O.kind });
        a.cmp("rax", PromiseKind);
        a.jcc("ne", notPromise);
    };
    // __nonaPromiseGetInternal(value, slot): slot 0 is the state bits of a
    // promise (promise-layout.ts), or -1 when value is not a promise; 1...9
    // the Values from PromiseLayout.value on.
    b.fn("rt.promiseGetInternal.code", 40, (a) => {
        const notPromise = a.unique("notPromise"),
            state = a.unique("state"),
            number = a.unique("number"),
            done = a.unique("done");
        a.cmp("rdx", 2);
        failIf(a, "b", "rt.throwTypeError");
        promiseAndSlot(a, notPromise);
        a.test("r11", "r11");
        a.jcc("e", state);
        a.cmp("r11", promiseValueSlots);
        failIf(a, "a", "rt.throwTypeError");
        a.shl("r11", 4);
        a.add("r10", "r11");
        for (const part of [0, 8]) {
            a.load("rax", {
                base: "r10",
                disp: L.value - 16 + part,
            });
            a.store({ base: "rcx", disp: part }, "rax");
        }
        a.jmp(done);
        a.label(state);
        a.load("rax", { base: "r10", disp: L.state });
        a.jmp(number);
        a.label(notPromise);
        a.test("r11", "r11");
        failIf(a, "ne", "rt.throwTypeError");
        a.mov("rax", -1);
        a.label(number);
        a.cvtsi2sd("xmm0", "rax");
        a.mov("rax", 3);
        a.store({ base: "rcx" }, "rax");
        a.storesd({ base: "rcx", disp: 8 }, "xmm0");
        a.label(done);
    });
    // __nonaPromiseSetInternal(promise, slot, value): slot as above; the
    // state (slot 0) is a Number.
    b.fn("rt.promiseSetInternal.code", 40, (a) => {
        const notPromise = a.unique("notPromise"),
            state = a.unique("state"),
            done = a.unique("done");
        a.mov("rax", 0);
        a.store({ base: "rcx" }, "rax");
        a.store({ base: "rcx", disp: 8 }, "rax");
        a.cmp("rdx", 3);
        failIf(a, "b", "rt.throwTypeError");
        promiseAndSlot(a, notPromise);
        a.test("r11", "r11");
        a.jcc("e", state);
        a.cmp("r11", promiseValueSlots);
        failIf(a, "a", "rt.throwTypeError");
        a.shl("r11", 4);
        a.add("r10", "r11");
        for (const part of [0, 8]) {
            a.load("rax", { base: "r8", disp: 32 + part });
            a.store(
                { base: "r10", disp: L.value - 16 + part },
                "rax",
            );
        }
        a.jmp(done);
        a.label(state);
        a.load("rax", { base: "r8", disp: 32 });
        a.cmp("rax", 3);
        failIf(a, "ne", "rt.throwTypeError");
        a.movsd("xmm0", { base: "r8", disp: 40 });
        a.cvttsd2si("rax", "xmm0");
        a.store({ base: "r10", disp: L.state }, "rax");
        a.jmp(done);
        a.label(notPromise);
        a.call("rt.throwTypeError");
        a.label(done);
    });

    // RCX promise object, RDX kind (1 fulfilled, 2 rejected), R8 Value*:
    // settles a pending promise, queues its reactions and remembers an
    // unhandled rejection. Allocates nothing.
    b.fn("rt.promiseSettle", 40, (a) => {
        const done = a.unique("done"),
            noReport = a.unique("noReport"),
            noReactions = a.unique("noReactions"),
            emptyQueue = a.unique("emptyQueue"),
            linked = a.unique("linked");
        a.load("r9", { base: "rcx", disp: L.state });
        a.mov("r10", "r9");
        a.and("r10", S.kindMask);
        a.test("r10", "r10");
        a.jcc("ne", done);
        a.mov("r10", "r9");
        a.or("r10", "rdx");
        a.store({ base: "rcx", disp: L.state }, "r10");
        copyValue(a, { base: "rcx", disp: L.value }, { base: "r8" });
        a.cmp("rdx", 2);
        a.jcc("ne", noReport);
        a.and("r9", S.handled);
        a.test("r9", "r9");
        a.jcc("ne", noReport);
        appendToList(a, Q.unhandled, "rcx");
        a.label(noReport);
        // The pending reactions move to the end of the job queue as they are.
        a.load("rax", { base: "rcx", disp: L.first });
        a.test("rax", "rax");
        a.jcc("e", noReactions);
        a.load("r10", { base: "rcx", disp: L.first + 8 });
        a.load("rax", list(Q.queue + 16));
        a.test("rax", "rax");
        a.jcc("e", emptyQueue);
        a.load("r11", list(Q.queue + 24));
        a.mov("rax", 5);
        a.store({ base: "r11", disp: L.next }, "rax");
        a.store({ base: "r11", disp: L.next + 8 }, "r10");
        a.jmp(linked);
        a.label(emptyQueue);
        a.mov("rax", 5);
        a.store(list(Q.queue), "rax");
        a.store(list(Q.queue + 8), "r10");
        a.label(linked);
        a.load("r10", { base: "rcx", disp: L.last + 8 });
        a.mov("rax", 5);
        a.store(list(Q.queue + 16), "rax");
        a.store(list(Q.queue + 24), "r10");
        clearValues(a, "rcx", L.first, 2);
        a.label(noReactions);
        a.label(done);
    });

    // RCX output, RDX six Values: source, prototype, onFulfilled, onRejected,
    // context, capability. A new reaction: the derived promise itself when
    // prototype is an object (PromiseState.target), else a hidden one. Its
    // source is the promise, or for any other value a fulfilled promise of
    // that value (the reaction itself), whose reaction is queued at once.
    rootedFn(
        b,
        "rt.promiseReactCore",
        72,
        [
            { kind: "output", register: "rcx" },
            { kind: "range", register: "rdx", count: 6 },
        ],
        (a) => {
            a.store(slot(40), "rcx");
            a.store(slot(48), "rdx");
            a.mov("rcx", L.size);
            a.call("rt.alloc");
            a.mov("rdx", "rax");
            a.mov("r10", HeapKind.object);
            a.store({ base: "rdx", disp: H.kind - H.size }, "r10");
            a.mov("r10", PromiseKind);
            a.store({ base: "rdx", disp: O.kind }, "r10");
            a.load("r8", slot(48));
            const hidden = a.unique("hidden");
            a.mov("r10", 0);
            a.mov("r11", 0);
            a.load("rax", { base: "r8", disp: 16 });
            a.cmp("rax", 5);
            a.jcc("ne", hidden);
            a.load("r10", { base: "r8", disp: 24 });
            a.mov("r11", S.target);
            a.label(hidden);
            a.store({ base: "rdx", disp: O.prototype }, "r10");
            a.store({ base: "rdx", disp: L.state }, "r11");
            // onFulfilled, onRejected, context and capability are adjacent.
            for (let i = 0; i < 8; i++) {
                a.load("rax", { base: "r8", disp: 32 + 8 * i });
                a.store({ base: "rdx", disp: L.onFulfilled + 8 * i }, "rax");
            }
            const self = a.unique("selfSource"),
                queued = a.unique("queued"),
                marked = a.unique("marked"),
                done = a.unique("done");
            a.load("rax", { base: "r8" });
            a.cmp("rax", 5);
            a.jcc("ne", self);
            a.load("r10", { base: "r8", disp: 8 });
            a.load("rax", { base: "r10", disp: O.kind });
            a.cmp("rax", PromiseKind);
            a.jcc("ne", self);
            a.mov("rax", 5);
            a.store({ base: "rdx", disp: L.source }, "rax");
            a.store({ base: "rdx", disp: L.source + 8 }, "r10");
            // The source is handled now; a reported one is reported again as handled.
            a.load("r9", { base: "r10", disp: L.state });
            a.mov("r11", "r9");
            a.and("r11", S.handled);
            a.test("r11", "r11");
            a.jcc("ne", marked);
            a.mov("r11", "r9");
            a.or("r11", S.handled);
            a.store({ base: "r10", disp: L.state }, "r11");
            a.mov("r11", "r9");
            a.and("r11", S.reported);
            a.test("r11", "r11");
            a.jcc("e", marked);
            appendToList(a, Q.handledLater, "r10");
            a.label(marked);
            a.and("r9", S.kindMask);
            a.test("r9", "r9");
            a.jcc("ne", queued);
            appendNode(
                a,
                (part) => ({ base: "r10", disp: L.first + part }),
                (part) => ({ base: "r10", disp: L.last + part }),
                "rdx",
            );
            a.jmp(done);
            a.label(self);
            a.load("rax", { base: "rdx", disp: L.state });
            a.or("rax", 1 | S.handled);
            a.store({ base: "rdx", disp: L.state }, "rax");
            copyValue(a, { base: "rdx", disp: L.value }, { base: "r8" });
            a.mov("rax", 5);
            a.store({ base: "rdx", disp: L.source }, "rax");
            a.store({ base: "rdx", disp: L.source + 8 }, "rdx");
            a.label(queued);
            appendToList(a, Q.queue, "rdx");
            a.label(done);
            a.load("rcx", slot(40));
            a.mov("rax", 5);
            a.store({ base: "rcx" }, "rax");
            a.store({ base: "rcx", disp: 8 }, "rdx");
        },
    );

    // Finds the own nodes of %Promise.prototype%.constructor and
    // %Promise%[@@species] and flags both objects, so that a change to their
    // properties advances the shape epoch. RAX 1 when both exist, else 0.
    b.fn("rt.promiseProtect", 40, (a) => {
        const fail = a.unique("fail"),
            done = a.unique("done");
        a.load("rcx", { rip: "rt.promiseRealm", addend: 24 });
        a.lea("rdx", { rip: "rt.str.constructor" });
        a.call("rt.findOwnProperty");
        a.test("rax", "rax");
        a.jcc("e", fail);
        a.store({ rip: "rt.promiseProtect", addend: 8 }, "rax");
        a.load("rcx", { rip: "rt.promiseRealm", addend: 8 });
        a.lea("rdx", { rip: "rt.Symbol.species.value" });
        a.call("rt.findOwnProperty");
        a.test("rax", "rax");
        a.jcc("e", fail);
        a.store({ rip: "rt.promiseProtect", addend: 16 }, "rax");
        for (const offset of [8, 24]) {
            a.load("r10", { rip: "rt.promiseRealm", addend: offset });
            a.load("rax", { base: "r10", disp: O.flags });
            a.or("rax", OF.cachedPrototype);
            a.store({ base: "r10", disp: O.flags }, "rax");
        }
        a.load("rax", { rip: "rt.shapeEpoch" });
        a.store({ rip: "rt.promiseProtect" }, "rax");
        a.mov("rax", 1);
        a.jmp(done);
        a.label(fail);
        a.mov("rax", 0);
        a.label(done);
    });

    // __nonaPromiseThenInternal(promise, onFulfilled, onRejected, context):
    // PerformPromiseThen with a new %Promise% for a promise whose
    // SpeciesConstructor is %Promise% without observable lookups (no own
    // properties, prototype %Promise.prototype%, whose constructor is the data
    // property %Promise%, whose @@species is the original getter). Returns the
    // derived promise, or undefined when the prelude has to take the general path.
    rootedFn(
        b,
        "rt.promiseThenInternal.code",
        168,
        [
            { kind: "output", register: "rcx" },
            { kind: "range", register: "r8", count: "rdx" },
        ],
        (a) => {
            const slow = a.unique("slow"),
                check = a.unique("check"),
                done = a.unique("done");
            a.store(slot(40), "rcx");
            a.store(slot(56), "r8");
            a.cmp("rdx", 4);
            failIf(a, "b", "rt.throwTypeError");
            a.load("rax", { base: "r8" });
            a.cmp("rax", 5);
            a.jcc("ne", slow);
            a.load("r10", { base: "r8", disp: 8 });
            a.load("rax", { base: "r10", disp: O.kind });
            a.cmp("rax", PromiseKind);
            a.jcc("ne", slow);
            for (const field of [O.properties, O.shape]) {
                a.load("rax", { base: "r10", disp: field });
                a.test("rax", "rax");
                a.jcc("ne", slow);
            }
            a.load("rax", { rip: "rt.promiseRealm", addend: 16 });
            a.cmp("rax", 5);
            a.jcc("ne", slow);
            a.load("r11", { rip: "rt.promiseRealm", addend: 24 });
            a.load("rax", { base: "r10", disp: O.prototype });
            a.cmp("rax", "r11");
            a.jcc("ne", slow);
            a.load("rax", { rip: "rt.promiseProtect" });
            a.cmpMemory("rax", { rip: "rt.shapeEpoch" });
            a.jcc("e", check);
            a.call("rt.promiseProtect");
            a.test("rax", "rax");
            a.jcc("e", slow);
            a.label(check);
            // The node values are read every time: writes need no new epoch.
            a.load("r10", { rip: "rt.promiseProtect", addend: 8 });
            a.load("rax", { base: "r10", disp: P.attributes });
            a.and("rax", A.accessor);
            a.test("rax", "rax");
            a.jcc("ne", slow);
            a.load("rax", { base: "r10", disp: P.value });
            a.cmp("rax", 5);
            a.jcc("ne", slow);
            a.load("rax", { base: "r10", disp: P.value + 8 });
            a.cmpMemory("rax", { rip: "rt.promiseRealm", addend: 8 });
            a.jcc("ne", slow);
            a.load("r10", { rip: "rt.promiseProtect", addend: 16 });
            a.load("rax", { base: "r10", disp: P.attributes });
            a.and("rax", A.accessor);
            a.test("rax", "rax");
            a.jcc("e", slow);
            a.load("rax", { base: "r10", disp: P.getter });
            a.cmp("rax", 5);
            a.jcc("ne", slow);
            a.load("rax", { base: "r10", disp: P.getter + 8 });
            a.cmpMemory("rax", { rip: "rt.promiseRealm", addend: 40 });
            a.jcc("ne", slow);
            // React(promise, %Promise.prototype%, onFulfilled, onRejected, context, undefined).
            a.load("r8", slot(56));
            copyValue(a, slot(64), { base: "r8" });
            copyValue(a, slot(80), { rip: "rt.promiseRealm", addend: 16 });
            for (let i = 1; i < 4; i++)
                copyValue(a, slot(80 + 16 * i), { base: "r8", disp: 16 * i });
            clearValues(a, "rsp", 144, 1);
            a.load("rcx", slot(40));
            a.lea("rdx", slot(64));
            a.call("rt.promiseReactCore");
            a.jmp(done);
            a.label(slow);
            a.load("rcx", slot(40));
            clearValues(a, "rcx", 0, 1);
            a.label(done);
        },
    );

    // __nonaPromiseReactInternal(source, prototype, onFulfilled, onRejected,
    // context, capability): rt.promiseReactCore.
    rootedFn(
        b,
        "rt.promiseReactInternal.code",
        40,
        [
            { kind: "output", register: "rcx" },
            { kind: "range", register: "r8", count: "rdx" },
        ],
        (a) => {
            a.cmp("rdx", 6);
            failIf(a, "b", "rt.throwTypeError");
            a.mov("rdx", "r8");
            a.call("rt.promiseReactCore");
        },
    );

    // Loads argument 0 (a promise) into R10, or throws a TypeError.
    const promiseArgument = (a: Assembler) => {
        a.load("rax", { base: "r8" });
        a.cmp("rax", 5);
        failIf(a, "ne", "rt.throwTypeError");
        a.load("r10", { base: "r8", disp: 8 });
        a.load("rax", { base: "r10", disp: O.kind });
        a.cmp("rax", PromiseKind);
        failIf(a, "ne", "rt.throwTypeError");
    };
    // Loads the Number argument at DISP as an integer into R11.
    const integerArgument = (a: Assembler, disp: number) => {
        a.load("rax", { base: "r8", disp });
        a.cmp("rax", 3);
        failIf(a, "ne", "rt.throwTypeError");
        a.movsd("xmm0", { base: "r8", disp: disp + 8 });
        a.cvttsd2si("r11", "xmm0");
    };

    // __nonaPromiseUpdateInternal(promise, operation, value): 1 fulfil or 2
    // reject a pending promise with value, 4 mark it handled, 8 release the
    // handlers of a reaction that has run.
    b.fn("rt.promiseUpdateInternal.code", 56, (a) => {
        const handle = a.unique("handle"),
            release = a.unique("release"),
            done = a.unique("done");
        a.cmp("rdx", 3);
        failIf(a, "b", "rt.throwTypeError");
        clearValues(a, "rcx", 0, 1);
        promiseArgument(a);
        integerArgument(a, 16);
        a.cmp("r11", 4);
        a.jcc("e", handle);
        a.cmp("r11", 8);
        a.jcc("e", release);
        a.cmp("r11", 1);
        failIf(a, "b", "rt.throwTypeError");
        a.cmp("r11", 2);
        failIf(a, "a", "rt.throwTypeError");
        a.mov("rcx", "r10");
        a.mov("rdx", "r11");
        a.add("r8", 32);
        a.call("rt.promiseSettle");
        a.jmp(done);
        a.label(handle);
        a.load("r9", { base: "r10", disp: L.state });
        a.mov("rax", "r9");
        a.and("rax", S.handled);
        a.test("rax", "rax");
        a.jcc("ne", done);
        a.mov("rax", "r9");
        a.or("rax", S.handled);
        a.store({ base: "r10", disp: L.state }, "rax");
        a.and("r9", S.reported);
        a.test("r9", "r9");
        a.jcc("e", done);
        appendToList(a, Q.handledLater, "r10");
        a.jmp(done);
        a.label(release);
        clearValues(a, "r10", L.onFulfilled, 5);
        a.load("rax", { base: "r10", disp: L.state });
        a.and("rax", ~S.result);
        a.store({ base: "r10", disp: L.state }, "rax");
        a.label(done);
    });

    // __nonaPromiseTakeInternal(list): removes and returns the first promise
    // of list 0 (the job queue), 1 (unhandled rejections) or 2 (handled after
    // being reported), or undefined; 3...5 return it without removing it.
    b.fn("rt.promiseTakeInternal.code", 40, (a) => {
        const peek = a.unique("peek"),
            empty = a.unique("empty"),
            done = a.unique("done");
        a.cmp("rdx", 1);
        failIf(a, "b", "rt.throwTypeError");
        integerArgument(a, 0);
        a.cmp("r11", 5);
        failIf(a, "a", "rt.throwTypeError");
        for (const n of [0, 1, 2]) {
            const next = a.unique("next");
            a.cmp("r11", n);
            a.jcc("ne", next);
            popList(a, n * 32, empty);
            a.mov("rax", 5);
            a.store({ base: "rcx" }, "rax");
            a.store({ base: "rcx", disp: 8 }, "r10");
            a.jmp(done);
            a.label(next);
        }
        a.label(peek);
        a.sub("r11", 3);
        a.shl("r11", 5);
        a.lea("r10", { rip: "rt.promiseLists" });
        a.add("r10", "r11");
        copyValue(a, { base: "rcx" }, { base: "r10" });
        a.jmp(done);
        a.label(empty);
        clearValues(a, "rcx", 0, 1);
        a.label(done);
    });

    // __nonaPromiseConfigInternal(Promise, prototype, speciesGetter) records
    // the realm's intrinsics; (tracking) whether reactions must run in the
    // prelude because async contexts are tracked.
    b.fn("rt.promiseConfigInternal.code", 40, (a) => {
        const realm = a.unique("realm"),
            flag = a.unique("flag"),
            done = a.unique("done");
        clearValues(a, "rcx", 0, 1);
        a.cmp("rdx", 1);
        failIf(a, "b", "rt.throwTypeError");
        a.cmp("rdx", 1);
        a.jcc("ne", realm);
        a.mov("r10", 0);
        a.load("rax", { base: "r8" });
        a.cmp("rax", 2);
        a.jcc("ne", flag);
        a.load("r10", { base: "r8", disp: 8 });
        a.label(flag);
        a.store({ rip: "rt.promiseTracking" }, "r10");
        a.jmp(done);
        a.label(realm);
        a.cmp("rdx", 3);
        failIf(a, "b", "rt.throwTypeError");
        for (let i = 0; i < 6; i++) {
            a.load("rax", { base: "r8", disp: 8 * i });
            a.store({ rip: "rt.promiseRealm", addend: 8 * i }, "rax");
        }
        a.mov("rax", -1);
        a.store({ rip: "rt.promiseProtect" }, "rax");
        a.label(done);
    });

    emitPromiseRunner(b);
}

/** __nonaPromiseRunInternal(): runs queued reactions until the queue is
 * empty (undefined) or a job needs the prelude, which it returns: async
 * contexts are tracked, the reaction has a capability (a foreign capability,
 * a target promise or a job function), its handler is a callable object other
 * than a function, or (PromiseState.result) its handler returned an object
 * that the derived promise has to resolve to. A reaction whose handler throws
 * rejects its derived promise; one without a derived promise drops the result. */
function emitPromiseRunner(b: RuntimeBuilder): void {
    const carrier = 64,
        value = 80,
        result = 96,
        error = 112,
        handler = 128,
        record = 144;
    rootedFn(
        b,
        "rt.promiseRunInternal.code",
        record + EH.size,
        [
            { kind: "output", register: "rcx" },
            { kind: "locals", offset: carrier, count: 5 },
        ],
        (a) => {
            const loop = a.unique("loop"),
                empty = a.unique("empty"),
                hand = a.unique("hand"),
                rejected = a.unique("rejected"),
                handlerReady = a.unique("handlerReady"),
                passThrough = a.unique("passThrough"),
                caught = a.unique("caught"),
                complete = a.unique("complete"),
                failed = a.unique("failed"),
                objectResult = a.unique("objectResult"),
                done = a.unique("done");
            a.store(slot(40), "rcx");
            a.label(loop);
            popList(a, Q.queue, empty);
            a.mov("rax", 5);
            a.store(slot(carrier), "rax");
            a.store(slot(carrier + 8), "r10");
            a.load("rax", { rip: "rt.promiseTracking" });
            a.test("rax", "rax");
            a.jcc("ne", hand);
            a.load("rax", { base: "r10", disp: L.capability });
            a.test("rax", "rax");
            a.jcc("ne", hand);
            a.load("r11", { base: "r10", disp: L.source + 8 });
            copyValue(a, slot(value), { base: "r11", disp: L.value });
            a.load("r9", { base: "r11", disp: L.state });
            a.and("r9", S.kindMask);
            a.store(slot(48), "r9");
            a.cmp("r9", 2);
            a.jcc("e", rejected);
            copyValue(a, slot(handler), { base: "r10", disp: L.onFulfilled });
            a.jmp(handlerReady);
            a.label(rejected);
            copyValue(a, slot(handler), { base: "r10", disp: L.onRejected });
            a.label(handlerReady);
            a.load("rax", slot(handler));
            a.cmp("rax", 5);
            a.jcc("ne", passThrough);
            a.load("r11", slot(handler + 8));
            a.load("rax", { base: "r11", disp: O.kind });
            a.cmp("rax", FunctionKind);
            a.jcc("ne", hand);
            // handler(value) with an exception handler record around it.
            a.load("rax", { rip: "rt.exceptionHandler" });
            a.store(slot(record + EH.next), "rax");
            a.mov("rax", "rsp");
            a.store(slot(record + EH.stack), "rax");
            a.lea("rax", { rip: caught });
            a.store(slot(record + EH.target), "rax");
            a.load("rax", { rip: "rt.gcRoots" });
            a.store(slot(record + EH.roots), "rax");
            a.lea("rax", slot(error));
            a.store(slot(record + EH.value), "rax");
            a.load("rax", { rip: "rt.cleanupHead" });
            a.store(slot(record + EH.cleanup), "rax");
            preservedGp.forEach((reg, i) =>
                a.store(slot(record + EH.gp + 8 * i), reg),
            );
            preservedXmm.forEach((reg, i) =>
                a.storeXmm128(slot(record + EH.xmm + 16 * i), reg),
            );
            a.mov("rax", 0);
            a.store(slot(record + EH.kind), "rax");
            a.lea("rax", slot(record));
            a.store({ rip: "rt.exceptionHandler" }, "rax");
            a.lea("rax", { rip: "rt.undefinedValue" });
            a.store(slot(32), "rax");
            a.lea("rcx", slot(result));
            a.lea("rdx", slot(handler));
            a.mov("r8", 1);
            a.lea("r9", slot(value));
            a.call("rt.invoke");
            a.load("rax", slot(record + EH.next));
            a.store({ rip: "rt.exceptionHandler" }, "rax");
            a.mov("rax", 0);
            a.store(slot(48), "rax");
            a.jmp(complete);
            a.label(caught);
            copyValue(a, slot(result), slot(error));
            a.mov("rax", 2);
            a.store(slot(48), "rax");
            a.jmp(complete);
            // No callable handler: the value or reason passes through.
            a.label(passThrough);
            copyValue(a, slot(result), slot(value));
            a.label(complete);
            a.load("r10", slot(carrier + 8));
            clearValues(a, "r10", L.onFulfilled, 3);
            clearValues(a, "r10", L.source, 1);
            a.load("rax", { base: "r10", disp: L.state });
            a.and("rax", S.target);
            a.test("rax", "rax");
            a.jcc("e", loop);
            a.load("rax", slot(48));
            a.cmp("rax", 2);
            a.jcc("e", failed);
            a.load("rax", slot(result));
            a.cmp("rax", 5);
            a.jcc("e", objectResult);
            a.mov("rcx", "r10");
            a.mov("rdx", 1);
            a.lea("r8", slot(result));
            a.call("rt.promiseSettle");
            a.jmp(loop);
            a.label(failed);
            a.mov("rcx", "r10");
            a.mov("rdx", 2);
            a.lea("r8", slot(result));
            a.call("rt.promiseSettle");
            a.jmp(loop);
            // Resolving to an object looks up its then: the prelude does that.
            a.label(objectResult);
            copyValue(a, { base: "r10", disp: L.onFulfilled }, slot(result));
            a.load("rax", { base: "r10", disp: L.state });
            a.or("rax", S.result);
            a.store({ base: "r10", disp: L.state }, "rax");
            a.label(hand);
            a.load("rcx", slot(40));
            copyValue(a, { base: "rcx" }, slot(carrier));
            a.jmp(done);
            a.label(empty);
            a.load("rcx", slot(40));
            clearValues(a, "rcx", 0, 1);
            a.label(done);
        },
    );
}
