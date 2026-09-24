import test from "node:test";
import assert from "node:assert/strict";
import { Assembler } from "../src/backend/x64/assembler.js";
import { linkPe } from "../src/backend/pe/writer.js";
import type { NativeProgram } from "../src/backend/pe/model.js";
import { runNative } from "./helpers/native.js";
import { readPe } from "./helpers/pe-reader.js";
import { encodeUnwind } from "../src/backend/pe/unwind.js";

test('rel32 target RVA must not underflow even when displacement fits',()=>{
  const p=program();
  p.fragments[0]={name:'entry',section:'.text',bytes:new Uint8Array([0xe9,0,0,0,0]),symbols:{end:5},fixups:[{kind:'rel32',offset:1,target:'entry',addend:-8192}]};
  assert.throws(()=>linkPe(p),/range/i);
});
function program(): NativeProgram {
  const a = new Assembler("entry");
  a.sub("rsp", 40);
  a.mov("rcx", 7);
  a.callImport("ExitProcess");
  a.label("end");
  return {
    fragments: [{ ...a.finish(), name: "entry", section: ".text" }],
    imports: [
      { dll: "KERNEL32.dll", name: "ExitProcess", symbol: "ExitProcess" },
    ],
    entry: "entry",
    functions: [
      {
        begin: "entry",
        end: "end",
        prologSize: 4,
        stackAllocation: 40,
        savedRegisters: [],
      },
    ],
  };
}
test("Windows loader runs a generated PE with imported ExitProcess", () => {
  const run = runNative(linkPe(program()));
  assert.equal(run.error, undefined);
  assert.equal(run.status, 7);
  assert.equal(run.stdout.length, 0);
});
test("independent reader checks headers, permissions, imports and unwind directories", () => {
  const pe = readPe(linkPe(program()));
  assert.equal(pe.machine, 0x8664);
  assert.equal(pe.magic, 0x20b);
  assert.equal(pe.subsystem, 3);
  assert.ok(pe.dllCharacteristics & 0x100);
  assert.ok(pe.dllCharacteristics & 0x40);
  assert.deepEqual(pe.imports(), ["KERNEL32.dll!ExitProcess"]);
  for (const section of pe.sections)
    assert.notEqual(section.characteristics & 0xa0000000, 0xa0000000);
  pe.checkDirectories();
  const p = pe.offset(pe.directories[3]!.rva);
  assert.ok(pe.u32(p) < pe.u32(p + 4));
  const x = pe.offset(pe.u32(p + 8));
  assert.deepEqual([...pe.bytes.slice(x, x + 6)], [1, 4, 1, 0, 4, 0x42]);
});
test("DIR64 relocation rebases an absolute pointer to a literal", () => {
  const p = program();
  p.fragments.push({
    name: "literal",
    section: ".rdata",
    bytes: new Uint8Array([42]),
    fixups: [],
    symbols: {},
  });
  p.fragments.push({
    name: "pointer",
    section: ".data",
    bytes: new Uint8Array(8),
    fixups: [{ offset: 0, target: "literal", addend: 0, kind: "va64" }],
    symbols: {},
  });
  const image = linkPe(p);
  const pe = readPe(image);
  const relocs = pe.relocations();
  assert.equal(relocs.length, 1);
  const off = pe.offset(relocs[0]!);
  const old = pe.u64(off);
  assert.equal(pe.bytes[pe.offset(Number(old - pe.imageBase))], 42);
  const rebased = pe.rebase(0x200000000n);
  assert.equal(
    new DataView(rebased.buffer).getBigUint64(off, true),
    old + 0x200000000n - pe.imageBase,
  );
  assert.equal(runNative(image).status, 7);
});
test("unwind supports large allocations and MOV saves without truncation", () => {
  assert.deepEqual(
    [
      ...encodeUnwind({
        begin: "a",
        end: "b",
        prologSize: 12,
        allocationCodeOffset: 7,
        stackAllocation: 0x100008,
        savedRegisters: [{ register: 12, codeOffset: 12, stackOffset: 32 }],
      }),
    ],
    [1, 12, 5, 0, 12, 0xc4, 4, 0, 7, 0x11, 8, 0, 16, 0, 0, 0],
  );
});
test("linker rejects undefined and duplicate symbols and out of bounds fixups", () => {
  let p = program();
  p.entry = "unknown";
  assert.throws(() => linkPe(p), /unknown|undefined/i);
  p = program();
  p.fragments.push({ ...p.fragments[0]!, bytes: new Uint8Array([0xc3]) });
  assert.throws(() => linkPe(p), /duplicate/i);
  p = program();
  p.fragments[0]!.fixups[0]!.offset = 9999;
  assert.throws(() => linkPe(p), /bounds|range/i);
});
test("Windows executes cross-fragment calls, conditional branches and SSE math", () => {
  const p = program();
  const a = new Assembler("entry");
  a.sub("rsp", 40);
  a.call("compute");
  a.cmp("rax", 42);
  a.jcc("ne", "bad");
  a.mov("rcx", "rax");
  a.callImport("ExitProcess");
  a.label("bad");
  a.mov("rcx", 99);
  a.callImport("ExitProcess");
  a.label("end");
  p.fragments[0] = { ...a.finish(), name: "entry", section: ".text" };
  const b = new Assembler("compute");
  b.mov("rax", 6);
  b.cvtsi2sd("xmm0", "rax");
  b.mov("rax", 7);
  b.cvtsi2sd("xmm1", "rax");
  b.mulsd("xmm0", "xmm1");
  b.cvttsd2si("rax", "xmm0");
  b.ret();
  p.fragments.push({ ...b.finish(), name: "compute", section: ".text" });
  assert.equal(runNative(linkPe(p)).status, 42);
});
