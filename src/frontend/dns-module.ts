import { modulesDns } from "../lib/sources.generated.js";

/** Public lookup shares net's platform resolver and deferred callback queue. */
export function dnsModuleSource(target: string): string {
    if (target !== "linux-x64" && target !== "win32-x64")
        return `throw new Error(${JSON.stringify(`node:dns is not available for ${target} yet`)});\nexport default undefined;\n`;
    return modulesDns;
}
