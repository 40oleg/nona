import {
    modulesX509,
    modulesX509StoreLinux,
    modulesX509StoreWin32,
} from "../lib/sources.generated.js";
/**
 * Source of `nona:internal/x509`: X.509 parsing, chain verification and the
 * host name check of the TLS client (issue #301).
 */
export const x509ModuleSource = modulesX509;

/**
 * Source of `nona:internal/x509-store`, the operating system's trust store:
 * a PEM bundle on Linux, the ROOT and CA system stores through crypt32.dll on
 * Windows. Other targets have no socket layer and get an empty store.
 */
export function x509StoreModuleSource(target: string): string {
    if (target === "win32-x64") return modulesX509StoreWin32;
    if (target === "linux-x64") return modulesX509StoreLinux;
    return "export function loadStore() { return { roots: [], intermediates: [] }; }\n";
}
