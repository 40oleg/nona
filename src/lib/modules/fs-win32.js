import { define, lastError } from "nona:ffi";
const CreateFileW = define(
    "kernel32.dll",
    "CreateFileW",
    "ptr(wstr,u32,u32,ptr,u32,u32,ptr)",
);
const ReadFile = define(
    "kernel32.dll",
    "ReadFile",
    "bool(ptr,buf,u32,buf,ptr)",
);
const WriteFile = define(
    "kernel32.dll",
    "WriteFile",
    "bool(ptr,buf,u32,buf,ptr)",
);
const GetFileSizeEx = define("kernel32.dll", "GetFileSizeEx", "bool(ptr,buf)");
const GetFileInformationByHandle = define(
    "kernel32.dll",
    "GetFileInformationByHandle",
    "bool(ptr,buf)",
);
const GetFileInformationByHandleEx = define(
    "kernel32.dll",
    "GetFileInformationByHandleEx",
    "bool(ptr,u32,buf,u32)",
);
const GetFinalPathNameByHandleW = define(
    "kernel32.dll",
    "GetFinalPathNameByHandleW",
    "u32(ptr,buf,u32,u32)",
);
const CloseHandle = define("kernel32.dll", "CloseHandle", "bool(ptr)");
const GetStdHandle = define("kernel32.dll", "GetStdHandle", "ptr(i32)");
const GetFileAttributesExW = define(
    "kernel32.dll",
    "GetFileAttributesExW",
    "bool(wstr,u32,buf)",
);
const CreateDirectoryW = define(
    "kernel32.dll",
    "CreateDirectoryW",
    "bool(wstr,ptr)",
);
const RemoveDirectoryW = define(
    "kernel32.dll",
    "RemoveDirectoryW",
    "bool(wstr)",
);
const DeleteFileW = define("kernel32.dll", "DeleteFileW", "bool(wstr)");
const CopyFileW = define("kernel32.dll", "CopyFileW", "bool(wstr,wstr,bool)");
const MoveFileExW = define(
    "kernel32.dll",
    "MoveFileExW",
    "bool(wstr,wstr,u32)",
);
const SetFilePointerEx = define(
    "kernel32.dll",
    "SetFilePointerEx",
    "bool(ptr,i64,ptr,u32)",
);
const SetEndOfFile = define("kernel32.dll", "SetEndOfFile", "bool(ptr)");
const FindFirstFileW = define(
    "kernel32.dll",
    "FindFirstFileW",
    "ptr(wstr,buf)",
);
const FindNextFileW = define("kernel32.dll", "FindNextFileW", "bool(ptr,buf)");
const FindClose = define("kernel32.dll", "FindClose", "bool(ptr)");
const DeviceIoControl = define(
    "kernel32.dll",
    "DeviceIoControl",
    "bool(ptr,u32,ptr,u32,buf,u32,buf,ptr)",
);
const GetFileAttributesW = define(
    "kernel32.dll",
    "GetFileAttributesW",
    "u32(wstr)",
);
const SetFileAttributesW = define(
    "kernel32.dll",
    "SetFileAttributesW",
    "bool(wstr,u32)",
);
const SetFileTime = define(
    "kernel32.dll",
    "SetFileTime",
    "bool(ptr,ptr,buf,buf)",
);
const DeviceIoControlIn = define(
    "kernel32.dll",
    "DeviceIoControl",
    "bool(ptr,u32,buf,u32,ptr,u32,buf,ptr)",
);
const CreateSymbolicLinkW = define(
    "kernel32.dll",
    "CreateSymbolicLinkW",
    // Returns a BOOLEAN (one byte); the rest of the register is undefined.
    "u8(wstr,wstr,u32)",
);
const INVALID_HANDLE = -1,
    DIRECTORY = 0x10,
    REPARSE_POINT = 0x400,
    BACKUP_SEMANTICS = 0x02000000,
    OPEN_REPARSE_POINT = 0x00200000,
    SYMLINK_TAG = 0xa000000c,
    MOUNT_POINT_TAG = 0xa0000003;
