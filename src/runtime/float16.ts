import { RuntimeBuilder } from "./abi.js";
import { builtinPropertyRoots } from "./function-builtin.js";

/**
 * Half-precision (IEEE 754 binary16) conversions for Math.f16round and
 * DataView get/setFloat16. They are linked only with the `float16` runtime
 * part (see RuntimeLink in src/link.ts).
 */
export const float16MathMethods = ["f16round"] as const;
export const float16DataViewMethods = ["getFloat16", "setFloat16"] as const;
const dataViewSymbol = (name: string) =>
    "rt.dataView" + name.charAt(0).toUpperCase() + name.slice(1) + ".fn";
/** GC roots of the float16 built-ins (traced only when the part is linked). */
export const float16Roots = [
    ...float16MathMethods.map((name) => "rt.Math." + name + ".fn"),
    ...float16DataViewMethods.map(dataViewSymbol),
];
export const float16PropertyRoots = [
    ...float16MathMethods.flatMap((name) =>
        builtinPropertyRoots("rt.Math." + name + ".fn", name, "rt.Math"),
    ),
    ...float16DataViewMethods.flatMap((name) =>
        builtinPropertyRoots(
            dataViewSymbol(name),
            name,
            "rt.dataviewPrototype",
        ),
    ),
];

export function emitFloat16(b: RuntimeBuilder): void {
    // xmm0 (double) → eax (binary16 bits), rounded to nearest, ties to even.
    // The rounding works on the double's bits directly: rounding through
    // binary32 first would round twice.
    b.fn("rt.float16FromDouble", 40, (a) => {
        const nan = a.unique("nan"),
            infinity = a.unique("infinity"),
            subnormal = a.unique("subnormal"),
            zero = a.unique("zero"),
            round = a.unique("round"),
            up = a.unique("up"),
            done = a.unique("done"),
            exit = a.unique("exit");
        a.movqFromXmm("rax", "xmm0");
        a.mov("rdx", "rax");
        a.shr("rdx", 48);
        a.and("rdx", 0x8000); // sign
        a.mov("r10", 0x7fffffffffffffffn);
        a.and("rax", "r10"); // |x|
        a.mov("r10", 0x7ff0000000000000n);
        a.cmp("rax", "r10");
        a.jcc("a", nan);
        a.mov("r10", 0x40effe0000000000n); // 65520 and above round to Infinity
        a.cmp("rax", "r10");
        a.jcc("ae", infinity);
        a.mov("r10", 1009n << 52n); // 2^-14, the smallest normal half
        a.cmp("rax", "r10");
        a.jcc("b", subnormal);
        // Normal: rebias the exponent (1023 → 15); the half bits are the top
        // bits and the 42 bits below them are the remainder.
        a.mov("r10", 1008n << 52n);
        a.sub("rax", "r10");
        a.mov("r8", "rax");
        a.shr("r8", 42);
        a.mov("r9", (1n << 42n) - 1n);
        a.and("rax", "r9");
        a.mov("r9", 1n << 41n);
        a.jmp(round);
        a.label(subnormal);
        // |x| = significand * 2^(e - 1075); the half is significand >> (1051 - e).
        a.mov("rcx", "rax");
        a.shr("rcx", 52);
        a.cmp("rcx", 998); // below 2^-25: rounds to zero
        a.jcc("b", zero);
        a.mov("r10", (1n << 52n) - 1n);
        a.and("rax", "r10");
        a.mov("r10", 1n << 52n);
        a.or("rax", "r10");
        a.mov("r8", 1051);
        a.sub("r8", "rcx");
        a.mov("rcx", "r8");
        a.mov("r8", "rax");
        a.shr("r8", "cl");
        a.mov("r9", 1);
        a.shl("r9", "cl");
        a.sub("r9", 1);
        a.and("rax", "r9");
        a.mov("r9", 1);
        a.shl("r9", "cl");
        a.shr("r9", 1);
        // r8 = truncated half, rax = remainder, r9 = half an ulp. A carry out
        // of the mantissa moves to the next exponent (or to the smallest normal).
        a.label(round);
        a.cmp("rax", "r9");
        a.jcc("b", done);
        a.jcc("a", up);
        a.mov("r10", "r8");
        a.and("r10", 1);
        a.cmp("r10", 0);
        a.jcc("e", done);
        a.label(up);
        a.add("r8", 1);
        a.label(done);
        a.or("r8", "rdx");
        a.mov("rax", "r8");
        a.jmp(exit);
        a.label(zero);
        a.mov("rax", "rdx");
        a.jmp(exit);
        a.label(infinity);
        a.mov("rax", 0x7c00);
        a.or("rax", "rdx");
        a.jmp(exit);
        a.label(nan);
        a.mov("rax", 0x7e00);
        a.label(exit);
    });
    // ecx (binary16 bits) → xmm0 (the exact double). NaNs become the canonical NaN.
    b.fn("rt.float16ToDouble", 40, (a) => {
        const special = a.unique("special"),
            subnormal = a.unique("subnormal"),
            nan = a.unique("nan"),
            done = a.unique("done");
        a.mov("rax", "rcx");
        a.and("rax", 0x7fff);
        a.mov("rdx", "rcx");
        a.and("rdx", 0x8000);
        a.shl("rdx", 48);
        a.cmp("rax", 0x7c00);
        a.jcc("ae", special);
        a.cmp("rax", 0x400);
        a.jcc("b", subnormal);
        // Normal: rebias the exponent (15 → 1023) and widen the mantissa.
        a.add("rax", 1008 << 10);
        a.shl("rax", 42);
        a.or("rax", "rdx");
        a.jmp(done);
        a.label(subnormal);
        a.cvtsi2sd("xmm0", "rax");
        a.mov("r10", 0x3e70000000000000n); // 2^-24
        a.movqToXmm("xmm1", "r10");
        a.mulsd("xmm0", "xmm1");
        a.movqFromXmm("rax", "xmm0");
        a.or("rax", "rdx");
        a.jmp(done);
        a.label(special);
        a.jcc("ne", nan);
        a.mov("rax", 0x7ff0000000000000n);
        a.or("rax", "rdx");
        a.jmp(done);
        a.label(nan);
        a.mov("rax", 0x7ff8000000000000n);
        a.label(done);
        a.movqToXmm("xmm0", "rax");
    });
}
