import { EventEmitter } from "node:events";
import { Buffer } from "node:buffer";
import { Readable, Writable } from "node:stream";
const READ = sys.READ,
    WRITE = sys.WRITE,
    EXIT = sys.EXIT;
const EAGAIN = -11,
    EINTR = -4,
    ESRCH = -3,
    EINVAL = -22,
    ENOSYS = -38;
const MAX_BUFFER = 1024 * 1024;
const codes = {
    1: "EPERM",
    2: "ENOENT",
    3: "ESRCH",
    4: "EINTR",
    5: "EIO",
    7: "E2BIG",
    8: "ENOEXEC",
    9: "EBADF",
    10: "ECHILD",
    11: "EAGAIN",
    12: "ENOMEM",
    13: "EACCES",
    14: "EFAULT",
    16: "EBUSY",
    17: "EEXIST",
    20: "ENOTDIR",
    21: "EISDIR",
    22: "EINVAL",
    23: "ENFILE",
    24: "EMFILE",
    32: "EPIPE",
    36: "ENAMETOOLONG",
    38: "ENOSYS",
    105: "ENOBUFS",
    110: "ETIMEDOUT",
};
const signals = {
    SIGHUP: 1,
    SIGINT: 2,
    SIGQUIT: 3,
    SIGILL: 4,
    SIGTRAP: 5,
    SIGABRT: 6,
    SIGBUS: 7,
    SIGFPE: 8,
    SIGKILL: 9,
    SIGUSR1: 10,
    SIGSEGV: 11,
    SIGUSR2: 12,
    SIGPIPE: 13,
    SIGALRM: 14,
    SIGTERM: 15,
    SIGSTKFLT: 16,
    SIGCHLD: 17,
    SIGCONT: 18,
    SIGSTOP: 19,
    SIGTSTP: 20,
    SIGTTIN: 21,
    SIGTTOU: 22,
    SIGURG: 23,
    SIGXCPU: 24,
    SIGXFSZ: 25,
    SIGVTALRM: 26,
    SIGPROF: 27,
    SIGWINCH: 28,
    SIGIO: 29,
    SIGPWR: 30,
    SIGSYS: 31,
};
const signalNames = [];
for (const name of Object.keys(signals)) signalNames[signals[name]] = name;

// ---- Errors ----------------------------------------------------------------
function errnoException(result, syscall, path, spawnargs) {
    const code = codes[-result] || "UNKNOWN";
    const error = new Error(syscall + " " + code);
    error.errno = sys.errno(-result, code);
    error.code = code;
    error.syscall = syscall;
    if (path !== undefined) error.path = path;
    if (spawnargs !== undefined) error.spawnargs = spawnargs;
    return error;
}
function codedError(code, message, Type) {
    const error = new (Type || Error)(message);
    error.code = code;
    return error;
}
function unsupported(name) {
    return codedError(
        "ERR_NONA_UNSUPPORTED",
        name + " is not supported by Nona",
    );
}
function describe(value) {
    if (value === null) return "null";
    if (typeof value === "function")
        return "function " + (value.name || "anonymous");
    if (typeof value === "object") return "an instance of Object";
    if (typeof value === "string")
        return "type string ('" + value.slice(0, 25) + "')";
    return "type " + typeof value + " (" + String(value) + ")";
}
function invalidType(name, expected, value) {
    return codedError(
        "ERR_INVALID_ARG_TYPE",
        'The "' +
            name +
            '" argument must be ' +
            expected +
            ". Received " +
            describe(value),
        TypeError,
    );
}
function validateString(value, name) {
    if (typeof value !== "string")
        throw invalidType(name, "of type string", value);
    if (value.indexOf("\u0000") >= 0)
        throw codedError(
            "ERR_INVALID_ARG_VALUE",
            "The argument '" +
                name +
                "' must be a string without null bytes. Received " +
                JSON.stringify(value),
            TypeError,
        );
}
function convertToValidSignal(signal) {
    if (typeof signal === "number" && signalNames[signal] !== undefined)
        return signal;
    if (typeof signal === "string" && signals[signal] !== undefined)
        return signals[signal];
    throw codedError(
        "ERR_UNKNOWN_SIGNAL",
        "Unknown signal: " + String(signal),
        TypeError,
    );
}
function systemErrorName(errno) {
    for (const n of Object.keys(codes))
        if (sys.errno(Number(n), codes[n]) === errno) return codes[n];
    return codes[-errno] || "Unknown system error " + errno;
}
function nextTick(callback) {
    if (typeof process.nextTick === "function") process.nextTick(callback);
    else queueMicrotask(callback);
}

