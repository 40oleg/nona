import {
    currentNativeTarget,
    type Assembler,
    type NativeArgumentKind,
    type Reg,
    type Xmm,
} from "../backend/machine/context.js";
import { RuntimeBuilder, slot, failIf } from "./abi.js";
import {
    ObjectLayout as O,
    PropertyLayout as P,
    PropertyAttributes as A,
} from "./object-layout.js";
import { FunctionLayout, FunctionKind } from "./functions.js";
import { ArrayBufferKind, ArrayBufferLayout } from "./array-buffer.js";
import { SharedArrayBufferKind } from "./shared-array-buffer.js";
import { TypedArrayKind, TypedArrayLayout } from "./typed-array.js";
import { DataViewKind } from "./data-view.js";
import { stringLiteral } from "./value.js";
import {
    parseFfiSignature,
    ffiImportSymbol,
    ffiIntegerTypes,
    ffiErrnoImport,
    ffiErrnoSymbol,
    isFfiLibraryImport,
    type FfiDeclaration,
    type FfiType,
} from "../ffi.js";

const integerTypes = new Set<string>(ffiIntegerTypes);
const gp: Reg[] = ["rcx", "rdx", "r8", "r9"];
const xmm: Xmm[] = ["xmm0", "xmm1", "xmm2", "xmm3"];
/** SysV AMD64 argument registers (Linux and macOS on x86-64). */
const sysvGp: Reg[] = ["rdi", "rsi", "rdx", "rcx", "r8", "r9"];
const sysvXmm: Xmm[] = [
    "xmm0",
    "xmm1",
    "xmm2",
    "xmm3",
    "xmm4",
    "xmm5",
    "xmm6",
    "xmm7",
];
/**
 * How a thunk reaches its import: the Win64 ABI (Windows, and the logical ABI
 * of the runtime's own shims and system calls), the SysV AMD64 ABI, or the
 * AAPCS64 bridge of the ARM64 assembler (callImport marshals the logical
 * registers to x0-x7/d0-d7 and the native stack).
 */
type Convention = "win64" | "sysv" | "aapcs64";
const isFloat = (type: FfiType) => type === "f32" || type === "f64";
/** The argument kind the assembler's native call bridge needs (sizes matter on Apple ARM64). */
function argumentKind(type: FfiType): NativeArgumentKind {
    switch (type) {
        case "f32":
        case "f64":
            return type;
        case "i8":
        case "u8":
            return "i8";
        case "i16":
        case "u16":
            return "i16";
        case "i32":
        case "u32":
        case "bool":
            return "i32";
        default:
            return "gp";
    }
}

/**
 * Native thunks for nona:ffi declarations. Each declaration N gets:
 * - `ffi.N.fn`: a static function object whose code is `ffi.N.code`;
 * - `ffi.N.get`: returns that function as a Value (the lowered define() call);
 * - `ffi.N.code`: converts the JS arguments, calls the import through the
 *   Win64 ABI, captures GetLastError and converts the result.
 * The thunk never allocates on the managed heap, so argument Values stay
 * valid without GC roots; strings are copied to temporary process-heap buffers.
 */
