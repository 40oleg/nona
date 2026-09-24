import type { ImportSymbol } from "./model.js";
export function buildImports(
  imports: ImportSymbol[],
  rva: number,
): {
  bytes: Uint8Array;
  symbols: Record<string, number>;
  descriptorSize: number;
  iatRva: number;
  iatSize: number;
} {
  const groups = new Map<string, ImportSymbol[]>();
  for (const entry of imports) {
    if (
      !/^[\x21-\x7e]+$/.test(entry.dll) ||
      !entry.name ||
      /[^\x20-\x7e]/.test(entry.name)
    )
      throw Error("Invalid import name");
    const key = entry.dll.toLowerCase();
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  if (!groups.size)
    return {
      bytes: new Uint8Array(),
      symbols: {},
      descriptorSize: 0,
      iatRva: 0,
      iatSize: 0,
    };
  const bytes: number[] = Array((groups.size + 1) * 20).fill(0);
  const reserve = (n: number, alignment = 1) => {
    while (bytes.length % alignment) bytes.push(0);
    const p = bytes.length;
    bytes.push(...Array(n).fill(0));
    return p;
  };
  const put = (p: number, n: number) => {
    for (let i = 0; i < 4; i++) bytes[p + i] = (n >>> (i * 8)) & 255;
  };
  const string = (s: string) => {
    const p = bytes.length;
    for (const c of s) bytes.push(c.charCodeAt(0));
    bytes.push(0);
    return p;
  };
  const entries = [...groups.values()].map((group) => ({
    group,
    ilt: reserve((group.length + 1) * 8, 8),
    iat: 0,
  }));
  const iatStart = reserve(0, 8);
  for (const e of entries) e.iat = reserve((e.group.length + 1) * 8, 8);
  const iatSize = bytes.length - iatStart;
  const symbols: Record<string, number> = Object.create(null) as Record<
    string,
    number
  >;
  entries.forEach((e, i) => {
    put(i * 20, e.ilt + rva);
    put(i * 20 + 12, string(e.group[0]!.dll) + rva);
    put(i * 20 + 16, e.iat + rva);
    e.group.forEach((imp, j) => {
      const hint = reserve(2, 2);
      string(imp.name);
      put(e.ilt + j * 8, hint + rva);
      put(e.iat + j * 8, hint + rva);
      if (Object.hasOwn(symbols, imp.symbol))
        throw Error(`Duplicate import symbol ${imp.symbol}`);
      symbols[imp.symbol] = rva + e.iat + j * 8;
    });
  });
  return {
    bytes: Uint8Array.from(bytes),
    symbols,
    descriptorSize: (groups.size + 1) * 20,
    iatRva: rva + iatStart,
    iatSize,
  };
}
