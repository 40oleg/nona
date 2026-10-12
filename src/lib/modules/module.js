
function unsupported(name) {
  return function () {
    const error = new Error(name + ' is not supported by Nona');
    error.code = 'ERR_NONA_UNSUPPORTED';
    throw error;
  };
}

export const builtinModules = ['assert', 'assert/strict', 'buffer', 'child_process', 'events', 'fs', 'module', 'net', 'http', 'os', 'path', 'path/posix', 'path/win32', 'perf_hooks', 'process', 'querystring', 'stream', 'stream/consumers', 'stream/promises', 'string_decoder', 'timers', 'timers/promises', 'tty', 'url', 'util', 'util/types', 'worker_threads'];
export function isBuiltin(name) { const bare = String(name).startsWith('node:') ? String(name).slice(5) : String(name); return builtinModules.includes(bare); }
export const createRequire = unsupported('module.createRequire');
export function syncBuiltinESMExports() {}
export function findSourceMap() { return undefined; }
export function register() {}
export default {builtinModules, isBuiltin, createRequire, syncBuiltinESMExports, findSourceMap, register};
