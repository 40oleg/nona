import type { NativeProgram, NamedFragment } from "../machine/model.js";
import { checkedRel32 } from "../x64/encoder.js";
import { isArm64Relocation, relocateArm64 } from "../arm64/relocations.js";
import { linuxInterpreter } from "../../ffi.js";
import { writeFileSync } from "node:fs";

const align = (value: number, boundary: number) =>
    Math.ceil(value / boundary) * boundary;
const u32 = (value: number) => {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff)
        throw new RangeError("ELF32 field out of range");
    return value;
};
type Section = {
    name: NamedFragment["section"];
    offset: number;
    length: number;
    flags: number;
    fragments: { fragment: NamedFragment; offset: number }[];
};
export interface ElfOptions {
    machine?: "x64" | "arm64";
    os?: "linux" | "freebsd" | "openbsd";
    base?: number;
    /** ARM64 uses 64 KiB by default so the image also loads on 16/64 KiB kernels. */
    pageSize?: number;
    /** OpenBSD requires the exact addresses of native syscall instructions. */
    syscallPins?: readonly { symbol: string; offset: number; number: number }[];
}

/**
 * The loader structures of a dynamically linked executable, as fragments: the
 * interpreter path, symbol and string tables, a SysV hash table and GLOB_DAT
 * relocations in the read-only section; the dynamic section and one GOT cell
 * per import (named by the import symbol, so `call [rip+symbol]` reaches the
 * bound address) in the writable section. Pointers are va64 fixups, resolved
 * with everything else once the layout is known.
 */
function dynamicFragments(
    imports: NativeProgram["imports"],
    machine: "x64" | "arm64",
): NamedFragment[] {
    const encoder = new TextEncoder();
    const fragment = (
        name: string,
        section: NamedFragment["section"],
        bytes: Uint8Array,
        alignment: number,
        fixups: NamedFragment["fixups"] = [],
    ): NamedFragment => ({
        name,
        section,
        alignment,
        bytes,
        symbols: {},
        fixups,
    });
    const pointer = (offset: number, target: string) => ({
        offset,
        kind: "va64" as const,
        target,
        addend: 0,
    });
    const symbols = new Set<string>();
    for (const item of imports) {
        if (symbols.has(item.symbol))
            throw new Error(`Duplicate ELF import ${item.symbol}`);
        symbols.add(item.symbol);
        if (
            !/^[\x21-\x7e]+$/.test(item.dll) ||
            !/^[\x21-\x7e]+$/.test(item.name)
        )
            throw new Error(`Invalid ELF import ${item.dll}!${item.name}`);
    }
    const libraries = [...new Set(imports.map((item) => item.dll))];
    // The string table: library names, then symbol names.
    const strings: number[] = [0],
        stringOffsets = new Map<string, number>();
    const intern = (text: string) => {
        let offset = stringOffsets.get(text);
        if (offset === undefined) {
            offset = strings.length;
            strings.push(...encoder.encode(text), 0);
            stringOffsets.set(text, offset);
        }
        return offset;
    };
    libraries.forEach(intern);
    const dynsym = new Uint8Array(24 * (imports.length + 1)),
        symbolView = new DataView(dynsym.buffer);
    imports.forEach((item, index) => {
        const at = 24 * (index + 1);
        symbolView.setUint32(at, intern(item.name), true);
        dynsym[at + 4] = 0x12; // STB_GLOBAL, STT_FUNC; st_shndx SHN_UNDEF
    });
    // SysV hash: one bucket chaining every symbol (the loader skips undefined ones).
    const hash = new Uint8Array(4 * (2 + 1 + imports.length + 1)),
        hashView = new DataView(hash.buffer);
    hashView.setUint32(0, 1, true);
    hashView.setUint32(4, imports.length + 1, true);
    hashView.setUint32(8, imports.length ? 1 : 0, true);
    for (let index = 1; index < imports.length; index++)
        hashView.setUint32(12 + 4 * index, index + 1, true);
    const rela = new Uint8Array(24 * imports.length),
        relaView = new DataView(rela.buffer),
        globDat = machine === "arm64" ? 1025 : 6;
    const relaFixups = imports.map((item, index) => {
        relaView.setBigUint64(
            24 * index + 8,
            (BigInt(index + 1) << 32n) | BigInt(globDat),
            true,
        );
        return pointer(24 * index, item.symbol);
    });
    const entries: [number, number | bigint | string][] = [
        ...libraries.map((library): [number, number] => [1, intern(library)]),
        [4, "elf.hash"],
        [5, "elf.dynstr"],
        [6, "elf.dynsym"],
        [10, strings.length],
        [11, 24],
        [7, "elf.rela"],
        [8, rela.length],
        [9, 24],
        [24, 0], // DT_BIND_NOW: every symbol resolves before the entry runs
        [30, 8], // DT_FLAGS: DF_BIND_NOW
        [0x6ffffffb, 1], // DT_FLAGS_1: DF_1_NOW
        [0, 0],
    ];
    const dynamic = new Uint8Array(16 * entries.length),
        dynamicView = new DataView(dynamic.buffer),
        dynamicFixups: NamedFragment["fixups"] = [];
    entries.forEach(([tag, value], index) => {
        dynamicView.setBigUint64(16 * index, BigInt(tag), true);
        if (typeof value === "string")
            dynamicFixups.push(pointer(16 * index + 8, value));
        else dynamicView.setBigUint64(16 * index + 8, BigInt(value), true);
    });
    return [
        fragment(
            "elf.interp",
            ".rdata",
            encoder.encode(linuxInterpreter[machine] + "\0"),
            1,
        ),
        fragment("elf.dynsym", ".rdata", dynsym, 8),
        fragment("elf.dynstr", ".rdata", Uint8Array.from(strings), 1),
        fragment("elf.hash", ".rdata", hash, 8),
        fragment("elf.rela", ".rdata", rela, 8, relaFixups),
        fragment("elf.dynamic", ".data", dynamic, 8, dynamicFixups),
        ...imports.map((item) =>
            fragment(item.symbol, ".data", new Uint8Array(8), 8),
        ),
    ];
}

