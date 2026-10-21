import { define } from "nona:ffi";
// FreeBSD system call numbers; openbsdSource in
// src/frontend/child-process-module.ts renumbers or replaces the statements
// that differ on OpenBSD. Errors are negative native (BSD) errno values until
// sys translates them.
const sysRead = define("syscall", "3", "i64(i64,buf,i64)");
const sysWrite = define("syscall", "4", "i64(i64,buf,i64)");
const sysOpen = define("syscall", "5", "i64(buf,i64,i64)");
const sysClose = define("syscall", "6", "i64(i64)");
const sysWait4 = define("syscall", "7", "i64(i64,buf,i64,i64)");
const sysChdir = define("syscall", "12", "i64(i64)");
const sysKill = define("syscall", "37", "i64(i64,i64)");
const sysExecve = define("syscall", "59", "i64(i64,i64,i64)");
const sysMunmap = define("syscall", "73", "i64(i64,i64)");
const sysDup2 = define("syscall", "90", "i64(i64,i64)");
const sysFcntl = define("syscall", "92", "i64(i64,i64,i64)");
const sysSetsid = define("syscall", "147", "i64()");
const sysPoll = define("syscall", "209", "i64(buf,i64,i64)");
const sysKqueue = define("syscall", "362", "i64()");
const sysKevent = define("syscall", "560", "i64(i64,buf,i64,buf,i64,buf)");
const sysMmap = define("syscall", "477", "i64(i64,i64,i64,i64,i64,i64)");
const sysPipe2 = define("syscall", "542", "i64(buf,i64)");
const sysReadTo = define("syscall", "3", "i64(i64,i64,i64)");
const sysExit = define("syscall", "1", "i64(i64)");
// fork returns 0 in the child's rax on FreeBSD and OpenBSD (cpu_fork,
// child_return); the child flag in rdx is not needed.
const sysFork = define("syscall", "2", "i64()");
// struct sigaction: 32 zero bytes are SIG_DFL in FreeBSD's layout (handler,
// flags, 128-bit mask) and OpenBSD's (handler, 32-bit mask, flags).
const sysSigaction = define("syscall", "416", "i64(i64,buf,buf)");
// sigprocmask(how, set, oldset) with FreeBSD's 128-bit sigset_t.
const sysSigprocmask = define("syscall", "340", "i64(i64,buf,buf)");
// sigtimedwait(set, info, timeout): the signal number.
const sysSigtimedwait = define("syscall", "345", "i64(buf,buf,buf)");
const platform = "freebsd";
const O_RDWR = 2,
    O_NONBLOCK = 4,
    O_CLOEXEC = 0x100000,
    F_DUPFD_CLOEXEC = 17,
    F_SETFD = 2,
    F_SETFL = 4,
    FD_CLOEXEC = 1,
    POLLIN = 1,
    POLLOUT = 4,
    WNOHANG = 1,
    SIG_BLOCK = 1,
    SIG_SETMASK = 3,
    SIGPIPE_BIT = 1 << 12,
    PROT_READ_WRITE = 3,
    MAP_PRIVATE_ANON = 0x1002,
    EVFILT_PROC = -5,
    EV_ADD = 1,
    EV_ONESHOT = 0x10,
    NOTE_EXIT = 0x80000000,
    INTERRUPTED = -4;
const textEncoder = new TextEncoder();
const pipeFds = new Int32Array(2),
    statusWord = new Int32Array(1),
    errorWord = new Int32Array(1),
    // Signal sets (128 bits; OpenBSD uses the first word): all signals,
    // none, and SIGPIPE alone.
    allSignals = new Uint32Array([
        0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff,
    ]),
    noSignals = new Uint32Array(4),
    pipeSignal = new Uint32Array([SIGPIPE_BIT, 0, 0, 0]),
    savedMask = new Uint32Array(4),
    writeMask = new Uint32Array(4),
    defaultAction = new Uint32Array(8),
    // struct kevent (64 bytes on FreeBSD, 32 on OpenBSD) and a zero timespec.
    procEvent = new DataView(new ArrayBuffer(64)),
    zeroTime = new Uint32Array(4);
let pollBuffer = new Int32Array(2 * 16);

