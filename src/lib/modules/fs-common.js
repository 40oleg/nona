import { resolve, join, dirname } from "node:path";
const encoder = new TextEncoder(),
    decoder = new TextDecoder();
const descriptions = {
    ENOENT: "no such file or directory",
    EEXIST: "file already exists",
    EACCES: "permission denied",
    EPERM: "operation not permitted",
    ENOTDIR: "not a directory",
    EISDIR: "illegal operation on a directory",
    ENOTEMPTY: "directory not empty",
    EBUSY: "resource busy or locked",
    EINVAL: "invalid argument",
    EBADF: "bad file descriptor",
    EXDEV: "cross-device link not permitted",
    EIO: "i/o error",
    UNKNOWN: "unknown error",
};
function fail(code, syscall, path, dest) {
    // Like Node.js, errors of reads and writes on an open file carry no path.
    if (syscall === "read" || syscall === "write") path = undefined;
    let message =
        code +
        ": " +
        (descriptions[code] || descriptions.UNKNOWN) +
        ", " +
        syscall;
    if (path !== undefined) message += " '" + path + "'";
    if (dest !== undefined) message += " -> '" + dest + "'";
    const error = new Error(message);
    error.code = code;
    error.syscall = syscall;
    if (path !== undefined) error.path = path;
    if (dest !== undefined) error.dest = dest;
    throw error;
}
function pathString(path, name) {
    if (typeof path === "string") {
        if (path.indexOf("\u0000") >= 0)
            throw new TypeError(
                "The argument '" +
                    name +
                    "' must be a string without null bytes",
            );
        return path;
    }
    if (path instanceof Uint8Array) return decoder.decode(path);
    throw new TypeError(
        'The "' +
            name +
            '" argument must be of type string or an instance of Uint8Array',
    );
}
function encodingOf(options) {
    if (typeof options === "string") return options;
    if (
        options !== null &&
        typeof options === "object" &&
        options.encoding != null
    )
        return options.encoding;
    return null;
}
function checkEncoding(encoding) {
    if (encoding !== null && encoding !== "utf8" && encoding !== "utf-8")
        throw new TypeError(
            "Unsupported encoding: " + encoding + " (only utf8 is supported)",
        );
}
function bytesOf(data) {
    if (typeof data === "string") return encoder.encode(data);
    if (ArrayBuffer.isView(data))
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    throw new TypeError(
        'The "data" argument must be of type string or an instance of Uint8Array, TypedArray or DataView',
    );
}
function concat(chunks, total) {
    const out = new Uint8Array(total);
    let offset = 0;
    for (let i = 0; i < chunks.length; i++) {
        out.set(chunks[i], offset);
        offset += chunks[i].length;
    }
    return out;
}
/** Read until end of file; readInto(view) returns the number of bytes read (0 at the end). */
function readChunks(sizeHint, readInto) {
    const chunks = [];
    let total = 0,
        chunk = new Uint8Array(Math.max(sizeHint + 1, 4096)),
        used = 0;
    for (;;) {
        if (used === chunk.length) {
            chunks.push(chunk);
            chunk = new Uint8Array(65536);
            used = 0;
        }
        const n = readInto(chunk.subarray(used));
        if (n === 0) break;
        used += n;
        total += n;
    }
    if (chunks.length === 0) return chunk.slice(0, used);
    chunks.push(chunk.subarray(0, used));
    return concat(chunks, total);
}
export class Stats {
    constructor(kind, size, mtimeMs, mode) {
        this.size = size;
        this.mtimeMs = mtimeMs;
        this.mode = mode;
        this.mtime = new Date(mtimeMs);
        Object.defineProperty(this, "_kind", { value: kind });
    }
    isFile() {
        return this._kind === "file";
    }
    isDirectory() {
        return this._kind === "dir";
    }
    isSymbolicLink() {
        return this._kind === "link";
    }
    isBlockDevice() {
        return typeOf(this._kind, this.mode) === 0o060000;
    }
    isCharacterDevice() {
        return typeOf(this._kind, this.mode) === 0o020000;
    }
    isFIFO() {
        return typeOf(this._kind, this.mode) === 0o010000;
    }
    isSocket() {
        return typeOf(this._kind, this.mode) === 0o140000;
    }
}
/** The S_IFMT bits of an entry that is neither a file, a directory nor a link. */
function typeOf(kind, mode) {
    return kind === "other" ? mode & 0o170000 : 0;
}
export class Dirent {
    constructor(name, parentPath, kind, mode) {
        this.name = name;
        this.parentPath = parentPath;
        this.path = parentPath;
        Object.defineProperty(this, "_kind", { value: kind });
        Object.defineProperty(this, "_mode", { value: mode });
    }
    isFile() {
        return this._kind === "file";
    }
    isDirectory() {
        return this._kind === "dir";
    }
    isSymbolicLink() {
        return this._kind === "link";
    }
    isBlockDevice() {
        return typeOf(this._kind, this._mode) === 0o060000;
    }
    isCharacterDevice() {
        return typeOf(this._kind, this._mode) === 0o020000;
    }
    isFIFO() {
        return typeOf(this._kind, this._mode) === 0o010000;
    }
    isSocket() {
        return typeOf(this._kind, this._mode) === 0o140000;
    }
}
function statsOf(result, options) {
    const value = new Stats(
        result.kind,
        result.size,
        result.mtimeMs,
        result.mode,
    );
    value.dev = options && options.bigint ? result.dev : Number(result.dev);
    value.ino = options && options.bigint ? result.ino : Number(result.ino);
    return value;
}
export function readFileSync(path, options) {
    path = pathString(path, "path");
    const encoding = encodingOf(options);
    checkEncoding(encoding);
    const bytes = sys.readAll(path);
    return encoding === null ? bytes : decoder.decode(bytes);
}
export function writeFileSync(path, data, options) {
    path = pathString(path, "path");
    const flag =
        options !== null && typeof options === "object"
            ? options.flag || "w"
            : "w";
    if (flag !== "w" && flag !== "a" && flag !== "wx")
        throw new TypeError("Unsupported file flag: " + flag);
    const mode =
        options !== null &&
        typeof options === "object" &&
        options.mode !== undefined
            ? options.mode
            : 0o666;
    sys.writeAll(path, bytesOf(data), flag === "a", flag === "wx", mode);
}
export function appendFileSync(path, data) {
    sys.writeAll(pathString(path, "path"), bytesOf(data), true);
}
export function accessSync(path, mode) {
    path = pathString(path, "path");
    if (sys.stat(path) === null) fail("ENOENT", "access", path);
}
export function existsSync(path) {
    try {
        return sys.stat(pathString(path, "path")) !== null;
    } catch (e) {
        return false;
    }
}
export function statSync(path, options) {
    path = pathString(path, "path");
    const result = sys.stat(path);
    if (result === null) {
        if (options && options.throwIfNoEntry === false) return undefined;
        fail("ENOENT", "stat", path);
    }
    return statsOf(result, options);
}
export function lstatSync(path, options) {
    path = pathString(path, "path");
    const result = sys.lstat(path);
    if (result === null) {
        if (options && options.throwIfNoEntry === false) return undefined;
        fail("ENOENT", "lstat", path);
    }
    return statsOf(result, options);
}
export function readlinkSync(path, options) {
    path = pathString(path, "path");
    checkEncoding(encodingOf(options));
    return sys.readlink(path);
}
export function realpathSync(path, options) {
    checkEncoding(encodingOf(options));
    return sys.realpath(resolve(pathString(path, "path")));
}
realpathSync.native = realpathSync;
export function readdirSync(path, options) {
    path = pathString(path, "path");
    const names = sys.readdir(path);
    if (options && typeof options === "object" && options.withFileTypes)
        return names.map((name) => {
            const info = sys.lstat(join(path, name));
            return info === null
                ? new Dirent(name, path, "other", 0)
                : new Dirent(name, path, info.kind, info.mode);
        });
    return names;
}
export function mkdirSync(path, options) {
    path = pathString(path, "path");
    const recursive =
        options !== null && typeof options === "object" && !!options.recursive;
    if (!recursive) {
        sys.mkdir(path);
        return undefined;
    }
    const existing = sys.stat(path);
    if (existing !== null) {
        if (existing.kind !== "dir") fail("EEXIST", "mkdir", path);
        return undefined;
    }
    // Create missing ancestors first; return the first directory created, like Node.js.
    const parts = [],
        separator = sys.separator;
    let current = path;
    while (current !== "" && sys.stat(current) === null) {
        parts.push(current);
        const index = Math.max(
            current.lastIndexOf("/"),
            separator === "\\" ? current.lastIndexOf("\\") : -1,
        );
        if (
            index <= 0 ||
            (separator === "\\" && index === 2 && current[1] === ":")
        )
            break;
        current = current.slice(0, index);
    }
    for (let i = parts.length - 1; i >= 0; i--) {
        try {
            sys.mkdir(parts[i]);
        } catch (e) {
            if (e.code !== "EEXIST") throw e;
        }
    }
    return parts.length ? parts[parts.length - 1] : undefined;
}
export function rmSync(path, options) {
    path = pathString(path, "path");
    const recursive = !!(options && options.recursive),
        force = !!(options && options.force);
    const info = sys.lstat(path);
    if (info === null) {
        if (force) return undefined;
        fail("ENOENT", "rm", path);
    }
    if (info.kind !== "dir") {
        sys.unlink(path);
        return undefined;
    }
    if (!recursive) {
        const error = new Error(
            "Path is a directory: rm returned EISDIR (is a directory) " + path,
        );
        error.code = "ERR_FS_EISDIR";
        throw error;
    }
    for (const name of sys.readdir(path))
        rmSync(join(path, name), { recursive: true, force });
    sys.rmdir(path);
    return undefined;
}
export function rmdirSync(path) {
    sys.rmdir(pathString(path, "path"));
}
export function unlinkSync(path) {
    sys.unlink(pathString(path, "path"));
}
export function renameSync(from, to) {
    sys.rename(pathString(from, "oldPath"), pathString(to, "newPath"));
}
export function copyFileSync(from, to, mode) {
    from = pathString(from, "src");
    to = pathString(to, "dest");
    if ((mode | 0) & 1 && sys.stat(to) !== null)
        fail("EEXIST", "copyfile", from, to);
    sys.copy(from, to);
}
/** A callback API over a synchronous one: the callback runs on a later turn (setImmediate), an error first; a TypeError for bad arguments is thrown synchronously. */
function callbackForm(operation) {
    return function (...args) {
        const callback = args.pop();
        if (typeof callback !== "function") {
            const error = new TypeError(
                'The "cb" argument must be of type function. Received ' +
                    (callback === undefined ? "undefined" : typeof callback),
            );
            error.code = "ERR_INVALID_ARG_TYPE";
            throw error;
        }
        let result,
            error = null;
        try {
            result = operation(...args);
        } catch (e) {
            if (e instanceof TypeError) throw e;
            error = e;
        }
        setImmediate(() =>
            error === null ? callback(null, result) : callback(error),
        );
    };
}
/** A promise API over a synchronous one. */
function promiseForm(operation) {
    return function (...args) {
        return new Promise((resolve) => resolve(operation(...args)));
    };
}
export const readFile = callbackForm(readFileSync),
    writeFile = callbackForm(writeFileSync),
    appendFile = callbackForm(appendFileSync),
    access = callbackForm(accessSync),
    stat = callbackForm(statSync),
    lstat = callbackForm(lstatSync),
    readlink = callbackForm(readlinkSync),
    realpath = callbackForm(realpathSync),
    readdir = callbackForm(readdirSync),
    mkdir = callbackForm(mkdirSync),
    rm = callbackForm(rmSync),
    rmdir = callbackForm(rmdirSync),
    unlink = callbackForm(unlinkSync),
    rename = callbackForm(renameSync),
    copyFile = callbackForm(copyFileSync);
