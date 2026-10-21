import { define, lastError } from "nona:ffi";
const cRead = define("/usr/lib/libSystem.B.dylib", "read", "i64(i32,buf,u64)");
const cWrite = define(
    "/usr/lib/libSystem.B.dylib",
    "write",
    "i64(i32,buf,u64)",
);
const cClose = define("/usr/lib/libSystem.B.dylib", "close", "i32(i32)");
const cPipe = define("/usr/lib/libSystem.B.dylib", "pipe", "i32(buf)");
const cPoll = define("/usr/lib/libSystem.B.dylib", "poll", "i32(buf,u32,i32)");
const cWaitpid = define(
    "/usr/lib/libSystem.B.dylib",
    "waitpid",
    "i32(i32,buf,i32)",
);
const cKill = define("/usr/lib/libSystem.B.dylib", "kill", "i32(i32,i32)");
const cMalloc = define("/usr/lib/libSystem.B.dylib", "malloc", "ptr(u64)");
const cFree = define("/usr/lib/libSystem.B.dylib", "free", "void(ptr)");
const cMemcpy = define(
    "/usr/lib/libSystem.B.dylib",
    "memcpy",
    "ptr(ptr,buf,u64)",
);
const cKqueue = define("/usr/lib/libSystem.B.dylib", "kqueue", "i32()");
const cKevent = define(
    "/usr/lib/libSystem.B.dylib",
    "kevent",
    "i32(i32,buf,i32,buf,i32,buf)",
);
const cSigmask = define(
    "/usr/lib/libSystem.B.dylib",
    "pthread_sigmask",
    "i32(i32,buf,buf)",
);
const cSigpending = define(
    "/usr/lib/libSystem.B.dylib",
    "sigpending",
    "i32(buf)",
);
const cSigwait = define(
    "/usr/lib/libSystem.B.dylib",
    "sigwait",
    "i32(buf,buf)",
);
const cSpawn = define(
    "/usr/lib/libSystem.B.dylib",
    "posix_spawn",
    "i32(buf,buf,buf,buf,ptr,ptr)",
);
const cActionsInit = define(
    "/usr/lib/libSystem.B.dylib",
    "posix_spawn_file_actions_init",
    "i32(buf)",
);
const cActionsDestroy = define(
    "/usr/lib/libSystem.B.dylib",
    "posix_spawn_file_actions_destroy",
    "i32(buf)",
);
const cActionsDup2 = define(
    "/usr/lib/libSystem.B.dylib",
    "posix_spawn_file_actions_adddup2",
    "i32(buf,i32,i32)",
);
const cActionsInherit = define(
    "/usr/lib/libSystem.B.dylib",
    "posix_spawn_file_actions_addinherit_np",
    "i32(buf,i32)",
);
const cActionsOpen = define(
    "/usr/lib/libSystem.B.dylib",
    "posix_spawn_file_actions_addopen",
    "i32(buf,i32,buf,i32,u16)",
);
const cActionsChdir = define(
    "/usr/lib/libSystem.B.dylib",
    "posix_spawn_file_actions_addchdir_np",
    "i32(buf,buf)",
);
const cAttrInit = define(
    "/usr/lib/libSystem.B.dylib",
    "posix_spawnattr_init",
    "i32(buf)",
);
const cAttrDestroy = define(
    "/usr/lib/libSystem.B.dylib",
    "posix_spawnattr_destroy",
    "i32(buf)",
);
const cAttrFlags = define(
    "/usr/lib/libSystem.B.dylib",
    "posix_spawnattr_setflags",
    "i32(buf,i16)",
);
const cAttrSigdefault = define(
    "/usr/lib/libSystem.B.dylib",
    "posix_spawnattr_setsigdefault",
    "i32(buf,buf)",
);
const cAttrSigmask = define(
    "/usr/lib/libSystem.B.dylib",
    "posix_spawnattr_setsigmask",
    "i32(buf,buf)",
);
// fcntl is variadic, which library calls on Apple Silicon do not support:
// the system call has a single result and is called directly.
const sysFcntl = define("syscall", "92", "i64(i64,i64,i64)");
const O_RDWR = 2,
    O_NONBLOCK = 4,
    FD_CLOEXEC = 1,
    F_SETFD = 2,
    F_SETFL = 4,
    F_DUPFD_CLOEXEC = 67,
    F_SETNOSIGPIPE = 73,
    POLLIN = 1,
    POLLOUT = 4,
    WNOHANG = 1,
    SIG_BLOCK = 1,
    SIG_SETMASK = 3,
    SIGPIPE_BIT = 1 << 12,
    POSIX_SPAWN_SETSIGDEF = 0x4,
    POSIX_SPAWN_SETSIGMASK = 0x8,
    POSIX_SPAWN_SETSID = 0x400,
    POSIX_SPAWN_CLOEXEC_DEFAULT = 0x4000,
    EVFILT_PROC = -5,
    EV_ADD = 1,
    EV_ONESHOT = 0x10,
    NOTE_EXIT = 0x80000000;
