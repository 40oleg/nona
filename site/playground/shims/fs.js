// The playground compiles a single source: there are no files to read.
export function readFileSync(path) {
  throw new Error(`ENOENT: the playground has no file system (${path})`);
}
// Used only for NONA_ELF_MAP, which is never set in the browser.
export function writeFileSync() {}
export default {readFileSync, writeFileSync};
