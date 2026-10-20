import type { Assembler, Mem } from "./assembler.js";

// Inline int32 paths of the Number operators, shared by the code generator
// (operations.ts): the bitwise operators and % (#238).

/**
 * `reg` <- the Number at `operand` when it is an int32 value (the truncation
 * round-trips and fits in 32 bits, so -0 gives 0); otherwise jumps to
 * `slow`. Clobbers R11, XMM0 and XMM1.
 */
export function int32Operand(
    a: Assembler,
    operand: Mem,
    reg: "rcx" | "r10",
    slow: string,
): void {
    a.movsd("xmm0", operand);
    a.cvttsd2si(reg, "xmm0");
    a.cvtsi2sd("xmm1", reg);
    a.ucomisd("xmm1", "xmm0");
    a.jcc("p", slow);
    a.jcc("ne", slow);
    a.mov("r11", reg);
    a.shl("r11", 32);
    a.sar("r11", 32);
    a.cmp("r11", reg);
    a.jcc("ne", slow);
}

/**
 * The low 32 bits of `reg` <- ToInt32 of the Number at `operand`: the 64-bit
 * truncation is exact for |x| < 2^63 (-0 gives 0), and ToInt32 is its value
 * modulo 2^32. NaN, the infinities and |x| >= 2^63 give the conversion's
 * invalid result 2^63 and jump to `slow` (Math.imul, #426). Clobbers R11 and
 * XMM0.
 */
export function toInt32Operand(
    a: Assembler,
    operand: Mem,
    reg: "rcx" | "r10",
    slow: string,
): void {
    a.movsd("xmm0", operand);
    a.cvttsd2si(reg, "xmm0");
    a.mov("r11", 1n << 63n);
    a.cmp(reg, "r11");
    a.jcc("e", slow);
}

/**
 * x % y of two Numbers that hold int32 values, XMM0 <- the result. Anything
 * else (fractions, NaN, Infinity, a zero divisor, -0 as the dividend) jumps
 * to `slow`, the fmod semantics of rt.rem. The remainder takes the sign of
 * the dividend, so a zero remainder of a negative dividend is -0. With a
 * constant divisor 2^k (`divisor`), a non-negative dividend is masked
 * instead of divided. Clobbers RAX, RCX, RDX, R10, R11, XMM0 and XMM1.
 */
export function integerRemainder(
    a: Assembler,
    dividend: Mem,
    divisor: Mem | number,
    slow: string,
): void {
    const divide = a.unique("divide"),
        negativeZero = a.unique("negativeZero"),
        ready = a.unique("remainderReady"),
        done = a.unique("remainder");
    // -0 equals 0 for the round trip, but -0 % y is -0.
    a.load("rax", dividend);
    a.mov("r11", 1n << 63n);
    a.cmp("rax", "r11");
    a.jcc("e", slow);
    int32Operand(a, dividend, "r10", slow);
    if (typeof divisor === "number") {
        a.test("r10", "r10");
        a.jcc("l", divide);
        a.and("r10", divisor - 1);
        a.jmp(ready);
        a.label(divide);
        a.mov("rcx", divisor);
    } else {
        int32Operand(a, divisor, "rcx", slow);
        a.test("rcx", "rcx");
        a.jcc("e", slow);
    }
    // In 64 bits, INT32_MIN % -1 cannot overflow.
    a.mov("rax", "r10");
    a.signExtendRax();
    a.idiv("rcx");
    a.mov("r10", "rdx");
    a.test("r10", "r10");
    a.jcc("ne", ready);
    a.load("rax", dividend);
    a.test("rax", "rax");
    a.jcc("s", negativeZero);
    a.label(ready);
    a.cvtsi2sd("xmm0", "r10");
    a.jmp(done);
    a.label(negativeZero);
    a.mov("rax", 1n << 63n);
    a.movqToXmm("xmm0", "rax");
    a.label(done);
}

/** The divisor of x % c that integerRemainder can mask: a power of two up to 2^30. */
export function maskableDivisor(value: unknown): number | undefined {
    return typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 1 &&
        value <= 2 ** 30 &&
        (value & (value - 1)) === 0
        ? value
        : undefined;
}
