import {
  checkedRel32,
  little,
  regCode,
  type Reg,
  type Xmm,
  type Mem,
  type Condition,
} from "./encoder.js";
import type { CodeFragment, Fixup } from "../pe/model.js";
export type { Reg, Xmm, Mem, Condition } from "./encoder.js";
export type { CodeFragment, Fixup } from "../pe/model.js";
let serial = 0;
export class Assembler {
  private bytes: number[] = [];
  private fixups: Fixup[] = [];
  private symbols: Record<string, number> = Object.create(null) as Record<
    string,
    number
  >;
  private id = serial++;
  constructor(readonly name = "") {}
  get offset(): number {
    return this.bytes.length;
  }
  unique(prefix: string): string {
    return `${this.name || "asm"}$${this.id}$${prefix}$${serial++}`;
  }
  label(name: string): void {
    if (Object.hasOwn(this.symbols, name))
      throw Error(`Duplicate label ${name}`);
    this.symbols[name] = this.offset;
  }
  emit(bytes: number[] | Uint8Array): void {
    for (const b of bytes) {
      if (!Number.isInteger(b) || b < 0 || b > 255) throw Error("Invalid byte");
      this.bytes.push(b);
    }
  }
  finish(): CodeFragment {
    return {
      bytes: Uint8Array.from(this.bytes),
      fixups: this.fixups.map((x) => ({ ...x })),
      symbols: { ...this.symbols },
    };
  }
  rel32(opcode: number[] | number, target: string, addend = 0): void {
    this.emit(typeof opcode === "number" ? [opcode] : opcode);
    this.fixups.push({ offset: this.offset, target, addend, kind: "rel32" });
    this.emit([0, 0, 0, 0]);
  }
  private instruction(
    op: number[],
    r: number,
    rm: Reg | Xmm | Mem,
    w = true,
    prefix: number[] = [],
    forceRex = false,
  ): void {
    let b = 0;
    let tail: number[] = [];
    let rip: { rip: string; addend?: number } | undefined;
    if (typeof rm === "string") {
      b = regCode(rm);
      tail = [0xc0 | ((r & 7) << 3) | (b & 7)];
    } else if ("rip" in rm) {
      tail = [((r & 7) << 3) | 5, 0, 0, 0, 0];
      rip = rm;
    } else {
      b = regCode(rm.base);
      const d = rm.disp ?? 0;
      checkedRel32(d);
      const mod = d === 0 && (b & 7) !== 5 ? 0 : d >= -128 && d <= 127 ? 1 : 2;
      tail = [(mod << 6) | ((r & 7) << 3) | (b & 7)];
      if ((b & 7) === 4) tail.push(0x24);
      if (mod === 1) tail.push(...little(d, 1));
      if (mod === 2) tail.push(...little(d, 4));
    }
    this.emit(prefix);
    const rex = 0x40 | (w ? 8 : 0) | ((r >> 3) << 2) | (b >> 3);
    if (rex !== 0x40 || forceRex) this.emit([rex]);
    this.emit(op);
    const start = this.offset;
    this.emit(tail);
    if (rip)
      this.fixups.push({
        offset: start + 1,
        target: rip.rip,
        addend: rip.addend ?? 0,
        kind: "rel32",
      });
  }
  mov(dst: Reg, src: Reg | number | bigint): void {
    const d = regCode(dst);
    if (typeof src === "string") this.instruction([0x89], regCode(src), dst);
    else {
      this.emit([0x48 | (d >> 3), 0xb8 + (d & 7), ...little(src, 8)]);
    }
  }
  load(dst: Reg, src: Mem, width: 8 | 16 | 32 | 64 = 64): void {
    this.instruction(
      width === 8 ? [0x0f, 0xb6] : width === 16 ? [0x0f, 0xb7] : [0x8b],
      regCode(dst),
      src,
      width === 64,
    );
  }
  store(dst: Mem, src: Reg, width: 8 | 16 | 32 | 64 = 64): void {
    // A bare REX is required for SPL/BPL/SIL/DIL byte stores.
    if (
      width === 8 &&
      regCode(src) >= 4 &&
      regCode(src) < 8 &&
      ("rip" in dst || regCode(dst.base) < 8)
    )
      this.emit([0x40]);
    this.instruction(
      [width === 8 ? 0x88 : 0x89],
      regCode(src),
      dst,
      width === 64,
      width === 16 ? [0x66] : [],
    );
  }
  /** XCHG with a memory operand is implicitly locked on x64. */
  atomicExchange(dst: Mem, src: Reg, width: 8 | 16 | 32 | 64): void {
    const code = regCode(src);
    this.instruction([width === 8 ? 0x86 : 0x87], code, dst, width === 64,
      width === 16 ? [0x66] : [], width === 8 && code >= 4 && code < 8);
  }
  atomicXadd(dst: Mem, src: Reg, width: 8 | 16 | 32 | 64): void {
    const code = regCode(src);
    this.instruction([0x0f, width === 8 ? 0xc0 : 0xc1], code, dst, width === 64,
      width === 16 ? [0xf0, 0x66] : [0xf0], width === 8 && code >= 4 && code < 8);
  }
  /** RAX/AL/AX/EAX contains the expected value; the old value is returned there. */
  atomicCompareExchange(dst: Mem, src: Reg, width: 8 | 16 | 32 | 64): void {
    const code = regCode(src);
    this.instruction([0x0f, width === 8 ? 0xb0 : 0xb1], code, dst, width === 64,
      width === 16 ? [0xf0, 0x66] : [0xf0], width === 8 && code >= 4 && code < 8);
  }
  mfence(): void {
    this.emit([0x0f, 0xae, 0xf0]);
  }
  lea(dst: Reg, src: Mem): void {
    this.instruction([0x8d], regCode(dst), src);
  }
  private binary(
    dst: Reg,
    src: Reg | number,
    opcode: number,
    group: number,
  ): void {
    if (typeof src === "string") this.instruction([opcode], regCode(src), dst);
    else {
      checkedRel32(src);
      const small = src >= -128 && src <= 127;
      this.instruction([small ? 0x83 : 0x81], group, dst);
      this.emit(little(src, small ? 1 : 4));
    }
  }
  add(d: Reg, s: Reg | number): void {
    this.binary(d, s, 0x01, 0);
  }
  or(d: Reg, s: Reg | number): void {
    this.binary(d, s, 0x09, 1);
  }
  and(d: Reg, s: Reg | number): void {
    this.binary(d, s, 0x21, 4);
  }
  sub(d: Reg, s: Reg | number): void {
    this.binary(d, s, 0x29, 5);
  }
  xor(d: Reg, s: Reg | number): void {
    this.binary(d, s, 0x31, 6);
  }
  cmp(d: Reg, s: Reg | number): void {
    this.binary(d, s, 0x39, 7);
  }
  test(l: Reg, r: Reg): void {
    this.instruction([0x85], regCode(r), l);
  }
  private shift(d: Reg, c: number | "cl", g: number): void {
    if (c !== "cl" && (!Number.isInteger(c) || c < 0 || c > 63))
      throw Error("Invalid shift count");
    this.instruction([c === "cl" ? 0xd3 : 0xc1], g, d);
    if (c !== "cl") this.emit([c]);
  }
  shl(d: Reg, c: number | "cl"): void {
    this.shift(d, c, 4);
  }
  shr(d: Reg, c: number | "cl"): void {
    this.shift(d, c, 5);
  }
  sar(d: Reg, c: number | "cl"): void {
    this.shift(d, c, 7);
  }
  imul(d: Reg, s: Reg): void {
    this.instruction([0x0f, 0xaf], regCode(d), s);
  }
  mul(s: Reg): void {
    this.instruction([0xf7], 4, s);
  }
  div(s: Reg): void {
    this.instruction([0xf7], 6, s);
  }
  idiv(s: Reg): void {
    this.instruction([0xf7], 7, s);
  }
  neg(r: Reg): void {
    this.instruction([0xf7], 3, r);
  }
  not(r: Reg): void {
    this.instruction([0xf7], 2, r);
  }
  push(r: Reg): void {
    const n = regCode(r);
    this.emit([...(n >= 8 ? [0x41] : []), 0x50 + (n & 7)]);
  }
  pop(r: Reg): void {
    const n = regCode(r);
    this.emit([...(n >= 8 ? [0x41] : []), 0x58 + (n & 7)]);
  }
  ret(): void {
    this.emit([0xc3]);
  }
  jmp(s: string): void {
    this.rel32(0xe9, s);
  }
  call(s: string): void {
    this.rel32(0xe8, s);
  }
  jumpRegister(register:Reg):void {this.instruction([0xff],4,register,false);}
  loadXmm128(d:Xmm,s:Mem):void {this.instruction([0x0f,0x10],regCode(d),s,false);}
  storeXmm128(d:Mem,s:Xmm):void {this.instruction([0x0f,0x11],regCode(s),d,false);}
  callRegister(register:Reg):void {
    this.instruction([0xff],2,register,false);
  }
  callImport(s: string): void {
    this.rel32([0xff, 0x15], s);
  }
  jcc(c: Condition, s: string): void {
    const cc: Record<Condition, number> = {
      o: 0,
      no: 1,
      b: 2,
      ae: 3,
      e: 4,
      ne: 5,
      be: 6,
      a: 7,
      s: 8,
      ns: 9,
      p: 10,
      np: 11,
      l: 12,
      ge: 13,
      le: 14,
      g: 15,
    };
    this.rel32([0x0f, 0x80 + cc[c]], s);
  }
  private sse(d: Xmm, s: Xmm | Mem, op: number, prefix = 0xf2): void {
    this.instruction([0x0f, op], regCode(d), s, false, [prefix]);
  }
  movsd(d: Xmm, s: Xmm | Mem): void {
    this.sse(d, s, 0x10);
  }
  storesd(d: Mem, s: Xmm): void {
    this.instruction([0x0f, 0x11], regCode(s), d, false, [0xf2]);
  }
  addsd(d: Xmm, s: Xmm | Mem): void {
    this.sse(d, s, 0x58);
  }
  subsd(d: Xmm, s: Xmm | Mem): void {
    this.sse(d, s, 0x5c);
  }
  mulsd(d: Xmm, s: Xmm | Mem): void {
    this.sse(d, s, 0x59);
  }
  divsd(d: Xmm, s: Xmm | Mem): void {
    this.sse(d, s, 0x5e);
  }
  sqrtsd(d: Xmm, s: Xmm | Mem): void {
    this.sse(d, s, 0x51);
  }
  cvtsd2ss(d: Xmm, s: Xmm | Mem): void {
    this.sse(d, s, 0x5a);
  }
  cvtss2sd(d: Xmm, s: Xmm | Mem): void {
    this.sse(d, s, 0x5a, 0xf3);
  }
  ucomisd(d: Xmm, s: Xmm | Mem): void {
    this.sse(d, s, 0x2e, 0x66);
  }
  cvtsi2sd(d: Xmm, s: Reg): void {
    this.instruction([0x0f, 0x2a], regCode(d), s, true, [0xf2]);
  }
  cvttsd2si(d: Reg, s: Xmm): void {
    this.instruction([0x0f, 0x2c], regCode(d), s, true, [0xf2]);
  }
  movqToXmm(d: Xmm, s: Reg): void {
    this.instruction([0x0f, 0x6e], regCode(d), s, true, [0x66]);
  }
  movqFromXmm(d: Reg, s: Xmm): void {
    this.instruction([0x0f, 0x7e], regCode(s), d, true, [0x66]);
  }
  /** Copies RCX bytes from [RSI] to [RDI], advancing both. */
  repMovsb(): void {
    this.emit([0xf3, 0xa4]);
  }
  /** Stores RAX to RCX quadwords at [RDI], advancing it. */
  repStosq(): void {
    this.emit([0xf3, 0x48, 0xab]);
  }
}
