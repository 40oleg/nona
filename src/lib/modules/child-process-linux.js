import { define } from "nona:ffi";
const sysRead = define("syscall", "0", "i64(i64,buf,i64)");
const sysWrite = define("syscall", "1", "i64(i64,buf,i64)");
const sysOpen = define("syscall", "2", "i64(buf,i64,i64)");
const sysClose = define("syscall", "3", "i64(i64)");
const sysPoll = define("syscall", "7", "i64(buf,i64,i64)");
const sysMmap = define("syscall", "9", "i64(i64,i64,i64,i64,i64,i64)");
const sysMunmap = define("syscall", "11", "i64(i64,i64)");
const sysSigaction = define("syscall", "13", "i64(i64,buf,buf,i64)");
const sysSigprocmask = define("syscall", "14", "i64(i64,buf,buf,i64)");
const sysReadTo = define("syscall", "0", "i64(i64,i64,i64)");
const sysDup2 = define("syscall", "33", "i64(i64,i64)");
const sysFork = define("syscall", "57", "i64()");
const sysExecve = define("syscall", "59", "i64(i64,i64,i64)");
const sysWait4 = define("syscall", "61", "i64(i64,buf,i64,i64)");
const sysKill = define("syscall", "62", "i64(i64,i64)");
const sysFcntl = define("syscall", "72", "i64(i64,i64,i64)");
const sysChdir = define("syscall", "80", "i64(i64)");
const sysSetsid = define("syscall", "112", "i64()");
const sysSigtimedwait = define("syscall", "128", "i64(buf,buf,buf,i64)");
const sysExitGroup = define("syscall", "231", "i64(i64)");
const sysPipe2 = define("syscall", "293", "i64(buf,i64)");
const sysPidfdOpen = define("syscall", "434", "i64(i64,i64)");
const O_RDWR = 2,
    O_NONBLOCK = 0x800,
    O_CLOEXEC = 0x80000,
    F_DUPFD_CLOEXEC = 1030,
    F_SETFD = 2,
    F_SETFL = 4,
    POLLIN = 1,
    POLLOUT = 4,
    WNOHANG = 1,
    INTERRUPTED = -4;
const textEncoder = new TextEncoder();
const pipeFds = new Int32Array(2),
    statusWord = new Int32Array(1),
    errorWord = new Int32Array(1),
    // Signal sets for rt_sigprocmask: all signals, none, and SIGPIPE alone.
    allSignals = new Uint32Array([0xffffffff, 0xffffffff]),
    noSignals = new Uint32Array(2),
    pipeSignal = new Uint32Array([1 << 12, 0]),
    savedMask = new Uint32Array(2),
    writeMask = new Uint32Array(2),
    // struct kernel_sigaction with SIG_DFL, and a zero timespec.
    defaultAction = new Uint32Array(8),
    zeroTime = new Uint32Array(4);
let pollBuffer = new Int32Array(2 * 16);

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
    const address = sysMmap(0, size, 3, 0x22, -1, 0);
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
    for (let n = 1; n < 32; n++)
        if (n !== 9 && n !== 19) sysSigaction(n, defaultAction, null, 8);
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
    sysSigprocmask(2, noSignals, null, 8);
    if (error === 0) {
        // execvp's rules: keep looking after ENOENT, ENOTDIR, ENODEV, ESTALE
        // and ETIMEDOUT, remember EACCES, stop at anything else.
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
                result !== -116 &&
                result !== -110
            ) {
                error = result;
                break;
            }
        }
        if (denied && (error === -2 || error === -20)) error = -13;
    }
    errorWord[0] = error;
    sysWrite(plan[PLAN_ERROR], errorWord, 4);
    sysExitGroup(127);
}

// ---- Exit status -----------------------------------------------------------
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
                    : { exitCode: null, signal };
        }
        if (child.pidfd >= 0) {
            sysClose(child.pidfd);
            child.pidfd = -1;
        }
        return true;
    }
}

const sys = {
    platform: "linux",
    READ: 1,
    WRITE: 2,
    EXIT: 4,
    errno(errno) {
        return -errno;
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
        if (typeof memory === "number") return memory;
        const fail = (result) => {
            closeAll(open);
            closeAll(stdio);
            sysMunmap(memory.address, memory.size);
            return result;
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
        sysSigprocmask(2, allSignals, savedMask, 8);
        const pid = sysFork();
        if (pid === 0) runChild(plan);
        sysSigprocmask(2, savedMask, null, 8);
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
        const child = { pid, pidfd: -1, status: null };
        if (n === 4) {
            check(child, 0);
            closeAll(stdio);
            return errorWord[0] < 0 ? errorWord[0] : -5;
        }
        const pidfd = sysPidfdOpen(pid, 0);
        if (pidfd >= 0) child.pidfd = pidfd;
        return { pid, process: child, stdio };
    },
    read(handle, buffer) {
        return sysRead(handle, buffer, buffer.length);
    },
    write(handle, bytes, offset, length) {
        // SIGPIPE is blocked during the write, and a pending one consumed, so
        // that a child that closed its stdin makes the write fail with EPIPE.
        const view =
            offset === 0 && length === bytes.length
                ? bytes
                : bytes.subarray(offset, offset + length);
        sysSigprocmask(0, pipeSignal, writeMask, 8);
        const result = sysWrite(handle, view, length);
        if (result === -32 && (writeMask[0] & (1 << 12)) === 0)
            sysSigtimedwait(pipeSignal, null, zeroTime, 8);
        sysSigprocmask(2, writeMask, null, 8);
        return result;
    },
    close(handle) {
        sysClose(handle);
    },
    kill(child, signal) {
        if (child.status !== null) return -3;
        return sysKill(child.pid, signal);
    },
    reap(child) {
        check(child, WNOHANG);
        return child.status;
    },
    release(child) {
        if (child.status === null) check(child, WNOHANG);
        if (child.pidfd >= 0) sysClose(child.pidfd);
        child.pidfd = -1;
    },
    poll(targets, timeout) {
        if (pollBuffer.length < 2 * targets.length)
            pollBuffer = new Int32Array(2 * targets.length);
        const ready = [],
            indices = [];
        // Without pidfd_open (Linux < 5.3) exits are found by polling wait4.
        let waiting = false;
        for (let i = 0; i < targets.length; i++) {
            const target = targets[i];
            let fd = target.handle,
                events = target.kind === 2 ? POLLOUT : POLLIN;
            if (target.kind === 4) {
                const child = target.handle;
                if (
                    child.status !== null ||
                    (child.pidfd < 0 && check(child, WNOHANG))
                ) {
                    ready.push(i);
                    continue;
                }
                if (child.pidfd < 0) {
                    waiting = true;
                    continue;
                }
                fd = child.pidfd;
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
                    target.handle.pidfd < 0 &&
                    ready.indexOf(i) < 0 &&
                    check(target.handle, WNOHANG)
                )
                    ready.push(i);
            }
        return ready.sort((a, b) => a - b);
    },
};