// ---- Event loop integration ------------------------------------------------
// Open pipe ends and running children are targets {handle, kind}; the loop's
// poller passes the watched ones to sys.poll and dispatches the ready ones to
// their owner's _ready(). Referenced targets keep the program alive.
let registered = false,
    refedCount = 0,
    readyTargets = [];
const watched = [];
function ensureLoop() {
    if (registered) return;
    registered = true;
    const hook = globalThis.__nonaIoLoop;
    if (typeof hook === "function") hook(poller);
}
function watch(target) {
    if (target.index >= 0) return;
    ensureLoop();
    target.index = watched.length;
    watched.push(target);
    if (target.refed) refedCount++;
}
function unwatch(target) {
    const i = target.index;
    if (i < 0) return;
    const last = watched.pop();
    if (last !== target) {
        watched[i] = last;
        last.index = i;
    }
    target.index = -1;
    if (target.refed) refedCount--;
}
function setRef(target, refed) {
    if (target.refed === refed) return;
    target.refed = refed;
    if (target.index >= 0) refedCount += refed ? 1 : -1;
}
function makeTarget(handle, kind, owner) {
    return { handle, kind, owner, index: -1, refed: true };
}
const poller = {
    active() {
        return refedCount;
    },
    total() {
        return watched.length;
    },
    poll(timeout) {
        const indices = sys.poll(watched, timeout);
        readyTargets = indices.map((i) => watched[i]);
        return readyTargets.length;
    },
    run(i) {
        const target = readyTargets[i];
        readyTargets[i] = undefined;
        if (target !== undefined && target.index >= 0)
            target.owner._ready(target);
    },
};

// ---- Child stdio streams ---------------------------------------------------
const readBuffer = new Uint8Array(65536);
/** The parent's end of a child's stdout or stderr. */
function pipeReadable(handle) {
    let target = null;
    const stream = new Readable({
        read() {
            if (target !== null) watch(target);
        },
        destroy(error, callback) {
            if (target !== null) {
                unwatch(target);
                sys.close(target.handle);
                target = null;
            }
            callback(error);
        },
    });
    if (handle === -1) {
        stream.push(null);
        return stream;
    }
    target = makeTarget(handle, READ, {
        _ready() {
            // Up to 1 MiB per turn, so that one busy pipe does not starve the loop.
            for (let total = 0; target !== null && total < 1048576;) {
                const n = sys.read(target.handle, readBuffer);
                if (n === EAGAIN || n === EINTR) return;
                if (n <= 0) {
                    unwatch(target);
                    sys.close(target.handle);
                    target = null;
                    if (n < 0) stream.destroy(errnoException(n, "read"));
                    else stream.push(null);
                    return;
                }
                total += n;
                if (!stream.push(Buffer.from(readBuffer.subarray(0, n)))) {
                    unwatch(target);
                    return;
                }
            }
        },
    });
    return stream;
}
/** The parent's end of a child's stdin. */
function pipeWritable(handle) {
    let target = null,
        pending = null;
    const close = () => {
        if (target === null) return;
        unwatch(target);
        sys.close(target.handle);
        target = null;
    };
    const flush = () => {
        while (pending !== null && target !== null) {
            const { bytes, callback } = pending;
            const n = sys.write(
                target.handle,
                bytes,
                pending.offset,
                bytes.length - pending.offset,
            );
            if (n === EAGAIN || n === EINTR) {
                watch(target);
                return;
            }
            if (n < 0) {
                pending = null;
                unwatch(target);
                callback(errnoException(n, "write"));
                return;
            }
            pending.offset += n;
            if (pending.offset >= bytes.length) {
                pending = null;
                unwatch(target);
                callback();
            }
        }
    };
    const stream = new Writable({
        write(chunk, encoding, callback) {
            if (target === null) {
                callback(errnoException(-32, "write"));
                return;
            }
            const bytes =
                typeof chunk === "string"
                    ? Buffer.from(chunk, encoding)
                    : chunk;
            if (bytes.length === 0) {
                callback();
                return;
            }
            pending = { bytes, offset: 0, callback };
            flush();
        },
        final(callback) {
            close();
            callback();
        },
        destroy(error, callback) {
            close();
            pending = null;
            callback(error);
        },
    });
    if (handle === -1) stream.destroy();
    else target = makeTarget(handle, WRITE, { _ready: flush });
    return stream;
}

