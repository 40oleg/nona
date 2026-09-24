import type { UnwindFunction } from "./model.js";
export function encodeUnwind(fn: UnwindFunction): Uint8Array {
  const n = fn.stackAllocation;
  if (!Number.isInteger(n) || n < 0 || n > 0xfffffff8 || n % 8)
    throw Error("Unwind allocation range");
  if (
    !Number.isInteger(fn.prologSize) ||
    fn.prologSize < 0 ||
    fn.prologSize > 255
  )
    throw Error("Unwind prologue range");
  const records: { offset: number; bytes: number[] }[] = [];
  const word = (n: number) => [n & 255, (n >>> 8) & 255];
  const add = (offset: number, bytes: number[]) => {
    if (!Number.isInteger(offset) || offset < 0 || offset > fn.prologSize)
      throw Error("Unwind code offset range");
    records.push({ offset, bytes: [offset, ...bytes] });
  };
  if (n) {
    const off = fn.allocationCodeOffset ?? (n <= 127 ? 4 : 7);
    if (n <= 128) add(off, [((n / 8 - 1) << 4) | 2]);
    else if (n <= 524280) add(off, [1, ...word(n / 8)]);
    else add(off, [0x11, ...word(n), ...word(Math.floor(n / 65536))]);
  }
  for (const s of fn.savedRegisters) {
    if (
      ![3, 5, 6, 7, 12, 13, 14, 15].includes(s.register) ||
      !Number.isInteger(s.stackOffset) ||
      s.stackOffset < 0 ||
      s.stackOffset % 8 ||
      s.stackOffset + 8 > n
    )
      throw Error("Invalid unwind register save");
    if (s.stackOffset <= 524280)
      add(s.codeOffset, [(s.register << 4) | 4, ...word(s.stackOffset / 8)]);
    else
      add(s.codeOffset, [
        (s.register << 4) | 5,
        ...word(s.stackOffset),
        ...word(Math.floor(s.stackOffset / 65536)),
      ]);
  }
  for (const p of fn.pushedRegisters ?? []) {
    if (![3, 5, 6, 7, 12, 13, 14, 15].includes(p.register))
      throw Error("Invalid pushed register");
    add(p.codeOffset, [p.register << 4]);
  }
  records.sort((a, b) => b.offset - a.offset);
  const codes = records.flatMap((r) => r.bytes);
  if (codes.length / 2 > 255) throw Error("Too many unwind codes");
  const bytes = [1, fn.prologSize, codes.length / 2, 0, ...codes];
  while (bytes.length % 4) bytes.push(0);
  return Uint8Array.from(bytes);
}
