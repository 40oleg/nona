import type { Assembler, Mem } from "./assembler.js";
import type { Operation } from "../../ir/model.js";
import { failIf } from "../../runtime/abi.js";

// Initialization and resolvability checks of the code generator
// (operations.ts, #505): a check that knows the variable name throws a
// ReferenceError that names it.

/**
 * Emits checkInitialized (`tag` is the value slot, compared with the
 * uninitialized marker) or checkResolvable (`payload` is the binding
 * pointer, zero when unresolvable).
 */
export function emitNameCheck(
    a: Assembler,
    op: Extract<Operation, { kind: "checkInitialized" | "checkResolvable" }>,
    literal: (value: string) => string,
    value: (slot: number) => Mem,
    payload: (slot: number) => Mem,
): void {
    const tdz = op.kind === "checkInitialized",
        { name } = op;
    a.load("rax", (tdz ? value : payload)(op.slot));
    if (tdz) a.cmp("rax", 255);
    else a.test("rax", "rax");
    if (name === undefined) return failIf(a, "e", "rt.throwReferenceError");
    const ok = a.unique("checked");
    a.jcc("ne", ok);
    a.lea("rcx", { rip: literal(name) });
    a.call(
        tdz ? "rt.throwReferenceErrorTdz" : "rt.throwReferenceErrorNotDefined",
    );
    a.label(ok);
}