export function emitFfi(
    declarations: FfiDeclaration[],
    options: { prefix?: string; support?: boolean } = {},
): RuntimeBuilder {
    const b = new RuntimeBuilder(),
        prefix = options.prefix ?? "ffi";
    if (options.support ?? true) {
        b.bundle.imports.push({
            dll: "KERNEL32.dll",
            name: "GetLastError",
            symbol: "GetLastError",
        });
        b.data("rt.ffiLastError", new Uint8Array(8), ".data");
        // __nonaFfiLastError(): the error code captured after the most recent FFI call.
        b.fn("rt.ffiLastError.code", 40, (a) => {
            a.load("rax", { rip: "rt.ffiLastError" }, 32);
            a.cvtsi2sd("xmm0", "rax");
            a.mov("rax", 3);
            a.store({ base: "rcx" }, "rax");
            a.storesd({ base: "rcx", disp: 8 }, "xmm0");
        });
    }
    const imported = new Set<string>();
    // Host declarations exist for both targets in every image: the imports of the
    // other target resolve to this stub (ENOSYS / NULL).
    if (prefix !== "ffi")
        b.fn(prefix + ".unavailable", 40, (a) => a.mov("rax", 0));
    // Program declarations of shared library functions on Linux and macOS are
    // called through the C ABI of the target; errno is read after each call.
    const target = currentNativeTarget(),
        errno = target === undefined ? undefined : ffiErrnoImport(target),
        library = (d: FfiDeclaration) =>
            prefix === "ffi" &&
            errno !== undefined &&
            isFfiLibraryImport({ dll: d.dll, symbol: ffiImportSymbol(d) });
    if (declarations.some(library)) b.bundle.imports.push(errno!);
    declarations.forEach((declaration, index) => {
        const signature = parseFfiSignature(declaration.signature),
            symbol = prefix + ffiImportSymbol(declaration).slice(3),
            convention: Convention = !library(declaration)
                ? "win64"
                : target!.endsWith("-x64")
                  ? "sysv"
                  : "aapcs64";
        if (!imported.has(symbol)) {
            imported.add(symbol);
            b.bundle.imports.push({
                dll: declaration.dll,
                name: declaration.name,
                symbol,
            });
            if (declaration.dll === "syscall") {
                if (signature.parameters.length > 6)
                    throw new Error("System calls take at most six arguments");
                if (currentNativeTarget() === "win32-arm64")
                    b.fn("linux." + symbol + ".code", 40, (a) =>
                        a.mov("rax", 0),
                    );
                else
                    syscallStub(
                        b,
                        "linux." + symbol + ".code",
                        Number(declaration.name),
                    );
            } else if (prefix !== "ffi")
                b.fn("linux." + symbol + ".code", 40, (a) => a.mov("rax", 0));
        }
        const base = prefix + "." + index;
        functionObject(b, base, declaration.name, signature.parameters.length);
        b.fn(base + ".get", 40, (a) => {
            a.mov("rax", 5);
            a.store({ base: "rcx" }, "rax");
            a.lea("rax", { rip: base + ".fn" });
            a.store({ base: "rcx", disp: 8 }, "rax");
        });
        thunk(
            b,
            base + ".code",
            symbol,
            signature.parameters,
            signature.result,
            convention,
        );
    });
    return b;
}

/** Target kernel call with logical Win64 arguments and negative errno results. */
function syscallStub(b: RuntimeBuilder, name: string, number: number): void {
    const target = currentNativeTarget(),
        darwin = target?.startsWith("darwin-"),
        carryError =
            darwin ||
            target?.startsWith("freebsd-") ||
            target?.startsWith("openbsd-");
    b.fn(name, 56, (a) => {
        a.store(slot(40), "rsi");
        a.store(slot(48), "rdi");
        a.mov("rdi", "rcx");
        a.mov("rsi", "rdx");
        a.mov("rdx", "r8");
        a.mov("r10", "r9");
        // Arguments 5 and 6 above the return address and the caller's shadow space.
        a.load("r8", slot(56 + 40));
        a.load("r9", slot(56 + 48));
        a.syscall(darwin ? 0x2000000 + number : number);
        if (carryError) {
            const done = a.unique("syscallDone");
            a.jcc("ae", done);
            a.neg("rax");
            a.label(done);
        }
        a.load("rsi", slot(40));
        a.load("rdi", slot(48));
    });
}

