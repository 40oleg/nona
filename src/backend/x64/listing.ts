import type { Reg, Xmm, Mem } from "./encoder.js";

/** One listed instruction (or label) of a code fragment, at its byte offset. */
export interface ListingEntry {
  offset: number;
  text: string;
}

const gp: readonly string[] = ["rax", "rcx", "rdx", "rbx", "rsp", "rbp", "rsi", "rdi"];
/** The name of a general register at an operand width. */
function sized(reg: Reg, width: number): string {
  if (width === 64) return reg;
  const legacy = gp.indexOf(reg);
  if (legacy < 0) return reg + (width === 32 ? "d" : width === 16 ? "w" : "b");
  const base = reg.slice(1);
  if (width === 32) return "e" + base;
  if (width === 16) return base;
  return legacy < 4 ? base[0] + "l" : base + "l";
}
function number(value: number | bigint): string {
  const n = BigInt(value);
  if (n > -10n && n < 10n) return String(n);
  return n < 0n ? "-0x" + (-n).toString(16) : "0x" + n.toString(16);
}
function memory(m: Mem, size?: string): string {
  const prefix = size ? size + " " : "";
  if ("rip" in m) {
    const addend = m.addend ?? 0;
    return `${prefix}[rip+${m.rip}${addend ? (addend < 0 ? "-" : "+") + number(Math.abs(addend)) : ""}]`;
  }
  const disp = m.disp ?? 0;
  return `${prefix}[${m.base}${disp ? (disp < 0 ? "-" : "+") + number(Math.abs(disp)) : ""}]`;
}
const sizeName: Record<number, string> = { 8: "byte", 16: "word", 32: "dword", 64: "qword" };
function operand(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return number(value);
  if (value && typeof value === "object" && ("base" in value || "rip" in value)) return memory(value as Mem);
  if (value instanceof Uint8Array || Array.isArray(value))
    return Array.from(value as ArrayLike<number>, (b) => "0x" + b.toString(16).padStart(2, "0")).join(", ");
  return String(value);
}
function bytes(value: ArrayLike<number>): string {
  return Array.from(value, (b) => "0x" + b.toString(16).padStart(2, "0")).join(", ");
}

/** Intel-syntax text for one call of an Assembler method `name` with `args`. */
export function formatInstruction(name: string, args: readonly unknown[]): string {
  const [x, y, z] = args;
  switch (name) {
    case "label": return `${x as string}:`;
    case "emit": return "db " + bytes(x as ArrayLike<number>);
    case "load": {
      const width = (z as number | undefined) ?? 64;
      return width === 8 || width === 16
        ? `movzx ${sized(x as Reg, 32)}, ${memory(y as Mem, sizeName[width])}`
        : `mov ${sized(x as Reg, width)}, ${memory(y as Mem)}`;
    }
    case "loadSigned32": return `movsxd ${x as string}, ${memory(y as Mem, "dword")}`;
    case "store": {
      const width = (z as number | undefined) ?? 64;
      return `mov ${memory(x as Mem)}, ${sized(y as Reg, width)}`;
    }
    case "atomicExchange": return `xchg ${memory(x as Mem, sizeName[z as number])}, ${sized(y as Reg, z as number)}`;
    case "atomicXadd": return `lock xadd ${memory(x as Mem, sizeName[z as number])}, ${sized(y as Reg, z as number)}`;
    case "atomicCompareExchange": return `lock cmpxchg ${memory(x as Mem, sizeName[z as number])}, ${sized(y as Reg, z as number)}`;
    case "addMemory": return `add ${x as string}, ${memory(y as Mem)}`;
    case "subMemory": return `sub ${x as string}, ${memory(y as Mem)}`;
    case "cmpMemory": return `cmp ${x as string}, ${memory(y as Mem)}`;
    case "cmpByte": return `cmp ${memory(x as Mem, "byte")}, ${number(y as number)}`;
    case "storeByte": return `mov ${memory(x as Mem, "byte")}, ${number(y as number)}`;
    case "incrementMemory": return `inc ${memory(x as Mem, "qword")}`;
    case "prefetch": return `prefetcht0 ${memory(x as Mem)}`;
    case "jcc": return `j${x as string} ${y as string}`;
    case "callUnless": return `j${x as string} $+7 ; call ${y as string}`;
    case "mov": {
      if (typeof y === "string") return `mov ${x as string}, ${y}`;
      // The encodings Assembler.mov picks: zero-extended 32-bit, sign-extended 32-bit, movabs.
      const value = BigInt.asIntN(64, BigInt(y as number | bigint));
      if (value >= 0n && value <= 0xffffffffn) return `mov ${sized(x as Reg, 32)}, ${number(value)}`;
      return `${value >= -0x80000000n ? "mov" : "movabs"} ${x as string}, ${number(value)}`;
    }
    case "tailJump": return `jmp ${x as string}`;
    case "callImport": return `call ${memory({ rip: x as string })}`;
    case "callRegister": return `call ${x as string}`;
    case "jumpRegister": return `jmp ${x as string}`;
    case "setCondition": return `set${x as string} al ; movzx rax, al`;
    case "syscall": return `mov eax, ${number(x as number)} ; syscall`;
    case "signExtendRax": return "cqo";
    case "timestamp": return "rdtsc";
    case "mfence": return "mfence";
    case "repMovsb": return "rep movsb";
    case "repStosq": return "rep stosq";
    case "rel32": return `db ${typeof x === "number" ? number(x) : bytes(x as number[])} ; rel32 ${y as string}${z ? "+" + number(z as number) : ""}`;
    case "loadXmm128": return `movups ${x as Xmm}, ${memory(y as Mem, "xmmword")}`;
    case "storeXmm128": return `movups ${memory(x as Mem, "xmmword")}, ${y as Xmm}`;
    case "storesd": return `movsd ${memory(x as Mem, "qword")}, ${y as Xmm}`;
    case "movqToXmm":
    case "movqFromXmm": return `movq ${x as string}, ${y as string}`;
    default: return args.length ? `${name} ${args.map(operand).join(", ")}` : name;
  }
}

/**
 * The listing of a code fragment: labels on their own lines, instructions
 * with their offset and encoded bytes.
 */
export function renderListing(name: string, code: Uint8Array, listing: readonly ListingEntry[]): string {
  const lines = [`${name}:`];
  const instructions = listing.filter((entry) => !entry.text.endsWith(":"));
  let next = 0;
  for (const entry of listing) {
    if (entry.text.endsWith(":")) {
      lines.push(entry.text);
      continue;
    }
    while (next < instructions.length && instructions[next] !== entry) next++;
    const end = next + 1 < instructions.length ? instructions[next + 1]!.offset : code.length;
    const encoded = Array.from(code.subarray(entry.offset, end), (b) => b.toString(16).padStart(2, "0")).join(" ");
    lines.push(`  ${entry.offset.toString(16).padStart(6, "0")}  ${encoded.padEnd(30)} ${entry.text}`);
  }
  return lines.join("\n") + "\n";
}
