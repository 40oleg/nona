export type Reg =
  | "rax"
  | "rcx"
  | "rdx"
  | "rbx"
  | "rsp"
  | "rbp"
  | "rsi"
  | "rdi"
  | "r8"
  | "r9"
  | "r10"
  | "r11"
  | "r12"
  | "r13"
  | "r14"
  | "r15";
export type Xmm =
  `xmm${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15}`;
export type Mem =
  | { base: Reg; disp?: number }
  | { rip: string; addend?: number };
export type Condition =
  | "e"
  | "ne"
  | "l"
  | "le"
  | "g"
  | "ge"
  | "b"
  | "be"
  | "a"
  | "ae"
  | "p"
  | "np"
  | "s"
  | "ns"
  | "o"
  | "no";
const regs: Reg[] = [
  "rax",
  "rcx",
  "rdx",
  "rbx",
  "rsp",
  "rbp",
  "rsi",
  "rdi",
  "r8",
  "r9",
  "r10",
  "r11",
  "r12",
  "r13",
  "r14",
  "r15",
];
export function regCode(reg: Reg | Xmm): number {
  const n = reg.startsWith("xmm")
    ? Number(reg.slice(3))
    : regs.indexOf(reg as Reg);
  if (n < 0 || n > 15 || !Number.isInteger(n)) throw Error("Invalid register");
  return n;
}
export function checkedRel32(n: number): number {
  if (!Number.isInteger(n) || n < -0x80000000 || n > 0x7fffffff)
    throw Error("rel32 range exceeded");
  return n;
}
export function little(n: number | bigint, size: number): number[] {
  const value = BigInt.asUintN(size * 8, BigInt(n));
  return Array.from({ length: size }, (_, i) =>
    Number((value >> BigInt(i * 8)) & 255n),
  );
}
export function encodeMovRegImm32(reg: string, n: number): Uint8Array {
  const names = ["eax", "ecx", "edx", "ebx", "esp", "ebp", "esi", "edi"];
  const r = names.indexOf(reg);
  if (r < 0) throw Error("Invalid 32-bit register");
  return Uint8Array.from([0xb8 + r, ...little(n, 4)]);
}
export function encodeSubRsp(n: number): Uint8Array {
  checkedRel32(n);
  return Uint8Array.from(
    n >= -128 && n <= 127
      ? [0x48, 0x83, 0xec, ...little(n, 1)]
      : [0x48, 0x81, 0xec, ...little(n, 4)],
  );
}
