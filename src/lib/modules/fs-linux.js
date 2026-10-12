import { define } from "nona:ffi";
const sysRead = define("syscall", "0", "i64(i64,buf,i64)");
const sysWrite = define("syscall", "1", "i64(i64,buf,i64)");
const sysOpen = define("syscall", "2", "i64(buf,i64,i64)");
const sysClose = define("syscall", "3", "i64(i64)");
const sysStat = define("syscall", "4", "i64(buf,buf)");
const sysLstat = define("syscall", "6", "i64(buf,buf)");
const sysReadlink = define("syscall", "89", "i64(buf,buf,i64)");
const sysFstat = define("syscall", "5", "i64(i64,buf)");
const sysRename = define("syscall", "82", "i64(buf,buf)");
const sysMkdir = define("syscall", "83", "i64(buf,i64)");
const sysRmdir = define("syscall", "84", "i64(buf)");
const sysUnlink = define("syscall", "87", "i64(buf)");
const sysGetdents = define("syscall", "217", "i64(i64,buf,i64)");
const O_WRONLY = 1,
    O_CREAT = 0x40,
    O_TRUNC = 0x200,
    O_APPEND = 0x400,
    O_DIRECTORY = 0x10000,
    O_CLOEXEC = 0x80000;
const codes = {
    1: "EPERM",
    2: "ENOENT",
    5: "EIO",
    9: "EBADF",
    13: "EACCES",
    16: "EBUSY",
    17: "EEXIST",
    18: "EXDEV",
    20: "ENOTDIR",
    21: "EISDIR",
    22: "EINVAL",
    39: "ENOTEMPTY",
};
function check(result, syscall, path, dest) {
    if (result < 0) fail(codes[-result] || "UNKNOWN", syscall, path, dest);
    return result;
}
function cpath(path) {
    const bytes = encoder.encode(path),
        out = new Uint8Array(bytes.length + 1);
    out.set(bytes);
    return out;
}
const statBuffer = new Uint8Array(144),
    statView = new DataView(statBuffer.buffer);
function statResult() {
    const mode = statView.getUint32(24, true),
        type = mode & 0o170000;
    const size =
        statView.getUint32(48, true) +
        statView.getUint32(52, true) * 4294967296;
    const seconds =
        statView.getUint32(88, true) + statView.getInt32(92, true) * 4294967296;
    const nanos = statView.getUint32(96, true);
    return {
        kind:
            type === 0o040000
                ? "dir"
                : type === 0o100000
                  ? "file"
                  : type === 0o120000
                    ? "link"
                    : "other",
        size,
        mtimeMs: seconds * 1000 + nanos / 1e6,
        mode,
        dev: statView.getBigUint64(0, true),
        ino: statView.getBigUint64(8, true),
    };
}
function readAllFd(fd, path) {
    check(sysFstat(fd, statBuffer), "read", path);
    return readChunks(statResult().size, (part) =>
        check(sysRead(fd, part, part.length), "read", path),
    );
}
function writeAllFd(fd, bytes, path) {
    let offset = 0;
    while (offset < bytes.length)
        offset += check(
            sysWrite(fd, bytes.subarray(offset), bytes.length - offset),
            "write",
            path,
        );
}
const sys = {
    separator: "/",
    readAll(path) {
        const fd = check(sysOpen(cpath(path), O_CLOEXEC, 0), "open", path);
        try {
            return readAllFd(fd, path);
        } finally {
            sysClose(fd);
        }
    },
    writeAll(path, bytes, append, exclusive = false, mode = 0o666) {
        const fd = check(
            sysOpen(
                cpath(path),
                O_WRONLY |
                    O_CREAT |
                    O_CLOEXEC |
                    (exclusive ? 0x80 : 0) |
                    (append ? O_APPEND : O_TRUNC),
                mode,
            ),
            "open",
            path,
        );
        try {
            writeAllFd(fd, bytes, path);
        } finally {
            sysClose(fd);
        }
    },
    stat(path) {
        const result = sysStat(cpath(path), statBuffer);
        if (result === -2 || result === -20) return null;
        check(result, "stat", path);
        return statResult();
    },
    lstat(path) {
        const result = sysLstat(cpath(path), statBuffer);
        check(result, "lstat", path);
        return statResult();
    },
    realpath(path) {
        let parts = path.split("/").filter(Boolean),
            resolved = "/",
            links = 0;
        while (parts.length) {
            const part = parts.shift();
            if (part === ".") continue;
            if (part === "..") {
                resolved = dirname(resolved);
                continue;
            }
            const candidate = join(resolved, part),
                data = new Uint8Array(65536),
                length = sysReadlink(cpath(candidate), data, data.length);
            if (length === -22) {
                if (this.stat(candidate) === null)
                    fail("ENOENT", "realpath", path);
                resolved = candidate;
                continue;
            }
            check(length, "realpath", path);
            if (length === data.length) fail("EINVAL", "realpath", path);
            if (++links > 40) fail("ELOOP", "realpath", path);
            const destination = decoder.decode(data.subarray(0, length));
            if (destination.startsWith("/")) resolved = "/";
            parts = destination.split("/").filter(Boolean).concat(parts);
        }
        if (this.stat(resolved) === null) fail("ENOENT", "realpath", path);
        return resolved;
    },
    readdir(path) {
        const fd = check(
            sysOpen(cpath(path), O_DIRECTORY | O_CLOEXEC, 0),
            "scandir",
            path,
        );
        const buffer = new Uint8Array(32768),
            view = new DataView(buffer.buffer),
            names = [];
        try {
            for (;;) {
                const n = check(
                    sysGetdents(fd, buffer, buffer.length),
                    "scandir",
                    path,
                );
                if (n === 0) break;
                for (let offset = 0; offset < n;) {
                    const length = view.getUint16(offset + 16, true);
                    let end = offset + 19;
                    while (buffer[end] !== 0) end++;
                    const name = decoder.decode(
                        buffer.subarray(offset + 19, end),
                    );
                    if (name !== "." && name !== "..") names.push(name);
                    offset += length;
                }
            }
        } finally {
            sysClose(fd);
        }
        return names;
    },
    mkdir(path) {
        check(sysMkdir(cpath(path), 0o777), "mkdir", path);
    },
    rmdir(path) {
        check(sysRmdir(cpath(path)), "rmdir", path);
    },
    unlink(path) {
        check(sysUnlink(cpath(path)), "unlink", path);
    },
    rename(from, to) {
        check(sysRename(cpath(from), cpath(to)), "rename", from, to);
    },
    copy(from, to) {
        const input = check(
            sysOpen(cpath(from), O_CLOEXEC, 0),
            "copyfile",
            from,
            to,
        );
        let bytes;
        try {
            bytes = readAllFd(input, from);
        } finally {
            sysClose(input);
        }
        const output = check(
            sysOpen(cpath(to), O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0o666),
            "copyfile",
            from,
            to,
        );
        try {
            writeAllFd(output, bytes, to);
        } finally {
            sysClose(output);
        }
    },
};
