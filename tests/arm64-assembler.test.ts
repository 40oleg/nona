import { test } from "node:test";
import assert from "node:assert/strict";
const assemblerPath = "../src/backend/arm64/assembler.js";
const module = await import(assemblerPath).catch(() => undefined);
function assembler() {
    assert.ok(module, "ARM64 assembler must exist");
    return new module.Arm64Assembler("test");
}
function words(bytes: Uint8Array): number[] {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return Array.from({ length: bytes.length / 4 }, (_, i) =>
        v.getUint32(i * 4, true),
    );
}

test("ARM64 moves and integer memory operations encode A64 rather than x64", () => {
    const a = assembler();
    a.mov("rax", 42);
    a.mov("rsi", "rdi");
    a.load("rdx", { base: "rcx", disp: 8 });
    a.store({ base: "rcx", disp: 3 }, "rax", 8);
    assert.deepEqual(
        words(a.finish().bytes),
        [0xd2800540, 0xaa0603e5, 0xf9400422, 0x39000c20],
    );
    assert.throws(() => a.emit([0x48, 0x99]), /raw|x64/i);
});

test("ARM64 labels and calls preserve the runtime return slot on its software stack", () => {
    const a = assembler();
    a.lea("rcx", { rip: "data", addend: 7 });
    a.call("child");
    a.ret();
    const f = a.finish(),
        fixups = f.fixups;
    assert.deepEqual(fixups.slice(0, 2), [
        { offset: 0, kind: "arm64-page21", target: "data", addend: 7 },
        { offset: 4, kind: "arm64-pageoff12", target: "data", addend: 7 },
    ]);
    assert.equal(fixups.at(-1)?.kind, "arm64-branch26");
    assert.equal(fixups.at(-1)?.target, "child");
    const code = words(f.bytes);
    assert.ok(code.includes(0xd100239c)); // sub x28, x28, #8
    assert.ok(code.includes(0xf900039e)); // str x30, [x28]
    assert.deepEqual(code.slice(-3), [0xf940039e, 0x9100239c, 0xd61f03c0]);
});

test("ARM64 integer operations and comparisons use native arithmetic and saved flags", () => {
    const a = assembler();
    a.add("rax", "rdx");
    a.cmp("rcx", 42);
    a.setCondition("e");
    a.jcc("b", "less");
    const f = a.finish(),
        code = words(f.bytes);
    assert.equal(code[0], 0xab020000); // adds x0, x0, x2
    assert.ok(code.includes(0xeb0d002c)); // subs x12, x1, x13
    assert.ok(code.includes(0x9a9f17e0)); // cset x0, eq
    assert.equal(f.fixups.at(-1)?.target, "less");
});

test("ARM64 binary64 arithmetic uses native FP registers and instructions", () => {
    const a = assembler();
    a.movqToXmm("xmm0", "rax");
    a.movqToXmm("xmm1", "rdx");
    a.addsd("xmm0", "xmm1");
    a.sqrtsd("xmm0", "xmm0");
    a.movqFromXmm("rax", "xmm0");
    assert.deepEqual(
        words(a.finish().bytes),
        [0x9e670000, 0x9e670041, 0x1e612800, 0x1e61c000, 0x9e660000],
    );
});

test("ARM64 int32 conversion and sign extension of a register's low 32 bits (#402)", () => {
    const a = assembler();
    a.cvtsi2sd32("xmm0", "r10");
    a.movsxd("r10", "r10");
    assert.deepEqual(words(a.finish().bytes), [0x1e620120, 0x93407d29]);
});

test("ARM64 register loops: counters in x19-x22 and doubles in d2-d5 (#424)", () => {
    const a = assembler();
    a.cvtsi2sd("xmm2", "r12");
    a.movsd("xmm3", "xmm2");
    a.addsd("xmm2", "xmm3");
    a.add("r12", 1);
    a.cmp("r12", "r13");
    a.mov("rax", "r14");
    a.storesd({ base: "rbp", disp: -8 }, "xmm5");
    const code = words(a.finish().bytes);
    assert.deepEqual(code.slice(0, 3), [0x9e620262, 0x1e604043, 0x1e632842]); // scvtf d2, x19; fmov d3, d2; fadd d2, d2, d3
    assert.ok(code.includes(0xab0d0273)); // adds x19, x19, x13
    assert.ok(code.includes(0xeb14026c)); // subs x12, x19, x20
    assert.ok(code.includes(0xaa1503e0)); // mov x0, x21
    assert.equal(code.at(-1), 0xfd000165); // str d5, [x11]
    const b = assembler();
    b.cvttsd2si("r15", "xmm4");
    assert.ok(words(b.finish().bytes).includes(0x9e780096)); // fcvtzs x22, d4
});

test("ARM64 CPU execution probe links arithmetic, flags, division, FP and atomic checks", async () => {
    const path = "../tests/probes/arm64-cpu-probe.js";
    const { arm64CpuProbe } = await import(path),
        image = arm64CpuProbe();
    assert.equal(new DataView(image.buffer).getUint16(18, true), 183);
});
