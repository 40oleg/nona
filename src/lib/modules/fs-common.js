import { resolve, join, dirname } from "nona:internal/path-core";
import { randomBytes } from "nona:internal/entropy";
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
    EROFS: "read-only file system",
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
    error.errno = errnos[code] !== undefined ? errnos[code] : errnos.UNKNOWN;
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
    throw typeError(
        'The "' +
            name +
            '" argument must be of type string or an instance of Buffer or Uint8Array',
    );
}
function typeError(message) {
    const error = new TypeError(message);
    error.code = "ERR_INVALID_ARG_TYPE";
    return error;
}
/** Whether the argument is a file descriptor; only 0, 1 and 2 are supported. */
function isFd(fd, syscall) {
    if (typeof fd !== "number") return false;
    if (!Number.isInteger(fd))
        throw typeError(
            'The "fd" argument must be of type integer. Received ' + fd,
        );
    if (fd < 0 || fd > 2147483647) {
        const error = new RangeError(
            'The value of "fd" is out of range. It must be an integer >= 0 && <= 2147483647. Received ' +
                fd,
        );
        error.code = "ERR_OUT_OF_RANGE";
        throw error;
    }
    if (fd > 2) fail("EBADF", syscall);
    return true;
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
    throw typeError(
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
    // r is a platform stat result; fields a platform lacks fall back to
    // mtime (times) or 0 (the rest), and dev/ino are filled in by statsOf.
    constructor(kind, r, bigint) {
        const mtimeMs = r.mtimeMs,
            number = (value) => (value === undefined ? 0 : value),
            time = (value) => (value === undefined ? mtimeMs : value);
        this.dev = bigint ? r.dev : Number(r.dev);
        this.mode = r.mode;
        this.nlink = number(r.nlink);
        this.uid = number(r.uid);
        this.gid = number(r.gid);
        this.rdev = number(r.rdev);
        this.blksize = number(r.blksize);
        this.ino = bigint ? r.ino : Number(r.ino);
        this.size = r.size;
        this.blocks = number(r.blocks);
        this.atimeMs = time(r.atimeMs);
        this.mtimeMs = mtimeMs;
        this.ctimeMs = time(r.ctimeMs);
        this.birthtimeMs = time(r.birthtimeMs);
        this.atime = new Date(this.atimeMs);
        this.mtime = new Date(mtimeMs);
        this.ctime = new Date(this.ctimeMs);
        this.birthtime = new Date(this.birthtimeMs);
        Object.defineProperty(this, "_kind", { value: kind });
    }
    isFile() {
        return this._kind === "file";
    }
    isDirectory() {
        return this._kind === "dir";
    }
    isSymbolicLink() {
        return this._kind === "symlink";
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
        return this._kind === "symlink";
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
    return new Stats(result.kind, result, !!(options && options.bigint));
}
export function readFileSync(path, options) {
    const fd = isFd(path, "read");
    if (!fd) path = pathString(path, "path");
    const encoding = encodingOf(options);
    checkEncoding(encoding);
    const bytes = fd ? sys.readAllFd(path) : sys.readAll(path);
    return encoding === null ? bytes : decoder.decode(bytes);
}
export function writeFileSync(path, data, options) {
    if (isFd(path, "write")) {
        sys.writeAllFd(path, bytesOf(data));
        return;
    }
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
    if (isFd(path, "write")) {
        sys.writeAllFd(path, bytesOf(data));
        return;
    }
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
export function symlinkSync(target, path, type) {
    target = pathString(target, "target");
    path = pathString(path, "path");
    sys.symlink(target, path, type);
}
export function realpathSync(path, options) {
    checkEncoding(encodingOf(options));
    return sys.realpath(resolve(pathString(path, "path")));
}
realpathSync.native = realpathSync;
export function readdirSync(path, options) {
    path = pathString(path, "path");
    const object = options && typeof options === "object";
    const withFileTypes = object && options.withFileTypes;
    const recursive = object && options.recursive;
    if (!recursive) {
        const names = sys.readdir(path);
        if (withFileTypes)
            return names.map((name) => {
                const info = sys.lstat(join(path, name));
                return info === null
                    ? new Dirent(name, path, "other", 0)
                    : new Dirent(name, path, info.kind, info.mode);
            });
        return names;
    }
    // Depth-first walk; a directory is listed before its children and symbolic
    // links to directories are entered like directories, as Node.js does.
    const result = [];
    const walk = (relative) => {
        const directory = relative === "" ? path : join(path, relative);
        for (const name of sys.readdir(directory)) {
            const info = sys.lstat(join(directory, name));
            const entry = relative === "" ? name : join(relative, name);
            result.push(
                withFileTypes
                    ? info === null
                        ? new Dirent(name, directory, "other", 0)
                        : new Dirent(name, directory, info.kind, info.mode)
                    : entry,
            );
            if (info === null) continue;
            if (info.kind === "dir") walk(entry);
            else if (info.kind === "symlink") {
                const target = sys.stat(join(directory, name));
                if (target !== null && target.kind === "dir") walk(entry);
            }
        }
    };
    walk("");
    return result;
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
const tempAlphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
/** Six characters of [A-Za-z0-9] from OS entropy; bytes >= 248 are rejected to avoid modulo bias. */
function tempSuffix() {
    let out = "";
    while (out.length < 6) {
        const bytes = randomBytes(12);
        for (let i = 0; i < bytes.length && out.length < 6; i++)
            if (bytes[i] < 248) out += tempAlphabet[bytes[i] % 62];
    }
    return out;
}
export function mkdtempSync(prefix, options) {
    prefix = pathString(prefix, "prefix");
    const encoding = encodingOf(options);
    if (encoding !== null && encoding !== "buffer") checkEncoding(encoding);
    for (let attempt = 0; ; attempt++) {
        const path = prefix + tempSuffix();
        try {
            sys.mkdir(path, 0o700);
        } catch (e) {
            if (e.code === "EEXIST" && attempt < 100) continue;
            if (e.code === "EEXIST" || e.syscall !== "mkdir") throw e;
            fail(e.code, "mkdtemp", prefix + "XXXXXX");
        }
        return encoding === "buffer" ? encoder.encode(path) : path;
    }
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
    try {
        sys.rmdir(path);
    } catch (e) {
        // A path through ".." (e.g. "a/b/..") stops resolving on POSIX once its
        // child "b" is removed; Node.js treats the directory as already gone.
        if (e.code !== "ENOENT") throw e;
    }
    return undefined;
}
export function rmdirSync(path) {
    sys.rmdir(pathString(path, "path"));
}
export function unlinkSync(path) {
    sys.unlink(pathString(path, "path"));
}
export function truncateSync(path, len = 0) {
    path = pathString(path, "path");
    if (typeof len !== "number") {
        const error = new TypeError(
            'The "len" argument must be of type number. Received ' +
                (len === null ? "null" : "type " + typeof len),
        );
        error.code = "ERR_INVALID_ARG_TYPE";
        throw error;
    }
    if (!Number.isInteger(len) || Math.abs(len) > Number.MAX_SAFE_INTEGER) {
        const error = new RangeError(
            'The value of "len" is out of range. It must be an integer. Received ' +
                len,
        );
        error.code = "ERR_OUT_OF_RANGE";
        throw error;
    }
    sys.truncate(path, len < 0 ? 0 : len);
}
export function renameSync(from, to) {
    sys.rename(pathString(from, "oldPath"), pathString(to, "newPath"));
}
function invalidArg(message) {
    const error = new TypeError(message);
    error.code = "ERR_INVALID_ARG_TYPE";
    return error;
}
function isOctal(text) {
    if (text.length === 0) return false;
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        if (c < 48 || c > 55) return false;
    }
    return true;
}
export function chmodSync(path, mode) {
    path = pathString(path, "path");
    if (typeof mode === "string" && isOctal(mode)) mode = parseInt(mode, 8);
    if (typeof mode !== "number" || !Number.isInteger(mode) || mode < 0)
        throw invalidArg(
            'The "mode" argument must be of type number or an octal string',
        );
    sys.chmod(path, mode & 0o7777);
}
/** Seconds since the epoch of a number, a numeric string or a Date. */
function timeSeconds(value, name) {
    let seconds = NaN;
    if (typeof value === "number") seconds = value;
    else if (value instanceof Date) seconds = value.getTime() / 1000;
    else if (typeof value === "string" && value !== "") seconds = Number(value);
    if (
        typeof seconds !== "number" ||
        seconds !== seconds ||
        !isFinite(seconds)
    )
        throw invalidArg(
            'The "' +
                name +
                '" argument must be of type number, string or an instance of Date',
        );
    return seconds;
}
export function utimesSync(path, atime, mtime) {
    path = pathString(path, "path");
    sys.utimes(path, timeSeconds(atime, "atime"), timeSeconds(mtime, "mtime"));
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
    mkdtemp = callbackForm(mkdtempSync),
    rm = callbackForm(rmSync),
    rmdir = callbackForm(rmdirSync),
    unlink = callbackForm(unlinkSync),
    rename = callbackForm(renameSync),
    chmod = callbackForm(chmodSync),
    utimes = callbackForm(utimesSync),
    truncate = callbackForm(truncateSync),
    copyFile = callbackForm(copyFileSync),
    symlink = callbackForm(symlinkSync);
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
    mkdtemp: promiseForm(mkdtempSync),
    rm: promiseForm(rmSync),
    rmdir: promiseForm(rmdirSync),
    unlink: promiseForm(unlinkSync),
    rename: promiseForm(renameSync),
    chmod: promiseForm(chmodSync),
    utimes: promiseForm(utimesSync),
    truncate: promiseForm(truncateSync),
    copyFile: promiseForm(copyFileSync),
    symlink: promiseForm(symlinkSync),
};
// fsPlatform is declared by the platform layer (fsModuleSource): reading
// process.platform here would link the process prelude and the RegExp engine.
const fsPosixCommon = [
    ["UV_FS_SYMLINK_DIR", 1],
    ["UV_FS_SYMLINK_JUNCTION", 2],
    ["O_RDONLY", 0],
    ["O_WRONLY", 1],
    ["O_RDWR", 2],
    ["UV_DIRENT_UNKNOWN", 0],
    ["UV_DIRENT_FILE", 1],
    ["UV_DIRENT_DIR", 2],
    ["UV_DIRENT_LINK", 3],
    ["UV_DIRENT_FIFO", 4],
    ["UV_DIRENT_SOCKET", 5],
    ["UV_DIRENT_CHAR", 6],
    ["UV_DIRENT_BLOCK", 7],
    ["EXTENSIONLESS_FORMAT_JAVASCRIPT", 0],
    ["EXTENSIONLESS_FORMAT_WASM", 1],
    ["S_IFMT", 61440],
    ["S_IFREG", 32768],
    ["S_IFDIR", 16384],
    ["S_IFCHR", 8192],
    ["S_IFBLK", 24576],
    ["S_IFIFO", 4096],
    ["S_IFLNK", 40960],
    ["S_IFSOCK", 49152],
];
const fsPosixModes = [
    ["S_IRWXU", 448],
    ["S_IRUSR", 256],
    ["S_IWUSR", 128],
    ["S_IXUSR", 64],
    ["S_IRWXG", 56],
    ["S_IRGRP", 32],
    ["S_IWGRP", 16],
    ["S_IXGRP", 8],
    ["S_IRWXO", 7],
    ["S_IROTH", 4],
    ["S_IWOTH", 2],
    ["S_IXOTH", 1],
];
const fsAccessAndCopy = [
    ["F_OK", 0],
    ["R_OK", 4],
    ["W_OK", 2],
    ["X_OK", 1],
    ["UV_FS_COPYFILE_EXCL", 1],
    ["COPYFILE_EXCL", 1],
    ["UV_FS_COPYFILE_FICLONE", 2],
    ["COPYFILE_FICLONE", 2],
    ["UV_FS_COPYFILE_FICLONE_FORCE", 4],
    ["COPYFILE_FICLONE_FORCE", 4],
];
// Open flags in Node.js order; a flag a platform lacks is omitted.
function fsOpenFlags(v) {
    const names = [
        "O_CREAT",
        "O_EXCL",
        "UV_FS_O_FILEMAP",
        "UV_FS_O_TEMPORARY",
        "UV_FS_O_SHORT_LIVED",
        "UV_FS_O_SEQUENTIAL",
        "UV_FS_O_RANDOM",
        "O_NOCTTY",
        "O_TRUNC",
        "O_APPEND",
        "O_DIRECTORY",
        "O_NOATIME",
        "O_NOFOLLOW",
        "O_SYNC",
        "O_DSYNC",
        "O_SYMLINK",
        "O_DIRECT",
        "O_NONBLOCK",
    ];
    const out = [];
    for (const name of names) if (name in v) out.push([name, v[name]]);
    return out;
}
function fsConstantEntries() {
    if (fsPlatform === "win32") {
        return [
            ["UV_FS_SYMLINK_DIR", 1],
            ["UV_FS_SYMLINK_JUNCTION", 2],
            ["O_RDONLY", 0],
            ["O_WRONLY", 1],
            ["O_RDWR", 2],
            ["UV_DIRENT_UNKNOWN", 0],
            ["UV_DIRENT_FILE", 1],
            ["UV_DIRENT_DIR", 2],
            ["UV_DIRENT_LINK", 3],
            ["UV_DIRENT_FIFO", 4],
            ["UV_DIRENT_SOCKET", 5],
            ["UV_DIRENT_CHAR", 6],
            ["UV_DIRENT_BLOCK", 7],
            ["S_IFMT", 61440],
            ["S_IFREG", 32768],
            ["S_IFDIR", 16384],
            ["S_IFCHR", 8192],
            ["S_IFIFO", 4096],
            ["S_IFLNK", 40960],
            ...fsOpenFlags({
                O_CREAT: 256,
                O_EXCL: 1024,
                UV_FS_O_FILEMAP: 536870912,
                UV_FS_O_TEMPORARY: 64,
                UV_FS_O_SHORT_LIVED: 4096,
                UV_FS_O_SEQUENTIAL: 32,
                UV_FS_O_RANDOM: 16,
                O_TRUNC: 512,
                O_APPEND: 8,
                O_SYNC: 134217728,
                O_DSYNC: 67108864,
                O_DIRECT: 33554432,
            }),
            ["S_IRUSR", 256],
            ["S_IWUSR", 128],
            ...fsAccessAndCopy,
        ];
    }
    let flags;
    if (fsPlatform === "darwin") {
        flags = {
            O_CREAT: 512,
            O_EXCL: 2048,
            UV_FS_O_FILEMAP: 0,
            O_NOCTTY: 131072,
            O_TRUNC: 1024,
            O_APPEND: 8,
            O_DIRECTORY: 1048576,
            O_NOFOLLOW: 256,
            O_SYNC: 128,
            O_DSYNC: 4194304,
            O_SYMLINK: 2097152,
            O_NONBLOCK: 4,
        };
    } else if (fsPlatform === "freebsd") {
        flags = {
            O_CREAT: 512,
            O_EXCL: 2048,
            UV_FS_O_FILEMAP: 0,
            O_NOCTTY: 32768,
            O_TRUNC: 1024,
            O_APPEND: 8,
            O_DIRECTORY: 131072,
            O_NOFOLLOW: 256,
            O_SYNC: 128,
            O_DSYNC: 16777216,
            O_DIRECT: 65536,
            O_NONBLOCK: 4,
        };
    } else if (fsPlatform === "openbsd") {
        flags = {
            O_CREAT: 512,
            O_EXCL: 2048,
            UV_FS_O_FILEMAP: 0,
            O_NOCTTY: 32768,
            O_TRUNC: 1024,
            O_APPEND: 8,
            O_DIRECTORY: 131072,
            O_NOFOLLOW: 256,
            O_SYNC: 128,
            O_DSYNC: 128,
            O_NONBLOCK: 4,
        };
    } else {
        flags = {
            O_CREAT: 64,
            O_EXCL: 128,
            UV_FS_O_FILEMAP: 0,
            O_NOCTTY: 256,
            O_TRUNC: 512,
            O_APPEND: 1024,
            O_DIRECTORY: 65536,
            O_NOATIME: 262144,
            O_NOFOLLOW: 131072,
            O_SYNC: 1052672,
            O_DSYNC: 4096,
            O_DIRECT: 16384,
            O_NONBLOCK: 2048,
        };
    }
    return [
        ...fsPosixCommon,
        ...fsOpenFlags(flags),
        ...fsPosixModes,
        ...fsAccessAndCopy,
    ];
}
export const constants = Object.fromEntries(fsConstantEntries());
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
    mkdtempSync,
    rmSync,
    rmdirSync,
    unlinkSync,
    renameSync,
    chmodSync,
    utimesSync,
    truncateSync,
    copyFileSync,
    symlinkSync,
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
    mkdtemp,
    rm,
    rmdir,
    unlink,
    rename,
    chmod,
    utimes,
    truncate,
    copyFile,
    symlink,
    promises,
    Dirent,
    Stats,
    constants,
};