const textEncoder = new TextEncoder();
const pipeFds = new Int32Array(2),
    pidWord = new Int32Array(1),
    statusWord = new Int32Array(1),
    // posix_spawn_file_actions_t and posix_spawnattr_t are pointers to
    // storage the library allocates.
    actions = new Float64Array(1),
    attributes = new Float64Array(1),
    // sigset_t is 32 bits: every catchable signal, none, and SIGPIPE alone.
    defaultSignals = new Uint32Array([~((1 << 8) | (1 << 16)) >>> 0]),
    noSignals = new Uint32Array(1),
    pipeSignal = new Uint32Array([SIGPIPE_BIT]),
    writeMask = new Uint32Array(1),
    pendingSignals = new Uint32Array(1),
    signalWord = new Int32Array(1),
    // struct kevent (32 bytes on x86-64 and arm64) and a zero timespec.
    procEvent = new DataView(new ArrayBuffer(32)),
    zeroTime = new Uint32Array(4);
let pollBuffer = new Int32Array(2 * 16);

// ---- Darwin numbers and the contract's Linux numbers ----------------------
// errno values 1-34 are the same except EDEADLK (Darwin 11, Linux 35).
const errnoToLinux = {
    11: 35,
    35: 11,
    55: 105,
    60: 110,
    62: 40,
    63: 36,
    66: 39,
    70: 116,
    78: 38,
};
const errnoToDarwin = {};
for (const darwin of Object.keys(errnoToLinux))
    errnoToDarwin[errnoToLinux[darwin]] = Number(darwin);
/** A Darwin errno as the contract's negative Linux errno. */
function linuxError(errno) {
    return -(errnoToLinux[errno] || errno || 5);
}
/** The negative Linux errno of the last library call. */
function failure() {
    return linuxError(lastError());
}
// Linux signal -> Darwin signal for the numbers that differ; SIGSTKFLT (16)
// and SIGPWR (30) do not exist on Darwin.
const signalToDarwin = {
    7: 10,
    10: 30,
    12: 31,
    16: 0,
    17: 20,
    18: 19,
    19: 17,
    20: 18,
    23: 16,
    29: 23,
    30: 0,
    31: 12,
};
const signalToLinux = {};
for (const linux of Object.keys(signalToDarwin))
    if (signalToDarwin[linux] !== 0)
        signalToLinux[signalToDarwin[linux]] = Number(linux);
// SIGEMT (7) and SIGINFO (29) have no Linux number: they keep a number
// outside the Linux range, so that they are reported as SIG<n>.
signalToLinux[7] = 128 + 7;
signalToLinux[29] = 128 + 29;

function cString(text) {
    const bytes = textEncoder.encode(text),
        out = new Uint8Array(bytes.length + 1);
    out.set(bytes);
    return out;
}
function setPointer(view, offset, pointer) {
    const high = Math.floor(pointer / 4294967296);
    view.setUint32(offset, pointer - high * 4294967296, true);
    view.setUint32(offset + 4, high, true);
}
function closeAll(fds) {
    for (const fd of fds) if (fd >= 0) cClose(fd);
}
/** Moves a descriptor above the standard ones, so that the child's dup2 cannot overwrite it. */
function above(fd) {
    if (fd < 0 || fd > 2) return fd;
    const moved = sysFcntl(fd, F_DUPFD_CLOEXEC, 3);
    cClose(fd);
    return moved;
}
function pipe() {
    if (cPipe(pipeFds) < 0) return failure();
    const ends = [pipeFds[0], pipeFds[1]];
    for (const fd of ends) sysFcntl(fd, F_SETFD, FD_CLOEXEC);
    return ends;
}

// ---- Argument memory -------------------------------------------------------
// posix_spawn needs argv and envp pointer arrays, and JavaScript cannot learn
// the address of its own buffers: the strings and arrays are laid out for the
// address malloc returns and copied there with memcpy.
function argumentMemory(argv, envp) {
    const lists = [argv, envp].map((list) => list.map(cString));
    let size = 8 * (argv.length + envp.length + 2);
    for (const list of lists) for (const bytes of list) size += bytes.length;
    const address = cMalloc(size);
    if (address === 0) return -12;
    const bytes = new Uint8Array(size),
        view = new DataView(bytes.buffer);
    let offset = 8 * (argv.length + envp.length + 2),
        slot = 0;
    for (const list of lists) {
        for (const string of list) {
            bytes.set(string, offset);
            setPointer(view, 8 * slot++, address + offset);
            offset += string.length;
        }
        setPointer(view, 8 * slot++, 0);
    }
    cMemcpy(address, bytes, size);
    return { address, argv: address, envp: address + 8 * (argv.length + 1) };
}

