import { define, lastError } from "nona:ffi";
const CreateProcessW = define(
    "kernel32.dll",
    "CreateProcessW",
    "bool(wstr,buf,ptr,ptr,bool,u32,buf,wstr,buf,buf)",
);
const CreatePipe = define(
    "kernel32.dll",
    "CreatePipe",
    "bool(buf,buf,ptr,u32)",
);
const CreateFileW = define(
    "kernel32.dll",
    "CreateFileW",
    "ptr(wstr,u32,u32,ptr,u32,u32,ptr)",
);
const SetHandleInformation = define(
    "kernel32.dll",
    "SetHandleInformation",
    "bool(ptr,u32,u32)",
);
const SetNamedPipeHandleState = define(
    "kernel32.dll",
    "SetNamedPipeHandleState",
    "bool(ptr,buf,ptr,ptr)",
);
const PeekNamedPipe = define(
    "kernel32.dll",
    "PeekNamedPipe",
    "bool(ptr,ptr,u32,ptr,buf,ptr)",
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
const CloseHandle = define("kernel32.dll", "CloseHandle", "bool(ptr)");
const GetStdHandle = define("kernel32.dll", "GetStdHandle", "ptr(i32)");
const GetCurrentProcess = define("kernel32.dll", "GetCurrentProcess", "ptr()");
const DuplicateHandle = define(
    "kernel32.dll",
    "DuplicateHandle",
    "bool(ptr,ptr,ptr,buf,u32,bool,u32)",
);
const TerminateProcess = define(
    "kernel32.dll",
    "TerminateProcess",
    "bool(ptr,u32)",
);
const GetExitCodeProcess = define(
    "kernel32.dll",
    "GetExitCodeProcess",
    "bool(ptr,buf)",
);
const WaitForSingleObject = define(
    "kernel32.dll",
    "WaitForSingleObject",
    "u32(ptr,u32)",
);
const WaitForMultipleObjects = define(
    "kernel32.dll",
    "WaitForMultipleObjects",
    "u32(u32,buf,bool,u32)",
);
const GetFileAttributesW = define(
    "kernel32.dll",
    "GetFileAttributesW",
    "u32(wstr)",
);
const Sleep = define("kernel32.dll", "Sleep", "void(u32)");
// Windows errors as Linux errno values (as libuv translates them).
const winErrors = {
    2: 2,
    3: 2,
    5: 13,
    6: 9,
    8: 12,
    14: 12,
    15: 2,
    87: 22,
    109: 32,
    123: 2,
    161: 2,
    193: 8,
    206: 36,
    232: 32,
    267: 2,
    1450: 12,
};
const uvErrors = {
    E2BIG: -4093,
    EACCES: -4092,
    EAGAIN: -4088,
    EBADF: -4083,
    EINVAL: -4071,
    EIO: -4070,
    EISDIR: -4068,
    EMFILE: -4066,
    ENAMETOOLONG: -4064,
    ENOBUFS: -4060,
    ENOENT: -4058,
    ENOMEM: -4057,
    ENOSYS: -4054,
    ENOTDIR: -4052,
    EPERM: -4048,
    EPIPE: -4047,
    ESRCH: -4040,
    ETIMEDOUT: -4039,
};
function failure() {
    return -(winErrors[lastError()] || 22);
}
const handleOut = new Uint8Array(8),
    handleOut2 = new Uint8Array(8),
    countOut = new Uint32Array(1),
    nowait = new Uint32Array([1]);
function readHandle(bytes, offset) {
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    const low = view.getUint32(offset, true),
        high = view.getInt32(offset + 4, true);
    return high * 4294967296 + low;
}
function writeHandle(view, offset, handle) {
    const high = Math.floor(handle / 4294967296);
    view.setUint32(offset, handle - high * 4294967296, true);
    view.setInt32(offset + 4, high, true);
}
function wide(text) {
    const out = new Uint16Array(text.length + 1);
    for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
    return out;
}

// ---- Command line (libuv's quote_cmd_arg) ----------------------------------
function quoteArgument(arg) {
    if (arg === "") return '""';
    if (!/[ \t"]/.test(arg)) return arg;
    if (!/["\\]/.test(arg)) return '"' + arg + '"';
    // Backslashes are literal unless they precede a quote: double those, and
    // the ones before the closing quote, and escape every quote.
    let out = '"',
        backslashes = 0;
    for (let i = 0; i < arg.length; i++) {
        const c = arg[i];
        if (c === "\\") {
            backslashes++;
            continue;
        }
        if (c === '"') out += "\\".repeat(2 * backslashes + 1) + '"';
        else out += "\\".repeat(backslashes) + c;
        backslashes = 0;
    }
    return out + "\\".repeat(2 * backslashes) + '"';
}
function commandLine(args, verbatim) {
    return (verbatim ? args : args.map(quoteArgument)).join(" ");
}

// ---- Executable search (libuv's search_path) -------------------------------
function isFile(path) {
    const attributes = GetFileAttributesW(path);
    return attributes !== 0xffffffff && (attributes & 0x10) === 0;
}
function isAbsolute(path) {
    return /^([A-Za-z]:)?[\\/]/.test(path);
}
function joinTest(dir, name, ext, cwd) {
    let path = dir;
    if (path !== "" && !/[\\/:]$/.test(path)) path += "\\";
    path += name + ext;
    if (!isAbsolute(path) && !/^[A-Za-z]:/.test(path))
        path = cwd + (/[\\/]$/.test(cwd) ? "" : "\\") + path;
    return isFile(path) ? path : null;
}
// Like libuv: the name as given when it has an extension, then .com and .exe.
function walkExtensions(dir, name, cwd) {
    const dot = name.lastIndexOf(".");
    if (dot > 0 && dot < name.length - 1) {
        const found = joinTest(dir, name, "", cwd);
        if (found !== null) return found;
    }
    return joinTest(dir, name, ".com", cwd) || joinTest(dir, name, ".exe", cwd);
}
function searchPath(file, cwd, path) {
    if (file === "" || file.endsWith(".")) return null;
    let start = file.length;
    while (start > 0 && !/[\\/:]/.test(file[start - 1])) start--;
    const name = file.slice(start);
    if (name === "") return null;
    if (start > 0) return walkExtensions(file.slice(0, start), name, cwd);
    // The current directory comes first, then every PATH entry.
    const found = walkExtensions("", name, cwd);
    if (found !== null) return found;
    for (let entry of (path || "").split(";")) {
        entry = entry.replace(/"/g, "");
        if (entry === "") continue;
        const result = walkExtensions(entry, name, cwd);
        if (result !== null) return result;
    }
    return null;
}

// ---- Environment block -----------------------------------------------------
// Variables a Windows process needs; libuv copies them from the parent when
// the environment given to the child lacks them.
const requiredVariables = [
    "HOMEDRIVE",
    "HOMEPATH",
    "LOGONSERVER",
    "PATH",
    "SYSTEMDRIVE",
    "SYSTEMROOT",
    "TEMP",
    "USERDOMAIN",
    "USERNAME",
    "USERPROFILE",
    "WINDIR",
];
function keyOf(pair) {
    const equals = pair.indexOf("=", 1);
    return (equals < 0 ? pair : pair.slice(0, equals)).toUpperCase();
}
function environmentBlock(pairs) {
    const seen = new Set(),
        list = [];
    for (const pair of pairs) {
        const key = keyOf(pair);
        if (seen.has(key)) continue;
        seen.add(key);
        list.push(pair);
    }
    for (const name of requiredVariables) {
        if (seen.has(name)) continue;
        for (const key of Object.keys(process.env))
            if (key.toUpperCase() === name) {
                list.push(key + "=" + process.env[key]);
                break;
            }
    }
    list.sort((a, b) => {
        const x = keyOf(a),
            y = keyOf(b);
        return x < y ? -1 : x > y ? 1 : 0;
    });
    let length = 1;
    for (const pair of list) length += pair.length + 1;
    const block = new Uint16Array(Math.max(length, 2));
    let offset = 0;
    for (const pair of list) {
        for (let i = 0; i < pair.length; i++)
            block[offset++] = pair.charCodeAt(i);
        block[offset++] = 0;
    }
    return block;
}
function pathOf(pairs) {
    for (const pair of pairs)
        if (keyOf(pair) === "PATH") return pair.slice(pair.indexOf("=") + 1);
    return undefined;
}

// ---- Stdio -----------------------------------------------------------------
const HANDLE_FLAG_INHERIT = 1,
    PIPE_SIZE = 262144;
/** [parentEnd, childEnd]: the child end is inheritable, the parent end non-blocking for writes. */
function makePipe(childReads) {
    if (!CreatePipe(handleOut, handleOut2, null, PIPE_SIZE)) return failure();
    const read = readHandle(handleOut, 0),
        write = readHandle(handleOut2, 0);
    const parent = childReads ? write : read,
        child = childReads ? read : write;
    if (
        !SetHandleInformation(child, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT)
    ) {
        const result = failure();
        CloseHandle(read);
        CloseHandle(write);
        return result;
    }
    if (childReads) SetNamedPipeHandleState(parent, nowait, null, null);
    return [parent, child];
}
function inheritable(handle) {
    const self = GetCurrentProcess();
    if (handle === 0 || handle === -1) return -1;
    if (!DuplicateHandle(self, handle, self, handleOut, 0, true, 2)) return -1;
    return readHandle(handleOut, 0);
}
function nullDevice() {
    const handle = CreateFileW("NUL", 0xc0000000, 3, null, 3, 0, null);
    if (handle === -1) return failure();
    SetHandleInformation(handle, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT);
    return handle;
}

// ---- Readiness -------------------------------------------------------------
// Anonymous pipes cannot be waited for: PeekNamedPipe says whether one has
// data (or is closed), writes are retried after a slice, and between scans
// the layer waits on the process handles, or sleeps, for 1 to 16 ms.
const avail = new Uint32Array(1);
let slice = 1,
    lastWriteProbe = 0,
    waitHandles = new Uint8Array(8 * 64);
function scan(targets, writes) {
    const ready = [];
    for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        if (target.kind === 1) {
            if (
                !PeekNamedPipe(target.handle, null, 0, null, avail, null) ||
                avail[0] > 0
            )
                ready.push(i);
        } else if (target.kind === 2) {
            if (writes) ready.push(i);
        } else if (WaitForSingleObject(target.handle.handle, 0) === 0)
            ready.push(i);
    }
    return ready;
}
function waitProcesses(targets, timeout) {
    const view = new DataView(waitHandles.buffer);
    let count = 0;
    for (const target of targets)
        if (target.kind === 4 && count < 64)
            writeHandle(view, 8 * count++, target.handle.handle);
    if (count === 0) Sleep(timeout);
    else WaitForMultipleObjects(count, waitHandles, false, timeout);
}

const sys = {
    platform: "win32",
    READ: 1,
    WRITE: 2,
    EXIT: 4,
    errno(errno, code) {
        return uvErrors[code] || -errno;
    },
    spawn(request) {
        const cwd = request.cwd || process.cwd(),
            pairs = request.envPairs;
        const application = searchPath(request.file, cwd, pathOf(pairs));
        if (application === null) return -2;
        const line = commandLine(
            request.args,
            request.windowsVerbatimArguments,
        );
        if (line.length > 32767) return -7;
        const parents = [-1, -1, -1],
            children = [-1, -1, -1];
        const cleanup = (result) => {
            for (let i = 0; i < 3; i++) {
                if (parents[i] !== -1) CloseHandle(parents[i]);
                if (children[i] !== -1) CloseHandle(children[i]);
            }
            return result;
        };
        const stdHandles = [-10, -11, -12];
        for (let i = 0; i < 3; i++) {
            const kind = request.stdio[i];
            if (kind === "pipe") {
                const pipe = makePipe(i === 0);
                if (typeof pipe === "number") return cleanup(pipe);
                parents[i] = pipe[0];
                children[i] = pipe[1];
            } else if (kind === "inherit")
                children[i] = inheritable(GetStdHandle(stdHandles[i]));
            else {
                const handle = nullDevice();
                if (handle < 0) return cleanup(handle);
                children[i] = handle;
            }
        }
        const startup = new Uint8Array(104),
            startupView = new DataView(startup.buffer);
        startupView.setUint32(0, 104, true);
        // STARTF_USESTDHANDLES, and STARTF_USESHOWWINDOW with SW_HIDE.
        startupView.setUint32(60, request.windowsHide ? 0x101 : 0x100, true);
        startupView.setUint16(64, 0, true);
        for (let i = 0; i < 3; i++)
            writeHandle(startupView, 80 + 8 * i, children[i]);
        const information = new Uint8Array(24);
        // CREATE_UNICODE_ENVIRONMENT, plus CREATE_NO_WINDOW when hidden and
        // DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP when detached.
        let flags = 0x400;
        if (request.detached) flags |= 0x208;
        else if (request.windowsHide) flags |= 0x8000000;
        const ok = CreateProcessW(
            application,
            wide(line),
            null,
            null,
            true,
            flags,
            environmentBlock(pairs),
            request.cwd || null,
            startup,
            information,
        );
        if (!ok) {
            const result = failure();
            return cleanup(result);
        }
        for (let i = 0; i < 3; i++)
            if (children[i] !== -1) CloseHandle(children[i]);
        CloseHandle(readHandle(information, 8));
        const pid = new DataView(information.buffer).getUint32(16, true);
        return {
            pid,
            process: { handle: readHandle(information, 0), signal: 0 },
            stdio: parents,
        };
    },
    read(handle, buffer) {
        if (!PeekNamedPipe(handle, null, 0, null, avail, null)) {
            const error = lastError();
            return error === 109 || error === 232 ? 0 : failure();
        }
        if (avail[0] === 0) return -11;
        const size = Math.min(avail[0], buffer.length);
        if (!ReadFile(handle, buffer, size, countOut, null)) {
            const error = lastError();
            return error === 109 ? 0 : -(winErrors[error] || 22);
        }
        return countOut[0];
    },
    write(handle, bytes, offset, length) {
        // A non-blocking pipe takes nothing from a write larger than its free
        // space, so smaller writes are tried before reporting a full pipe.
        let size = Math.min(length, 65536);
        for (;;) {
            const view =
                offset === 0 && size === bytes.length
                    ? bytes
                    : bytes.subarray(offset, offset + size);
            if (!WriteFile(handle, view, size, countOut, null))
                return failure();
            if (countOut[0] > 0) return countOut[0];
            if (size <= 512) return -11;
            size = Math.max(512, size >> 3);
        }
    },
    close(handle) {
        CloseHandle(handle);
    },
    kill(child, signal) {
        if (WaitForSingleObject(child.handle, 0) === 0) return -3;
        if (signal === 0) return 0;
        // SIGINT, SIGQUIT, SIGKILL and SIGTERM terminate the process, as in libuv.
        if (signal !== 2 && signal !== 3 && signal !== 9 && signal !== 15)
            return -38;
        if (!TerminateProcess(child.handle, 1)) {
            const result = failure();
            return WaitForSingleObject(child.handle, 0) === 0 ? -3 : result;
        }
        child.signal = signal;
        return 0;
    },
    reap(child) {
        if (WaitForSingleObject(child.handle, 0) !== 0) return null;
        if (!GetExitCodeProcess(child.handle, countOut)) countOut[0] = 1;
        return { exitCode: countOut[0], signal: child.signal };
    },
    release(child) {
        if (child.handle !== -1) CloseHandle(child.handle);
        child.handle = -1;
    },
    poll(targets, timeout) {
        if (targets.length === 0) {
            if (timeout !== 0) Sleep(timeout < 0 ? 16 : timeout);
            return [];
        }
        const start = performance.now();
        let waited = false;
        for (;;) {
            const now = performance.now(),
                writes = waited || now - lastWriteProbe >= 16;
            if (writes) lastWriteProbe = now;
            const ready = scan(targets, writes);
            if (ready.length > 0) {
                slice = 1;
                return ready;
            }
            if (timeout === 0) return ready;
            const elapsed = performance.now() - start;
            if (timeout > 0 && elapsed >= timeout) return ready;
            let pipes = false;
            for (const target of targets) if (target.kind !== 4) pipes = true;
            let wait;
            if (!pipes && targets.length <= 64)
                wait = timeout < 0 ? 0xffffffff : Math.ceil(timeout - elapsed);
            else {
                wait = slice;
                if (timeout > 0)
                    wait = Math.min(wait, Math.ceil(timeout - elapsed));
                slice = Math.min(16, slice * 2);
            }
            waitProcesses(targets, wait);
            waited = true;
        }
    },
};
