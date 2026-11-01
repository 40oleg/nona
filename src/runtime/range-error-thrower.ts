import { RuntimeBuilder, slot } from "./abi.js";
import { stringLiteral } from "./value.js";
import type { Fixup } from "../backend/machine/model.js";

// Kept out of errors.ts: typed-array.ts uses it, and errors.ts imports proxy.ts,
// which imports typed-array.ts.
const pointer = (offset: number, target: string): Fixup => ({
    offset,
    kind: "va64",
    target,
    addend: 0,
});
const rangeMessages = new WeakMap<RuntimeBuilder, Map<string, string>>();
/**
 * A function that throws a RangeError with a static message; returns its symbol
 * (`rt.throwRangeError.<id>`). Idempotent per builder and text, so any runtime
 * emitter may call it while building (fragment order does not matter: symbols
 * are resolved at link time). Use it like `failIf(a, "ne", symbol)`.
 */
export function rangeErrorThrower(b: RuntimeBuilder, text: string): string {
    let known = rangeMessages.get(b);
    if (!known) rangeMessages.set(b, (known = new Map()));
    const existing = known.get(text);
    if (existing) return existing;
    const id = known.size;
    const symbol = "rt.throwRangeError." + id;
    known.set(text, symbol);
    const message = "rt.error.rangeMsg." + id;
    const bytes = new Uint8Array(16);
    bytes[0] = 4;
    b.bundle.fragments.push(stringLiteral(message, text), {
        name: message + ".value",
        section: ".rdata",
        alignment: 8,
        bytes,
        symbols: {},
        fixups: [pointer(8, message)],
    });
    b.fn(symbol, 72, (a) => {
        a.lea("rcx", slot(48));
        a.mov("rdx", 1);
        a.lea("r8", { rip: message + ".value" });
        a.call("rt.RangeError.code");
        a.lea("rcx", slot(48));
        a.call("rt.throw");
    });
    return symbol;
}
