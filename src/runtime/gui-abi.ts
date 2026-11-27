import { RuntimeBuilder, slot } from "./abi.js";
import type { Reg, Xmm } from "../backend/machine/context.js";

/** Private scalar GTK/Cairo calls. Public FFI declarations are unchanged.
 * Signatures use p for an integer/pointer and d for a double. Win64 assigns
 * registers by argument position; SysV has independent integer/vector banks.
 */
export function guiSystemCall(
    b: RuntimeBuilder,
    library: string,
    name: string,
    signature = "pppppp",
): void {
    if (
        !/^[pd]*$/.test(signature) ||
        [...signature].filter((t) => t === "p").length > 6 ||
        [...signature].filter((t) => t === "d").length > 8
    )
        throw new Error("Unsupported private GUI ABI signature: " + signature);
    b.bundle.imports.push({ dll: library, name, symbol: "gui.import." + name });
    // Win64 entry: RDI/RSI and XMM6..15 are nonvolatile, unlike SysV.
    // 216 = 8 mod 16. Outgoing SysV arguments all fit in registers; keep
    // runtime shadow space separate from the saved registers.
    const frame = 216 + Math.ceil((signature.length * 8) / 16) * 16;
    b.fn("gui.abi." + name, frame, (a) => {
        a.store(slot(32), "rdi");
        a.store(slot(40), "rsi");
        for (let i = 6; i < 16; i++)
            a.storeXmm128(slot(48 + 16 * (i - 6)), ("xmm" + i) as Xmm);
        const win: Reg[] = ["rcx", "rdx", "r8", "r9"];
        const sys: Reg[] = ["rdi", "rsi", "rdx", "rcx", "r8", "r9"];
        // Stage all inputs before moving either bank (including XMM overlap).
        [...signature].forEach((type, i) => {
            if (i < 4) {
                if (type === "d")
                    a.storesd(slot(208 + i * 8), ("xmm" + i) as Xmm);
                else a.store(slot(208 + i * 8), win[i]!);
            } else {
                a.load("rax", slot(frame + 40 + (i - 4) * 8));
                a.store(slot(208 + i * 8), "rax");
            }
        });
        let gp = 0,
            fp = 0;
        [...signature].forEach((type, i) => {
            if (type === "d") a.movsd(("xmm" + fp++) as Xmm, slot(208 + i * 8));
            else a.load(sys[gp++]!, slot(208 + i * 8));
        });
        a.mov("rax", fp); // SysV variadic vector-register count
        a.callImport("gui.import." + name);
        for (let i = 6; i < 16; i++)
            a.loadXmm128(("xmm" + i) as Xmm, slot(48 + 16 * (i - 6)));
        a.load("rdi", slot(32));
        a.load("rsi", slot(40));
    });
}
