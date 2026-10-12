import type { Assembler } from "./assembler.js";
import type { MachineMath } from "../machine/math.js";

// x87 encodings with an [rsp+disp8] operand (all runtime slots are below 128).
const disp8 = (offset: number) => {
    if (!Number.isInteger(offset) || offset < 0 || offset > 127)
        throw new Error("x87 slot out of disp8 range");
    return offset;
};
const fld = (offset: number) => [0xdd, 0x44, 0x24, disp8(offset)]; // fld qword [rsp+offset]
const fstp = (offset: number) => [0xdd, 0x5c, 0x24, disp8(offset)]; // fstp qword [rsp+offset]
const faddFrom = (offset: number) => [0xdc, 0x44, 0x24, disp8(offset)]; // fadd qword [rsp+offset]
const fmulFrom = (offset: number) => [
    0xdd,
    0x44,
    0x24,
    disp8(offset),
    0xde,
    0xc9,
]; // fld; fmulp
const FLDLN2 = [0xd9, 0xed],
    FLDLG2 = [0xd9, 0xec],
    FLD1 = [0xd9, 0xe8],
    FLDL2E = [0xd9, 0xea];
const FSIN = [0xd9, 0xfe],
    FCOS = [0xd9, 0xff],
    FPTAN = [0xd9, 0xf2],
    FPATAN = [0xd9, 0xf3],
    FYL2X = [0xd9, 0xf1],
    FYL2XP1 = [0xd9, 0xf9],
    F2XM1 = [0xd9, 0xf0];
const FSTP_ST0 = [0xdd, 0xd8];
const slot = (offset: number) => ({ base: "rsp" as const, disp: offset });

