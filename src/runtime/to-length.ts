import type { Assembler } from "../backend/machine/context.js";

/**
 * ToLength of the number in XMM0 into RAX (ES2024 7.1.20): NaN and values
 * not above zero become 0, values from 2^53 - 1 up are clamped to it, others
 * are truncated. Changes RAX, XMM1 and the flags.
 */
export function emitToLength(a: Assembler): void {
    const zero = a.unique("zeroLength"),
        ready = a.unique("lengthReady");
    a.mov("rax", 0);
    a.movqToXmm("xmm1", "rax");
    a.ucomisd("xmm0", "xmm1");
    a.jcc("p", zero);
    a.jcc("be", zero);
    a.mov("rax", 9007199254740991n);
    a.cvtsi2sd("xmm1", "rax");
    a.ucomisd("xmm0", "xmm1");
    a.jcc("ae", ready);
    a.cvttsd2si("rax", "xmm0");
    a.jmp(ready);
    a.label(zero);
    a.mov("rax", 0);
    a.label(ready);
}