// ---- Options -----------------------------------------------------------------
function normalizeStdio(stdio) {
    if (stdio === undefined || stdio === null) stdio = "pipe";
    if (typeof stdio === "string") {
        if (stdio === "overlapped") stdio = "pipe";
        if (stdio !== "pipe" && stdio !== "inherit" && stdio !== "ignore")
            throw codedError(
                "ERR_INVALID_ARG_VALUE",
                "The argument 'stdio' is invalid. Received '" + stdio + "'",
                TypeError,
            );
        return [stdio, stdio, stdio];
    }
    if (!Array.isArray(stdio))
        throw codedError(
            "ERR_INVALID_ARG_VALUE",
            "The argument 'stdio' is invalid. Received " + describe(stdio),
            TypeError,
        );
    const out = [];
    for (let i = 0; i < Math.max(3, stdio.length); i++) {
        let value = stdio[i];
        if (value === undefined || value === null)
            value = i < 3 ? "pipe" : "ignore";
        if (value === "overlapped") value = "pipe";
        else if (value === i) value = "inherit";
        else if (
            i < 3 &&
            typeof value === "object" &&
            value === [process.stdin, process.stdout, process.stderr][i]
        )
            value = "inherit";
        if (value === "ipc") throw unsupported("child_process IPC");
        if (value !== "pipe" && value !== "inherit" && value !== "ignore")
            throw unsupported("child_process stdio " + describe(value));
        if (i >= 3 && value !== "ignore")
            throw unsupported("child_process stdio[" + i + "]");
        out.push(value);
    }
    return out.slice(0, 3);
}
function pathOfUrl(value) {
    if (
        value !== null &&
        typeof value === "object" &&
        typeof value.href === "string" &&
        value.protocol === "file:"
    ) {
        let path = decodeURIComponent(value.pathname);
        if (sys.platform === "win32") {
            path = path.replace(/\//g, "\\");
            if (/^\\[A-Za-z]:/.test(path)) path = path.slice(1);
        }
        return path;
    }
    return value;
}
function normalizeSpawnArguments(file, args, options) {
    validateString(file, "file");
    if (file.length === 0)
        throw codedError(
            "ERR_INVALID_ARG_VALUE",
            "The argument 'file' cannot be empty. Received ''",
            TypeError,
        );
    if (Array.isArray(args)) args = args.slice();
    else if (args === undefined || args === null) args = [];
    else if (typeof args !== "object")
        throw invalidType("args", "an instance of Array", args);
    else {
        options = args;
        args = [];
    }
    for (let i = 0; i < args.length; i++)
        validateString(args[i], "args[" + i + "]");
    if (options === undefined || options === null) options = {};
    else if (typeof options !== "object")
        throw invalidType("options", "of type object", options);
    let cwd = pathOfUrl(options.cwd);
    if (cwd !== undefined && cwd !== null) validateString(cwd, "options.cwd");
    else cwd = undefined;
    let windowsVerbatimArguments = !!options.windowsVerbatimArguments;
    if (options.shell) {
        const command = [file].concat(args).join(" ");
        if (sys.platform === "win32") {
            file =
                typeof options.shell === "string"
                    ? options.shell
                    : process.env.comspec || "cmd.exe";
            if (/^(?:.*\\)?cmd(?:\.exe)?$/i.test(file)) {
                args = ["/d", "/s", "/c", '"' + command + '"'];
                windowsVerbatimArguments = true;
            } else args = ["-c", command];
        } else {
            file =
                typeof options.shell === "string" ? options.shell : "/bin/sh";
            args = ["-c", command];
        }
    }
    if (typeof options.argv0 === "string") args.unshift(options.argv0);
    else args.unshift(file);
    const env = options.env || process.env,
        envPairs = [];
    for (const key in env) {
        const value = env[key];
        if (value !== undefined) envPairs.push(key + "=" + value);
    }
    return {
        options,
        file,
        args,
        cwd,
        envPairs,
        detached: !!options.detached,
        windowsHide: !!options.windowsHide,
        windowsVerbatimArguments,
    };
}

// ---- ChildProcess ----------------------------------------------------------
export class ChildProcess extends EventEmitter {
    constructor() {
        super();
        this._closesNeeded = 1;
        this._closesGot = 0;
        this.connected = false;
        this.signalCode = null;
        this.exitCode = null;
        this.killed = false;
        this.spawnfile = null;
        this._handle = null;
        this._target = null;
        this.stdin = null;
        this.stdout = null;
        this.stderr = null;
        this.stdio = null;
    }
    spawn(options) {
        if (options === null || typeof options !== "object")
            throw invalidType("options", "of type object", options);
        const stdio = normalizeStdio(options.stdio);
        validateString(options.file, "options.file");
        this.spawnfile = options.file;
        const args = Array.isArray(options.args) ? options.args : [];
        this.spawnargs = args;
        let envPairs = options.envPairs;
        if (!Array.isArray(envPairs)) {
            envPairs = [];
            for (const key in process.env)
                if (process.env[key] !== undefined)
                    envPairs.push(key + "=" + process.env[key]);
        }
        const result = sys.spawn({
            file: options.file,
            args,
            cwd: options.cwd,
            envPairs,
            stdio,
            detached: !!options.detached,
            windowsHide: !!options.windowsHide,
            windowsVerbatimArguments: !!options.windowsVerbatimArguments,
        });
        let handles = [-1, -1, -1];
        if (typeof result === "number") {
            const errno = -result;
            // Run-time errors are reported as an 'error' event, as in Node.js.
            if (
                errno === 13 ||
                errno === 11 ||
                errno === 24 ||
                errno === 23 ||
                errno === 2
            )
                nextTick(() =>
                    this._onExit(sys.errno(errno, codes[errno]), 0, result),
                );
            else throw errnoException(result, "spawn");
        } else {
            this._handle = result.process;
            this.pid = result.pid;
            handles = result.stdio;
            this._target = makeTarget(result.process, EXIT, this);
            watch(this._target);
            nextTick(() => this.emit("spawn"));
        }
        this.stdio = [];
        for (let i = 0; i < 3; i++) {
            let stream = null;
            if (stdio[i] === "pipe") {
                if (i === 0) stream = pipeWritable(handles[i]);
                else {
                    stream = pipeReadable(handles[i]);
                    this._closesNeeded++;
                    stream.on("close", () => this._maybeClose());
                }
            }
            this.stdio.push(stream);
        }
        this.stdin = this.stdio[0];
        this.stdout = this.stdio[1];
        this.stderr = this.stdio[2];
        return undefined;
    }
    _ready() {
        const status = sys.reap(this._handle);
        if (status === null) return;
        this._onExit(status.exitCode, status.signal);
    }
    _onExit(exitCode, signal, spawnError) {
        if (this._target !== null) {
            unwatch(this._target);
            this._target = null;
        }
        if (this._handle !== null) {
            sys.release(this._handle);
            this._handle = null;
        }
        if (signal) this.signalCode = signalNames[signal] || "SIG" + signal;
        else this.exitCode = exitCode;
        if (this.stdin) this.stdin.destroy();
        if (spawnError !== undefined)
            this.emit(
                "error",
                errnoException(
                    spawnError,
                    "spawn " + this.spawnfile,
                    this.spawnfile,
                    this.spawnargs.slice(1),
                ),
            );
        else this.emit("exit", this.exitCode, this.signalCode);
        nextTick(() => this._flushStdio());
        this._maybeClose();
    }
    _flushStdio() {
        if (this.stdio === null) return;
        for (let i = 1; i < this.stdio.length; i++) {
            const stream = this.stdio[i];
            if (stream && stream.readable && stream.readableFlowing === null)
                stream.resume();
        }
    }
    _maybeClose() {
        this._closesGot++;
        if (this._closesGot === this._closesNeeded)
            this.emit("close", this.exitCode, this.signalCode);
    }
    kill(sig) {
        const signal =
            sig === 0
                ? 0
                : convertToValidSignal(sig === undefined ? "SIGTERM" : sig);
        if (this._handle !== null) {
            const result = sys.kill(this._handle, signal);
            if (result === 0) {
                this.killed = true;
                return true;
            }
            if (result === EINVAL || result === ENOSYS)
                throw errnoException(result, "kill");
            if (result !== ESRCH)
                this.emit("error", errnoException(result, "kill"));
        }
        return false;
    }
    ref() {
        if (this._target !== null) setRef(this._target, true);
    }
    unref() {
        if (this._target !== null) setRef(this._target, false);
    }
    get channel() {
        return undefined;
    }
    [Symbol.dispose]() {
        if (!this.killed) this.kill();
    }
}

// ---- spawn, execFile, exec -------------------------------------------------
export function spawn(file, args, options) {
    const normalized = normalizeSpawnArguments(file, args, options);
    options = normalized.options;
    const killSignal =
        options.killSignal === undefined
            ? undefined
            : convertToValidSignal(options.killSignal);
    const child = new ChildProcess();
    child.spawn({
        file: normalized.file,
        args: normalized.args,
        cwd: normalized.cwd,
        envPairs: normalized.envPairs,
        stdio: options.stdio,
        detached: normalized.detached,
        windowsHide: normalized.windowsHide,
        windowsVerbatimArguments: normalized.windowsVerbatimArguments,
    });
    if (options.timeout > 0) {
        let timer = setTimeout(() => {
            if (timer) {
                try {
                    child.kill(killSignal);
                } catch (error) {
                    child.emit("error", error);
                }
                timer = null;
            }
        }, options.timeout);
        child.once("exit", () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        });
    }
    return child;
}

