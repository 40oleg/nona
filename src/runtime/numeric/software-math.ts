import type { RuntimeBuilder } from "../abi.js";
import type { Assembler, Xmm } from "../../backend/machine/context.js";

/* Range reduction constants follow Sun fdlibm/openlibm e_log.c and e_exp.c.
 * Copyright (C) 1993, 2004 by Sun Microsystems, Inc. All rights reserved.
 * Permission to use, copy, modify, and distribute this software is freely
 * granted, provided that this notice is preserved.
 * The approximations below use ordinary convergent power series.
 */
export const INF = 0x7ff0000000000000n,
    SIGN = 0x8000000000000000n,
    ABS = 0x7fffffffffffffffn,
    QNAN = 0x7ff8000000000000n;
export const bits = (value: number) => {
    const b = new DataView(new ArrayBuffer(8));
    b.setFloat64(0, value, true);
    return b.getBigUint64(0, true);
};
export function constant(a: Assembler, register: Xmm, value: number): void {
    a.mov("rax", bits(value));
    a.movqToXmm(register, "rax");
}
function answer(a: Assembler, value: bigint, done: string): void {
    a.mov("rax", value);
    a.movqToXmm("xmm0", "rax");
    a.jmp(done);
}
const ln2High = 6.9314718036912381649e-1,
    ln2Low = 1.90821492927058770002e-10;