function functionObject(
    b: RuntimeBuilder,
    base: string,
    name: string,
    length: number,
): void {
    const fragments = b.bundle.fragments;
    fragments.push(
        stringLiteral(base + ".key", name),
        stringLiteral(base + ".source", `function ${name}() { [native code] }`),
    );
    const callable = new Uint8Array(FunctionLayout.size);
    callable[O.kind] = FunctionKind;
    callable[FunctionLayout.rawThis] = 1;
    const lengthProperty = new Uint8Array(P.size);
    lengthProperty[P.value] = 3;
    lengthProperty[P.attributes] = A.configurable;
    new DataView(lengthProperty.buffer).setFloat64(P.value + 8, length, true);
    fragments.push({
        name: base + ".length",
        section: ".data",
        alignment: 8,
        bytes: lengthProperty,
        symbols: {},
        fixups: [
            { offset: P.key, kind: "va64", target: "rt.str.length", addend: 0 },
        ],
    });
    const nameProperty = new Uint8Array(P.size);
    nameProperty[P.value] = 4;
    nameProperty[P.attributes] = A.configurable;
    fragments.push({
        name: base + ".name",
        section: ".data",
        alignment: 8,
        bytes: nameProperty,
        symbols: {},
        fixups: [
            {
                offset: P.next,
                kind: "va64",
                target: base + ".length",
                addend: 0,
            },
            { offset: P.key, kind: "va64", target: "rt.str.name", addend: 0 },
            {
                offset: P.value + 8,
                kind: "va64",
                target: base + ".key",
                addend: 0,
            },
        ],
    });
    fragments.push({
        name: base + ".fn",
        section: ".data",
        alignment: 8,
        bytes: callable,
        symbols: {},
        fixups: [
            {
                offset: O.properties,
                kind: "va64",
                target: base + ".name",
                addend: 0,
            },
            {
                offset: O.prototype,
                kind: "va64",
                target: "rt.functionPrototype",
                addend: 0,
            },
            {
                offset: FunctionLayout.code,
                kind: "va64",
                target: base + ".code",
                addend: 0,
            },
            {
                offset: FunctionLayout.sourceText,
                kind: "va64",
                target: base + ".source",
                addend: 0,
            },
        ],
    });
}