// ---- Executable search (execvp) --------------------------------------------
function candidates(file, pairs) {
    if (file.indexOf("/") >= 0) return [file];
    let path = "/usr/bin:/bin";
    for (const pair of pairs)
        if (pair.startsWith("PATH=")) path = pair.slice(5);
    return path
        .split(":")
        .map((dir) =>
            dir === "" ? file : dir.replace(/\/$/, "") + "/" + file,
        );
}
/** posix_spawn on each candidate with execvp's rules; the pid or a negative Linux errno. */
function spawnFirst(paths, memory) {
    // Keep looking after ENOENT, ENOTDIR, ENODEV, ESTALE and ETIMEDOUT,
    // remember EACCES, stop at anything else.
    let denied = false,
        error = 2;
    for (const path of paths) {
        const result = cSpawn(
            pidWord,
            cString(path),
            actions,
            attributes,
            memory.argv,
            memory.envp,
        );
        if (result === 0) return pidWord[0];
        if (result === 13) denied = true;
        else if (
            result !== 2 &&
            result !== 20 &&
            result !== 19 &&
            result !== 70 &&
            result !== 60
        ) {
            error = result;
            break;
        }
    }
    if (denied && (error === 2 || error === 20)) error = 13;
    return linuxError(error);
}

// ---- Exit status -----------------------------------------------------------
function closeQueue(child) {
    if (child.kqueue >= 0) cClose(child.kqueue);
    child.kqueue = -1;
}
/** Reaps the child if it has exited; the status stays on the process value. */
function check(child, options) {
    if (child.status !== null) return true;
    for (;;) {
        const result = cWaitpid(child.pid, statusWord, options);
        if (result < 0 && lastError() === 4) continue;
        if (result === 0) return false;
        if (result < 0) child.status = { exitCode: 0, signal: 0 };
        else {
            const status = statusWord[0],
                signal = status & 0x7f;
            child.status =
                signal === 0
                    ? { exitCode: (status >> 8) & 0xff, signal: 0 }
                    : {
                          exitCode: null,
                          signal: signalToLinux[signal] || signal,
                      };
        }
        closeQueue(child);
        return true;
    }
}
/** A kqueue that becomes readable when the child exits (EVFILT_PROC, NOTE_EXIT), or -1. */
function exitQueue(pid) {
    const queue = cKqueue();
    if (queue < 0) return -1;
    sysFcntl(queue, F_SETFD, FD_CLOEXEC);
    procEvent.setUint32(0, pid, true);
    procEvent.setUint32(4, 0, true);
    procEvent.setInt16(8, EVFILT_PROC, true);
    procEvent.setUint16(10, EV_ADD | EV_ONESHOT, true);
    procEvent.setUint32(12, NOTE_EXIT, true);
    if (cKevent(queue, procEvent, 1, null, 0, zeroTime) < 0) {
        // ESRCH: the child has already exited; it is found by waitpid.
        cClose(queue);
        return -1;
    }
    return queue;
}

