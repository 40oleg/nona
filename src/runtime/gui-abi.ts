import { RuntimeBuilder, slot } from "./abi.js";
import type { Xmm } from "../backend/machine/context.js";

/** Private integer/pointer-only GTK calls. Public FFI declarations are unchanged. */
export function guiSystemCall(b: RuntimeBuilder, library: string, name: string): void {
    b.bundle.imports.push({ dll: library, name, symbol: "gui.import." + name });
    // Win64 entry: RDI/RSI and XMM6..15 are nonvolatile, unlike SysV.
    // 216 = 8 mod 16. Outgoing SysV arguments all fit in registers; keep
    // runtime shadow space separate from the saved registers.
    b.fn("gui.abi." + name, 216, (a) => {
        a.store(slot(32), "rdi");
        a.store(slot(40), "rsi");
        for (let i = 6; i < 16; i++)
            a.storeXmm128(slot(48 + 16 * (i - 6)), ("xmm" + i) as Xmm);
        a.mov("rdi", "rcx");
        a.mov("rsi", "rdx");
        a.mov("rdx", "r8");
        a.mov("rcx", "r9");
        a.load("r8", slot(216 + 40));
        a.load("r9", slot(216 + 48));
        a.mov("rax", 0); // no vector arguments (including variadic AL convention)
        a.callImport("gui.import." + name);
        for (let i = 6; i < 16; i++)
            a.loadXmm128(("xmm" + i) as Xmm, slot(48 + 16 * (i - 6)));
        a.load("rdi", slot(32));
        a.load("rsi", slot(40));
    });
}
