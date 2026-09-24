import test from "node:test";
import assert from "node:assert/strict";
import { Assembler } from "../src/backend/x64/assembler.js";
import {
  checkedRel32,
  encodeMovRegImm32,
  encodeSubRsp,
} from "../src/backend/x64/encoder.js";
import { planFrame } from "../src/backend/x64/frame.js";
test('indirect calls encode low and extended registers',()=>{
 const a=new Assembler();a.callRegister('rax');a.callRegister('r10');
 assert.deepEqual([...a.finish().bytes],[0xff,0xd0,0x41,0xff,0xd2]);
});
test("x64 immediate encoding and ABI frame sizes", () => {
  assert.deepEqual([...encodeMovRegImm32("ecx", 7)], [0xb9, 7, 0, 0, 0]);
  assert.deepEqual([...encodeSubRsp(40)], [0x48, 0x83, 0xec, 0x28]);
  assert.equal(planFrame(8192, 0).needsProbe, true);
  assert.equal(planFrame(0, 0).allocation, 40);
  assert.throws(() => checkedRel32(0x80000000), /range/i);
});
test("memory encodings include SIB, base-five displacement, extended regs and zero extension", () => {
  const a = new Assembler();
  a.load("rax", { base: "rsp" });
  a.load("r9", { base: "r13", disp: -8 });
  a.store({ base: "rbp" }, "r10");
  a.load("rax", { base: "rax" }, 8);
  a.load("r8", { base: "r12" }, 16);
  assert.deepEqual(
    [...a.finish().bytes],
    [
      0x48, 0x8b, 0x04, 0x24, 0x4d, 0x8b, 0x4d, 0xf8, 0x4c, 0x89, 0x55, 0, 0x0f,
      0xb6, 0, 0x45, 0x0f, 0xb7, 0x04, 0x24,
    ],
  );
});
test("integer arithmetic and shifts have independent ISA bytes", () => {
  const a = new Assembler();
  a.add("rax", "r8");
  a.sub("rsp", 40);
  a.cmp("r9", 128);
  a.test("rax", "rax");
  a.shl("r10", 3);
  a.sar("rax", "cl");
  a.imul("rax", "rcx");
  a.mul("r8");
  a.div("rcx");
  a.neg("rax");
  a.not("r9");
  a.push("r12");
  a.pop("r12");
  a.ret();
  assert.deepEqual(
    [...a.finish().bytes],
    [
      0x4c, 1, 0xc0, 0x48, 0x83, 0xec, 40, 0x49, 0x81, 0xf9, 128, 0, 0, 0, 0x48,
      0x85, 0xc0, 0x49, 0xc1, 0xe2, 3, 0x48, 0xd3, 0xf8, 0x48, 0x0f, 0xaf, 0xc1,
      0x49, 0xf7, 0xe0, 0x48, 0xf7, 0xf1, 0x48, 0xf7, 0xd8, 0x49, 0xf7, 0xd1,
      0x41, 0x54, 0x41, 0x5c, 0xc3,
    ],
  );
});
test("SSE scalar double and conversion encodings", () => {
  const a = new Assembler();
  a.movsd("xmm8", "xmm1");
  a.sqrtsd("xmm3", "xmm4");
  a.addsd("xmm0", { base: "rsp", disp: 32 });
  a.ucomisd("xmm0", "xmm2");
  a.cvtsi2sd("xmm1", "r9");
  a.cvttsd2si("r8", "xmm2");
  a.movqToXmm("xmm0", "rax");
  a.movqFromXmm("rax", "xmm0");
  assert.deepEqual(
    [...a.finish().bytes],
    [
      0xf2, 0x44, 0x0f, 0x10, 0xc1, 0xf2, 0x0f, 0x51, 0xdc, 0xf2, 0x0f, 0x58, 0x44, 0x24, 32, 0x66,
      0x0f, 0x2e, 0xc2, 0xf2, 0x49, 0x0f, 0x2a, 0xc9, 0xf2, 0x4c, 0x0f, 0x2c,
      0xc2, 0x66, 0x48, 0x0f, 0x6e, 0xc0, 0x66, 0x48, 0x0f, 0x7e, 0xc0,
    ],
  );
});
test("symbolic branches preserve fixups and reject duplicate labels", () => {
  const a = new Assembler("entry");
  a.label("entry");
  a.jmp("end");
  a.callImport("exit");
  a.label("end");
  a.ret();
  assert.deepEqual(a.finish().fixups, [
    { offset: 1, target: "end", addend: 0, kind: "rel32" },
    { offset: 7, target: "exit", addend: 0, kind: "rel32" },
  ]);
  assert.equal(a.finish().symbols.end, 11);
  assert.throws(() => a.label("end"), /duplicate/i);
});
test("remaining integer and SSE instruction forms match ISA encodings", () => {
  const a = new Assembler();
  a.mov("r9", 0x1122334455667788n);
  a.mov("rdx", "r8");
  a.and("rax", 15);
  a.or("r8", "rcx");
  a.xor("rdx", "rdx");
  a.shr("rax", 1);
  a.lea("r8", { base: "rbp", disp: -128 });
  a.store({ base: "rsp" }, "rsi", 8);
  a.store({ base: "r12", disp: 128 }, "r9", 16);
  a.load("r10", { base: "rax" }, 32);
  a.storesd({ base: "r12" }, "xmm9");
  a.subsd("xmm0", "xmm1");
  a.mulsd("xmm0", "xmm2");
  a.divsd("xmm0", "xmm3");
  assert.deepEqual(
    [...a.finish().bytes],
    [
      0x49, 0xb9, 0x88, 0x77, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11, 0x4c, 0x89,
      0xc2, 0x48, 0x83, 0xe0, 15, 0x49, 0x09, 0xc8, 0x48, 0x31, 0xd2, 0x48,
      0xc1, 0xe8, 1, 0x4c, 0x8d, 0x45, 128, 0x40, 0x88, 0x34, 0x24, 0x66, 0x45,
      0x89, 0x8c, 0x24, 128, 0, 0, 0, 0x44, 0x8b, 0x10, 0xf2, 0x45, 0x0f, 0x11,
      0x0c, 0x24, 0xf2, 0x0f, 0x5c, 0xc1, 0xf2, 0x0f, 0x59, 0xc2, 0xf2, 0x0f,
      0x5e, 0xc3,
    ],
  );
});
test("all condition codes and RIP addressing retain explicit fixup locations", () => {
  const a = new Assembler();
  a.lea("rax", { rip: "data", addend: 8 });
  a.movsd("xmm0", { rip: "double" });
  a.call("target");
  a.jcc("p", "unordered");
  assert.deepEqual(a.finish().fixups, [
    { offset: 3, target: "data", addend: 8, kind: "rel32" },
    { offset: 11, target: "double", addend: 0, kind: "rel32" },
    { offset: 16, target: "target", addend: 0, kind: "rel32" },
    { offset: 22, target: "unordered", addend: 0, kind: "rel32" },
  ]);
  assert.deepEqual([...a.finish().bytes.slice(20, 22)], [0x0f, 0x8a]);
});

test("exception transfer encodings preserve full XMM lanes",()=>{const a=new Assembler();a.jumpRegister("rax");a.jumpRegister("r10");a.loadXmm128("xmm6",{base:"rax"});a.storeXmm128({base:"rax"},"xmm15");assert.deepEqual([...a.finish().bytes],[0xff,0xe0,0x41,0xff,0xe2,0x0f,0x10,0x30,0x44,0x0f,0x11,0x38]);});