// ---- BSD numbers and the contract's Linux numbers -------------------------
// errno values 1-34 are the same except EDEADLK (BSD 11, Linux 35).
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
const errnoToBsd = {};
for (const bsd of Object.keys(errnoToLinux))
    errnoToBsd[errnoToLinux[bsd]] = Number(bsd);
/** A system call result with a negative BSD errno as the contract's negative Linux errno. */
function linuxResult(result) {
    return result < 0 ? -(errnoToLinux[-result] || -result) : result;
}
// Linux signal -> BSD signal for the numbers that differ; SIGSTKFLT (16)
// and SIGPWR (30) do not exist on the BSDs.
const signalToBsd = {
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
for (const linux of Object.keys(signalToBsd))
    if (signalToBsd[linux] !== 0)
        signalToLinux[signalToBsd[linux]] = Number(linux);
// SIGEMT (7), SIGINFO (29) and FreeBSD's SIGTHR (32) and SIGLIBRT (33) have
// no Linux number: they keep a number outside the Linux range, so that they
// are reported as SIG<n>.
for (const bsd of [7, 29, 32, 33]) signalToLinux[bsd] = 128 + bsd;

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
    for (const fd of fds) if (fd >= 0) sysClose(fd);
}
/** Moves a descriptor above the standard ones, so that dup2 in the child cannot overwrite it. */
function above(fd) {
    if (fd < 0 || fd > 2) return fd;
    const moved = sysFcntl(fd, F_DUPFD_CLOEXEC, 3);
    sysClose(fd);
    return moved;
}
function pipe() {
    const result = sysPipe2(pipeFds, O_CLOEXEC);
    return result < 0 ? result : [pipeFds[0], pipeFds[1]];
}

