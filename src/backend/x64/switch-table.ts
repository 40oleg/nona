import type { Assembler, Mem } from "./assembler.js";
import type { NamedFragment } from "../machine/model.js";
import type { Terminator } from "../../ir/model.js";

/**
 * The jump table of a dense integer switch (#241, IR terminator "switch"):
 * a Number holding an int32 v with low <= v < low + targets.length jumps
 * through `table` (one address per entry, in .rdata) to its case; any other
 * value (another tag, a fraction, NaN, out of range) jumps to `otherwise`.
 * -0 converts to 0, as -0 === 0 requires. Clobbers RAX, R11, XMM0 and XMM1.
 */
export function emitSwitchTable(
    a: Assembler,
    fragments: NamedFragment[],
    fn: string,
    block: number,
    term: Extract<Terminator, { kind: "switch" }>,
    operand: { tag: Mem; payload: Mem },
): void {
    const label = (id: number) => fn + ".block." + id,
        table = `${fn}.switch.${block}`,
        otherwise = label(term.otherwise),
        targets = term.targets.map(label),
        low = term.low;
    a.load("rax", operand.tag);
    a.cmp("rax", 3);
    a.jcc("ne", otherwise);
    a.movsd("xmm0", operand.payload);
    a.cvttsd2si("rax", "xmm0");
    a.cvtsi2sd("xmm1", "rax");
    a.ucomisd("xmm1", "xmm0");
    a.jcc("p", otherwise);
    a.jcc("ne", otherwise);
    if (low !== 0) a.sub("rax", low);
    a.mov("r11", targets.length);
    a.cmp("rax", "r11");
    a.jcc("ae", otherwise);
    a.shl("rax", 3);
    a.lea("r11", { rip: table });
    a.add("r11", "rax");
    a.load("r11", { base: "r11" });
    a.jumpRegister("r11");
    fragments.push({
        name: table,
        section: ".rdata",
        alignment: 8,
        bytes: new Uint8Array(8 * targets.length),
        symbols: {},
        fixups: targets.map((target, index) => ({
            offset: 8 * index,
            kind: "va64",
            target,
            addend: 0,
        })),
    });
}
