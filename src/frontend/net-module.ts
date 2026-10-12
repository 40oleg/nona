import {
    modulesNetCommon,
    modulesNetWin32,
    modulesNetLinux,
} from "../lib/sources.generated.js";
/**
 * Source of the built-in `node:net` (alias `nona:net`) module: non-blocking
 * TCP sockets and servers. As in node:fs, a small platform layer (Linux system
 * calls, Winsock through nona:ffi) sits under a shared JavaScript
 * implementation. Socket readiness is waited for by the host event loop: the
 * module registers a poller with it (poll on Linux, WSAPoll on Windows).
 *
 * Platform layer contract (`sys`): every call returns a non-negative result or
 * a negative Linux errno (Windows errors are translated), so the shared code
 * has one error table.
 */
const common = modulesNetCommon;

const win32 = modulesNetWin32;

const linux = modulesNetLinux;

export function netModuleSource(target: string): string {
    // The platform layers exist for Linux x64 (system calls) and Windows x64
    // (Winsock); other targets get a module that reports it when imported.
    if (target !== "linux-x64" && target !== "win32-x64")
        return `throw new Error(${JSON.stringify(`node:net and node:http are not available for ${target} yet`)});\nexport default undefined;\n`;
    return (target === "linux-x64" ? linux : win32) + common;
}