// libuv error numbers as Node.js reports them on Windows.
const errnos = {
    EPERM: -4048,
    ENOENT: -4058,
    EIO: -4070,
    EBADF: -4083,
    EACCES: -4092,
    EBUSY: -4082,
    EEXIST: -4075,
    EXDEV: -4037,
    ENOTDIR: -4052,
    EISDIR: -4068,
    EINVAL: -4071,
    ENOTEMPTY: -4051,
    ELOOP: -4114,
    UNKNOWN: -4094,
};
function codeOf(error) {
    switch (error) {
        case 2:
        case 3:
        case 15:
        case 53:
        case 67:
        case 123:
        case 161:
        case 206:
            return "ENOENT";
        case 5:
        case 19:
        case 1314:
            return "EPERM";
        case 32:
        case 33:
            return "EBUSY";
        case 80:
        case 183:
            return "EEXIST";
        case 145:
            return "ENOTEMPTY";
        case 267:
            return "ENOTDIR";
        case 17:
            return "EXDEV";
        case 87:
            return "EINVAL";
        case 6:
            return "EBADF";
        default:
            return "UNKNOWN";
    }
}
function error(syscall, path, dest) {
    let code = codeOf(lastError());
    // Reading a directory as a file fails with EISDIR from read() in Node.js.
    if (code === "EPERM" && syscall === "open" && isDirectory(path)) {
        code = "EISDIR";
        syscall = "read";
    }
    fail(code, syscall, path, dest);
}
const attributeData = new Uint8Array(36),
    attributeView = new DataView(attributeData.buffer);
