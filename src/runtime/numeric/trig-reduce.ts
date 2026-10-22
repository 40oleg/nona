import { RuntimeBuilder, slot } from "../abi.js";
import type { Xmm } from "../../backend/machine/context.js";

// floor((2/pi) * 2^1152), little-endian for limb multiplication.
// Extra zero limbs allow the 53-bit significand to carry above the table.
const reciprocalHex =
    "a2f9836e4e441529fc2757d1f534ddc0db6295993c439041fe5163abdebbc561b7246e3a424dd2e006492eea09d1921cfe1deb1cb129a73ee88235f52ebb4484e99c7026b45f7e413991d639835339f49c845f8bbdf9283b1ff897ffde05980fef2f118b5a0a6d1f6d367ecf27cb09b74f463f669e5fea2d7527bac7ebe5f17b3d0739f78a5292ea6bfb5fb11f8d5d08";

// pi/2 = C + c as a double-double; C = Ch + Cl with 26-bit halves (Veltkamp).
const C = 0x3ff921fb54442d18n,
    c = 0x3c91a62633145c07n,
    Ch = 0x3ff921fb58000000n,
    Cl = 0xbe4dde9740000000n,
    split = 0x41a0000002000000n; // 2^27 + 1

export function emitTrigReduce(b: RuntimeBuilder): void {
    const table = new Uint8Array(20 * 8),
        view = new DataView(table.buffer);
    for (let i = 0; i < 18; i++)
        view.setBigUint64(
            i * 8,
            BigInt(
                "0x" +
                    reciprocalHex.slice(
                        -(i + 1) * 16,
                        i === 0 ? undefined : -i * 16,
                    ),
            ),
            true,
        );
    b.data("rt.trig.twoOverPi", table, ".rdata");
    // Input: finite |x| > pi/4 in XMM0. Output: the reduced angle
    // r = |x| - q * pi/2 with |r| <= ~pi/4 as a double-double XMM0 + XMM1
    // (|XMM1| <= ulp(XMM0)), and the nearest quadrant q modulo four in RAX.
    // |x| * 2/pi is the product of the significand m and the table, scaled by
    // 2^(e - 1152) for the exponent e of m. Its 20 limbs are stored above two
    // zero limbs at slot 128, so buffer bit k + 128 is product bit k and the
    // binary point is at product bit B = 1152 - e (slot 64). The two integer
    // bits above it give q; about 116 bits from the first significant fraction
    // bit give r. The product is exact to about bit 53, which leaves at least
    // 64 significant bits even for the closest doubles to a multiple of pi/2.
    b.fn("rt.trigReduce", 344, (a) => {
        a.movqFromXmm("rax", "xmm0");
        a.mov("r10", "rax");
        a.shr("r10", 52);
        a.and("r10", 0x7ff);
        a.sub("r10", 1075);
        a.store(slot(48), "r10"); // binary exponent after 53-bit significand
        a.mov("r10", 0x000fffffffffffffn);
        a.and("rax", "r10");
        a.mov("r10", 0x0010000000000000n);
        a.or("rax", "r10");
        a.store(slot(56), "rax");
        a.mov("rax", 1152);
        a.load("r10", slot(48));
        a.sub("rax", "r10");
        a.store(slot(64), "rax");
        a.mov("rax", 0);
        a.store(slot(72), "rax");
        a.store(slot(40), "rax");
        a.store(slot(128), "rax");
        a.store(slot(136), "rax");
        const multiply = a.unique("multiply"),
            carry = a.unique("carry"),
            next = a.unique("next"),
            multiplyDone = a.unique("multiplyDone");
        a.label(multiply);
        a.load("r10", slot(40));
        a.cmp("r10", 20);
        a.jcc("ae", multiplyDone);
        a.shl("r10", 3);
        a.lea("r11", { rip: "rt.trig.twoOverPi" });
        a.add("r11", "r10");
        a.load("r11", { base: "r11" });
        a.load("rax", slot(56));
        a.mul("r11");
        a.load("r10", slot(72));
        a.add("rax", "r10");
        a.jcc("b", carry);
        a.jmp(next);
        a.label(carry);
        a.add("rdx", 1);
        a.label(next);
        a.load("r10", slot(40));
        a.shl("r10", 3);
        a.lea("r11", slot(144));
        a.add("r11", "r10");
        a.store({ base: "r11" }, "rax");
        a.store(slot(72), "rdx");
        a.load("rax", slot(40));
        a.add("rax", 1);
        a.store(slot(40), "rax");
        a.jmp(multiply);
        a.label(multiplyDone);
        // R8 = buffer bit index; R11 = address of its limb, RCX = bit in it.
        const locate = () => {
            a.mov("r10", "r8");
            a.shr("r10", 6);
            a.shl("r10", 3);
            a.lea("r11", slot(128));
            a.add("r11", "r10");
            a.load("rax", { base: "r11" });
            a.mov("rcx", "r8");
            a.and("rcx", 63);
            a.shr("rax", "cl");
        };
        // RAX = the buffer bit at R8.
        const bit = () => {
            locate();
            a.and("rax", 1);
        };
        // RAX = the 64 buffer bits starting at R8.
        const bits64 = () => {
            locate();
            a.load("r11", { base: "r11", disp: 8 });
            a.xor("rcx", 63);
            a.shl("r11", 1);
            a.shl("r11", "cl"); // shifts by 64 - bit, also when the bit is 0
            a.or("rax", "r11");
        };
        a.load("r8", slot(64));
        a.add("r8", 128);
        bit();
        a.store(slot(80), "rax");
        a.load("r8", slot(64));
        a.add("r8", 129);
        bit();
        a.shl("rax", 1);
        a.load("r10", slot(80));
        a.or("rax", "r10");
        a.store(slot(80), "rax");
        // A fraction of one half or more rounds q up, and r is minus the
        // complement of the fraction (one unit of product bit 0 too small).
        a.load("r8", slot(64));
        a.add("r8", 64);
        bits64();
        a.mov("rdx", "rax");
        a.sar("rdx", 63);
        a.store(slot(88), "rdx"); // all ones when r is negative
        const positive = a.unique("positive");
        a.test("rdx", "rdx");
        a.jcc("e", positive);
        a.load("r10", slot(80));
        a.add("r10", 1);
        a.and("r10", 3);
        a.store(slot(80), "r10");
        a.label(positive);
        // L (slot 96) = product index of the first significant fraction bit;
        // B - 65 when the top 64 fraction bits are all insignificant, which
        // finite doubles never reach.
        a.xor("rax", "rdx");
        a.load("r10", slot(64));
        a.sub("r10", 65);
        a.store(slot(96), "r10");
        const leading = a.unique("leading");
        a.test("rax", "rax");
        a.jcc("e", leading);
        a.bitScanReverse("r10", "rax");
        a.load("r11", slot(64));
        a.sub("r11", 64);
        a.add("r10", "r11");
        a.store(slot(96), "r10");
        a.label(leading);
        // H = product bits L-63..L and W = bits L-127..L-64, complemented
        // when r is negative. hi = (H >> 11) * 2^(L-52-B) is exact, and
        // lo = (H mod 2^11, W >> 12) * 2^(L-115-B) is below ulp(hi).
        a.load("r8", slot(96));
        a.add("r8", 128 - 63);
        bits64();
        a.load("rdx", slot(88));
        a.xor("rax", "rdx");
        a.store(slot(104), "rax");
        a.load("r8", slot(96));
        a.add("r8", 128 - 127);
        bits64();
        a.load("rdx", slot(88));
        a.xor("rax", "rdx");
        a.shr("rax", 12);
        a.load("r10", slot(104));
        a.mov("r11", "r10");
        a.shr("r10", 11);
        a.cvtsi2sd("xmm0", "r10");
        a.and("r11", 0x7ff);
        a.shl("r11", 52);
        a.or("rax", "r11");
        a.cvtsi2sd("xmm1", "rax");
        for (const [xmm, offset] of [
            ["xmm0", 52],
            ["xmm1", 115],
        ] as const) {
            a.load("r10", slot(96));
            a.load("r11", slot(64));
            a.sub("r10", "r11");
            a.add("r10", 1023 - offset);
            a.shl("r10", 52);
            a.movqToXmm("xmm2", "r10");
            a.mulsd(xmm, "xmm2");
        }
        // (hi + lo) * (C + c): hi * C = p + e exactly (Dekker), and the
        // small terms lo * C + hi * c are added to e.
        const constant = (xmm: Xmm, value: bigint) => {
            a.mov("r10", value);
            a.movqToXmm(xmm, "r10");
        };
        constant("xmm3", C);
        a.mulsd("xmm1", "xmm3"); // lo * C
        a.movsd("xmm4", "xmm0");
        a.mulsd("xmm4", "xmm3"); // p
        constant("xmm2", c);
        a.mulsd("xmm2", "xmm0");
        a.addsd("xmm1", "xmm2"); // + hi * c
        constant("xmm3", split);
        a.movsd("xmm2", "xmm0");
        a.mulsd("xmm2", "xmm3");
        a.movsd("xmm3", "xmm2");
        a.subsd("xmm3", "xmm0");
        a.subsd("xmm2", "xmm3"); // hh, the high half of hi
        a.subsd("xmm0", "xmm2"); // hl = hi - hh
        // e = ((hh * Ch - p) + hh * Cl + hl * Ch) + hl * Cl
        constant("xmm3", Ch);
        a.movsd("xmm5", "xmm2");
        a.mulsd("xmm5", "xmm3");
        a.subsd("xmm5", "xmm4");
        constant("xmm3", Cl);
        a.mulsd("xmm2", "xmm3");
        a.addsd("xmm5", "xmm2");
        constant("xmm3", Ch);
        a.movsd("xmm2", "xmm0");
        a.mulsd("xmm2", "xmm3");
        a.addsd("xmm5", "xmm2");
        constant("xmm3", Cl);
        a.mulsd("xmm0", "xmm3");
        a.addsd("xmm5", "xmm0");
        a.addsd("xmm1", "xmm5");
        // Fast two-sum: XMM0 + XMM1 = p + all low-order terms.
        a.movsd("xmm0", "xmm4");
        a.addsd("xmm0", "xmm1");
        a.movsd("xmm2", "xmm0");
        a.subsd("xmm2", "xmm4");
        a.subsd("xmm1", "xmm2");
        a.load("rdx", slot(88));
        a.mov("r10", 0x8000000000000000n);
        a.and("rdx", "r10");
        for (const xmm of ["xmm0", "xmm1"] as const) {
            a.movqFromXmm("rax", xmm);
            a.xor("rax", "rdx");
            a.movqToXmm(xmm, "rax");
        }
        a.load("rax", slot(80));
    });
}