/** Transcendental steps on the x87 unit of x86-64. */
export const x87Math: MachineMath = {
    softwareRoutines: false,
    trig(a, name, argument, result) {
        // fsin/fcos/fptan accept |x| < 2^63; larger finite angles go through rt.trigReduce (slots 88, 96).
        const op = name === "sin" ? FSIN : name === "cos" ? FCOS : FPTAN;
        const large = a.unique("largeAngle"),
            done = a.unique("trigDone");
        a.load("rax", slot(argument));
        a.mov("r10", 0x7fffffffffffffffn);
        a.and("rax", "r10");
        a.mov("r10", 0x43e0000000000000n);
        a.cmp("rax", "r10");
        a.jcc("ae", large);
        a.emit(fld(argument));
        a.emit(op);
        if (name === "tan") a.emit(FSTP_ST0); // discard the extra 1.0 from fptan
        a.emit(fstp(result));
        a.jmp(done);
        a.label(large);
        const nonfinite = a.unique("nonfinite");
        a.mov("r10", 0x7ff0000000000000n);
        a.cmp("rax", "r10");
        a.jcc("ae", nonfinite);
        a.movqToXmm("xmm0", "rax");
        a.call("rt.trigReduce");
        a.store(slot(96), "rax");
        a.storesd(slot(88), "xmm0");
        if (name === "tan") {
            a.emit([...fld(88), ...FPTAN, ...FSTP_ST0, ...fstp(result)]); // tan(reduced angle)
            const even = a.unique("even");
            a.load("rax", slot(96));
            a.and("rax", 1);
            a.jcc("e", even);
            a.mov("rax", 0xbff0000000000000n);
            a.movqToXmm("xmm0", "rax");
            a.divsd("xmm0", slot(result));
            a.storesd(slot(result), "xmm0");
            a.label(even);
        } else {
            const useSin = a.unique("useSin"),
                after = a.unique("afterTrig");
            a.load("rax", slot(96));
            a.and("rax", 1);
            a.jcc(name === "sin" ? "e" : "ne", useSin);
            a.emit([...fld(88), ...FCOS, ...fstp(result)]);
            a.jmp(after);
            a.label(useSin);
            a.emit([...fld(88), ...FSIN, ...fstp(result)]);
            a.label(after);
            const noQuadrantSign = a.unique("noQuadrantSign");
            a.load("rax", slot(96));
            if (name === "sin") {
                a.cmp("rax", 2);
                a.jcc("b", noQuadrantSign);
            } else {
                a.cmp("rax", 1);
                a.jcc("b", noQuadrantSign);
                a.cmp("rax", 2);
                a.jcc("a", noQuadrantSign);
            }
            a.load("rax", slot(result));
            a.mov("r10", 0x8000000000000000n);
            a.xor("rax", "r10");
            a.store(slot(result), "rax");
            a.label(noQuadrantSign);
        }
        if (name !== "cos") {
            a.load("rax", slot(argument));
            a.mov("r10", 0x8000000000000000n);
            a.and("rax", "r10");
            a.load("r11", slot(result));
            a.xor("rax", "r11");
            a.store(slot(result), "rax");
        }
        a.jmp(done);
        a.label(nonfinite);
        a.mov("rax", 0x7ff8000000000000n);
        a.store(slot(result), "rax");
        a.label(done);
    },
    log(a, name, argument, result) {
        // ln(2), lg(2) or 1 times log2(x)
        a.emit([
            ...(name === "log" ? FLDLN2 : name === "log10" ? FLDLG2 : FLD1),
            ...fld(argument),
            ...FYL2X,
            ...fstp(result),
        ]);
    },
    atan(a, argument, result) {
        a.emit([...fld(argument), ...FLD1, ...FPATAN, ...fstp(result)]);
    }, // atan2(x, 1)
    atan2(a, y, x, result) {
        a.emit([...fld(y), ...fld(x), ...FPATAN, ...fstp(result)]);
    },
    log1pCore(a) {
        a.storesd(slot(40), "xmm0");
        a.load("rax", slot(40));
        a.mov("r10", 0x7fffffffffffffffn);
        a.and("rax", "r10");
        a.mov("r10", 0x3fd0000000000000n);
        const ordinary = a.unique("ordinary"),
            done = a.unique("done");
        a.cmp("rax", "r10");
        a.jcc("ae", ordinary);
        a.emit([...FLDLN2, ...fld(40), ...FYL2XP1]); // ln(2) * log2(1+x), preserving small x
        a.jmp(done);
        a.label(ordinary);
        a.emit([...FLDLN2, ...FLD1, ...faddFrom(40), ...FYL2X]); // ln(2) * log2(1+x)
        a.label(done);
        a.emit(fstp(48));
        a.movsd("xmm0", slot(48));
    },
    expCore(a) {
        a.movqFromXmm("rax", "xmm0");
        a.store(slot(40), "rax");
        a.mov("r10", 0x7fffffffffffffffn);
        a.and("r10", "rax");
        const special = a.unique("expSpecial"),
            zero = a.unique("expZero"),
            done = a.unique("expDone");
        a.mov("r11", 0x7ff0000000000000n);
        a.cmp("r10", "r11");
        a.jcc("ae", special);
        a.test("r10", "r10");
        a.jcc("e", zero);
        a.emit([...FLDL2E, ...fmulFrom(40)]); // log2(e) * x
        // 2^t = 2^frac(t) * 2^int(t): fld st0; frndint; fxch; fsub st0,st1; f2xm1; fld1; faddp; fscale; fstp st1
        a.emit([
            0xd9,
            0xc0,
            0xd9,
            0xfc,
            0xd9,
            0xc9,
            0xd8,
            0xe1,
            ...F2XM1,
            ...FLD1,
            0xde,
            0xc1,
            0xd9,
            0xfd,
            0xdd,
            0xd9,
        ]);
        a.emit(fstp(48));
        a.movsd("xmm0", slot(48));
        a.jmp(done);
        a.label(special);
        a.mov("r11", 0x7ff0000000000000n);
        a.cmp("r10", "r11");
        const save = a.unique("expSave");
        a.jcc("ne", save);
        a.test("rax", "rax");
        a.jcc("s", zero);
        a.mov("rax", 0x7ff0000000000000n);
        a.jmp(save);
        a.label(zero);
        a.mov("rax", 0x3ff0000000000000n);
        a.load("r10", slot(40));
        a.test("r10", "r10");
        const normalZero = a.unique("normalZero");
        a.jcc("ns", normalZero);
        a.mov("r11", 0x7fffffffffffffffn);
        a.and("r10", "r11");
        a.test("r10", "r10");
        a.jcc("e", normalZero);
        a.mov("rax", 0);
        a.label(normalZero);
        a.label(save);
        a.movqToXmm("xmm0", "rax");
        a.label(done);
    },
    expm1Core(a) {
        a.movqFromXmm("rax", "xmm0");
        a.store(slot(40), "rax");
        a.mov("r10", 0x7fffffffffffffffn);
        a.and("rax", "r10");
        const large = a.unique("expm1Large"),
            done = a.unique("expm1Done");
        a.mov("r10", 0x3fe62e42fefa39efn);
        a.cmp("rax", "r10");
        a.jcc("a", large);
        a.emit([...FLDL2E, ...fmulFrom(40), ...F2XM1, ...fstp(48)]); // 2^(x*log2(e))-1
        a.movsd("xmm0", slot(48));
        a.jmp(done);
        a.label(large);
        a.call("rt.mathExpCore");
        a.mov("rax", 0x3ff0000000000000n);
        a.movqToXmm("xmm1", "rax");
        a.subsd("xmm0", "xmm1");
        a.label(done);
    },
};
