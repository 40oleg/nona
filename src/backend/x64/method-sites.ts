import type { Assembler, Mem } from "./assembler.js";
import type { Operation } from "../../ir/model.js";
import type { NamedFragment } from "../machine/model.js";
import { ObjectLayout as O } from "../../runtime/object-layout.js";
import { FunctionLayout, FunctionKind } from "../../runtime/functions.js";
import { TailCallTag } from "../../runtime/tail-calls.js";
import { realmTable } from "../../runtime/constructor-prototype.js";
import { HasCacheLayout } from "../../runtime/has-cache.js";

// Method, call/apply and hasOwnProperty sites of the code generator (operations.ts, #47):
// a plain function callee's code is called directly.

type Invoke = Extract<Operation, { kind: "invoke" }>;
/** The frame helpers of the function being emitted (operations.ts). */
export interface SiteFrame {
    a: Assembler;
    value(n: number): Mem;
    payload(n: number): Mem;
    stack(disp: number): Mem;
    copy(to: Mem, from: Mem): void;
    pointer(reg: "rcx" | "rdx" | "r8" | "r9", n: number): void;
    pushCold(emit: () => void): void;
    argsBase: number;
    /** The general call through the site's descriptor. */
    callSite(op: Invoke): void;
    fragments: NamedFragment[];
}

/** R9 <- the function object `n` holds; anything else jumps to `notFunction`. Clobbers RAX. */
function functionObject(f: SiteFrame, n: number, notFunction: string): void {
    const a = f.a;
    a.load("rax", f.value(n));
    a.cmp("rax", 5);
    a.jcc("ne", notFunction);
    a.load("r9", f.payload(n));
    a.load("rax", { base: "r9", disp: O.kind });
    a.cmp("rax", FunctionKind);
    a.jcc("ne", notFunction);
}

/**
 * Jumps to `notPlain` when the function object in R9 is bound, a generator
 * or async function, an arrow function or a class constructor. Clobbers RAX.
 */
function plainFunction(a: Assembler, notPlain: string): void {
    for (const field of [
        FunctionLayout.bound,
        FunctionLayout.generator,
        FunctionLayout.arrow,
    ]) {
        a.load("rax", { base: "r9", disp: field });
        a.test("rax", "rax");
        a.jcc("ne", notPlain);
    }
    a.load("rax", { base: "r9", disp: FunctionLayout.constructable });
    a.cmp("rax", 2);
    a.jcc("e", notPlain);
}

/**
 * Calls the code of the function in R9 with the direct-call convention:
 * `argc` arguments in the argument area, the pointer to this already at
 * stack +32. A tail call made by the callee comes back as a marker
 * (rt.invoke does the same) and is dispatched out of line, then jumps to
 * `done`.
 */
function callCode(f: SiteFrame, op: Invoke, argc: number, done: string) {
    const a = f.a,
        tail = a.unique("tailMarker");
    a.lea("rax", { rip: "rt.undefinedValue" });
    a.store(f.stack(40), "rax");
    f.pointer("rcx", op.dest);
    a.mov("rdx", argc);
    a.lea("r8", f.stack(f.argsBase));
    a.load("rax", { base: "r9", disp: FunctionLayout.code });
    a.callRegister("rax");
    a.load("rax", f.value(op.dest));
    a.cmp("rax", TailCallTag);
    a.jcc("e", tail);
    f.pushCold(() => {
        a.label(tail);
        f.pointer("rcx", op.dest);
        a.call("rt.tailDispatch");
        a.jmp(done);
    });
}

/** The general call of a call/apply site; rt.applyElements creates an elided array literal first. */
function generalCall(f: SiteFrame, op: Invoke): void {
    if (op.callApply !== "applyElements") {
        f.callSite(op);
        return;
    }
    [op.callee, op.receiver!, ...op.arguments].forEach((n, i) =>
        f.copy(f.stack(f.argsBase + 16 * i), f.value(n)),
    );
    f.pointer("rcx", op.dest);
    f.a.lea("rdx", f.stack(f.argsBase));
    f.a.mov("r8", op.arguments.length + 2);
    f.a.call("rt.applyElements");
}

/**
 * `f.call(thisArg, ...args)` / `f.apply(thisArg, list)` (src/ir/calls.ts):
 * when the callee is the builtin (by identity) and `f` a function object,
 * `f` is called without it. call: a plain function's code with the
 * direct-call convention (this as rt.invoke gives it: as is for strict code
 * and object receivers, the realm's global object for undefined/null),
 * anything else through rt.invoke with the shifted arguments. apply:
 * rt.applyFast for an undefined/null list or a dense array; with an array
 * literal that was not created ("applyElements"), like call with its
 * elements. Other callees and targets make the general call.
 */
