export function buildRelocations(rvas: number[]): Uint8Array {
  const pages = new Map<number, number[]>();
  for (const rva of [...new Set(rvas)].sort((a, b) => a - b)) {
    const page = Math.floor(rva / 4096) * 4096;
    const entries = pages.get(page) ?? [];
    entries.push(0xa000 | (rva & 4095));
    pages.set(page, entries);
  }
  const bytes: number[] = [];
  const u32 = (n: number) => {
    for (let i = 0; i < 4; i++) bytes.push((n >>> (8 * i)) & 255);
  };
  for (const [page, entries] of pages) {
    if (entries.length % 2) entries.push(0);
    u32(page);
    u32(8 + entries.length * 2);
    for (const e of entries) bytes.push(e & 255, e >>> 8);
  }
  return Uint8Array.from(bytes);
}