function thunk(
    b: RuntimeBuilder,
    name: string,
    symbol: string,
    parameters: FfiType[],
    result: FfiType,
    convention: Convention,
): void {
    const n = parameters.length;
    // Outgoing stack arguments (at least four for WideCharToMultiByte), then locals.
    const L = 32 + 8 * Math.max(4, n - 4);
    const OUT = L,
        ARGC = L + 8,
        ARGV = L + 16,
        RESULT = L + 24,
        RESULT_XMM = L + 32,
        ARGS = L + 40,
        TEMPS = ARGS + 8 * n,
        // SysV: RSI, RDI and XMM6-XMM15 are volatile in the callee but preserved
        // by the logical ABI of the thunk's caller.
        SAVES = TEMPS + 8 * n,
        saveBytes = convention === "sysv" ? 16 + 10 * 16 : 0;
    const frame = Math.ceil((SAVES + saveBytes + 8) / 16) * 16 - 8;
    b.fn(name, frame, (a) => {
        a.store(slot(OUT), "rcx");
        a.store(slot(ARGC), "rdx");
        a.store(slot(ARGV), "r8");
        a.mov("rax", 0);
        for (let i = 0; i < n; i++) a.store(slot(TEMPS + 8 * i), "rax");
        // Pass 1: type checks and conversions. Nothing is allocated yet, so a
        // TypeError leaves no temporary buffers behind.
        parameters.forEach((type, i) => {
            const have = a.unique("have"),
                store = a.unique("store"),
                zero = a.unique("zero");
            a.lea("r10", { rip: "rt.undefinedValue" });
            a.load("rax", slot(ARGC));
            a.cmp("rax", i);
            a.jcc("be", have);
            a.load("r10", slot(ARGV));
            a.add("r10", 16 * i);
            a.label(have);
            a.load("r11", { base: "r10" });
            if (integerTypes.has(type)) {
                const notNumber = a.unique("notNumber"),
                    notBoolean = a.unique("notBoolean");
                a.cmp("r11", 3);
                a.jcc("ne", notNumber);
                a.movsd("xmm0", { base: "r10", disp: 8 });
                a.cvttsd2si("rax", "xmm0");
                a.jmp(store);
                a.label(notNumber);
                a.cmp("r11", 2);
                a.jcc("ne", notBoolean);
                a.load("rax", { base: "r10", disp: 8 });
                a.jmp(store);
                a.label(notBoolean);
                if (type === "ptr") {
                    a.cmp("r11", 1);
                    a.jcc("be", zero);
                }
                a.call("rt.throwTypeError");
            } else if (type === "f32" || type === "f64") {
                a.cmp("r11", 3);
                failIf(a, "ne", "rt.throwTypeError");
                a.movsd("xmm0", { base: "r10", disp: 8 });
                if (type === "f32") a.cvtsd2ss("xmm0", "xmm0");
                a.storesd(slot(ARGS + 8 * i), "xmm0");
                a.jmp(store + ".done");
            } else if (type === "wstr" || type === "str") {
                a.cmp("r11", 1);
                a.jcc("be", zero);
                a.cmp("r11", 4);
                failIf(a, "ne", "rt.throwTypeError");
                a.load("rax", { base: "r10", disp: 8 });
                a.jmp(store);
            } else if (type === "buf") {
                const view = a.unique("view"),
                    buffer = a.unique("buffer");
                a.cmp("r11", 1);
                a.jcc("be", zero);
                a.cmp("r11", 5);
                failIf(a, "ne", "rt.throwTypeError");
                a.load("r11", { base: "r10", disp: 8 });
                a.load("rax", { base: "r11", disp: O.kind });
                a.cmp("rax", ArrayBufferKind);
                a.jcc("e", buffer);
                a.cmp("rax", SharedArrayBufferKind);
                a.jcc("e", buffer);
                a.cmp("rax", TypedArrayKind);
                a.jcc("e", view);
                a.cmp("rax", DataViewKind);
                failIf(a, "ne", "rt.throwTypeError");
                // TypedArray and DataView share the buffer/byteOffset layout.
                a.label(view);
                a.load("r9", { base: "r11", disp: TypedArrayLayout.buffer });
                a.load("rax", { base: "r9", disp: ArrayBufferLayout.detached });
                a.test("rax", "rax");
                failIf(a, "ne", "rt.throwTypeError");
                a.load("rax", { base: "r9", disp: ArrayBufferLayout.bytes });
                a.load("r9", {
                    base: "r11",
                    disp: TypedArrayLayout.byteOffset,
                });
                a.add("rax", "r9");
                a.jmp(store);
                a.label(buffer);
                a.load("rax", {
                    base: "r11",
                    disp: ArrayBufferLayout.detached,
                });
                a.test("rax", "rax");
                failIf(a, "ne", "rt.throwTypeError");
                a.load("rax", { base: "r11", disp: ArrayBufferLayout.bytes });
                a.jmp(store);
            } else throw new Error("Unsupported FFI parameter type " + type);
            a.label(zero);
            a.mov("rax", 0);
            a.label(store);
            // The C ABIs of Linux and macOS leave the upper bits of a narrow
            // integer argument to the caller (Apple ARM64 requires the
            // extension to 32 bits; a stack slot holds the extended value).
            if (convention !== "win64") extendInteger(a, type);
            a.store(slot(ARGS + 8 * i), "rax");
            a.label(store + ".done");
        });
        // Pass 2: NUL-terminated copies of string arguments.
        parameters.forEach((type, i) => {
            if (type === "wstr") wideCopy(a, ARGS + 8 * i, TEMPS + 8 * i);
            if (type === "str") utf8Copy(a, ARGS + 8 * i, TEMPS + 8 * i);
        });
        if (convention === "sysv")
            sysvCall(a, symbol, parameters, {
                ARGS,
                RESULT,
                RESULT_XMM,
                SAVES,
            });
        else {
            // Pass 3: Win64 argument registers and stack slots (the ARM64
            // assembler's callImport bridges them to AAPCS64).
            for (let i = 4; i < n; i++) {
                a.load("rax", slot(ARGS + 8 * i));
                a.store(slot(32 + 8 * (i - 4)), "rax");
            }
            for (let i = 0; i < Math.min(4, n); i++) {
                const type = parameters[i]!;
                if (isFloat(type)) a.movsd(xmm[i]!, slot(ARGS + 8 * i));
                else a.load(gp[i]!, slot(ARGS + 8 * i));
            }
            a.callImport(
                symbol,
                parameters.map((type) =>
                    convention === "aapcs64"
                        ? argumentKind(type)
                        : isFloat(type)
                          ? type
                          : "gp",
                ),
            );
            a.store(slot(RESULT), "rax");
            a.storesd(slot(RESULT_XMM), "xmm0");
            if (convention === "aapcs64") {
                // errno, before any other library call changes it.
                a.callImport(ffiErrnoSymbol, []);
                a.load("rax", { base: "rax" }, 32);
            } else a.callImport("GetLastError");
            a.store({ rip: "rt.ffiLastError" }, "rax", 32);
        }
        parameters.forEach((type, i) => {
            if (type !== "wstr" && type !== "str") return;
            const skip = a.unique("free");
            a.load("r8", slot(TEMPS + 8 * i));
            a.test("r8", "r8");
            a.jcc("e", skip);
            a.load("rcx", { rip: "rt.heap" });
            a.mov("rdx", 0);
            a.callImport("HeapFree");
            a.label(skip);
        });
        convertResult(a, result, OUT, RESULT, RESULT_XMM);
    });
}