function emitCallApplySite(f: SiteFrame, op: Invoke): void {
    const a = f.a;
    if (
        !op.callApply ||
        op.direct ||
        op.construct ||
        op.tail ||
        op.receiver === undefined
    ) {
        generalCall(f, op);
        return;
    }
    const receiver = op.receiver,
        general = a.unique("callApplyGeneral"),
        done = a.unique("callApplyDone");
    a.load("rax", f.value(op.callee));
    a.cmp("rax", 5);
    a.jcc("ne", general);
    a.load("rax", f.payload(op.callee));
    a.lea("r10", {
        rip: op.callApply === "call" ? "rt.functionCall" : "rt.functionApply",
    });
    a.cmp("rax", "r10");
    a.jcc("ne", general);
    f.pushCold(() => {
        a.label(general);
        generalCall(f, op);
        a.jmp(done);
    });
    if (op.callApply === "apply") {
        f.pointer("rcx", op.dest);
        a.lea("rdx", f.value(receiver));
        a.lea("r8", f.value(op.arguments[0]!));
        a.lea("r9", f.value(op.arguments[1]!));
        a.call("rt.applyFast");
        a.test("rax", "rax");
        a.jcc("e", general);
        a.label(done);
        return;
    }
    const args = op.arguments.slice(1),
        thisArg: Mem =
            op.arguments.length > 0
                ? f.value(op.arguments[0]!)
                : { rip: "rt.undefinedValue" },
        invoke = a.unique("callInvoke"),
        ready = a.unique("callThisReady");
    functionObject(f, receiver, general);
    args.forEach((n, i) => f.copy(f.stack(f.argsBase + 16 * i), f.value(n)));
    plainFunction(a, invoke);
    a.lea("r11", thisArg);
    a.load("rax", { base: "r9", disp: FunctionLayout.rawThis });
    a.test("rax", "rax");
    a.jcc("ne", ready);
    a.load("rax", { base: "r11" });
    a.cmp("rax", 5);
    a.jcc("e", ready);
    a.cmp("rax", 1);
    a.jcc("a", invoke);
    a.load("rax", { base: "r9", disp: FunctionLayout.realm });
    a.and("rax", 255);
    a.shl("rax", 3);
    a.lea("r11", { rip: realmTable("rt.globalValue") });
    a.add("r11", "rax");
    a.load("r11", { base: "r11" });
    a.label(ready);
    a.store(f.stack(32), "r11");
    callCode(f, op, args.length, done);
    f.pushCold(() => {
        a.label(invoke);
        a.lea("rax", thisArg);
        a.store(f.stack(32), "rax");
        f.pointer("rcx", op.dest);
        a.lea("rdx", f.value(receiver));
        a.mov("r8", args.length);
        a.lea("r9", f.stack(f.argsBase));
        a.call("rt.invoke");
        a.jmp(done);
    });
    a.label(done);
}

/**
 * `object.name(...)` (src/ir/calls.ts): a plain function (not bound, a
 * generator or async, an arrow or a class constructor) is called at its
 * code with the direct-call convention. The receiver is this: an object as
 * is, a primitive only for strict code (sloppy code boxes it on the general
 * path).
 */
function emitMethodSite(f: SiteFrame, op: Invoke): void {
    const a = f.a,
        receiver = op.receiver!;
    op.arguments.forEach((n, i) =>
        f.copy(f.stack(f.argsBase + 16 * i), f.value(n)),
    );
    const general = a.unique("generalCall"),
        called = a.unique("called"),
        object = a.unique("objectThis");
    functionObject(f, op.callee, general);
    plainFunction(a, general);
    a.load("rax", f.value(receiver));
    a.cmp("rax", 5);
    a.jcc("e", object);
    a.load("rax", { base: "r9", disp: FunctionLayout.rawThis });
    a.test("rax", "rax");
    a.jcc("e", general);
    a.label(object);
    a.lea("rax", f.value(receiver));
    a.store(f.stack(32), "rax");
    callCode(f, op, op.arguments.length, called);
    f.pushCold(() => {
        a.label(general);
        f.callSite(op);
        a.jmp(called);
    });
    a.label(called);
}

/**
 * %Object.prototype.hasOwnProperty% called on a shaped object with a string
 * key (`object.hasOwnProperty(key)` or `f.call(object, key)`): answered by
 * the site's cache (has-cache.ts). The callee is checked at every call;
 * anything else is a call.
 */
function emitHasOwnSite(f: SiteFrame, op: Invoke): void {
    const a = f.a,
        general = a.unique("generalCall"),
        called = a.unique("called"),
        call = op.hasOwn === "call",
        self = call ? op.arguments[0]! : op.receiver!,
        key = call ? op.arguments[1]! : op.arguments[0]!,
        cache = "hc." + f.fragments.length;
    f.fragments.push({
        name: cache,
        section: ".data",
        alignment: 8,
        bytes: new Uint8Array(HasCacheLayout.size),
        fixups: [],
        symbols: {},
    });
    const check = (n: number, symbol: string) => {
        a.load("rax", f.value(n));
        a.cmp("rax", 5);
        a.jcc("ne", general);
        a.load("rax", f.payload(n));
        a.lea("r10", { rip: symbol });
        a.cmp("rax", "r10");
        a.jcc("ne", general);
    };
    if (call) {
        check(op.callee, "rt.functionCall");
        check(op.receiver!, "rt.objectHasOwn");
    } else check(op.callee, "rt.objectHasOwn");
    f.pointer("rcx", op.dest);
    f.pointer("rdx", self);
    f.pointer("r8", key);
    a.lea("r9", { rip: cache });
    a.call("rt.icHasOwn");
    a.test("rax", "rax");
    a.jcc("ne", called);
    a.label(general);
    emitCallApplySite(f, op);
    a.label(called);
}

/**
 * Emits a hasOwnProperty, call/apply or method site and returns true, or
 * returns false for any other call.
 */
export function emitFastSite(f: SiteFrame, op: Invoke): boolean {
    const plain = !op.direct && !op.construct && op.receiver !== undefined;
    // An elided array literal ("applyElements") always needs this site.
    if (plain && op.hasOwn) emitHasOwnSite(f, op);
    else if (op.callApply) emitCallApplySite(f, op);
    else if (plain && op.method && !op.tail) emitMethodSite(f, op);
    else return false;
    return true;
}