// ---- Argument memory -------------------------------------------------------
// execve needs pointer arrays, and JavaScript cannot learn the address of its
// own buffers. The parent maps anonymous memory, whose address mmap returns,
// lays out the strings and pointer arrays for that address and copies them in
// through a pipe (read() into the mapping). The child inherits the mapping.
let copyPipe = null;
function copyInto(address, bytes) {
    if (copyPipe === null) {
        const result = sysPipe2(pipeFds, O_CLOEXEC | O_NONBLOCK);
        if (result < 0) return result;
        copyPipe = [pipeFds[0], pipeFds[1]];
    }
    for (let offset = 0; offset < bytes.length;) {
        const n = sysWrite(
            copyPipe[1],
            bytes.subarray(offset, Math.min(bytes.length, offset + 65536)),
            Math.min(bytes.length - offset, 65536),
        );
        if (n === INTERRUPTED) continue;
        if (n <= 0) return n < 0 ? n : -5;
        for (let done = 0; done < n;) {
            const m = sysReadTo(copyPipe[0], address + offset + done, n - done);
            if (m === INTERRUPTED) continue;
            if (m <= 0) return m < 0 ? m : -5;
            done += m;
        }
        offset += n;
    }
    return 0;
}
/** Maps {argv, envp, strings} and returns {address, size, pointers}, pointers in the order of strings. */
function argumentMemory(argv, envp, strings) {
    const encoded = strings.map(cString),
        lists = [argv, envp].map((list) => list.map(cString));
    let size = 8 * (argv.length + envp.length + 2);
    for (const list of [encoded, lists[0], lists[1]])
        for (const bytes of list) size += bytes.length;
    size = Math.ceil(size / 4096) * 4096;
    const address = sysMmap(0, size, PROT_READ_WRITE, MAP_PRIVATE_ANON, -1, 0);
    if (address < 0) return address;
    const bytes = new Uint8Array(size),
        view = new DataView(bytes.buffer);
    let offset = 8 * (argv.length + envp.length + 2),
        slot = 0;
    const place = (string) => {
        bytes.set(string, offset);
        offset += string.length;
        return address + offset - string.length;
    };
    for (const list of lists) {
        for (const string of list) setPointer(view, 8 * slot++, place(string));
        setPointer(view, 8 * slot++, 0);
    }
    const pointers = encoded.map(place);
    const result = copyInto(address, bytes.subarray(0, offset));
    if (result < 0) {
        sysMunmap(address, size);
        return result;
    }
    return {
        address,
        size,
        argv: address,
        envp: address + 8 * (argv.length + 1),
        pointers,
    };
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

// ---- The child -------------------------------------------------------------
// Between fork and execve the child runs only system calls on numbers and
// preallocated buffers: the parent may have other threads, and the child has
// a copy of the heap that nothing may change. plan layout:
const PLAN_ERROR = 0,
    PLAN_DETACHED = 1,
    PLAN_STDIO = 2, // three descriptors, -1 for inherit
    PLAN_CWD = 5, // pointer or 0
    PLAN_ARGV = 6,
    PLAN_ENVP = 7,
    PLAN_COUNT = 8,
    PLAN_PATHS = 9;
function runChild(plan) {
    // Every signal but SIGKILL (9) and SIGSTOP (17).
    for (let n = 1; n < 32; n++)
        if (n !== 9 && n !== 17) sysSigaction(n, defaultAction, null);
    let error = 0;
    if (plan[PLAN_DETACHED] !== 0) sysSetsid();
    for (let i = 0; i < 3 && error === 0; i++) {
        const fd = plan[PLAN_STDIO + i];
        if (fd < 0) sysFcntl(i, F_SETFD, 0);
        else {
            const result = sysDup2(fd, i);
            if (result < 0) error = result;
        }
    }
    if (error === 0 && plan[PLAN_CWD] !== 0) {
        const result = sysChdir(plan[PLAN_CWD]);
        if (result < 0) error = result;
    }
    sysSigprocmask(SIG_SETMASK, noSignals, null);
    if (error === 0) {
        // execvp's rules: keep looking after ENOENT, ENOTDIR, ENODEV, ESTALE
        // and ETIMEDOUT (BSD numbers), remember EACCES, stop at anything else.
        let denied = false;
        error = -2;
        for (let k = 0; k < plan[PLAN_COUNT]; k++) {
            const result = sysExecve(
                plan[PLAN_PATHS + k],
                plan[PLAN_ARGV],
                plan[PLAN_ENVP],
            );
            if (result === -13) denied = true;
            else if (
                result !== -2 &&
                result !== -20 &&
                result !== -19 &&
                result !== -70 &&
                result !== -60
            ) {
                error = result;
                break;
            }
        }
        if (denied && (error === -2 || error === -20)) error = -13;
    }
    errorWord[0] = error;
    sysWrite(plan[PLAN_ERROR], errorWord, 4);
    sysExit(127);
}

// ---- Exit status -----------------------------------------------------------
function closeQueue(child) {
    if (child.kqueue >= 0) sysClose(child.kqueue);
    child.kqueue = -1;
}
/** Reaps the child if it has exited; the status stays on the process value. */
function check(child, options) {
    if (child.status !== null) return true;
    for (;;) {
        const result = sysWait4(child.pid, statusWord, options, 0);
        if (result === INTERRUPTED) continue;
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
    const queue = sysKqueue();
    if (queue < 0) return -1;
    sysFcntl(queue, F_SETFD, FD_CLOEXEC);
    for (let offset = 0; offset < 64; offset += 4)
        procEvent.setUint32(offset, 0, true);
    procEvent.setUint32(0, pid, true);
    procEvent.setInt16(8, EVFILT_PROC, true);
    procEvent.setUint16(10, EV_ADD | EV_ONESHOT, true);
    procEvent.setUint32(12, NOTE_EXIT, true);
    if (sysKevent(queue, procEvent, 1, null, 0, zeroTime) < 0) {
        // ESRCH: the child has already exited; it is found by wait4.
        sysClose(queue);
        return -1;
    }
    return queue;
}

const sys = {
    platform,
    READ: 1,
    WRITE: 2,
    EXIT: 4,
    errno(errno) {
        // libuv's numbers on the BSDs are negative native errno values.
        return -(errnoToBsd[errno] || errno);
    },
    spawn(request) {
        const pairs = request.envPairs,
            paths = candidates(request.file, pairs),
            open = [],
            stdio = [-1, -1, -1],
            plan = new Float64Array(PLAN_PATHS + paths.length);
        const strings = paths.slice();
        if (request.cwd) strings.push(request.cwd);
        const memory = argumentMemory(request.args, pairs, strings);
        if (typeof memory === "number") return linuxResult(memory);
        const fail = (result) => {
            closeAll(open);
            closeAll(stdio);
            sysMunmap(memory.address, memory.size);
            return linuxResult(result);
        };
        for (let i = 0; i < 3; i++) {
            const kind = request.stdio[i];
            if (kind === "inherit") plan[PLAN_STDIO + i] = -1;
            else if (kind === "pipe") {
                const ends = pipe();
                if (typeof ends === "number") return fail(ends);
                const parent = i === 0 ? ends[1] : ends[0],
                    child = above(i === 0 ? ends[0] : ends[1]);
                stdio[i] = parent;
                if (child < 0) return fail(child);
                open.push(child);
                plan[PLAN_STDIO + i] = child;
                sysFcntl(parent, F_SETFL, O_NONBLOCK);
            } else {
                const fd = above(
                    sysOpen(cString("/dev/null"), O_RDWR | O_CLOEXEC, 0),
                );
                if (fd < 0) return fail(fd);
                open.push(fd);
                plan[PLAN_STDIO + i] = fd;
            }
        }
        const errorPipe = pipe();
        if (typeof errorPipe === "number") return fail(errorPipe);
        open.push(errorPipe[0]);
        const errorWrite = above(errorPipe[1]);
        if (errorWrite < 0) return fail(errorWrite);
        open.push(errorWrite);
        plan[PLAN_ERROR] = errorWrite;
        plan[PLAN_DETACHED] = request.detached ? 1 : 0;
        plan[PLAN_CWD] = request.cwd ? memory.pointers[paths.length] : 0;
        plan[PLAN_ARGV] = memory.argv;
        plan[PLAN_ENVP] = memory.envp;
        plan[PLAN_COUNT] = paths.length;
        for (let k = 0; k < paths.length; k++)
            plan[PLAN_PATHS + k] = memory.pointers[k];
        // Signals stay blocked until the child has reset their handlers.
        sysSigprocmask(SIG_SETMASK, allSignals, savedMask);
        const pid = sysFork();
        if (pid === 0) runChild(plan);
        sysSigprocmask(SIG_SETMASK, savedMask, null);
        if (pid < 0) return fail(pid);
        // Only the error pipe's read end stays: EOF means execve succeeded.
        const errorRead = errorPipe[0];
        open.splice(open.indexOf(errorRead), 1);
        closeAll(open);
        open.length = 0;
        let n;
        do n = sysRead(errorRead, errorWord, 4);
        while (n === INTERRUPTED);
        sysClose(errorRead);
        sysMunmap(memory.address, memory.size);
        const child = { pid, kqueue: -1, status: null };
        if (n === 4) {
            check(child, 0);
            closeAll(stdio);
            return errorWord[0] < 0 ? linuxResult(errorWord[0]) : -5;
        }
        child.kqueue = exitQueue(pid);
        return { pid, process: child, stdio };
    },
    read(handle, buffer) {
        return linuxResult(sysRead(handle, buffer, buffer.length));
    },
    write(handle, bytes, offset, length) {
        // SIGPIPE is blocked during the write, and a pending one consumed, so
        // that a child that closed its stdin makes the write fail with EPIPE.
        const view =
            offset === 0 && length === bytes.length
                ? bytes
                : bytes.subarray(offset, offset + length);
        sysSigprocmask(SIG_BLOCK, pipeSignal, writeMask);
        const result = sysWrite(handle, view, length);
        if (result === -32 && (writeMask[0] & SIGPIPE_BIT) === 0)
            sysSigtimedwait(pipeSignal, null, zeroTime);
        sysSigprocmask(SIG_SETMASK, writeMask, null);
        return linuxResult(result);
    },
    close(handle) {
        sysClose(handle);
    },
    kill(child, signal) {
        if (child.status !== null) return -3;
        const bsd = Object.hasOwn(signalToBsd, signal)
            ? signalToBsd[signal]
            : signal;
        if ((bsd === 0 && signal !== 0) || bsd > 31) return -38;
        return linuxResult(sysKill(child.pid, bsd));
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
        // A child without an exit kqueue is found by polling wait4.
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
        const result = sysPoll(pollBuffer, indices.length, timeout);
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