realpath.native = realpath;
export function exists(path, callback) {
    const result = existsSync(path);
    setImmediate(() => callback(result));
}
/** fs.promises, also the node:fs/promises module (a literal, so unused code can be pruned, #440). */
export const promises = {
    readFile: promiseForm(readFileSync),
    writeFile: promiseForm(writeFileSync),
    appendFile: promiseForm(appendFileSync),
    access: promiseForm(accessSync),
    stat: promiseForm(statSync),
    lstat: promiseForm(lstatSync),
    readlink: promiseForm(readlinkSync),
    realpath: promiseForm(realpathSync),
    readdir: promiseForm(readdirSync),
    mkdir: promiseForm(mkdirSync),
    rm: promiseForm(rmSync),
    rmdir: promiseForm(rmdirSync),
    unlink: promiseForm(unlinkSync),
    rename: promiseForm(renameSync),
    copyFile: promiseForm(copyFileSync),
};
export const constants = {
    COPYFILE_EXCL: 1,
    F_OK: 0,
    R_OK: 4,
    W_OK: 2,
    X_OK: 1,
};
export default {
    readFileSync,
    writeFileSync,
    appendFileSync,
    accessSync,
    existsSync,
    statSync,
    lstatSync,
    readlinkSync,
    realpathSync,
    readdirSync,
    mkdirSync,
    rmSync,
    rmdirSync,
    unlinkSync,
    renameSync,
    copyFileSync,
    readFile,
    writeFile,
    appendFile,
    access,
    exists,
    stat,
    lstat,
    readlink,
    realpath,
    readdir,
    mkdir,
    rm,
    rmdir,
    unlink,
    rename,
    copyFile,
    promises,
    Dirent,
    Stats,
    constants,
};