/** Link a fixed-address ELF64 executable (x86-64 or AArch64) from target-independent fragments.
 * Native imports must be replaced by Linux runtime shims before this linker runs;
 * the imports that remain are shared library functions, which make the image
 * dynamically linked (PT_INTERP, PT_DYNAMIC, DT_NEEDED, GOT relocations). An
 * image without them is static and identical to what earlier versions produced.
 */
export function linkElf(
    program: NativeProgram,
    options: ElfOptions = {},
): Uint8Array {
    const machine = options.machine ?? "x64",
        os = options.os ?? "linux";
    if (
        (machine !== "x64" && machine !== "arm64") ||
        !["linux", "freebsd", "openbsd"].includes(os)
    )
        throw new Error("Unsupported ELF target");
    if (os !== "linux" && machine !== "x64")
        throw new Error("Unsupported ELF target architecture");
    const dynamic = program.imports.length > 0;
    if (dynamic && os !== "linux")
        throw new Error("Shared library imports require a Linux ELF target");
    if (dynamic)
        program = {
            ...program,
            fragments: [
                ...program.fragments,
                ...dynamicFragments(program.imports, machine),
            ],
        };
    const page = options.pageSize ?? (machine === "arm64" ? 65536 : 4096),
        base = options.base ?? 0x400000;
    if (
        !Number.isInteger(page) ||
        page < 4096 ||
        page > 65536 ||
        page & (page - 1)
    )
        throw new Error("Invalid ELF page alignment");
    if (!Number.isSafeInteger(base) || base < 0 || base % page)
        throw new Error("Invalid ELF base alignment");
    if (options.syscallPins?.length && os !== "openbsd")
        throw new Error("ELF syscall pins require OpenBSD");
    const sections: Section[] = [];
    let next = page;
    for (const [name, flags] of [
        [".text", 5],
        [".rdata", 4],
        [".data", 6],
    ] as const) {
        const members = program.fragments.filter(
            (fragment) => fragment.section === name,
        );
        if (!members.length) continue;
        let length = 0;
        const fragments = members.map((fragment) => {
            const alignment = fragment.alignment ?? (name === ".text" ? 16 : 8);
            if (
                !Number.isInteger(alignment) ||
                alignment < 1 ||
                alignment > page ||
                alignment & (alignment - 1)
            )
                throw new Error("Invalid fragment alignment");
            length = align(length, alignment);
            const offset = length;
            length += fragment.bytes.length;
            return { fragment, offset };
        });
        sections.push({ name, offset: next, length, flags, fragments });
        next = align(next + Math.max(length, 1), page);
    }
    if (
        sections.reduce((sum, section) => sum + section.fragments.length, 0) !==
        program.fragments.length
    )
        throw new Error("Unsupported ELF section");
    if (!Number.isSafeInteger(base + next) || next > 0xffffffff)
        throw new RangeError("ELF address range exceeds exact representation");
    const symbols = new Map<string, number>();
    const put = (name: string, address: number) => {
        if (symbols.has(name)) throw new Error(`Duplicate symbol ${name}`);
        symbols.set(name, address);
    };
    for (const section of sections)
        for (const { fragment, offset } of section.fragments) {
            const address = base + section.offset + offset;
            put(fragment.name, address);
            for (const [label, position] of Object.entries(fragment.symbols)) {
                if (
                    !Number.isInteger(position) ||
                    position < 0 ||
                    position > fragment.bytes.length
                )
                    throw new Error("Symbol offset out of bounds");
                if (label !== fragment.name || position !== 0)
                    put(label, address + position);
            }
        }
    // NONA_ELF_MAP=<file>: write the symbol table as JSON, for profiling tools.
    if (process.env.NONA_ELF_MAP)
        writeFileSync(
            process.env.NONA_ELF_MAP,
            JSON.stringify(Object.fromEntries(symbols)),
        );
    const entry = symbols.get(program.entry);
    if (machine === "arm64" && entry !== undefined && entry % 4)
        throw new Error("ARM64 ELF entry is unaligned");
    const code = sections.find((section) => section.name === ".text");
    if (
        entry === undefined ||
        !code ||
        entry < base + code.offset ||
        entry >= base + code.offset + code.length
    )
        throw new Error("ELF entry is outside executable code");
    const pins = options.syscallPins ?? [];
    if (os === "openbsd" && !pins.length)
        throw new Error("OpenBSD ELF requires syscall locations");
    const pinOffset = next,
        pinSize = pins.length * 8;
    const image = new Uint8Array(next + pinSize),
        view = new DataView(image.buffer);
    for (const section of sections)
        for (const { fragment, offset } of section.fragments) {
            const file = section.offset + offset;
            image.set(fragment.bytes, file);
            for (const fixup of fragment.fixups) {
                const width = fixup.kind === "va64" ? 8 : 4;
                if (
                    !Number.isInteger(fixup.offset) ||
                    fixup.offset < 0 ||
                    fixup.offset + width > fragment.bytes.length
                )
                    throw new Error("Fixup out of bounds");
                if (!Number.isSafeInteger(fixup.addend))
                    throw new Error("Fixup addend out of range");
                const target = symbols.get(fixup.target);
                if (target === undefined)
                    throw new Error(`Unknown symbol ${fixup.target}`);
                const place = base + file + fixup.offset,
                    at = file + fixup.offset,
                    resolved = target + fixup.addend;
                if (!Number.isSafeInteger(resolved) || resolved < 0)
                    throw new RangeError("ELF relocation address out of range");
                if (fixup.kind === "rel32")
                    view.setInt32(at, checkedRel32(resolved - place - 4), true);
                else if (fixup.kind === "rva32")
                    view.setUint32(at, u32(resolved - base), true);
                else if (fixup.kind === "va64")
                    view.setBigUint64(at, BigInt(resolved), true);
                else if (isArm64Relocation(fixup.kind)) {
                    if (machine !== "arm64")
                        throw new Error(
                            "ARM64 relocation requires ARM64 architecture",
                        );
                    view.setUint32(
                        at,
                        relocateArm64(
                            fixup.kind,
                            view.getUint32(at, true),
                            place,
                            resolved,
                        ),
                        true,
                    );
                } else throw new Error("Unknown ELF fixup");
            }
        }
    for (const [index, pin] of pins.entries()) {
        const address = symbols.get(pin.symbol),
            resolved = address === undefined ? undefined : address + pin.offset;
        if (
            !Number.isInteger(pin.offset) ||
            pin.offset < 0 ||
            resolved === undefined ||
            !code ||
            resolved < base + code.offset ||
            resolved + 2 > base + code.offset + code.length ||
            !Number.isInteger(pin.number) ||
            pin.number <= 0 ||
            pin.number >= 65536
        )
            throw new Error("Invalid ELF syscall location");
        const instruction = resolved - base;
        if (image[instruction] !== 0x0f || image[instruction + 1] !== 0x05)
            throw new Error(
                "ELF syscall location is not a syscall instruction",
            );
        // ET_EXEC locations are absolute virtual addresses; the OpenBSD loader
        // subtracts its executable text base when constructing the pin table.
        view.setUint32(pinOffset + index * 8, u32(resolved), true);
        view.setUint32(pinOffset + index * 8 + 4, pin.number, true);
    }
    const headers =
        sections.length +
        1 +
        (pins.length ? 1 : 0) +
        (os === "openbsd" ? 1 : 0) +
        (dynamic ? 3 : 0);
    const noteOffset = 64 + 56 * headers;
    if (noteOffset + (os === "openbsd" ? 24 : 0) > page)
        throw new Error("ELF program headers exceed first page");
    image.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1], 0);
    image[7] = os === "freebsd" ? 9 : os === "openbsd" ? 12 : 0;
    view.setUint16(16, 2, true);
    view.setUint16(18, machine === "arm64" ? 183 : 62, true);
    view.setUint32(20, 1, true);
    view.setBigUint64(24, BigInt(entry), true);
    view.setBigUint64(32, 64n, true);
    view.setUint16(52, 64, true);
    view.setUint16(54, 56, true);
    view.setUint16(56, headers, true);
    const segment = (
        index: number,
        offset: number,
        length: number,
        flags: number,
    ) => {
        const at = 64 + index * 56;
        view.setUint32(at, 1, true);
        view.setUint32(at + 4, flags, true);
        view.setBigUint64(at + 8, BigInt(offset), true);
        view.setBigUint64(at + 16, BigInt(base + offset), true);
        view.setBigUint64(at + 24, BigInt(base + offset), true);
        view.setBigUint64(at + 32, BigInt(length), true);
        view.setBigUint64(at + 40, BigInt(length), true);
        view.setBigUint64(at + 48, BigInt(page), true);
    };
    // PT_INTERP precedes the loadable segments; PT_DYNAMIC follows them.
    const locate = (name: string) => {
        for (const section of sections)
            for (const { fragment, offset } of section.fragments)
                if (fragment.name === name)
                    return {
                        offset: section.offset + offset,
                        length: fragment.bytes.length,
                    };
        throw new Error(`Missing ELF fragment ${name}`);
    };
    const header = (
        index: number,
        type: number,
        flags: number,
        offset: number,
        length: number,
        alignment: number,
    ) => {
        const at = 64 + index * 56;
        view.setUint32(at, type, true);
        view.setUint32(at + 4, flags, true);
        view.setBigUint64(at + 8, BigInt(offset), true);
        view.setBigUint64(at + 16, BigInt(base + offset), true);
        view.setBigUint64(at + 24, BigInt(base + offset), true);
        view.setBigUint64(at + 32, BigInt(length), true);
        view.setBigUint64(at + 40, BigInt(length), true);
        view.setBigUint64(at + 48, BigInt(alignment), true);
    };
    const first = dynamic ? 1 : 0;
    if (dynamic) {
        const interp = locate("elf.interp");
        header(0, 3, 4, interp.offset, interp.length, 1);
    }
    segment(first, 0, page, 4);
    sections.forEach((section, index) =>
        segment(
            first + index + 1,
            section.offset,
            section.length,
            section.flags,
        ),
    );
    if (dynamic) {
        const table = locate("elf.dynamic");
        header(
            first + sections.length + 1,
            2,
            6,
            table.offset,
            table.length,
            8,
        );
        // PT_GNU_STACK: a non-executable stack, as the C library expects.
        const at = 64 + (first + sections.length + 2) * 56;
        view.setUint32(at, 0x6474e551, true);
        view.setUint32(at + 4, 6, true);
        view.setBigUint64(at + 48, 16n, true);
    }
    if (os === "openbsd") {
        // Released kernels validate the OpenBSD PT_NOTE before checking EI_OSABI.
        const at = 64 + (sections.length + 1) * 56;
        view.setUint32(at, 4, true);
        view.setUint32(at + 4, 4, true);
        view.setBigUint64(at + 8, BigInt(noteOffset), true);
        view.setBigUint64(at + 16, BigInt(base + noteOffset), true);
        view.setBigUint64(at + 32, 24n, true);
        view.setBigUint64(at + 40, 24n, true);
        view.setBigUint64(at + 48, 4n, true);
        view.setUint32(noteOffset, 8, true);
        view.setUint32(noteOffset + 4, 4, true);
        view.setUint32(noteOffset + 8, 1, true);
        image.set(new TextEncoder().encode("OpenBSD\0"), noteOffset + 12);
    }
    if (pins.length) {
        const at = 64 + (headers - 1) * 56;
        view.setUint32(at, 0x65a3dbe9, true);
        view.setUint32(at + 4, 4, true);
        view.setBigUint64(at + 8, BigInt(pinOffset), true);
        view.setBigUint64(at + 32, BigInt(pinSize), true);
        view.setBigUint64(at + 48, 4n, true);
    }
    return image;
}