function attributes(path) {
    if (!GetFileAttributesExW(path, 0, attributeData)) return null;
    return attributeView.getUint32(0, true);
}
function isDirectory(path) {
    const a = attributes(path);
    return a !== null && (a & DIRECTORY) !== 0;
}
const counter = new Uint32Array(1);
/** The target of a symbolic link or junction, or null for other files. */
function linkTarget(path, throws = false) {
    const handle = CreateFileW(
        path,
        0,
        7,
        null,
        3,
        BACKUP_SEMANTICS | OPEN_REPARSE_POINT,
        null,
    );
    if (handle === INVALID_HANDLE) {
        if (throws) error("readlink", path);
        return null;
    }
    const data = new Uint8Array(16384),
        view = new DataView(data.buffer);
    try {
        // FSCTL_GET_REPARSE_POINT fills a REPARSE_DATA_BUFFER.
        if (
            !DeviceIoControl(
                handle,
                0x000900a8,
                null,
                0,
                data,
                data.length,
                counter,
                null,
            )
        )
            return null;
    } finally {
        CloseHandle(handle);
    }
    const tag = view.getUint32(0, true);
    if (tag !== SYMLINK_TAG && tag !== MOUNT_POINT_TAG) return null;
    const buffer = tag === SYMLINK_TAG ? 20 : 16,
        offset = view.getUint16(8, true),
        length = view.getUint16(10, true);
    let value = "";
    for (let i = 0; i < length; i += 2)
        value += String.fromCharCode(view.getUint16(buffer + offset + i, true));
    return value.startsWith("\\??\\UNC\\")
        ? "\\\\" + value.slice(8)
        : value.startsWith("\\??\\")
          ? value.slice(4)
          : value;
}
/** A directory with a mount-point reparse buffer; the target must be absolute. */
function junction(target, path) {
    const absolute = resolve(target).split("/").join("\\");
    const substitute = "\\??\\" + absolute,
        print = absolute;
    const subBytes = substitute.length * 2,
        printBytes = print.length * 2;
    const data = new Uint8Array(16 + subBytes + printBytes + 4),
        view = new DataView(data.buffer);
    view.setUint32(0, MOUNT_POINT_TAG, true);
    view.setUint16(4, 8 + subBytes + printBytes + 4, true);
    view.setUint16(10, subBytes, true);
    view.setUint16(12, subBytes + 2, true);
    view.setUint16(14, printBytes, true);
    for (let i = 0; i < substitute.length; i++)
        view.setUint16(16 + i * 2, substitute.charCodeAt(i), true);
    for (let i = 0; i < print.length; i++)
        view.setUint16(18 + subBytes + i * 2, print.charCodeAt(i), true);
    if (!CreateDirectoryW(path, null)) error("symlink", target, path);
    const handle = CreateFileW(
        path,
        0x40000000,
        7,
        null,
        3,
        BACKUP_SEMANTICS | OPEN_REPARSE_POINT,
        null,
    );
    if (handle !== INVALID_HANDLE) {
        try {
            // FSCTL_SET_REPARSE_POINT
            if (
                DeviceIoControlIn(
                    handle,
                    0x000900a4,
                    data,
                    data.length,
                    null,
                    0,
                    counter,
                    null,
                )
            )
                return;
        } finally {
            CloseHandle(handle);
        }
    }
    const code = codeOf(lastError());
    RemoveDirectoryW(path);
    fail(code, "symlink", target, path);
}
function isAbsoluteWin32(path) {
    const first = path.charCodeAt(0) | 32;
    return path[0] === "\\" || (first >= 97 && first <= 122 && path[1] === ":");
}
const sys = {
    separator: "\\",
    readAllFd(fd) {
        const handle = GetStdHandle(-10 - fd);
        if (handle === null || handle === INVALID_HANDLE) fail("EBADF", "read");
        return readChunks(0, (part) => {
            if (
                !ReadFile(
                    handle,
                    part,
                    Math.min(part.length, 0x40000000),
                    counter,
                    null,
                )
            ) {
                // A closed pipe is the end of the input.
                if (lastError() === 109) return 0;
                error("read");
            }
            return counter[0];
        });
    },
    writeAllFd(fd, bytes) {
        const handle = GetStdHandle(-10 - fd);
        if (handle === null || handle === INVALID_HANDLE)
            fail("EBADF", "write");
        let offset = 0;
        while (offset < bytes.length) {
            const part = bytes.subarray(
                offset,
                offset + Math.min(bytes.length - offset, 0x40000000),
            );
            if (!WriteFile(handle, part, part.length, counter, null))
                error("write");
            offset += counter[0];
        }
    },
    readAll(path) {
        const handle = CreateFileW(path, 0x80000000, 7, null, 3, 0x80, null);
        if (handle === INVALID_HANDLE) error("open", path);
        try {
            const size = new Uint8Array(8),
                view = new DataView(size.buffer);
            if (!GetFileSizeEx(handle, size)) error("read", path);
            const expected =
                view.getUint32(0, true) + view.getUint32(4, true) * 4294967296;
            return readChunks(expected, (part) => {
                if (
                    !ReadFile(
                        handle,
                        part,
                        Math.min(part.length, 0x40000000),
                        counter,
                        null,
                    )
                )
                    error("read", path);
                return counter[0];
            });
        } finally {
            CloseHandle(handle);
        }
    },
    writeAll(path, bytes, append, exclusive = false, mode = 0o666) {
        const handle = CreateFileW(
            path,
            append ? 0x4 : 0x40000000,
            7,
            null,
            exclusive ? 1 : append ? 4 : 2,
            0x80,
            null,
        );
        if (handle === INVALID_HANDLE) error("open", path);
        try {
            let offset = 0;
            while (offset < bytes.length) {
                const part = bytes.subarray(
                    offset,
                    offset + Math.min(bytes.length - offset, 0x40000000),
                );
                if (!WriteFile(handle, part, part.length, counter, null))
                    error("write", path);
                offset += counter[0];
            }
        } finally {
            CloseHandle(handle);
        }
    },
    stat(path, noFollow = false) {
        const a = attributes(path);
        if (a === null) {
            const code = codeOf(lastError());
            if (code === "ENOENT" || code === "ENOTDIR") return null;
            fail(code, "stat", path);
        }
        const size =
            attributeView.getUint32(32, true) +
            attributeView.getUint32(28, true) * 4294967296;
        const ticks =
            attributeView.getUint32(20, true) +
            attributeView.getUint32(24, true) * 4294967296;
        const directory = (a & DIRECTORY) !== 0;
        const handle = CreateFileW(
            path,
            0,
            7,
            null,
            3,
            BACKUP_SEMANTICS | (noFollow ? OPEN_REPARSE_POINT : 0),
            null,
        );
        if (handle === INVALID_HANDLE) error(noFollow ? "lstat" : "stat", path);
        const identity = new Uint8Array(52),
            identityView = new DataView(identity.buffer),
            fileId = new Uint8Array(24),
            idView = new DataView(fileId.buffer);
        let extended = false;
        try {
            if (!GetFileInformationByHandle(handle, identity))
                error("stat", path);
            extended = GetFileInformationByHandleEx(
                handle,
                18,
                fileId,
                fileId.length,
            );
        } finally {
            CloseHandle(handle);
        }
        const targetDirectory =
            (identityView.getUint32(0, true) & DIRECTORY) !== 0;
        const targetSize =
            identityView.getUint32(36, true) +
            identityView.getUint32(32, true) * 4294967296;
        const targetTicks =
            identityView.getUint32(20, true) +
            identityView.getUint32(24, true) * 4294967296;
        return {
            kind: targetDirectory ? "dir" : "file",
            size: targetDirectory ? 0 : targetSize,
            dev: extended
                ? idView.getBigUint64(0, true)
                : BigInt(identityView.getUint32(28, true)),
            ino: extended
                ? idView.getBigUint64(8, true) |
                  (idView.getBigUint64(16, true) << 64n)
                : (BigInt(identityView.getUint32(44, true)) << 32n) |
                  BigInt(identityView.getUint32(48, true)),
            mtimeMs: (targetTicks - 116444736000000000) / 10000,
            mode: targetDirectory ? 0o40666 : 0o100666,
        };
    },
    lstat(path) {
        const result = sys.stat(path, true);
        if (result && attributes(path) & REPARSE_POINT && linkTarget(path)) {
            result.kind = "symlink";
            result.mode = 0o120666;
        }
        return result;
    },
    readlink(path) {
        const target = linkTarget(path, true);
        if (target === null) fail("EINVAL", "readlink", path);
        return target;
    },
    symlink(target, path, type) {
        if (type === "junction") return junction(target, path);
        target = target.split("/").join("\\");
        let flags = 2;
        if (type === "dir") flags |= 1;
        else if (type !== "file") {
            const absolute = isAbsoluteWin32(target)
                ? target
                : join(dirname(resolve(path)), target);
            if (isDirectory(absolute)) flags |= 1;
        }
        if (CreateSymbolicLinkW(path, target, flags) === 0)
            error("symlink", target, path);
    },
    realpath(path) {
        const handle = CreateFileW(path, 0, 7, null, 3, 0x02000000, null);
        if (handle === INVALID_HANDLE) error("realpath", path);
        try {
            let data = new Uint16Array(1024),
                length = GetFinalPathNameByHandleW(
                    handle,
                    data,
                    data.length,
                    0,
                );
            if (!length) error("realpath", path);
            if (length >= data.length) {
                data = new Uint16Array(length + 1);
                length = GetFinalPathNameByHandleW(
                    handle,
                    data,
                    data.length,
                    0,
                );
                if (!length || length >= data.length) error("realpath", path);
            }
            let value = "";
            for (let i = 0; i < length; i++)
                value += String.fromCharCode(data[i]);
            return value.startsWith("\\\\?\\UNC\\")
                ? "\\\\" + value.slice(8)
                : value.startsWith("\\\\?\\")
                  ? value.slice(4)
                  : value;
        } finally {
            CloseHandle(handle);
        }
    },
    readdir(path) {
        const data = new Uint8Array(592),
            view = new DataView(data.buffer);
        const pattern =
            path.endsWith("\\") || path.endsWith("/")
                ? path + "*"
                : path + "\\*";
        const handle = FindFirstFileW(pattern, data);
        if (handle === INVALID_HANDLE) {
            const code = codeOf(lastError());
            if (code === "ENOENT" && attributes(path) !== null)
                fail("ENOTDIR", "scandir", path);
            fail(code, "scandir", path);
        }
        const names = [];
        try {
            do {
                let name = "";
                for (let i = 44; i < 564; i += 2) {
                    const c = view.getUint16(i, true);
                    if (c === 0) break;
                    name += String.fromCharCode(c);
                }
                if (name !== "." && name !== "..") names.push(name);
            } while (FindNextFileW(handle, data));
        } finally {
            FindClose(handle);
        }
        return names;
    },
    mkdir(path) {
        if (!CreateDirectoryW(path, null)) error("mkdir", path);
    },
    rmdir(path) {
        if (!RemoveDirectoryW(path)) error("rmdir", path);
    },
    unlink(path) {
        if (!DeleteFileW(path)) {
            if (isDirectory(path)) fail("EPERM", "unlink", path);
            error("unlink", path);
        }
    },
    truncate(path, len) {
        // GENERIC_WRITE, share read/write/delete, OPEN_EXISTING.
        const handle = CreateFileW(path, 0x40000000, 7, null, 3, 0x80, null);
        if (handle === INVALID_HANDLE) error("open", path);
        try {
            if (!SetFilePointerEx(handle, len, null, 0)) error("open", path);
            if (!SetEndOfFile(handle)) error("open", path);
        } finally {
            CloseHandle(handle);
        }
    },
    rename(from, to) {
        if (!MoveFileExW(from, to, 3)) error("rename", from, to);
    },
    chmod(path, mode) {
        // Like Node.js, only the read-only attribute reflects the write bit.
        const current = GetFileAttributesW(path);
        if (current === 0xffffffff) error("chmod", path);
        const next = mode & 0o200 ? current & ~1 : current | 1;
        if (next !== current && !SetFileAttributesW(path, next || 0x80))
            error("chmod", path);
    },
    utimes(path, atime, mtime) {
        const handle = CreateFileW(
            path,
            0x100,
            7,
            null,
            3,
            BACKUP_SEMANTICS,
            null,
        );
        if (handle === INVALID_HANDLE) error("utime", path);
        const times = new Uint8Array(16),
            view = new DataView(times.buffer);
        [atime, mtime].forEach((value, i) => {
            // 100-nanosecond ticks since 1601, split in two 32-bit words.
            const ticks = Math.round(value * 1e7) + 116444736000000000;
            const high = Math.floor(ticks / 4294967296);
            view.setUint32(i * 8, ticks - high * 4294967296, true);
            view.setUint32(i * 8 + 4, high, true);
        });
        try {
            const access = times.subarray(0, 8),
                write = times.subarray(8, 16);
            if (!SetFileTime(handle, null, access, write)) error("utime", path);
        } finally {
            CloseHandle(handle);
        }
    },
    copy(from, to) {
        if (!CopyFileW(from, to, false)) error("copyfile", from, to);
    },
};
