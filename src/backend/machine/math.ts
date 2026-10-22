import type { Assembler } from "../x64/assembler.js";

/**
 * The floating-point operations that have no SSE2 instruction. The runtime
 * (`runtime/math.ts`) emits the argument conversion and result boxing of every
 * `Math` function and asks the machine for the transcendental step only.
 * Operands live in 8-byte stack slots given as offsets from `rsp`; the
 * `*Core` routines take their argument in `xmm0` and return in `xmm0`.
 *
 * Two implementations exist: `x87Math` (`backend/x64/x87-math.ts`) uses the
 * x87 unit of x86-64, and `softwareMath` (this file) calls the portable
 * `rt.armMath.*` routines emitted by `runtime/numeric/software-math.ts`, used
 * where there is no x87 unit (ARM64). `machineMath()` in `context.ts` chooses.
 */
export interface MachineMath {
    /** Whether the `rt.armMath.*` software routines must be emitted. */
    readonly softwareRoutines: boolean;
    /** `[rsp+result] = sin|cos|tan([rsp+argument])`; may use slots 88 to 112. */
    trig(
        a: Assembler,
        name: "sin" | "cos" | "tan",
        argument: number,
        result: number,
    ): void;
    /** `[rsp+result] = log|log2|log10([rsp+argument])`. */
    log(
        a: Assembler,
        name: "log" | "log2" | "log10",
        argument: number,
        result: number,
    ): void;
    /** `[rsp+result] = atan([rsp+argument])`. */
    atan(a: Assembler, argument: number, result: number): void;
    /** `[rsp+result] = atan2([rsp+y], [rsp+x])`. */
    atan2(a: Assembler, y: number, x: number, result: number): void;
    /** Body of `rt.mathLog1pCore` (frame 72): xmm0 = log1p(xmm0). */
    log1pCore(a: Assembler): void;
    /** Body of `rt.mathExpCore` (frame 72): xmm0 = exp(xmm0). */
    expCore(a: Assembler): void;
    /** Body of `rt.mathExpm1Core` (frame 72): xmm0 = expm1(xmm0). */
    expm1Core(a: Assembler): void;
}

const slot = (offset: number) => ({ base: "rsp" as const, disp: offset });
function call(
    a: Assembler,
    routine: string,
    argument: number,
    result: number,
): void {
    a.movsd("xmm0", slot(argument));
    a.call("rt.armMath." + routine);
    a.storesd(slot(result), "xmm0");
}

/** Calls of the portable `rt.armMath.*` routines (SSE2-role instructions only). */
export const softwareMath: MachineMath = {
    softwareRoutines: true,
    trig(a, name, argument, result) {
        call(a, name, argument, result);
    },
    log(a, name, argument, result) {
        call(a, name, argument, result);
    },
    atan(a, argument, result) {
        call(a, "atan", argument, result);
    },
    atan2(a, y, x, result) {
        a.movsd("xmm0", slot(y));
        a.movsd("xmm1", slot(x));
        a.call("rt.armMath.atan2");
        a.storesd(slot(result), "xmm0");
    },
    log1pCore(a) {
        a.call("rt.armMath.log1p");
    },
    expCore(a) {
        a.call("rt.armMath.exp");
    },
    expm1Core(a) {
        a.call("rt.armMath.expm1");
    },
};