const sys = {
    platform: "darwin",
    READ: 1,
    WRITE: 2,
    EXIT: 4,
    errno(errno) {
        // libuv's numbers on macOS are negative Darwin errno values.
        return -(errnoToDarwin[errno] || errno);
    },
    spawn(request) {
        const pairs = request.envPairs,
            paths = candidates(request.file, pairs),
            open = [],
            stdio = [-1, -1, -1];
        const memory = argumentMemory(request.args, pairs);
        if (typeof memory === "number") return memory;
        let result = cActionsInit(actions);
        if (result !== 0) {
            cFree(memory.address);
            return linuxError(result);
        }
        result = cAttrInit(attributes);
        if (result !== 0) {
            cActionsDestroy(actions);
            cFree(memory.address);
            return linuxError(result);
        }
        const finish = () => {
            closeAll(open);
            cAttrDestroy(attributes);
            cActionsDestroy(actions);
            cFree(memory.address);
        };
        const fail = (result) => {
            finish();
            closeAll(stdio);
            return result;
        };
        for (let i = 0; i < 3 && result === 0; i++) {
            const kind = request.stdio[i];
            if (kind === "inherit") result = cActionsInherit(actions, i);
            else if (kind === "pipe") {
                const ends = pipe();
                if (typeof ends === "number") return fail(ends);
                const parent = i === 0 ? ends[1] : ends[0],
                    child = above(i === 0 ? ends[0] : ends[1]);
                stdio[i] = parent;
                if (child < 0) return fail(child);
                open.push(child);
                sysFcntl(parent, F_SETFL, O_NONBLOCK);
                // A write to a child that closed its stdin fails with EPIPE
                // instead of raising SIGPIPE.
                if (i === 0) sysFcntl(parent, F_SETNOSIGPIPE, 1);
                result = cActionsDup2(actions, child, i);
            } else
                result = cActionsOpen(
                    actions,
                    i,
                    cString("/dev/null"),
                    O_RDWR,
                    0,
                );
        }
        if (result === 0 && request.cwd)
            result = cActionsChdir(actions, cString(request.cwd));
        // The child starts with default signal dispositions, an empty signal
        // mask and only its three standard descriptors.
        if (result === 0)
            result = cAttrFlags(
                attributes,
                POSIX_SPAWN_SETSIGDEF |
                    POSIX_SPAWN_SETSIGMASK |
                    POSIX_SPAWN_CLOEXEC_DEFAULT |
                    (request.detached ? POSIX_SPAWN_SETSID : 0),
            );
        if (result === 0) result = cAttrSigdefault(attributes, defaultSignals);
        if (result === 0) result = cAttrSigmask(attributes, noSignals);
        if (result !== 0) return fail(linuxError(result));
        // posix_spawn reports exec failures itself.
        const pid = spawnFirst(paths, memory);
        if (pid < 0) return fail(pid);
        finish();
        const child = { pid, kqueue: exitQueue(pid), status: null };
        return { pid, process: child, stdio };
    },
    read(handle, buffer) {
        const n = cRead(handle, buffer, buffer.length);
        return n < 0 ? failure() : n;
    },
    write(handle, bytes, offset, length) {
        // SIGPIPE is also blocked during the write, and a pending one
        // consumed, in case the pipe does not honour F_SETNOSIGPIPE.
        const view =
            offset === 0 && length === bytes.length
                ? bytes
                : bytes.subarray(offset, offset + length);
        cSigmask(SIG_BLOCK, pipeSignal, writeMask);
        let result = cWrite(handle, view, length);
        if (result < 0) result = failure();
        if (result === -32 && (writeMask[0] & SIGPIPE_BIT) === 0) {
            cSigpending(pendingSignals);
            if ((pendingSignals[0] & SIGPIPE_BIT) !== 0)
                cSigwait(pipeSignal, signalWord);
        }
        cSigmask(SIG_SETMASK, writeMask, null);
        return result;
    },
    close(handle) {
        cClose(handle);
    },
    kill(child, signal) {
        if (child.status !== null) return -3;
        const darwin = Object.hasOwn(signalToDarwin, signal)
            ? signalToDarwin[signal]
            : signal;
        if (darwin === 0 && signal !== 0) return -38;
        return cKill(child.pid, darwin) < 0 ? failure() : 0;
    },
    reap(child) {
        check(child, WNOHANG);
        return child.status;
    },
    release(child) {
        if (child.status === null) check(child, WNOHANG);
        closeQueue(child);
    },
    poll(targets, timeout) {
        if (pollBuffer.length < 2 * targets.length)
            pollBuffer = new Int32Array(2 * targets.length);
        const ready = [],
            indices = [];
        // A child without an exit kqueue is found by polling waitpid.
        let waiting = false;
        for (let i = 0; i < targets.length; i++) {
            const target = targets[i];
            let fd = target.handle,
                events = target.kind === 2 ? POLLOUT : POLLIN;
            if (target.kind === 4) {
                const child = target.handle;
                if (
                    child.status !== null ||
                    (child.kqueue < 0 && check(child, WNOHANG))
                ) {
                    ready.push(i);
                    continue;
                }
                if (child.kqueue < 0) {
                    waiting = true;
                    continue;
                }
                fd = child.kqueue;
                events = POLLIN;
            }
            pollBuffer[2 * indices.length] = fd;
            pollBuffer[2 * indices.length + 1] = events;
            indices.push(i);
        }
        if (ready.length > 0) timeout = 0;
        else if (waiting && (timeout < 0 || timeout > 10)) timeout = 10;
        else if (indices.length === 0 && timeout < 0) timeout = 16;
        const result = cPoll(pollBuffer, indices.length, timeout);
        if (result > 0)
            for (let j = 0; j < indices.length; j++)
                if (pollBuffer[2 * j + 1] >>> 16 !== 0) ready.push(indices[j]);
        if (waiting)
            for (let i = 0; i < targets.length; i++) {
                const target = targets[i];
                if (
                    target.kind === 4 &&
                    target.handle.kqueue < 0 &&
                    ready.indexOf(i) < 0 &&
                    check(target.handle, WNOHANG)
                )
                    ready.push(i);
            }
        return ready.sort((a, b) => a - b);
    },
};
