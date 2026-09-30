import type { NativeProgram, NamedFragment } from "./model.js";
import { checkedRel32 } from "../x64/encoder.js";
import { buildImports } from "./imports.js";
import { buildRelocations } from "./relocations.js";
import { encodeUnwind } from "./unwind.js";
const imageBase = 0x140000000n;
function align(n: number, a: number): number {
  return Math.ceil(n / a) * a;
}
function u32(n: number): number {
  if (!Number.isSafeInteger(n) || n < 0 || n > 0xffffffff)
    throw Error("PE RVA/size range exceeded");
  return n;
}
interface Section {
  name: string;
  bytes: Uint8Array;
  rva: number;
  raw: number;
  rawSize: number;
  flags: number;
}
export interface PeOptions {
  /** Optional-header subsystem: console (3, default) or windows GUI (2, no console window). */
  subsystem?: "console" | "windows";
}
export function linkPe(program: NativeProgram, options: PeOptions = {}): Uint8Array {
  const sections: Section[] = [];
  let nextRva = 0x1000;
  const symbols = new Map<string, number>();
  const placements: {
    fragment: NamedFragment;
    section: Section;
    offset: number;
  }[] = [];
  const symbol = (name: string, rva: number) => {
    if (symbols.has(name)) throw Error(`Duplicate symbol ${name}`);
    symbols.set(name, u32(rva));
  };
  const addSection = (name: string, bytes: Uint8Array, flags: number) => {
    const s = {
      name,
      bytes,
      rva: nextRva,
      raw: 0,
      rawSize: align(bytes.length, 512),
      flags,
    };
    sections.push(s);
    nextRva = u32(nextRva + align(Math.max(bytes.length, 1), 4096));
    return s;
  };
  for (const [name, flags] of [
    [".text", 0x60000020],
    [".rdata", 0x40000040],
    [".data", 0xc0000040],
  ] as const) {
    const fragments = program.fragments.filter((f) => f.section === name);
    if (!fragments.length) continue;
    let length = 0;
    const offsets = fragments.map((f) => {
      const alignment = f.alignment ?? (name === ".text" ? 16 : 8);
      if (
        !Number.isInteger(alignment) ||
        alignment < 1 ||
        alignment > 4096 ||
        alignment & (alignment - 1)
      )
        throw Error("Invalid fragment alignment");
      length = align(length, alignment);
      const o = length;
      length = u32(length + f.bytes.length);
      return o;
    });
    const data = new Uint8Array(length);
    const sec = addSection(name, data, flags);
    fragments.forEach((f, i) => {
      const offset = offsets[i]!;
      data.set(f.bytes, offset);
      symbol(f.name, sec.rva + offset);
      for (const [label, pos] of Object.entries(f.symbols)) {
        if (!Number.isInteger(pos) || pos < 0 || pos > f.bytes.length)
          throw Error("Symbol offset out of bounds");
        if (label === f.name && pos === 0) continue;
        symbol(label, sec.rva + offset + pos);
      }
      placements.push({ fragment: f, section: sec, offset });
    });
  }
  if (placements.length !== program.fragments.length)
    throw Error("Unsupported section");
  const imports = buildImports(program.imports, nextRva);
  let idata: Section | undefined;
  if (imports.bytes.length) {
    idata = addSection(".idata", imports.bytes, 0xc0000040);
    for (const [name, rva] of Object.entries(imports.symbols))
      symbol(name, rva);
  }
  const resolve = (name: string) => {
    const rva = symbols.get(name);
    if (rva === undefined) throw Error(`Unknown symbol ${name}`);
    return rva;
  };
  const relocations: number[] = [];
  for (const { fragment: f, section: s, offset } of placements) {
    const view = new DataView(s.bytes.buffer);
    for (const fix of f.fixups) {
      const width = fix.kind === "va64" ? 8 : 4;
      if (
        !Number.isInteger(fix.offset) ||
        fix.offset < 0 ||
        fix.offset + width > f.bytes.length
      )
        throw Error("Fixup out of bounds");
      if (!Number.isSafeInteger(fix.addend)) throw Error("Fixup addend range");
      const target = u32(resolve(fix.target) + fix.addend),
        place = s.rva + offset + fix.offset,
        o = offset + fix.offset;
      if (fix.kind === "rel32")
        view.setInt32(o, checkedRel32(target - place - 4), true);
      else if (fix.kind === "rva32") view.setUint32(o, u32(target), true);
      else if (fix.kind === "va64") {
        view.setBigUint64(o, imageBase + BigInt(u32(target)), true);
        relocations.push(place);
      } else throw Error("Unknown fixup kind");
    }
  }
  let pdata: Section | undefined;
  if (program.functions.length) {
    let size = 0;
    const funcs = program.functions
      .map((f) => {
        const bytes = encodeUnwind(f),
          offset = size;
        size += bytes.length;
        const begin = resolve(f.begin),
          end = resolve(f.end);
        if (end <= begin || f.prologSize > end - begin)
          throw Error("Invalid unwind function bounds");
        return { bytes, offset, begin, end };
      })
      .sort((a, b) => a.begin - b.begin);
    for (let i = 1; i < funcs.length; i++)
      if (funcs[i]!.begin < funcs[i - 1]!.end)
        throw Error("Overlapping unwind functions");
    const data = new Uint8Array(size);
    for (const f of funcs) data.set(f.bytes, f.offset);
    const xdata = addSection(".xdata", data, 0x40000040);
    const pbytes = new Uint8Array(funcs.length * 12);
    const pv = new DataView(pbytes.buffer);
    funcs.forEach((f, i) => {
      pv.setUint32(i * 12, f.begin, true);
      pv.setUint32(i * 12 + 4, f.end, true);
      pv.setUint32(i * 12 + 8, xdata.rva + f.offset, true);
    });
    pdata = addSection(".pdata", pbytes, 0x40000040);
  }
  let reloc: Section | undefined;
  if (relocations.length)
    reloc = addSection(".reloc", buildRelocations(relocations), 0x42000040);
  const entry = resolve(program.entry);
  if (
    !sections.some(
      (s) =>
        s.name === ".text" && entry >= s.rva && entry < s.rva + s.bytes.length,
    )
  )
    throw Error("Entry is outside executable code");
  const headerSize = align(0x80 + 24 + 240 + sections.length * 40, 512);
  let fileSize = headerSize;
  for (const s of sections) {
    s.raw = fileSize;
    fileSize = u32(fileSize + s.rawSize);
  }
  const image = new Uint8Array(fileSize),
    v = new DataView(image.buffer);
  const w16 = (o: number, n: number) => v.setUint16(o, n, true),
    w32 = (o: number, n: number) => v.setUint32(o, u32(n), true),
    w64 = (o: number, n: bigint) => v.setBigUint64(o, n, true);
  w16(0, 0x5a4d);
  w32(60, 0x80);
  w32(0x80, 0x4550);
  w16(0x84, 0x8664);
  w16(0x86, sections.length);
  w16(0x94, 240);
  w16(0x96, 0x22);
  const o = 0x98;
  w16(o, 0x20b);
  image[o + 2] = 1;
  w32(
    o + 4,
    sections.filter((s) => s.flags & 0x20).reduce((a, s) => a + s.rawSize, 0),
  );
  w32(
    o + 8,
    sections
      .filter((s) => !(s.flags & 0x20))
      .reduce((a, s) => a + s.rawSize, 0),
  );
  w32(o + 16, entry);
  w32(o + 20, sections.find((s) => s.name === ".text")!.rva);
  w64(o + 24, imageBase);
  w32(o + 32, 4096);
  w32(o + 36, 512);
  w16(o + 40, 6);
  w16(o + 48, 6);
  w32(o + 56, nextRva);
  w32(o + 60, headerSize);
  w16(o + 68, options.subsystem === "windows" ? 2 : 3);
  w16(o + 70, 0x160);
  w64(o + 72, 0x1000000n);
  w64(o + 80, 0x1000n);
  w64(o + 88, 0x100000n);
  w64(o + 96, 0x1000n);
  w32(o + 108, 16);
  const directory = (i: number, rva: number, size: number) => {
    w32(o + 112 + i * 8, rva);
    w32(o + 116 + i * 8, size);
  };
  if (idata) {
    directory(1, idata.rva, imports.descriptorSize);
    directory(12, imports.iatRva, imports.iatSize);
  }
  if (pdata) directory(3, pdata.rva, pdata.bytes.length);
  if (reloc) directory(5, reloc.rva, reloc.bytes.length);
  sections.forEach((s, i) => {
    const h = o + 240 + i * 40;
    for (let j = 0; j < s.name.length; j++) image[h + j] = s.name.charCodeAt(j);
    w32(h + 8, s.bytes.length);
    w32(h + 12, s.rva);
    w32(h + 16, s.rawSize);
    w32(h + 20, s.raw);
    w32(h + 36, s.flags);
    image.set(s.bytes, s.raw);
  });
  return image;
}
