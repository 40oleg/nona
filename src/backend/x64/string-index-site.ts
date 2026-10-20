import type { Operation } from "../../ir/model.js";
import type { SiteFrame } from "./method-sites.js";

// Inline charCodeAt/charAt sites of the code generator (operations.ts, #425).

type Invoke = Extract<Operation, { kind: "invoke" }>;

/**
 * Emits a `string.charCodeAt(position)` / `string.charAt(position)` site and
 * returns true, or returns false for any other call.
 *
 * %String.prototype.charCodeAt% / %String.prototype.charAt% on a primitive
 * string with a missing or Number position: the code unit is read in place,
 * with the builtin's ToIntegerOrInfinity and range check (string-builtins.ts).
 * The callee and receiver are already evaluated and the receiver slot was
 * flattened before this operation, so skipping the call is unobservable.
 * Other positions (ToNumber may run code), String objects, other callees and
 * charAt of a unit >= 256 (rt.charStrings) are calls.
 */
export function emitStringIndexSite(f: SiteFrame, op: Invoke): boolean {
    if (
        !op.stringIndex ||
        op.direct ||
        op.construct ||
        op.tail ||
        op.receiver === undefined
    )
        return false;
    const { a, value, payload } = f;
    const general = a.unique("generalCall"),
        out = a.unique("outOfRange"),
        negative = a.unique("negativePosition"),
        ready = a.unique("positionReady"),
        called = a.unique("called"),
        charAt = op.stringIndex === "charAt";
    a.load("rax", value(op.callee));
    a.cmp("rax", 5);
    a.jcc("ne", general);
    a.load("rax", payload(op.callee));
    a.lea("r10", {
        rip: charAt ? "rt.stringCharAt.fn" : "rt.stringCharCodeAt.fn",
    });
    a.cmp("rax", "r10");
    a.jcc("ne", general);
    a.load("rax", value(op.receiver));
    a.cmp("rax", 4);
    a.jcc("ne", general);
    if (op.arguments.length === 1) {
        a.load("rax", value(op.arguments[0]!));
        a.cmp("rax", 3);
        a.jcc("ne", general);
    }
    // R10 the string record, R11 its length, RAX the position.
    a.load("r10", payload(op.receiver));
    a.load("r11", { base: "r10" });
    a.mov("rax", 0);
    if (op.arguments.length === 1) {
        // NaN and -0 are 0, fractions truncate toward zero, and anything
        // below 0 or at least the length is out of range (-1 < x < 0
        // truncates to 0).
        a.movsd("xmm0", payload(op.arguments[0]!));
        a.ucomisd("xmm0", "xmm0");
        a.jcc("p", ready);
        a.movqToXmm("xmm1", "rax");
        a.ucomisd("xmm0", "xmm1");
        a.jcc("b", negative);
        a.cvtsi2sd("xmm1", "r11");
        a.ucomisd("xmm0", "xmm1");
        a.jcc("ae", out);
        a.cvttsd2si("rax", "xmm0");
        a.jmp(ready);
        f.pushCold(() => {
            a.label(negative);
            a.mov("rax", 0xbff0000000000000n);
            a.movqToXmm("xmm1", "rax");
            a.ucomisd("xmm0", "xmm1");
            a.jcc("be", out);
            a.mov("rax", 0);
            a.jmp(ready);
        });
    }
    a.label(ready);
    a.cmp("rax", "r11");
    a.jcc("ae", out);
    a.shl("rax", 1);
    a.add("r10", "rax");
    a.load("rax", { base: "r10", disp: 8 }, 16);
    if (charAt) {
        a.cmp("rax", 256);
        a.jcc("ae", general);
        a.shl("rax", 4);
        a.lea("r10", { rip: "rt.charStrings" });
        a.add("r10", "rax");
        a.store(payload(op.dest), "r10");
        a.mov("rax", 4);
    } else {
        a.cvtsi2sd("xmm0", "rax");
        a.storesd(payload(op.dest), "xmm0");
        a.mov("rax", 3);
    }
    a.store(value(op.dest), "rax");
    f.pushCold(() => {
        a.label(out);
        if (charAt) {
            a.lea("rax", { rip: "rt.str.empty" });
            a.store(payload(op.dest), "rax");
            a.mov("rax", 4);
        } else {
            a.mov("rax", 0x7ff8000000000000n);
            a.store(payload(op.dest), "rax");
            a.mov("rax", 3);
        }
        a.store(value(op.dest), "rax");
        a.jmp(called);
    });
    f.pushCold(() => {
        a.label(general);
        f.callSite(op);
        a.jmp(called);
    });
    a.label(called);
    return true;
}