function normalizeExecFileArgs(file, args, options, callback) {
    if (Array.isArray(args)) args = args.slice();
    else if (args !== null && typeof args === "object") {
        callback = options;
        options = args;
        args = null;
    } else if (typeof args === "function") {
        callback = args;
        options = null;
        args = null;
    }
    if (args === null || args === undefined) args = [];
    if (typeof options === "function") callback = options;
    else if (options !== null && options !== undefined) {
        if (typeof options !== "object")
            throw invalidType("options", "of type object", options);
    } else options = {};
    if (
        callback !== null &&
        callback !== undefined &&
        typeof callback !== "function"
    )
        throw invalidType("callback", "of type function", callback);
    if (typeof options === "function") options = {};
    return { file, args, options, callback };
}
export function execFile(file, args, options, callback) {
    ({ file, args, options, callback } = normalizeExecFileArgs(
        file,
        args,
        options,
        callback,
    ));
    options = Object.assign(
        {
            encoding: "utf8",
            timeout: 0,
            maxBuffer: MAX_BUFFER,
            killSignal: "SIGTERM",
            cwd: null,
            env: null,
            shell: false,
        },
        options,
    );
    const child = spawn(file, args, {
        cwd: options.cwd,
        env: options.env,
        shell: options.shell,
        argv0: options.argv0,
        windowsHide: !!options.windowsHide,
        windowsVerbatimArguments: !!options.windowsVerbatimArguments,
    });
    const encoding =
        options.encoding !== "buffer" && Buffer.isEncoding(options.encoding)
            ? options.encoding
            : null;
    const stdoutChunks = [],
        stderrChunks = [];
    let stdoutLength = 0,
        stderrLength = 0,
        killed = false,
        exited = false,
        timer = null,
        ex = null,
        cmd = file;
    function exithandler(code, signal) {
        if (exited) return;
        exited = true;
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        if (!callback) return;
        const stdout = encoding
            ? stdoutChunks.join("")
            : Buffer.concat(stdoutChunks);
        const stderr = encoding
            ? stderrChunks.join("")
            : Buffer.concat(stderrChunks);
        if (!ex && code === 0 && signal === null) {
            callback(null, stdout, stderr);
            return;
        }
        if (args.length > 0) cmd += " " + args.join(" ");
        if (!ex) {
            ex = new Error("Command failed: " + cmd + "\n" + stderr);
            ex.code = code < 0 ? systemErrorName(code) : code;
            ex.killed = child.killed || killed;
            ex.signal = signal;
        }
        ex.cmd = cmd;
        callback(ex, stdout, stderr);
    }
    function errorhandler(error) {
        ex = error;
        if (child.stdout) child.stdout.destroy();
        if (child.stderr) child.stderr.destroy();
        exithandler();
    }
    function kill() {
        if (child.stdout) child.stdout.destroy();
        if (child.stderr) child.stderr.destroy();
        killed = true;
        try {
            child.kill(options.killSignal);
        } catch (error) {
            ex = error;
            exithandler();
        }
    }
    if (options.timeout > 0)
        timer = setTimeout(() => {
            kill();
            timer = null;
        }, options.timeout);
    const collect = (stream, chunks, name) => {
        if (encoding) stream.setEncoding(encoding);
        stream.on("data", (chunk) => {
            const length = encoding
                ? Buffer.byteLength(chunk, encoding)
                : chunk.length;
            const total =
                name === "stdout"
                    ? (stdoutLength += length)
                    : (stderrLength += length);
            if (total > options.maxBuffer) {
                const keep = options.maxBuffer - (total - length);
                chunks.push(chunk.slice(0, keep));
                ex = codedError(
                    "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
                    name + " maxBuffer length exceeded",
                    RangeError,
                );
                kill();
            } else chunks.push(chunk);
        });
    };
    if (child.stdout) collect(child.stdout, stdoutChunks, "stdout");
    if (child.stderr) collect(child.stderr, stderrChunks, "stderr");
    child.addListener("close", exithandler);
    child.addListener("error", errorhandler);
    return child;
}
export function exec(command, options, callback) {
    validateString(command, "command");
    if (typeof options === "function") {
        callback = options;
        options = undefined;
    }
    options = Object.assign({}, options);
    options.shell = typeof options.shell === "string" ? options.shell : true;
    return execFile(command, options, callback);
}
const customPromisify = Symbol.for("nodejs.util.promisify.custom");
function promiseExec(original) {
    return (...args) => {
        let resolve, reject;
        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        promise.child = original(...args, (error, stdout, stderr) => {
            if (error !== null) {
                error.stdout = stdout;
                error.stderr = stderr;
                reject(error);
            } else resolve({ stdout, stderr });
        });
        return promise;
    };
}
Object.defineProperty(exec, customPromisify, {
    enumerable: false,
    value: promiseExec(exec),
});
Object.defineProperty(execFile, customPromisify, {
    enumerable: false,
    value: promiseExec(execFile),
});

