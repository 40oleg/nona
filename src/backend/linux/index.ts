import type { NativeProgram } from "../machine/model.js";
import { linkElf } from "../elf/writer.js";
import { linuxShims } from "./shims.js";
import { withNativeTarget } from "../machine/context.js";
import type { NativeArch } from "../../target.js";
import type { Assembler } from "../x64/assembler.js";
import { isFfiLibraryImport } from "../../ffi.js";

// Linux AArch64 uses the asm-generic syscall table. The runtime services
// retain their existing logical ABI; only the kernel boundary is adapted.
function arm64Call(a: Assembler, number: number): void {
    if (number === 2) {
        // open(path, flags, mode) -> openat(AT_FDCWD, path, flags, mode).
        a.mov("r10", "rdx");
        a.mov("rdx", "rsi");
        a.mov("rsi", "rdi");
        a.mov("rdi", -100);
        a.syscall(56);
        return;
    }
    const mapped = new Map([
        [1, 64],
        [3, 57],
        [9, 222],
        [10, 226],
        [11, 215],
        [35, 101],
        [39, 172],
        [56, 220],
        [60, 93],
        [202, 98],
        [228, 113],
        [231, 94],
    ]).get(number);
    if (mapped === undefined)
        throw new Error("Unadapted Linux ARM64 runtime syscall " + number);
    a.syscall(mapped);
}
/**
 * Windows API imports become runtime shims; shared library functions a
 * program declares through nona:ffi stay imports, which make the executable
 * dynamically linked (elf/writer.ts). Without them it stays static.
 */
export function linkLinux(
    program: NativeProgram,
    arch: NativeArch = "x64",
): Uint8Array {
    const libraries = program.imports.filter(isFfiLibraryImport),
        shimmed = program.imports.filter((item) => !isFfiLibraryImport(item));
    return withNativeTarget(`linux-${arch}`, () =>
        linkElf(
            {
                ...program,
                imports: libraries,
                fragments: [
                    ...program.fragments,
                    ...linuxShims(
                        shimmed,
                        arch === "arm64"
                            ? { syscall: arm64Call, pageSize: 65536 }
                            : {},
                    ),
                ],
            },
            { machine: arch },
        ),
    );
}
