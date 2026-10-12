// The playground compiles a single source: there are no files to read.
export function readFileSync(path) {
    throw new Error(`ENOENT: the playground has no file system (${path})`);
}
// Module resolution (node_modules, package.json) finds nothing.
export function statSync(path, options) {
    if (options && options.throwIfNoEntry === false) return undefined;
    throw new Error(`ENOENT: the playground has no file system (${path})`);
}
export function realpathSync(path) {
    return path;
}
// Used only for NONA_ELF_MAP, which is never set in the browser.
export function writeFileSync() {}
export default { readFileSync, writeFileSync, statSync, realpathSync };