/** Self-contained binary64 helpers (rt.armMath.*) for machines without an x87 unit: input/result in XMM0, volatile scratch only. */
export function emitSoftwareMath(b: RuntimeBuilder): void {
    for (const name of ["log", "log2", "log10"] as const)
        b.fn("rt.armMath." + name, 88, (a) => {
            const zero = a.unique("logZero"),
                invalid = a.unique("logInvalid"),
                special = a.unique("logSpecial"),
                normal = a.unique("logNormal"),
                normalized = a.unique("logNormalized"),
                done = a.unique("logDone");
            a.movqFromXmm("rax", "xmm0");
            a.mov("r10", ABS);
            a.and("r10", "rax");
            a.test("r10", "r10");
            a.jcc("e", zero);
            a.mov("r11", INF);
            a.cmp("r10", "r11");
            a.jcc("ae", special);
            a.test("rax", "rax");
            a.jcc("s", invalid);
            a.mov("r9", "rax");
            a.shr("r9", 52);
            a.test("r9", "r9");
            a.jcc("ne", normal);
            // Scaling makes subnormal significands normal without losing any bits.
            constant(a, "xmm1", 2 ** 54);
            a.mulsd("xmm0", "xmm1");
            a.movqFromXmm("rax", "xmm0");
            a.mov("r9", "rax");
            a.shr("r9", 52);
            a.sub("r9", 54);
            a.label(normal);
            a.sub("r9", 1023);
            a.mov("r10", 0x000fffffffffffffn);
            a.and("rax", "r10");
            a.mov("r10", bits(1));
            a.or("rax", "r10");
            a.movqToXmm("xmm0", "rax");
            constant(a, "xmm1", Math.SQRT2);
            a.ucomisd("xmm0", "xmm1");
            a.jcc("be", normalized);
            constant(a, "xmm1", 0.5);
            a.mulsd("xmm0", "xmm1");
            a.add("r9", 1);
            a.label(normalized);
            // log(m) = 2 * atanh((m-1)/(m+1)); |z| <= 0.1716.
            constant(a, "xmm1", 1);
            a.subsd("xmm0", "xmm1");
            constant(a, "xmm1", 2);
            a.addsd("xmm1", "xmm0");
            a.divsd("xmm0", "xmm1");
            a.movsd("xmm2", "xmm0");
            a.mulsd("xmm2", "xmm2");
            constant(a, "xmm3", 1 / 39);
            for (let denominator = 37; denominator >= 3; denominator -= 2) {
                a.mulsd("xmm3", "xmm2");
                constant(a, "xmm1", 1 / denominator);
                a.addsd("xmm3", "xmm1");
            }
            a.mulsd("xmm3", "xmm2");
            constant(a, "xmm1", 1);
            a.addsd("xmm3", "xmm1");
            a.mulsd("xmm0", "xmm3");
            constant(a, "xmm1", 2);
            a.mulsd("xmm0", "xmm1");
            a.cvtsi2sd("xmm2", "r9");
            if (name === "log2") {
                constant(a, "xmm1", Math.LOG2E);
                a.mulsd("xmm0", "xmm1");
                a.addsd("xmm0", "xmm2");
            } else {
                constant(a, "xmm1", ln2Low);
                a.mulsd("xmm1", "xmm2");
                a.addsd("xmm0", "xmm1");
                constant(a, "xmm1", ln2High);
                a.mulsd("xmm1", "xmm2");
                a.addsd("xmm0", "xmm1");
                if (name === "log10") {
                    constant(a, "xmm1", Math.LOG10E);
                    a.mulsd("xmm0", "xmm1");
                }
            }
            a.jmp(done);
            a.label(special);
            a.cmp("r10", "r11");
            a.jcc("a", done);
            a.test("rax", "rax");
            a.jcc("ns", done);
            a.label(invalid);
            answer(a, QNAN, done);
            a.label(zero);
            answer(a, INF | SIGN, done);
            a.label(done);
        });
    b.fn("rt.armMath.exp", 88, (a) => {
        const special = a.unique("expSpecial"),
            zero = a.unique("expZero"),
            one = a.unique("expOne"),
            overflow = a.unique("expOverflow"),
            scale = a.unique("expScale"),
            small = a.unique("expSmall"),
            scaled = a.unique("expScaled"),
            done = a.unique("expDone");
        a.movqFromXmm("rax", "xmm0");
        a.mov("r10", ABS);
        a.and("r10", "rax");
        a.mov("r11", INF);
        a.cmp("r10", "r11");
        a.jcc("ae", special);
        a.test("r10", "r10");
        a.jcc("e", one);
        // exp(1) is the correctly rounded constant e; reduction can be one ulp high.
        const reduced = a.unique("expReduced");
        a.mov("r11", bits(1));
        a.cmp("rax", "r11");
        a.jcc("ne", reduced);
        answer(a, bits(Math.E), done);
        a.label(reduced);
        constant(a, "xmm1", 709.782712893383973096);
        a.ucomisd("xmm0", "xmm1");
        a.jcc("a", overflow);
        constant(a, "xmm1", -745.13321910194110842);
        a.ucomisd("xmm0", "xmm1");
        a.jcc("b", zero);
        constant(a, "xmm1", Math.LOG2E);
        a.mulsd("xmm1", "xmm0");
        a.cvtsd2si("r9", "xmm1");
        a.cvtsi2sd("xmm2", "r9");
        constant(a, "xmm1", ln2High);
        a.mulsd("xmm1", "xmm2");
        a.subsd("xmm0", "xmm1");
        constant(a, "xmm1", ln2Low);
        a.mulsd("xmm1", "xmm2");
        a.subsd("xmm0", "xmm1");
        // Taylor on |r| <= ln(2)/2, followed by exact powers of two.
        let factorial = 1;
        const reciprocal: number[] = [1];
        for (let i = 1; i <= 18; i++) {
            factorial *= i;
            reciprocal.push(1 / factorial);
        }
        constant(a, "xmm3", reciprocal[18]!);
        for (let i = 17; i >= 0; i--) {
            a.mulsd("xmm3", "xmm0");
            constant(a, "xmm1", reciprocal[i]!);
            a.addsd("xmm3", "xmm1");
        }
        a.movsd("xmm0", "xmm3");
        a.mov("r8", 0);
        a.cmp("r9", 1023);
        a.jcc("le", scaled);
        a.sub("r9", 1);
        constant(a, "xmm1", 2);
        a.mulsd("xmm0", "xmm1");
        a.label(scaled);
        a.cmp("r9", -1022);
        a.jcc("l", small);
        a.jmp(scale);
        a.label(small);
        a.add("r9", 54);
        a.mov("r8", 1);
        a.label(scale);
        a.add("r9", 1023);
        a.shl("r9", 52);
        a.movqToXmm("xmm1", "r9");
        a.mulsd("xmm0", "xmm1");
        a.test("r8", "r8");
        a.jcc("e", done);
        constant(a, "xmm1", 2 ** -54);
        a.mulsd("xmm0", "xmm1");
        a.jmp(done);
        a.label(special);
        a.cmp("r10", "r11");
        a.jcc("a", done);
        a.movqFromXmm("rax", "xmm0");
        a.test("rax", "rax");
        a.jcc("ns", done);
        a.label(zero);
        answer(a, 0n, done);
        a.label(one);
        answer(a, bits(1), done);
        a.label(overflow);
        answer(a, INF, done);
        a.label(done);
    });
    b.fn("rt.armMath.log1p", 88, (a) => {
        const special = a.unique("log1pSpecial"),
            unit = a.unique("log1pUnit"),
            invalid = a.unique("log1pInvalid"),
            ordinary = a.unique("log1pOrdinary"),
            done = a.unique("log1pDone");
        a.movqFromXmm("rax", "xmm0");
        a.mov("r10", ABS);
        a.and("r10", "rax");
        a.mov("r11", INF);
        a.cmp("r10", "r11");
        a.jcc("ae", special);
        a.mov("r11", bits(2 ** -54));
        a.cmp("r10", "r11");
        a.jcc("b", done);
        constant(a, "xmm1", -1);
        a.ucomisd("xmm0", "xmm1");
        a.jcc("e", unit);
        a.jcc("b", invalid);
        a.mov("r11", bits(0.5));
        a.cmp("r10", "r11");
        a.jcc("ae", ordinary);
        // The atanh series avoids cancellation in 1+x for small finite x.
        constant(a, "xmm1", 2);
        a.addsd("xmm1", "xmm0");
        a.divsd("xmm0", "xmm1");
        a.movsd("xmm2", "xmm0");
        a.mulsd("xmm2", "xmm2");
        constant(a, "xmm3", 1 / 61);
        for (let d = 59; d >= 3; d -= 2) {
            a.mulsd("xmm3", "xmm2");
            constant(a, "xmm1", 1 / d);
            a.addsd("xmm3", "xmm1");
        }
        a.mulsd("xmm3", "xmm2");
        constant(a, "xmm1", 1);
        a.addsd("xmm3", "xmm1");
        a.mulsd("xmm0", "xmm3");
        constant(a, "xmm1", 2);
        a.mulsd("xmm0", "xmm1");
        a.jmp(done);
        a.label(ordinary);
        a.storesd({ base: "rsp", disp: 40 }, "xmm0");
        constant(a, "xmm1", 1);
        a.addsd("xmm0", "xmm1");
        a.storesd({ base: "rsp", disp: 48 }, "xmm0");
        a.call("rt.armMath.log");
        a.movsd("xmm1", { base: "rsp", disp: 48 });
        constant(a, "xmm2", 1);
        a.subsd("xmm1", "xmm2");
        a.movsd("xmm2", { base: "rsp", disp: 40 });
        a.subsd("xmm2", "xmm1");
        a.divsd("xmm2", { base: "rsp", disp: 48 });
        a.addsd("xmm0", "xmm2");
        a.jmp(done);
        a.label(special);
        a.cmp("r10", "r11");
        a.jcc("a", done);
        a.movqFromXmm("rax", "xmm0");
        a.test("rax", "rax");
        a.jcc("ns", done);
        a.label(invalid);
        answer(a, QNAN, done);
        a.label(unit);
        answer(a, INF | SIGN, done);
        a.label(done);
    });
    b.fn("rt.armMath.expm1", 88, (a) => {
        const special = a.unique("expm1Special"),
            ordinary = a.unique("expm1Ordinary"),
            done = a.unique("expm1Done");
        a.movqFromXmm("rax", "xmm0");
        a.mov("r10", ABS);
        a.and("r10", "rax");
        a.mov("r11", INF);
        a.cmp("r10", "r11");
        a.jcc("ae", special);
        a.mov("r11", bits(2 ** -54));
        a.cmp("r10", "r11");
        a.jcc("b", done);
        a.mov("r11", bits(0.5));
        a.cmp("r10", "r11");
        a.jcc("a", ordinary);
        let factorial = 1;
        const reciprocal: number[] = [1];
        for (let i = 1; i <= 18; i++) {
            factorial *= i;
            reciprocal.push(1 / factorial);
        }
        constant(a, "xmm3", reciprocal[18]!);
        for (let i = 17; i >= 2; i--) {
            a.mulsd("xmm3", "xmm0");
            constant(a, "xmm1", reciprocal[i]!);
            a.addsd("xmm3", "xmm1");
        }
        a.mulsd("xmm3", "xmm0");
        a.mulsd("xmm3", "xmm0");
        a.addsd("xmm0", "xmm3");
        a.jmp(done);
        a.label(ordinary);
        a.call("rt.armMath.exp");
        constant(a, "xmm1", 1);
        a.subsd("xmm0", "xmm1");
        a.jmp(done);
        a.label(special);
        a.cmp("r10", "r11");
        a.jcc("a", done);
        a.movqFromXmm("rax", "xmm0");
        a.test("rax", "rax");
        a.jcc("ns", done);
        answer(a, bits(-1), done);
        a.label(done);
    });
    for (const name of ["sin", "cos", "tan"] as const)
        b.fn("rt.armMath." + name, 120, (a) => {
            const small = a.unique("trigSmall"),
                reduced = a.unique("trigReduced"),
                invalid = a.unique("trigInvalid"),
                done = a.unique("trigDone");
            a.storesd({ base: "rsp", disp: 40 }, "xmm0");
            a.movqFromXmm("rax", "xmm0");
            a.mov("r10", ABS);
            a.and("rax", "r10");
            a.mov("r11", INF);
            a.cmp("rax", "r11");
            a.jcc("ae", invalid);
            a.mov("r11", bits(2 ** -27));
            a.cmp("rax", "r11");
            a.jcc("b", small);
            a.movqToXmm("xmm0", "rax");
            a.mov("r10", 0);
            a.movqToXmm("xmm5", "r10"); // low part of the reduced angle
            a.mov("r11", bits(Math.PI / 4));
            a.cmp("rax", "r11");
            a.mov("rax", 0);
            a.jcc("be", reduced);
            a.call("rt.trigReduce");
            a.movsd("xmm5", "xmm1");
            a.label(reduced);
            a.store({ base: "rsp", disp: 48 }, "rax");
            a.movsd("xmm2", "xmm0");
            a.mulsd("xmm2", "xmm2");
            const factorial = (n: number) => {
                let f = 1;
                for (let i = 2; i <= n; i++) f *= i;
                return f;
            };
            constant(a, "xmm3", -1 / factorial(15));
            for (let i = 6; i >= 1; i--) {
                a.mulsd("xmm3", "xmm2");
                constant(a, "xmm1", (i % 2 ? -1 : 1) / factorial(i * 2 + 1));
                a.addsd("xmm3", "xmm1");
            }
            a.mulsd("xmm3", "xmm2");
            constant(a, "xmm1", 1);
            a.addsd("xmm3", "xmm1");
            a.mulsd("xmm3", "xmm0");
            constant(a, "xmm4", 1 / factorial(16));
            for (let i = 7; i >= 1; i--) {
                a.mulsd("xmm4", "xmm2");
                constant(a, "xmm1", (i % 2 ? -1 : 1) / factorial(i * 2));
                a.addsd("xmm4", "xmm1");
            }
            a.mulsd("xmm4", "xmm2");
            constant(a, "xmm1", 1);
            a.addsd("xmm4", "xmm1");
            // sin(r + lo) = sin r + lo cos r, cos(r + lo) = cos r - lo sin r
            a.movsd("xmm2", "xmm5");
            a.mulsd("xmm2", "xmm3");
            a.movsd("xmm1", "xmm5");
            a.mulsd("xmm1", "xmm4");
            a.addsd("xmm3", "xmm1");
            a.subsd("xmm4", "xmm2");
            if (name === "tan") {
                a.movsd("xmm0", "xmm3");
                a.divsd("xmm0", "xmm4");
                a.load("rax", { base: "rsp", disp: 48 });
                a.and("rax", 1);
                const even = a.unique("trigEven");
                a.jcc("e", even);
                constant(a, "xmm1", -1);
                a.divsd("xmm1", "xmm0");
                a.movsd("xmm0", "xmm1");
                a.label(even);
            } else {
                const useSin = a.unique("trigUseSin"),
                    selected = a.unique("trigSelected"),
                    positive = a.unique("trigPositive");
                a.load("rax", { base: "rsp", disp: 48 });
                a.and("rax", 1);
                a.jcc(name === "sin" ? "e" : "ne", useSin);
                a.movsd("xmm0", "xmm4");
                a.jmp(selected);
                a.label(useSin);
                a.movsd("xmm0", "xmm3");
                a.label(selected);
                a.load("rax", { base: "rsp", disp: 48 });
                if (name === "sin") {
                    a.cmp("rax", 2);
                    a.jcc("b", positive);
                } else {
                    a.cmp("rax", 1);
                    a.jcc("b", positive);
                    a.cmp("rax", 2);
                    a.jcc("a", positive);
                }
                a.movqFromXmm("rax", "xmm0");
                a.mov("r10", SIGN);
                a.xor("rax", "r10");
                a.movqToXmm("xmm0", "rax");
                a.label(positive);
            }
            if (name !== "cos") {
                a.load("rax", { base: "rsp", disp: 40 });
                a.mov("r10", SIGN);
                a.and("rax", "r10");
                a.movqFromXmm("r10", "xmm0");
                a.xor("rax", "r10");
                a.movqToXmm("xmm0", "rax");
            }
            a.jmp(done);
            a.label(small);
            if (name === "cos") answer(a, bits(1), done);
            else a.jmp(done);
            a.label(invalid);
            answer(a, QNAN, done);
            a.label(done);
        });
    b.fn("rt.armMath.atan", 88, (a) => {
        const medium = a.unique("atanMedium"),
            reduced = a.unique("atanReduced"),
            done = a.unique("atanDone");
        a.storesd({ base: "rsp", disp: 40 }, "xmm0");
        a.movqFromXmm("rax", "xmm0");
        a.mov("r10", ABS);
        a.and("rax", "r10");
        a.mov("r11", INF);
        a.cmp("rax", "r11");
        a.jcc("a", done);
        a.mov("r11", bits(2 ** -27));
        a.cmp("rax", "r11");
        a.jcc("b", done);
        a.movqToXmm("xmm0", "rax");
        constant(a, "xmm1", 1 + Math.SQRT2);
        a.ucomisd("xmm0", "xmm1");
        a.jcc("be", medium);
        constant(a, "xmm1", -1);
        a.divsd("xmm1", "xmm0");
        a.movsd("xmm0", "xmm1");
        constant(a, "xmm1", Math.PI / 2);
        a.jmp(reduced);
        a.label(medium);
        constant(a, "xmm1", Math.SQRT2 - 1);
        a.ucomisd("xmm0", "xmm1");
        const small = a.unique("atanSmall");
        a.jcc("be", small);
        constant(a, "xmm1", 1);
        a.movsd("xmm2", "xmm0");
        a.addsd("xmm2", "xmm1");
        a.subsd("xmm0", "xmm1");
        a.divsd("xmm0", "xmm2");
        constant(a, "xmm1", Math.PI / 4);
        a.jmp(reduced);
        a.label(small);
        constant(a, "xmm1", 0);
        a.label(reduced);
        a.storesd({ base: "rsp", disp: 48 }, "xmm1");
        a.movsd("xmm2", "xmm0");
        a.mulsd("xmm2", "xmm2");
        constant(a, "xmm3", 1 / 65);
        for (let i = 31; i >= 1; i--) {
            a.mulsd("xmm3", "xmm2");
            constant(a, "xmm1", (i % 2 ? -1 : 1) / (2 * i + 1));
            a.addsd("xmm3", "xmm1");
        }
        a.mulsd("xmm3", "xmm2");
        constant(a, "xmm1", 1);
        a.addsd("xmm3", "xmm1");
        a.mulsd("xmm0", "xmm3");
        a.addsd("xmm0", { base: "rsp", disp: 48 });
        a.load("rax", { base: "rsp", disp: 40 });
        a.mov("r10", SIGN);
        a.and("rax", "r10");
        a.movqFromXmm("r10", "xmm0");
        a.xor("rax", "r10");
        a.movqToXmm("xmm0", "rax");
        a.label(done);
    });
    b.fn("rt.armMath.atan2", 104, (a) => {
        const zeroY = a.unique("atan2ZeroY"),
            zeroX = a.unique("atan2ZeroX"),
            bothInfinite = a.unique("atan2BothInfinite"),
            angleZero = a.unique("atan2AngleZero"),
            invalid = a.unique("atan2Invalid"),
            angleReady = a.unique("atan2AngleReady"),
            positiveX = a.unique("atan2PositiveX"),
            done = a.unique("atan2Done");
        a.storesd({ base: "rsp", disp: 40 }, "xmm0");
        a.storesd({ base: "rsp", disp: 48 }, "xmm1");
        a.movqFromXmm("r8", "xmm0");
        a.movqFromXmm("r9", "xmm1");
        a.mov("r10", ABS);
        a.and("r8", "r10");
        a.and("r9", "r10");
        a.mov("r11", INF);
        a.cmp("r8", "r11");
        a.jcc("a", invalid);
        a.cmp("r9", "r11");
        a.jcc("a", invalid);
        a.test("r8", "r8");
        a.jcc("e", zeroY);
        a.test("r9", "r9");
        a.jcc("e", zeroX);
        a.cmp("r8", "r11");
        const finiteY = a.unique("atan2FiniteY");
        a.jcc("ne", finiteY);
        a.cmp("r9", "r11");
        a.jcc("e", bothInfinite);
        a.jmp(zeroX);
        a.label(finiteY);
        a.cmp("r9", "r11");
        a.jcc("e", angleZero);
        a.movqToXmm("xmm0", "r8");
        a.movqToXmm("xmm1", "r9");
        a.divsd("xmm0", "xmm1");
        a.call("rt.armMath.atan");
        a.jmp(angleReady);
        a.label(zeroY);
        a.jmp(angleZero);
        a.label(zeroX);
        constant(a, "xmm0", Math.PI / 2);
        a.jmp(angleReady);
        a.label(bothInfinite);
        constant(a, "xmm0", Math.PI / 4);
        a.jmp(angleReady);
        a.label(angleZero);
        constant(a, "xmm0", 0);
        a.label(angleReady);
        a.load("rax", { base: "rsp", disp: 48 });
        a.test("rax", "rax");
        a.jcc("ns", positiveX);
        constant(a, "xmm1", Math.PI);
        a.subsd("xmm1", "xmm0");
        a.movsd("xmm0", "xmm1");
        a.label(positiveX);
        a.load("rax", { base: "rsp", disp: 40 });
        a.mov("r10", SIGN);
        a.and("rax", "r10");
        a.movqFromXmm("r10", "xmm0");
        a.xor("rax", "r10");
        a.movqToXmm("xmm0", "rax");
        a.jmp(done);
        a.label(invalid);
        answer(a, QNAN, done);
        a.label(done);
    });
}