/** Sign- or zero-extend the integer in RAX to 64 bits according to its C type. */
function extendInteger(a: Assembler, type: FfiType): void {
    const narrow: Partial<Record<FfiType, [number, boolean]>> = {
        i8: [56, true],
        i16: [48, true],
        i32: [32, true],
        bool: [32, true],
        u8: [56, false],
        u16: [48, false],
        u32: [32, false],
    };
    const width = narrow[type];
    if (!width) return;
    a.shl("rax", width[0]);
    if (width[1]) a.sar("rax", width[0]);
    else a.shr("rax", width[0]);
}

/**
 * Call a C function through the SysV AMD64 ABI: integer and pointer arguments
 * in RDI, RSI, RDX, RCX, R8, R9, floating-point arguments in XMM0-XMM7, the
 * rest on the stack in order; RSP is 16-byte aligned at the call (the
 * runtime's own alignment depends on the platform entry) and AL holds the
 * number of vector registers used, as variadic callees expect. The result and
 * errno are stored into the thunk frame, which R11 addresses while RSP is
 * realigned; the 128-byte red zone below the realigned RSP holds nothing of ours.
 */
function sysvCall(
    a: Assembler,
    symbol: string,
    parameters: FfiType[],
    at: { ARGS: number; RESULT: number; RESULT_XMM: number; SAVES: number },
): void {
    const registers: { index: number; register: Reg | Xmm }[] = [],
        stack: number[] = [];
    let gpUsed = 0,
        fpUsed = 0;
    parameters.forEach((type, index) => {
        if (isFloat(type)) {
            if (fpUsed < sysvXmm.length)
                registers.push({ index, register: sysvXmm[fpUsed++]! });
            else stack.push(index);
        } else if (gpUsed < sysvGp.length)
            registers.push({ index, register: sysvGp[gpUsed++]! });
        else stack.push(index);
    });
    const outgoing = Math.ceil((8 * stack.length) / 16) * 16;
    a.store(slot(at.SAVES), "rsi");
    a.store(slot(at.SAVES + 8), "rdi");
    for (let i = 6; i < 16; i++)
        a.storeXmm128(slot(at.SAVES + 16 + 16 * (i - 6)), ("xmm" + i) as Xmm);
    // R11 = the thunk frame; RSP = an aligned area holding the stack arguments
    // and, above them, the frame pointer to restore.
    a.mov("r11", "rsp");
    a.sub("rsp", outgoing + 16);
    a.and("rsp", -16);
    a.store(slot(outgoing), "r11");
    stack.forEach((index, position) => {
        a.load("rax", { base: "r11", disp: at.ARGS + 8 * index });
        a.store(slot(8 * position), "rax");
    });
    for (const { index, register } of registers) {
        const source = { base: "r11" as const, disp: at.ARGS + 8 * index };
        if (register.startsWith("xmm")) a.movsd(register as Xmm, source);
        else a.load(register as Reg, source);
    }
    a.mov("rax", fpUsed);
    a.callImport(symbol, parameters.map(argumentKind));
    a.load("r11", slot(outgoing));
    a.store({ base: "r11", disp: at.RESULT }, "rax");
    a.storesd({ base: "r11", disp: at.RESULT_XMM }, "xmm0");
    // errno, before any other library call changes it (RSP is still aligned).
    a.callImport(ffiErrnoSymbol, []);
    a.load("rax", { base: "rax" }, 32);
    a.store({ rip: "rt.ffiLastError" }, "rax", 32);
    a.load("rsp", slot(outgoing));
    for (let i = 6; i < 16; i++)
        a.loadXmm128(("xmm" + i) as Xmm, slot(at.SAVES + 16 + 16 * (i - 6)));
    a.load("rsi", slot(at.SAVES));
    a.load("rdi", slot(at.SAVES + 8));
}

