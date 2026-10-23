import type { Assembler } from "../../backend/machine/context.js";
import { constant } from "./software-math.js";

/* Port of FreeBSD/fdlibm s_cbrt.c (also used by V8 in base/ieee754.cc), so
 * results match Node.js bit for bit.
 * Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
 * Developed at SunPro, a Sun Microsystems, Inc. business.
 * Permission to use, copy, modify, and distribute this software is freely
 * granted, provided that this notice is preserved.
 * Optimized by Bruce D. Evans.
 */
const B1 = 715094163n, // (1023-1023/3-0.03306235651)*2**20
    B2 = 696219795n, // (1023-1023/3-54/3-0.03306235651)*2**20
    P0 = 1.87595182427177009643,
    P1 = -1.88497979543377169875,
    P2 = 1.62142972010535446614,
    P3 = -0.758397934778766047437,
    P4 = 0.145996192886612446982;

/** cbrt of a finite, positive, non-zero XMM0 into XMM0; volatile scratch only. */
export function emitCbrtCore(a: Assembler): void {
    const normal = a.unique("cbrtNormal");
    // Initial estimate to about 5 bits: divide the exponent by 3.
    a.movqFromXmm("rax", "xmm0");
    a.shr("rax", 32);
    a.mov("r9", "rax");
    a.mov("r11", B1);
    a.mov("r10", 0x00100000);
    a.cmp("r9", "r10");
    a.jcc("ae", normal);
    // Subnormal: scale by 2^54 first.
    constant(a, "xmm1", 2 ** 54);
    a.mulsd("xmm1", "xmm0");
    a.movqFromXmm("r9", "xmm1");
    a.shr("r9", 32);
    a.mov("r11", B2);
    a.label(normal);
    a.mov("r10", 0xaaaaaaabn); // hx / 3 == (hx * 0xaaaaaaab) >> 33 for hx < 2^31
    a.imul("r9", "r10");
    a.shr("r9", 33);
    a.add("r9", "r11");
    a.shl("r9", 32);
    a.movqToXmm("xmm1", "r9");
    // r = (t*t)*(t/x); t = t*((P0+r*(P1+r*P2))+((r*r)*r)*(P3+r*P4))
    a.movsd("xmm2", "xmm1");
    a.mulsd("xmm2", "xmm1");
    a.movsd("xmm3", "xmm1");
    a.divsd("xmm3", "xmm0");
    a.mulsd("xmm2", "xmm3");
    constant(a, "xmm3", P2);
    a.mulsd("xmm3", "xmm2");
    constant(a, "xmm4", P1);
    a.addsd("xmm3", "xmm4");
    a.mulsd("xmm3", "xmm2");
    constant(a, "xmm4", P0);
    a.addsd("xmm3", "xmm4");
    constant(a, "xmm4", P4);
    a.mulsd("xmm4", "xmm2");
    constant(a, "xmm5", P3);
    a.addsd("xmm4", "xmm5");
    a.movsd("xmm5", "xmm2");
    a.mulsd("xmm5", "xmm2");
    a.mulsd("xmm5", "xmm2");
    a.mulsd("xmm4", "xmm5");
    a.addsd("xmm3", "xmm4");
    a.mulsd("xmm1", "xmm3");
    // Round t away from zero to 23 bits so that t*t is exact.
    a.movqFromXmm("rax", "xmm1");
    a.mov("r10", 0x80000000n);
    a.add("rax", "r10");
    a.mov("r10", 0xffffffffc0000000n);
    a.and("rax", "r10");
    a.movqToXmm("xmm1", "rax");
    // One Newton step to 53 bits: s=t*t; r=x/s; w=t+t; r=(r-t)/(w+r); t=t+t*r
    a.movsd("xmm2", "xmm1");
    a.mulsd("xmm2", "xmm1");
    a.movsd("xmm3", "xmm0");
    a.divsd("xmm3", "xmm2");
    a.movsd("xmm4", "xmm1");
    a.addsd("xmm4", "xmm1");
    a.movsd("xmm5", "xmm3");
    a.subsd("xmm5", "xmm1");
    a.addsd("xmm4", "xmm3");
    a.divsd("xmm5", "xmm4");
    a.mulsd("xmm5", "xmm1");
    a.addsd("xmm1", "xmm5");
    a.movsd("xmm0", "xmm1");
}