// ---- Synchronous variants --------------------------------------------------
function inputBytes(input, name) {
    if (typeof input === "string") return Buffer.from(input);
    if (ArrayBuffer.isView(input))
        return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    throw invalidType(
        name,
        "of type string or an instance of Buffer, TypedArray, or DataView",
        input,
    );
}
/** Runs a child to completion, writing input and draining stdout and stderr together. */
function runSync(request, input, timeout, maxBuffer, killSignal) {
    const result = sys.spawn(request);
    if (typeof result === "number") return { error: result };
    const child = result.process,
        handles = result.stdio,
        targets = [],
        chunks = [[], [], []];
    let offset = 0,
        buffered = 0,
        error = 0,
        status = null,
        killed = false;
    if (handles[0] !== -1) {
        if (input !== null && input.length > 0)
            targets.push(makeTarget(handles[0], WRITE, 0));
        else sys.close(handles[0]);
    }
    for (let i = 1; i < 3; i++)
        if (handles[i] !== -1) targets.push(makeTarget(handles[i], READ, i));
    const exit = makeTarget(child, EXIT, -1);
    targets.push(exit);
    const deadline = timeout > 0 ? performance.now() + timeout : Infinity;
    const remove = (target) => {
        const i = targets.indexOf(target);
        if (i >= 0) targets.splice(i, 1);
        if (target !== exit) sys.close(target.handle);
    };
    const stop = (errno) => {
        if (killed) return;
        killed = true;
        error = error || errno;
        sys.kill(child, killSignal);
    };
    for (;;) {
        for (const target of targets.slice()) {
            if (target.kind === WRITE) {
                for (;;) {
                    const n = sys.write(
                        target.handle,
                        input,
                        offset,
                        input.length - offset,
                    );
                    if (n === EAGAIN || n === EINTR) break;
                    if (n < 0) {
                        remove(target);
                        break;
                    }
                    offset += n;
                    if (offset >= input.length) {
                        remove(target);
                        break;
                    }
                }
            } else if (target.kind === READ) {
                for (;;) {
                    const n = sys.read(target.handle, readBuffer);
                    if (n === EAGAIN || n === EINTR) break;
                    if (n <= 0) {
                        remove(target);
                        break;
                    }
                    chunks[target.owner].push(
                        Buffer.from(readBuffer.subarray(0, n)),
                    );
                    buffered += n;
                    if (maxBuffer > 0 && buffered > maxBuffer) stop(-105);
                }
            } else if (status === null) {
                status = sys.reap(child);
                if (status !== null) remove(exit);
            }
        }
        let reading = false;
        for (const target of targets) if (target.kind === READ) reading = true;
        if (status !== null && !reading) break;
        let wait = -1;
        if (!killed && deadline !== Infinity) {
            wait = Math.ceil(deadline - performance.now());
            if (wait <= 0) {
                stop(-110);
                wait = -1;
            }
        }
        if (status === null && targets.indexOf(exit) < 0) targets.push(exit);
        sys.poll(targets, wait);
    }
    for (const target of targets.slice()) remove(target);
    sys.release(child);
    const output = [null];
    for (let i = 1; i < 3; i++)
        output.push(handles[i] === -1 ? null : Buffer.concat(chunks[i]));
    return {
        error,
        status: status.signal ? null : status.exitCode,
        signal: status.signal
            ? signalNames[status.signal] || "SIG" + status.signal
            : null,
        output,
        pid: result.pid,
    };
}
export function spawnSync(file, args, options) {
    const normalized = normalizeSpawnArguments(file, args, options);
    options = normalized.options;
    const stdio = normalizeStdio(options.stdio);
    let input = null;
    if (options.input !== undefined && options.input !== null) {
        input = inputBytes(options.input, "options.stdio[0]");
        if (stdio[0] !== "pipe") input = null;
    }
    const maxBuffer =
        options.maxBuffer === undefined || options.maxBuffer === null
            ? MAX_BUFFER
            : options.maxBuffer === Infinity
              ? 0
              : options.maxBuffer;
    const killSignal =
        options.killSignal === undefined
            ? 15
            : convertToValidSignal(options.killSignal);
    const raw = runSync(
        {
            file: normalized.file,
            args: normalized.args,
            cwd: normalized.cwd,
            envPairs: normalized.envPairs,
            stdio,
            detached: normalized.detached,
            windowsHide: normalized.windowsHide,
            windowsVerbatimArguments: normalized.windowsVerbatimArguments,
        },
        input,
        options.timeout > 0 ? options.timeout : 0,
        maxBuffer,
        killSignal,
    );
    const result = {};
    if (raw.error)
        result.error = errnoException(
            raw.error,
            "spawnSync " + normalized.file,
            normalized.file,
            normalized.args.slice(1),
        );
    if (raw.output === undefined) {
        Object.assign(result, {
            status: null,
            signal: null,
            output: null,
            pid: 0,
            stdout: undefined,
            stderr: undefined,
        });
        return result;
    }
    const encoding = options.encoding;
    if (encoding && encoding !== "buffer")
        for (let i = 0; i < raw.output.length; i++)
            if (raw.output[i]) raw.output[i] = raw.output[i].toString(encoding);
    result.status = raw.status;
    result.signal = raw.signal;
    result.output = raw.output;
    result.pid = raw.pid;
    result.stdout = raw.output[1];
    result.stderr = raw.output[2];
    return result;
}
function checkExecSyncError(result, args, cmd) {
    let error;
    if (result.error) {
        error = result.error;
        Object.assign(error, result);
    } else if (result.status !== 0) {
        let message = "Command failed: " + (cmd || args.join(" "));
        if (result.stderr && result.stderr.length > 0)
            message += "\n" + result.stderr.toString();
        error = new Error(message);
        Object.assign(error, result);
    }
    return error;
}
export function execFileSync(file, args, options) {
    ({ file, args, options } = normalizeExecFileArgs(file, args, options));
    const inheritStderr = !options.stdio;
    const result = spawnSync(file, args, options);
    if (inheritStderr && result.stderr) process.stderr.write(result.stderr);
    const error = checkExecSyncError(
        result,
        [options.argv0 || file].concat(args),
        undefined,
    );
    if (error) throw error;
    return result.stdout;
}
export function execSync(command, options) {
    validateString(command, "command");
    options = Object.assign({}, options);
    options.shell = typeof options.shell === "string" ? options.shell : true;
    const inheritStderr = !options.stdio;
    const result = spawnSync(command, options);
    if (inheritStderr && result.stderr) process.stderr.write(result.stderr);
    const error = checkExecSyncError(result, undefined, command);
    if (error) throw error;
    return result.stdout;
}
export function fork() {
    throw unsupported("child_process.fork");
}
export function _forkChild() {
    throw unsupported("child_process._forkChild");
}
export default {
    ChildProcess,
    spawn,
    spawnSync,
    exec,
    execSync,
    execFile,
    execFileSync,
    fork,
    _forkChild,
};