function allocate(a: Assembler, bytes: Reg): void {
    a.mov("r8", bytes);
    a.load("rcx", { rip: "rt.heap" });
    a.mov("rdx", 0);
    a.callImport("HeapAlloc");
    a.test("rax", "rax");
    failIf(a, "e");
}

/** Copy the UTF-16 string at [arg] into a NUL-terminated process-heap buffer. */
function wideCopy(a: Assembler, arg: number, temp: number): void {
    const skip = a.unique("wideSkip"),
        loop = a.unique("wideLoop"),
        done = a.unique("wideDone");
    a.load("rax", slot(arg));
    a.test("rax", "rax");
    a.jcc("e", skip);
    a.load("rax", { base: "rax" });
    a.add("rax", "rax");
    a.add("rax", 2);
    a.mov("r9", "rax");
    allocate(a, "r9");
    a.store(slot(temp), "rax");
    a.load("r10", slot(arg));
    a.load("rcx", { base: "r10" });
    a.add("r10", 8);
    a.mov("r11", "rax");
    a.label(loop);
    a.test("rcx", "rcx");
    a.jcc("e", done);
    a.load("rax", { base: "r10" }, 16);
    a.store({ base: "r11" }, "rax", 16);
    a.add("r10", 2);
    a.add("r11", 2);
    a.sub("rcx", 1);
    a.jmp(loop);
    a.label(done);
    a.mov("rax", 0);
    a.store({ base: "r11" }, "rax", 16);
    a.load("rax", slot(temp));
    a.store(slot(arg), "rax");
    a.label(skip);
}

