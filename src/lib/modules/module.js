import { createRequire } from "nona:internal/commonjs";
export const builtinModules = [
    "assert",
    "assert/strict",
    "buffer",
    "child_process",
    "events",
    "fs",
    "module",
    "net",
    "http",
    "http2",
    "https",
    "os",
    "path",
    "path/posix",
    "path/win32",
    "perf_hooks",
    "process",
    "querystring",
    "stream",
    "stream/consumers",
    "stream/promises",
    "string_decoder",
    "timers",
    "timers/promises",
    "tls",
    "tty",
    "url",
    "util",
    "util/types",
    "worker_threads",
    "zlib",
];
export function isBuiltin(name) {
    const bare = String(name).startsWith("node:")
        ? String(name).slice(5)
        : String(name);
    return builtinModules.includes(bare);
}
export { createRequire };
export function syncBuiltinESMExports() {}
export function findSourceMap() {
    return undefined;
}
export function register() {}
export default {
    builtinModules,
    isBuiltin,
    createRequire,
    syncBuiltinESMExports,
    findSourceMap,
    register,
};
