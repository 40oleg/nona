import assert from "node:assert/strict";
export function readPe(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (o: number) => v.getUint16(o, true),
    u32 = (o: number) => v.getUint32(o, true),
    u64 = (o: number) => v.getBigUint64(o, true);
  assert.equal(u16(0), 0x5a4d);
  const nt = u32(60);
  assert.equal(u32(nt), 0x4550);
  const opt = nt + 24;
  const sectionStart = opt + u16(nt + 20);
  const sections = Array.from({ length: u16(nt + 6) }, (_, i) => {
    const o = sectionStart + i * 40;
    return {
      name: Buffer.from(bytes.slice(o, o + 8))
        .toString("ascii")
        .replace(/\0.*$/, ""),
      virtualSize: u32(o + 8),
      rva: u32(o + 12),
      rawSize: u32(o + 16),
      raw: u32(o + 20),
      characteristics: u32(o + 36),
    };
  });
  const directories = Array.from({ length: 16 }, (_, i) => ({
    rva: u32(opt + 112 + i * 8),
    size: u32(opt + 116 + i * 8),
  }));
  const offset = (rva: number) => {
    const s = sections.find((s) => rva >= s.rva && rva < s.rva + s.rawSize);
    if (!s) throw Error(`Unmapped RVA ${rva}`);
    return s.raw + rva - s.rva;
  };
  const str = (rva: number) => {
    const start = offset(rva);
    let end = start;
    while (bytes[end]) end++;
    return Buffer.from(bytes.slice(start, end)).toString("ascii");
  };
  const relocations = () => {
    const dir = directories[5]!;
    const result: number[] = [];
    if (!dir.size) return result;
    let o = offset(dir.rva),
      end = o + dir.size;
    while (o < end) {
      const page = u32(o),
        size = u32(o + 4);
      assert.ok(size >= 8);
      for (let q = o + 8; q < o + size; q += 2) {
        const e = u16(q);
        if (e >>> 12 === 10) result.push(page + (e & 4095));
        else assert.equal(e, 0);
      }
      o += size;
    }
    return result;
  };
  return {
    bytes,
    u16,
    u32,
    u64,
    offset,
    sections,
    directories,
    machine: u16(nt + 4),
    magic: u16(opt),
    subsystem: u16(opt + 68),
    dllCharacteristics: u16(opt + 70),
    imageBase: u64(opt + 24),
    imports: () => {
      const list: string[] = [];
      if (!directories[1]!.size) return list;
      let d = offset(directories[1]!.rva);
      while (u32(d)) {
        const dll = str(u32(d + 12));
        let t = offset(u32(d));
        while (u64(t)) {
          list.push(`${dll}!${str(Number(u64(t)) + 2)}`);
          t += 8;
        }
        d += 20;
      }
      return list;
    },
    /** Resource tree (type → id → language) flattened to its data entries. */
    resources: () => {
      const list: { type: number; id: number; language: number; data: Uint8Array }[] = [];
      const dir = directories[2]!;
      if (!dir.size) return list;
      const base = offset(dir.rva);
      const entries = (at: number) => {
        const count = u16(at + 12) + u16(at + 14);
        return Array.from({ length: count }, (_, i) => ({ id: u32(at + 16 + 8 * i), target: u32(at + 20 + 8 * i) }));
      };
      let previous = -1;
      for (const type of entries(base)) {
        assert.ok(type.target & 0x80000000);assert.ok(type.id > previous);previous = type.id;
        for (const name of entries(base + (type.target & 0x7fffffff))) {
          assert.ok(name.target & 0x80000000);
          for (const language of entries(base + (name.target & 0x7fffffff))) {
            assert.equal(language.target & 0x80000000, 0);
            const leaf = base + language.target, at = offset(u32(leaf)), size = u32(leaf + 4);
            list.push({ type: type.id, id: name.id, language: language.id, data: bytes.slice(at, at + size) });
          }
        }
      }
      return list;
    },
    checkDirectories: () => {
      for (const d of directories)
        if (d.size) {
          const o = offset(d.rva);
          assert.ok(o + d.size <= bytes.length);
          const s = sections.find(
            (s) => d.rva >= s.rva && d.rva + d.size <= s.rva + s.virtualSize,
          );
          assert.ok(s);
        }
    },
    relocations,
    rebase: (base: bigint) => {
      const copy = bytes.slice();
      const view = new DataView(copy.buffer);
      for (const r of relocations()) {
        const o = offset(r);
        view.setBigUint64(o, u64(o) + base - u64(opt + 24), true);
      }
      return copy;
    },
  };
}