/** Convert the UTF-16 string at [arg] to a NUL-terminated UTF-8 process-heap buffer. */
function utf8Copy(a: Assembler, arg: number, temp: number): void {
    const skip = a.unique("utf8Skip"),
        empty = a.unique("utf8Empty"),
        terminate = a.unique("utf8Terminate");
    a.load("rax", slot(arg));
    a.test("rax", "rax");
    a.jcc("e", skip);
    a.load("r9", { base: "rax" });
    a.test("r9", "r9");
    a.jcc("e", empty);
    // Size query: WideCharToMultiByte(CP_UTF8, 0, src, len, NULL, 0, NULL, NULL).
    a.mov("rcx", 65001);
    a.mov("rdx", 0);
    a.lea("r8", { base: "rax", disp: 8 });
    a.mov("rax", 0);
    for (const d of [32, 40, 48, 56]) a.store(slot(d), "rax");
    a.callImport("WideCharToMultiByte");
    a.test("rax", "rax");
    failIf(a, "e");
    a.store(slot(40), "rax");
    a.add("rax", 1);
    a.mov("r9", "rax");
    allocate(a, "r9");
    a.store(slot(temp), "rax");
    a.store(slot(32), "rax");
    a.mov("rax", 0);
    a.store(slot(48), "rax");
    a.store(slot(56), "rax");
    a.load("rax", slot(arg));
    a.load("r9", { base: "rax" });
    a.lea("r8", { base: "rax", disp: 8 });
    a.mov("rcx", 65001);
    a.mov("rdx", 0);
    a.callImport("WideCharToMultiByte");
    a.test("rax", "rax");
    failIf(a, "e");
    a.load("r11", slot(temp));
    a.add("r11", "rax");
    a.jmp(terminate);
    a.label(empty);
    a.mov("r9", 1);
    allocate(a, "r9");
    a.store(slot(temp), "rax");
    a.mov("r11", "rax");
    a.label(terminate);
    a.mov("rax", 0);
    a.store({ base: "r11" }, "rax", 8);
    a.load("rax", slot(temp));
    a.store(slot(arg), "rax");
    a.label(skip);
}

function convertResult(
    a: Assembler,
    result: FfiType,
    OUT: number,
    RESULT: number,
    RESULT_XMM: number,
): void {
    a.load("rcx", slot(OUT));
    if (result === "void") {
        a.mov("rax", 0);
        a.store({ base: "rcx" }, "rax");
        a.store({ base: "rcx", disp: 8 }, "rax");
        return;
    }
    if (result === "bool") {
        const done = a.unique("boolDone");
        a.load("rax", slot(RESULT), 32);
        a.test("rax", "rax");
        a.mov("rax", 0);
        a.jcc("e", done);
        a.mov("rax", 1);
        a.label(done);
        a.store({ base: "rcx", disp: 8 }, "rax");
        a.mov("rax", 2);
        a.store({ base: "rcx" }, "rax");
        return;
    }
    if (result === "f64") {
        a.movsd("xmm0", slot(RESULT_XMM));
    } else if (result === "f32") {
        a.cvtss2sd("xmm0", slot(RESULT_XMM));
    } else {
        a.load("rax", slot(RESULT));
        const narrow: Record<string, [number, boolean]> = {
            i8: [56, true],
            i16: [48, true],
            i32: [32, true],
            u8: [56, false],
            u16: [48, false],
            u32: [32, false],
        };
        const n = narrow[result];
        if (n) {
            a.shl("rax", n[0]);
            if (n[1]) a.sar("rax", n[0]);
            else a.shr("rax", n[0]);
        }
        if (result === "u64") {
            const signed = a.unique("signed"),
                converted = a.unique("converted");
            a.test("rax", "rax");
            a.jcc("ns", signed);
            a.mov("r11", "rax");
            a.shr("r11", 1);
            a.and("rax", 1);
            a.or("r11", "rax");
            a.cvtsi2sd("xmm0", "r11");
            a.addsd("xmm0", "xmm0");
            a.jmp(converted);
            a.label(signed);
            a.cvtsi2sd("xmm0", "rax");
            a.label(converted);
        } else a.cvtsi2sd("xmm0", "rax");
    }
    a.mov("rax", 3);
    a.store({ base: "rcx" }, "rax");
    a.storesd({ base: "rcx", disp: 8 }, "xmm0");
}
