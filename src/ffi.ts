/** Native foreign function declarations (`define` from `nona:ffi`). */
import type { NativeOS, Target } from "./target.js";

export const ffiIntegerTypes = [
    "i8",
    "i16",
    "i32",
    "i64",
    "u8",
    "u16",
    "u32",
    "u64",
    "ptr",
    "bool",
] as const;
export const ffiFloatTypes = ["f32", "f64"] as const;
export const ffiPointerTypes = ["wstr", "str", "buf"] as const;
export type FfiType =
    | (typeof ffiIntegerTypes)[number]
    | (typeof ffiFloatTypes)[number]
    | (typeof ffiPointerTypes)[number]
    | "void";
export interface FfiSignature {
    result: FfiType;
    parameters: FfiType[];
}
export interface FfiDeclaration {
    /** The library: a DLL name, a shared object soname or path, a dylib path, or `syscall`. */
    dll: string;
    name: string;
    signature: string;
}
/** The operating systems a portable declaration may name libraries for. */
export const ffiLibraryKeys = ["win32", "linux", "darwin"] as const;
export type FfiLibraryKey = (typeof ffiLibraryKeys)[number];
export type FfiLibraries = Partial<Record<FfiLibraryKey, string>>;

const parameterTypes = new Set<string>([
    ...ffiIntegerTypes,
    ...ffiFloatTypes,
    ...ffiPointerTypes,
]);
const resultTypes = new Set<string>([
    ...ffiIntegerTypes,
    ...ffiFloatTypes,
    "void",
]);
/** Reserved for later versions (callbacks, out parameters). */
const reserved = /^(cb|out)\b/;

/** Parse `result(param,param,...)`; throws an Error with a user-facing message. */
export function parseFfiSignature(text: string): FfiSignature {
    const match = /^\s*([a-z0-9]+)\s*\(\s*([^()]*?)\s*\)\s*$/.exec(text);
    if (!match)
        throw new Error(
            `Invalid FFI signature '${text}': expected 'result(type,...)'`,
        );
    const result = match[1]!,
        list = match[2]!;
    if (!resultTypes.has(result))
        throw new Error(`Unsupported FFI result type '${result}'`);
    const parameters =
        list === "" ? [] : list.split(",").map((part) => part.trim());
    for (const parameter of parameters) {
        if (reserved.test(parameter))
            throw new Error(
                `FFI type '${parameter}' is reserved and not supported yet`,
            );
        if (!parameterTypes.has(parameter))
            throw new Error(`Unsupported FFI parameter type '${parameter}'`);
    }
    if (parameters.length > 32)
        throw new Error("FFI functions support at most 32 parameters");
    return { result: result as FfiType, parameters: parameters as FfiType[] };
}

/**
 * Validate a library name and symbol name. Windows DLL names have no path
 * separators (the import table names a module); POSIX libraries may be a
 * soname (`libc.so.6`) or a path (`/usr/lib/libSystem.B.dylib`). With the OS
 * unknown (lowering), only the rules common to all systems apply.
 */
export function checkFfiNames(
    dll: string,
    name: string,
    os: NativeOS | undefined,
): void {
    if (dll === "syscall") {
        if (!/^\d{1,3}$/.test(name))
            throw new Error(`Invalid system call number '${name}'`);
        return;
    }
    const windows = os === "win32",
        posix = os !== undefined && !windows;
    if (
        !/^[\x21-\x7e]+$/.test(dll) ||
        /\\/.test(dll) ||
        (windows && /\//.test(dll))
    )
        throw new Error(
            windows || (os === undefined && /\.dll$/i.test(dll))
                ? `Invalid DLL name '${dll}'`
                : `Invalid library name '${dll}'`,
        );
    if (
        posix
            ? !/^[A-Za-z_$][A-Za-z0-9_$.]*$/.test(name)
            : !/^[A-Za-z_?@$][\x21-\x7e]*$/.test(name)
    )
        throw new Error(
            posix
                ? `Invalid symbol name '${name}'`
                : `Invalid export name '${name}'`,
        );
}

/** The import symbol of a library function; `ffi.` imports are the program's declarations. */
export function ffiImportSymbol(d: FfiDeclaration): string {
    return "ffi." + d.dll.toLowerCase() + "!" + d.name;
}

/**
 * Whether an import is a shared library function the program declared: linked
 * dynamically by the Linux and macOS linkers. System calls and Windows DLL
 * declarations (which the POSIX linkers can only stub) are not.
 */
export function isFfiLibraryImport(i: {
    dll: string;
    symbol: string;
}): boolean {
    return (
        i.dll !== "syscall" &&
        i.symbol.startsWith("ffi.") &&
        !/\.dll$/i.test(i.dll)
    );
}

/** The import that provides `errno` after a POSIX library call (`lastError()`). */
export const ffiErrnoSymbol = "ffi.errno";
export function ffiErrnoImport(
    target: Target,
): { dll: string; name: string; symbol: string } | undefined {
    if (target.startsWith("linux-"))
        return {
            dll: "libc.so.6",
            name: "__errno_location",
            symbol: ffiErrnoSymbol,
        };
    if (target.startsWith("darwin-"))
        return {
            dll: "/usr/lib/libSystem.B.dylib",
            name: "__error",
            symbol: ffiErrnoSymbol,
        };
    return undefined;
}

/** The program interpreter of a dynamically linked Linux executable. */
export const linuxInterpreter: Readonly<Record<"x64" | "arm64", string>> = {
    x64: "/lib64/ld-linux-x86-64.so.2",
    arm64: "/lib/ld-linux-aarch64.so.1",
};

/** Source of the built-in `nona:ffi` module. `define` calls are compiled statically. */
export const ffiModuleSource = `export function define(dll, name, signature) {
  throw new TypeError('nona:ffi define() must be called directly with three string literals');
}
export function lastError() {
  return typeof __nonaFfiLastError === 'function' ? __nonaFfiLastError() : 0;
}
`;
