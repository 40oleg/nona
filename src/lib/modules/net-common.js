import { EventEmitter } from "node:events";
import { Buffer } from "node:buffer";
import { Readable, defaults, clock } from "nona:internal/stream";
import { copy as copyBytes, slice as sliceBytes } from "nona:internal/native";
const bufferPrototype = Buffer.prototype;
const READ = 1,
    WRITE = 2,
    ERROR = 4,
    HANGUP = 8;
const EAGAIN = -11,
    EINTR = -4,
    EINPROGRESS = -115;
const codes = {
    1: "EPERM",
    4: "EINTR",
    9: "EBADF",
    11: "EAGAIN",
    12: "ENOMEM",
    13: "EACCES",
    22: "EINVAL",
    24: "EMFILE",
    32: "EPIPE",
    97: "EAFNOSUPPORT",
    98: "EADDRINUSE",
    99: "EADDRNOTAVAIL",
    100: "ENETDOWN",
    101: "ENETUNREACH",
    103: "ECONNABORTED",
    104: "ECONNRESET",
    105: "ENOBUFS",
    106: "EISCONN",
    107: "ENOTCONN",
    110: "ETIMEDOUT",
    111: "ECONNREFUSED",
    113: "EHOSTUNREACH",
    114: "EALREADY",
    115: "EINPROGRESS",
};
const descriptions = {
    EACCES: "permission denied",
    EADDRINUSE: "address already in use",
    EADDRNOTAVAIL: "address not available",
    EAFNOSUPPORT: "address family not supported",
    EINVAL: "invalid argument",
    EMFILE: "too many open files",
    ECONNREFUSED: "connection refused",
    ECONNRESET: "connection reset by peer",
    EPIPE: "broken pipe",
    ETIMEDOUT: "connection timed out",
    ENOTCONN: "socket is not connected",
};
function errnoException(result, syscall, address, port, withDescription) {
    const code = codes[-result] || "UNKNOWN";
    let message = syscall + " " + code;
    if (withDescription)
        message += ": " + (descriptions[code] || "unknown error");
    if (address !== undefined)
        message += " " + address + (port !== undefined ? ":" + port : "");
    const error = new Error(message);
    error.errno = sys.errno(-result, code);
    error.code = code;
    error.syscall = syscall;
    if (address !== undefined) error.address = address;
    if (port !== undefined) error.port = port;
    return error;
}
function codedError(code, message, Type) {
    const error = new (Type || Error)(message);
    error.code = code;
    return error;
}

// ---- IP addresses ----------------------------------------------------------
const v4 =
    /^(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])){3}$/;
export function isIPv4(input) {
    return typeof input === "string" && v4.test(input);
}
function parseIPv6(input) {
    if (
        typeof input !== "string" ||
        input.length < 2 ||
        input.indexOf("%") >= 0
    )
        return null;
    let text = input;
    const lastColon = text.lastIndexOf(":");
    if (lastColon < 0) return null;
    if (text.indexOf(".") > lastColon) {
        // A trailing dotted quad stands for the last two groups.
        const four = text.slice(lastColon + 1);
        if (!isIPv4(four)) return null;
        const parts = four.split(".").map(Number);
        text =
            text.slice(0, lastColon + 1) +
            ((parts[0] << 8) | parts[1]).toString(16) +
            ":" +
            ((parts[2] << 8) | parts[3]).toString(16);
    }
    const halves = text.split("::");
    if (halves.length > 2) return null;
    const group = /^[0-9a-fA-F]{1,4}$/;
    const parse = (part) =>
        part === ""
            ? []
            : part
                  .split(":")
                  .map((g) => (group.test(g) ? parseInt(g, 16) : NaN));
    const head = parse(halves[0]),
        rest = halves.length === 2 ? parse(halves[1]) : [];
    if (head.some((n) => n !== n) || rest.some((n) => n !== n)) return null;
    const total = head.length + rest.length;
    if (halves.length === 1 ? total !== 8 : total > 7) return null;
    const words = head.concat(new Array(8 - total).fill(0), rest);
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 8; i++) {
        bytes[2 * i] = words[i] >> 8;
        bytes[2 * i + 1] = words[i] & 255;
    }
    return bytes;
}
export function isIPv6(input) {
    return parseIPv6(input) !== null;
}
export function isIP(input) {
    return isIPv4(input) ? 4 : isIPv6(input) ? 6 : 0;
}
function formatIPv6(bytes, offset) {
    const words = [];
    for (let i = 0; i < 8; i++)
        words.push((bytes[offset + 2 * i] << 8) | bytes[offset + 2 * i + 1]);
    if (
        words[0] === 0 &&
        words[1] === 0 &&
        words[2] === 0 &&
        words[3] === 0 &&
        words[4] === 0 &&
        words[5] === 0xffff
    )
        return (
            "::ffff:" +
            [
                bytes[offset + 12],
                bytes[offset + 13],
                bytes[offset + 14],
                bytes[offset + 15],
            ].join(".")
        );
    let bestStart = -1,
        bestLength = 0;
    for (let i = 0; i < 8;) {
        if (words[i] !== 0) {
            i++;
            continue;
        }
        let j = i;
        while (j < 8 && words[j] === 0) j++;
        if (j - i > bestLength && j - i > 1) {
            bestStart = i;
            bestLength = j - i;
        }
        i = j;
    }
    if (bestStart < 0) return words.map((w) => w.toString(16)).join(":");
    return (
        words
            .slice(0, bestStart)
            .map((w) => w.toString(16))
            .join(":") +
        "::" +
        words
            .slice(bestStart + bestLength)
            .map((w) => w.toString(16))
            .join(":")
    );
}
/** sockaddr_in / sockaddr_in6 for an IP literal. */
function socketAddress(address, port) {
    if (isIPv4(address)) {
        const out = new Uint8Array(16);
        out[0] = sys.AF_INET & 255;
        out[1] = sys.AF_INET >> 8;
        out[2] = port >> 8;
        out[3] = port & 255;
        address.split(".").forEach((part, i) => {
            out[4 + i] = Number(part);
        });
        return out;
    }
    const bytes = parseIPv6(address),
        out = new Uint8Array(28);
    out[0] = sys.AF_INET6 & 255;
    out[1] = sys.AF_INET6 >> 8;
    out[2] = port >> 8;
    out[3] = port & 255;
    out.set(bytes, 8);
    return out;
}
function decodeAddress(raw) {
    if (raw === null) return {};
    const family = raw[0] | (raw[1] << 8),
        port = (raw[2] << 8) | raw[3];
    if (family === sys.AF_INET)
        return {
            address: raw[4] + "." + raw[5] + "." + raw[6] + "." + raw[7],
            family: "IPv4",
            port,
        };
    if (family === sys.AF_INET6)
        return { address: formatIPv6(raw, 8), family: "IPv6", port };
    return {};
}
/** Host name to [{address, family}], synchronously; throws ENOTFOUND. */
function lookup(host) {
    if (isIP(host)) return [{ address: host, family: isIP(host) }];
    const name = String(host).toLowerCase();
    if (name === "localhost" || name.endsWith(".localhost"))
        return [{ address: "127.0.0.1", family: 4 }];
    const found = sys.lookup(name);
    if (found.length === 0) {
        const error = new Error("getaddrinfo ENOTFOUND " + host);
        error.errno = -3008;
        error.code = "ENOTFOUND";
        error.syscall = "getaddrinfo";
        error.hostname = host;
        throw error;
    }
    return found;
}

// ---- Handle lists ----------------------------------------------------------------
/**
 * An unordered list of handles with O(1) add and remove: each handle keeps
 * its position in a field. Sets and Maps are not used for sets that change on
 * every request: a deleted entry stays in their entry list (for iterators),
 * so constant churn makes them grow and their small-size lookups linear.
 */
class HandleList {
    // One list per server (its connections); the position field is fixed so
    // that its accesses are plain named property reads.
    constructor() {
        this.items = [];
    }
    get size() {
        return this.items.length;
    }
    has(handle) {
        const i = handle._connectionIndex;
        return i >= 0 && this.items[i] === handle;
    }
    add(handle) {
        if (this.has(handle)) return;
        handle._connectionIndex = this.items.length;
        this.items.push(handle);
    }
    delete(handle) {
        if (!this.has(handle)) return false;
        const i = handle._connectionIndex,
            last = this.items.pop();
        if (last !== handle) {
            this.items[i] = last;
            last._connectionIndex = i;
        }
        handle._connectionIndex = -1;
        return true;
    }
    values() {
        return this.items.slice();
    }
}

// ---- Event loop integration ------------------------------------------------
// Handles (sockets and servers) are registered while they are open. The loop
// asks the poller how many referenced handles keep the program alive, then
// calls poll(timeout), which returns the number of ready entries, and run(i)
// for each of them, draining the job queue in between. Readiness comes from
// the platform layer (epoll on Linux, WSAPoll on Windows); a handle's
// interest is only recomputed after markDirty(), so a poll costs work in
// proportion to the handles that changed or became ready, not to all of them.
let registered = false,
    handleCount = 0,
    refedCount = 0;
let immediates = [],
    dirty = [];
const byFd = [];
const readyHandles = [],
    readyEvents = [];
// Inactivity timeouts: deadlines in loop time; scanned only when the earliest
// one is due. A handle whose deadline was cleared stays on the list with
// deadline 0 until a scan drops it: a keep-alive connection sets and clears
// its deadline once per request, which is then two field writes.
const timedItems = [];
let earliestDeadline = Infinity;
// The timed list is a HandleList over the _timedIndex field of sockets,
// spelled out: it changes on every request of a keep-alive connection.
function timedHas(handle) {
    const i = handle._timedIndex;
    return i >= 0 && timedItems[i] === handle;
}
function timedDelete(handle) {
    const i = handle._timedIndex,
        last = timedItems.pop();
    if (last !== handle) {
        timedItems[i] = last;
        last._timedIndex = i;
    }
    handle._timedIndex = -1;
}
/** Loop time in milliseconds, updated after every wait (like libuv's uv_now). */
let loopNow = performance.now();
clock.now = loopNow;
function ensureLoop() {
    if (registered) return;
    registered = true;
    const hook = globalThis.__nonaIoLoop;
    if (typeof hook === "function") hook(poller);
    sys.init();
}
function register(handle) {
    ensureLoop();
    if (handle._registered) return;
    handle._registered = true;
    handleCount++;
    if (handle._refed) refedCount++;
}
function unregister(handle) {
    if (!handle._registered) return;
    handle._registered = false;
    handleCount--;
    if (handle._refed) refedCount--;
    if (timedHas(handle)) timedDelete(handle);
}
function setRef(handle, refed) {
    if (handle._refed === refed) return;
    handle._refed = refed;
    if (handle._registered) refedCount += refed ? 1 : -1;
}
/** Starts watching the handle's file descriptor (its interest is computed at the next poll). */
function watch(handle) {
    byFd[handle._fd] = handle;
    handle._watched = 0;
    markDirty(handle);
}
/**
 * Stops watching the descriptor; with closing set it is closed right after,
 * which removes it from the poller by itself (no epoll_ctl per connection).
 */
function unwatch(handle, closing) {
    const fd = handle._fd;
    if (fd < 0) return;
    if (byFd[fd] === handle) byFd[fd] = undefined;
    if (handle._watched !== 0) {
        if (!closing || !sys.closeDropsWatch)
            sys.watch(fd, 0, handle._watched, handle);
        handle._watched = 0;
    }
}
function markDirty(handle) {
    if (!handle._dirty) {
        handle._dirty = true;
        dirty.push(handle);
    }
}
function setDeadline(handle, deadline) {
    handle._deadline = deadline;
    if (deadline > 0) {
        if (!timedHas(handle)) {
            handle._timedIndex = timedItems.length;
            timedItems.push(handle);
        }
        if (deadline < earliestDeadline) earliestDeadline = deadline;
    }
}
/** Run a callback in a later turn of the event loop (after I/O, like setImmediate). */
function defer(callback) {
    ensureLoop();
    immediates.push(callback);
}
const IMMEDIATE = -1,
    TIMEOUT = -2;
const poller = {
    active() {
        return refedCount + immediates.length;
    },
    total() {
        return handleCount + immediates.length;
    },
    /**
     * nextTimer: when the earliest timer is due, in performance.now() time.
     * Expired socket deadlines not before nextTimer stay pending: the loop
     * runs the due timers, then calls poll(0), which reports them.
     */
    poll(timeout, nextTimer = Infinity) {
        if (immediates.length > 0) timeout = 0;
        if (dirty.length > 0) {
            const list = dirty;
            dirty = [];
            for (let i = 0; i < list.length; i++) {
                const handle = list[i];
                handle._dirty = false;
                if (handle._fd < 0 || byFd[handle._fd] !== handle) continue;
                const want = handle._interest();
                if (want !== handle._watched) {
                    sys.watch(handle._fd, want, handle._watched, handle);
                    handle._watched = want;
                }
            }
        }
        if (earliestDeadline !== Infinity) {
            const wait = Math.max(0, Math.ceil(earliestDeadline - loopNow));
            if (timeout < 0 || wait < timeout) timeout = wait;
        }
        const n = sys.wait(timeout);
        loopNow = clock.now = performance.now();
        let count = 0;
        for (let i = 0; i < n; i++) {
            const handle = byFd[sys.readyFd(i)];
            if (handle === undefined) continue;
            readyHandles[count] = handle;
            readyEvents[count] = sys.readyEvents(i);
            count++;
        }
        // A timer due first runs first, as in Node.js where socket timeouts are timers too.
        if (earliestDeadline <= loopNow && earliestDeadline < nextTimer) {
            let next = Infinity;
            for (const handle of timedItems.slice()) {
                const deadline = handle._deadline;
                if (deadline === 0) timedDelete(handle);
                else if (deadline <= loopNow && deadline < nextTimer) {
                    handle._deadline = 0;
                    timedDelete(handle);
                    readyHandles[count] = handle;
                    readyEvents[count] = TIMEOUT;
                    count++;
                } else if (deadline < next) next = deadline;
            }
            earliestDeadline = next;
        }
        if (immediates.length > 0) {
            const due = immediates;
            immediates = [];
            for (let i = 0; i < due.length; i++) {
                readyHandles[count] = due[i];
                readyEvents[count] = IMMEDIATE;
                count++;
            }
        }
        return count;
    },
    run(i) {
        const handle = readyHandles[i],
            events = readyEvents[i];
        readyHandles[i] = undefined;
        if (events === IMMEDIATE) handle();
        else if (events === TIMEOUT) {
            if (!handle.destroyed) handle.emit("timeout");
        } else handle._ready(events);
    },
};

/** The 'finish' listener of destroySoon (returns nothing: a returned value is checked for capture). */
function destroyOnFinish() {
    this.destroy();
}
/** Write callbacks are functions, or (from node:http) objects with a _sent method. */
function invoke(callback, error) {
    if (typeof callback === "function") callback(error);
    else callback._sent(error);
}

// ---- Socket ----------------------------------------------------------------
/**
 * Sockets read into one arena shared by all of them; readBuffer is the view
 * of its free part. A consumer (node:http) may keep views of the bytes it was
 * given instead of copying them (large request body chunks): onData then
 * returns how many bytes from the start of the view must stay untouched, and
 * later reads go after them, into a fresh arena once less than readReserve is
 * left. The arena fills the allocator's largest cell (64 KiB with its
 * header), so it is recycled from a free list like the copies it replaces.
 * The reserve is small so that little of an arena is left unused (the bytes
 * allocated per request set how often the collector runs): a message that
 * does not fit the rest of an arena is read in two parts, the second one at
 * once (see _readNow).
 */
const readArenaBytes = 65432,
    readReserve = 4096,
    readShort = 16384;
let readArena = new Uint8Array(readArenaBytes),
    readBuffer = readArena,
    readOffset = 0,
    readFree = readArenaBytes; // readBuffer.length
function keepRead(kept) {
    readOffset += kept;
    readFree = readArenaBytes - readOffset;
    if (readFree < readReserve) {
        readArena = sliceBytes(readArena, 0, readArenaBytes, undefined, 2);
        readOffset = 0;
        readFree = readArenaBytes;
        readBuffer = readArena;
    } else
        readBuffer = sliceBytes(
            readArena,
            readOffset,
            readArenaBytes,
            undefined,
            1,
        );
}
export class Socket extends Readable {
    // Field defaults live on the prototype (see defaults() below).
    constructor(options) {
        super(options);
        if (options && options.allowHalfOpen) this.allowHalfOpen = true;
    }
    get bytesWritten() {
        return this._bytesWritten;
    }
    get pending() {
        return this._fd < 0 || this.connecting;
    }
    get readyState() {
        if (this.connecting) return "opening";
        if (this._fd < 0) return "closed";
        const readable = !this._eof,
            writable = !this._writeEnded;
        return readable && writable
            ? "open"
            : readable
              ? "readOnly"
              : writable
                ? "writeOnly"
                : "closed";
    }
    get writable() {
        return !this._destroyed && !this._writeEnded;
    }
    get writableLength() {
        return this._writeLength;
    }
    get bufferSize() {
        return this._writeLength;
    }
    get writableEnded() {
        return this._writeEnded;
    }
    get writableFinished() {
        return this._finished;
    }
    get writableNeedDrain() {
        return this._needDrain;
    }
    get remoteAddress() {
        return this._peer().address;
    }
    get remotePort() {
        return this._peer().port;
    }
    get remoteFamily() {
        return this._peer().family;
    }
    get localAddress() {
        return this._local().address;
    }
    get localPort() {
        return this._local().port;
    }
    get localFamily() {
        return this._local().family;
    }
    _peer() {
        if (this._peername === null && this._fd >= 0 && !this.connecting)
            this._peername = sys.peername(this._fd);
        return decodeAddress(this._peername);
    }
    _local() {
        if (this._sockname === null && this._fd >= 0)
            this._sockname = sys.sockname(this._fd);
        return decodeAddress(this._sockname);
    }
    address() {
        const a = this._local();
        return a.address === undefined
            ? {}
            : { address: a.address, family: a.family, port: a.port };
    }
    _attach(fd) {
        this._fd = fd;
        register(this);
        watch(this);
    }
    connect(...args) {
        let options, callback;
        if (args[0] !== null && typeof args[0] === "object") {
            options = args[0];
            callback = args[1];
        } else {
            options = { port: args[0] };
            if (typeof args[1] === "string") {
                options.host = args[1];
                callback = args[2];
            } else callback = args[1];
        }
        if (typeof callback === "function") this.once("connect", callback);
        if (options.path !== undefined && options.path !== null)
            throw codedError(
                "ERR_INVALID_ARG_VALUE",
                "IPC paths are not supported by nona:net",
            );
        const port = Number(options.port);
        if (
            options.port === undefined ||
            options.port === null ||
            options.port === "" ||
            !(port >= 0 && port < 65536 && port === Math.floor(port))
        ) {
            throw codedError(
                "ERR_SOCKET_BAD_PORT",
                "Port should be >= 0 and < 65536. Received " +
                    (typeof options.port === "string"
                        ? "type string ('" + options.port + "')"
                        : "type " +
                          typeof options.port +
                          " (" +
                          String(options.port) +
                          ")") +
                    ".",
                RangeError,
            );
        }
        const host = options.host || "localhost";
        if (typeof options.timeout === "number")
            this.setTimeout(options.timeout);
        if (options.noDelay) this._noDelay = true;
        this.connecting = true;
        this._host = host;
        this._refed = true;
        register(this);
        // Like Node.js, the lookup and the connect call happen on a later tick, so
        // errors reach listeners attached after connect() returns.
        queueMicrotask(() => {
            if (this.connecting && !this._destroyed)
                this._startConnect(host, port);
        });
        return this;
    }
    _startConnect(host, port) {
        let addresses;
        try {
            addresses = lookup(host);
        } catch (error) {
            this.connecting = false;
            this.destroy(error);
            return;
        }
        const target = addresses[0].address;
        this.emit("lookup", null, target, addresses[0].family, host);
        if (this._destroyed) return;
        const fd = sys.socket(isIPv4(target) ? sys.AF_INET : sys.AF_INET6);
        if (fd < 0) {
            this.destroy(errnoException(fd, "connect", target, port));
            return;
        }
        this._fd = fd;
        watch(this);
        if (this._noDelay) sys.setNoDelay(fd, true);
        const result = sys.connect(fd, socketAddress(target, port));
        this._target = { address: target, port };
        if (result < 0 && result !== EINPROGRESS && result !== EAGAIN)
            this.destroy(errnoException(result, "connect", target, port));
        else if (result >= 0) queueMicrotask(() => this._connected());
    }
    _connected() {
        if (this._destroyed || !this.connecting) return;
        this.connecting = false;
        markDirty(this);
        this._touch();
        this.emit("connect");
        this.emit("ready");
        this._flushWrites();
    }
    _interest() {
        if (this._fd < 0 || this._destroyed) return 0;
        if (this.connecting) return WRITE;
        let interest = 0;
        if (!this._eof && this._flowing !== false && this._queued < this._hwm)
            interest |= READ;
        if (this._writeQueue !== null && this._writeQueue.length > 0)
            interest |= WRITE;
        return interest;
    }
    _ready(revents) {
        if (this._destroyed || this._fd < 0) return;
        if (this.connecting) {
            const error = sys.socketError(this._fd);
            if (error < 0) {
                this.destroy(
                    errnoException(
                        error,
                        "connect",
                        this._target.address,
                        this._target.port,
                    ),
                );
                return;
            }
            if ((revents & (WRITE | ERROR | HANGUP)) === 0) return;
            this._connected();
            return;
        }
        if (revents & (READ | ERROR | HANGUP)) this._readNow();
        if (
            !this._destroyed &&
            revents & (WRITE | ERROR | HANGUP) &&
            this._writeQueue !== null &&
            this._writeQueue.length > 0
        )
            this._flushWrites();
    }
    /**
     * Reads what the socket has. A read that fills the buffer is repeated
     * without waiting for the next readiness event (as libuv repeats it), in
     * a microtask: as in Node.js, the tasks and microtasks the data queued
     * run before the next read.
     */
    _readNow() {
        if (this._eof || this._destroyed) return;
        const buffer = readBuffer,
            n = sys.recv(this._fd, buffer);
        if (n === EAGAIN || n === EINTR) return;
        if (n < 0) {
            this.destroy(errnoException(n, "read"));
            return;
        }
        this._touch();
        if (n === 0) {
            this._eof = true;
            markDirty(this);
            if (this._consumer !== null) {
                this._consumer.onEnd();
                this._maybeClose();
                return;
            }
            this.push(null);
            if (!this.allowHalfOpen && !this._writeEnded) this.end();
            this._maybeClose();
            return;
        }
        this.bytesRead += n;
        if (n !== readFree) {
            if (this._consumer !== null) {
                const kept = this._consumer.onData(buffer, n, true);
                if (kept > 0) keepRead(kept);
            } else this.push(sliceBytes(buffer, 0, n, bufferPrototype));
            return;
        }
        // The read filled the buffer. A small rest of the arena (its bytes
        // were copied, not kept) is given up, or every later read would be
        // as small.
        let more;
        if (this._consumer !== null) {
            const kept = this._consumer.onData(buffer, n, true);
            if (kept > 0) keepRead(kept);
            else if (n < readShort) keepRead(n);
            more = this._consumer !== null;
        } else {
            more = this.push(sliceBytes(buffer, 0, n, bufferPrototype));
            if (n < readShort) keepRead(n);
        }
        if (more && this._flowing !== false)
            queueMicrotask(() => {
                if (this._fd >= 0) this._readNow();
            });
    }
    _ended_() {
        this._maybeClose();
    }
    write(data, encoding, callback) {
        if (typeof encoding === "function") {
            callback = encoding;
            encoding = undefined;
        }
        if (this._writeEnded) {
            const error = codedError(
                "ERR_STREAM_WRITE_AFTER_END",
                "write after end",
            );
            queueMicrotask(() => {
                if (callback) callback(error);
                this.emit("error", error);
            });
            return false;
        }
        if (typeof data !== "string" && !(data instanceof Uint8Array)) {
            const error = new TypeError(
                'The "chunk" argument must be of type string or an instance of Buffer or Uint8Array. Received ' +
                    (data === null ? "null" : typeof data),
            );
            error.code = "ERR_INVALID_ARG_TYPE";
            throw error;
        }
        const bytes =
            typeof data === "string" ? Buffer.from(data, encoding) : data;
        if (this._destroyed) {
            const error = codedError(
                "ERR_STREAM_DESTROYED",
                "Cannot call write after a stream was destroyed",
            );
            if (callback) queueMicrotask(() => callback(error));
            return false;
        }
        (this._writeQueue || (this._writeQueue = [])).push({
            bytes,
            offset: 0,
            length: bytes.length,
            callback,
        });
        this._writeLength += bytes.length;
        if (!this.connecting && this._fd >= 0) this._flushWrites();
        const ok = this._writeLength < 16384;
        if (!ok) this._needDrain = true;
        return ok;
    }
    _flushWrites() {
        while (
            this._writeQueue !== null &&
            this._writeQueue.length > 0 &&
            !this._destroyed
        ) {
            const item = this._writeQueue[0];
            if (item.length > item.offset) {
                if (item.offset > 0) {
                    const rest = new Uint8Array(item.length - item.offset);
                    copyBytes(item.bytes, item.offset, item.length, rest, 0);
                    item.bytes = rest;
                    item.length = rest.length;
                    item.offset = 0;
                }
                const n = sys.send(this._fd, item.bytes, item.length);
                if (n === EAGAIN || n === EINTR) {
                    markDirty(this);
                    return;
                }
                if (n < 0) {
                    this.destroy(errnoException(n, "write"));
                    return;
                }
                this._touch();
                item.offset += n;
                this._writeLength -= n;
                this._bytesWritten += n;
                if (item.offset < item.length) {
                    markDirty(this);
                    return;
                }
            }
            this._writeQueue.shift();
            if (item.callback) {
                const callback = item.callback;
                queueMicrotask(() => invoke(callback, null));
            }
        }
        if (this._writeQueue === null || this._writeQueue.length === 0) {
            if (this._watched & WRITE) markDirty(this);
            if (this._needDrain) {
                this._needDrain = false;
                queueMicrotask(() => {
                    if (!this._destroyed) this.emit("drain");
                });
            }
            if (this._writeEnded && !this._shutdown) this._finishWrites();
        }
    }
    _finishWrites() {
        this._shutdown = true;
        if (this._fd >= 0) sys.shutdown(this._fd);
        queueMicrotask(() => {
            if (this._destroyed) return;
            this._finished = true;
            this.emit("finish");
            this._maybeClose();
        });
    }
    end(data, encoding, callback) {
        if (typeof data === "function") {
            callback = data;
            data = undefined;
        } else if (typeof encoding === "function") {
            callback = encoding;
            encoding = undefined;
        }
        if (data !== undefined && data !== null) this.write(data, encoding);
        if (typeof callback === "function") this.once("finish", callback);
        if (this._writeEnded) return this;
        this._writeEnded = true;
        if (
            !this.connecting &&
            this._fd >= 0 &&
            (this._writeQueue === null || this._writeQueue.length === 0)
        )
            this._finishWrites();
        else if (this._fd < 0 && !this.connecting)
            queueMicrotask(() => this.destroy());
        return this;
    }
    destroySoon() {
        if (!this._writeEnded) this.end();
        if (this._finished) this.destroy();
        else this.once("finish", destroyOnFinish);
    }
    _maybeClose() {
        if (this._destroyed) return;
        if (
            (this._endEmitted || (this._eof && this._flowing !== true)) &&
            this._finished
        )
            this.destroy();
    }
    _destroy(error, callback) {
        if (error) this._hadError = true;
        this.connecting = false;
        this._deadline = 0;
        if (this._fd >= 0) {
            unwatch(this, true);
            sys.close(this._fd);
            this._fd = -1;
        }
        unregister(this);
        if (this._writeQueue !== null)
            for (const item of this._writeQueue)
                if (item.callback) {
                    const cb = item.callback;
                    queueMicrotask(() =>
                        invoke(
                            cb,
                            error ||
                                codedError(
                                    "ERR_STREAM_DESTROYED",
                                    "Cannot call write after a stream was destroyed",
                                ),
                        ),
                    );
                }
        this._writeQueue = null;
        this._writeLength = 0;
        if (this.server !== null) this.server._removeConnection(this);
        callback(error);
    }
    destroy(error) {
        if (this._destroyed) return this;
        super.destroy(error);
        return this;
    }
    resetAndDestroy() {
        return this.destroy();
    }
    // 'close' carries hadError (as Node.js emits it from its destroy path;
    // an emit override would cost a rest array and a spread per emit).
    _closeTask() {
        if (this._finalError) this.emit("error", this._finalError);
        this._closed = true;
        this.emit("close", this._hadError);
    }
    setNoDelay(noDelay) {
        if (this._fd >= 0 && !this.connecting)
            sys.setNoDelay(this._fd, noDelay !== false);
        else this._noDelay = noDelay !== false;
        return this;
    }
    setKeepAlive(enable) {
        if (this._fd >= 0) sys.setKeepAlive(this._fd, !!enable);
        return this;
    }
    setTimeout(timeout, callback) {
        this._timeout = timeout;
        if (typeof callback === "function") {
            if (timeout === 0) this.removeListener("timeout", callback);
            else this.once("timeout", callback);
        }
        // The current time, not loopNow: a timer set just before with the same delay is due first.
        if (this._timeout > 0 && !this._destroyed)
            setDeadline(this, performance.now() + this._timeout);
        else if (this._deadline !== 0) setDeadline(this, 0);
        return this;
    }
    /**
     * Inactivity timeout in loop time, for the server's keep-alive and
     * per-request timeouts (node:http): like setTimeout(timeout) without the
     * listener and without reading the clock.
     */
    _idleTimeout(timeout) {
        this._timeout = timeout;
        if (timeout > 0 && !this._destroyed) {
            // setDeadline, spelled out: the socket is usually on the timed
            // list already (a cleared deadline keeps it there).
            const deadline = loopNow + timeout,
                i = this._timedIndex;
            this._deadline = deadline;
            if (i < 0 || timedItems[i] !== this) {
                this._timedIndex = timedItems.length;
                timedItems.push(this);
            }
            if (deadline < earliestDeadline) earliestDeadline = deadline;
        } else this._deadline = 0;
    }
    /** Activity: extends the inactivity deadline (never moves it earlier). */
    _touch() {
        if (this._timeout > 0 && !this._destroyed) {
            const deadline = loopNow + this._timeout;
            if (deadline > this._deadline) setDeadline(this, deadline);
        } else if (this._deadline !== 0) setDeadline(this, 0);
    }
    pause() {
        super.pause();
        markDirty(this);
        return this;
    }
    resume() {
        super.resume();
        markDirty(this);
        return this;
    }
    /**
     * Sends bytes[0, length) at once when nothing is queued; the rest is queued
     * (copied) for when the socket is writable. Internal fast path of node:http.
     */
    _sendNow(bytes, length, callback) {
        if (
            (this._writeQueue !== null && this._writeQueue.length > 0) ||
            this.connecting ||
            this._fd < 0 ||
            this._destroyed
        ) {
            const pending = sliceBytes(bytes, 0, length);
            // Terminal public-write paths only accept function callbacks.
            // Keep their existing behavior; live writes retain the HTTP owner.
            if (this._writeEnded || this._destroyed)
                return this.write(pending, callback);
            return this.write(pending, undefined, callback);
        }
        let n = sys.send(this._fd, bytes, length);
        if (n === EINTR) n = EAGAIN;
        if (n < 0 && n !== EAGAIN) {
            this.destroy(errnoException(n, "write"));
            return false;
        }
        if (n === EAGAIN) n = 0;
        this._bytesWritten += n;
        if (n < length) {
            const rest = sliceBytes(bytes, n, length);
            (this._writeQueue || (this._writeQueue = [])).push({
                bytes: rest,
                offset: 0,
                length: rest.length,
                callback,
            });
            this._writeLength += rest.length;
            markDirty(this);
            return this._writeLength < 16384;
        }
        if (callback) invoke(callback, null);
        return true;
    }
    ref() {
        setRef(this, true);
        return this;
    }
    unref() {
        setRef(this, false);
        return this;
    }
}
defaults(Socket.prototype, {
    _fd: -1,
    connecting: false,
    _refed: true,
    _writeQueue: null,
    _writeLength: 0,
    _needDrain: false,
    _writeEnded: false,
    _shutdown: false,
    _finished: false,
    _eof: false,
    _timeout: 0,
    _deadline: 0,
    _timedIndex: -1,
    _connectionIndex: -1,
    _registered: false,
    _dirty: false,
    _watched: 0,
    _consumer: null,
    allowHalfOpen: false,
    bytesRead: 0,
    _bytesWritten: 0,
    _hadError: false,
    server: null,
    _sockname: null,
    _peername: null,
    _noDelay: false,
    _target: null,
    _host: undefined,
    _httpMessage: null,
    _httpConnection: null,
});
export const Stream = Socket;

// ---- Server ----------------------------------------------------------------
export class Server extends EventEmitter {
    constructor(options, listener) {
        super();
        if (typeof options === "function") {
            listener = options;
            options = {};
        }
        if (options) this._options = options;
        if (typeof listener === "function") this.on("connection", listener);
        this._connections = new HandleList();
    }
    get connections() {
        return this._connections.size;
    }
    listen(...args) {
        let options = {},
            callback;
        if (typeof args[args.length - 1] === "function") callback = args.pop();
        if (args[0] !== null && typeof args[0] === "object") options = args[0];
        else {
            options.port = args[0];
            if (typeof args[1] === "string") {
                options.host = args[1];
                options.backlog = args[2];
            } else options.backlog = args[1];
        }
        if (this.listening)
            throw codedError(
                "ERR_SERVER_ALREADY_LISTEN",
                "Listen method has been called more than once without closing.",
            );
        if (options.path !== undefined && options.path !== null)
            throw codedError(
                "ERR_INVALID_ARG_VALUE",
                "IPC paths are not supported by nona:net",
            );
        const port =
            options.port === undefined || options.port === null
                ? 0
                : Number(options.port);
        if (!(port >= 0 && port < 65536 && port === Math.floor(port)))
            throw codedError(
                "ERR_SOCKET_BAD_PORT",
                "options.port should be >= 0 and < 65536. Received type " +
                    typeof options.port +
                    " (" +
                    String(options.port) +
                    ").",
                RangeError,
            );
        if (typeof callback === "function") this.once("listening", callback);
        let host = options.host,
            fd = -1,
            address;
        register(this);
        if (host === undefined || host === null || host === "") {
            // Like Node.js: the IPv6 any address in dual-stack mode, else IPv4.
            fd = sys.socket(sys.AF_INET6);
            if (fd >= 0) {
                address = "::";
                if (options.ipv6Only !== true) sys.setV6Only(fd, false);
            } else {
                fd = sys.socket(sys.AF_INET);
                address = "0.0.0.0";
            }
        } else {
            try {
                address = lookup(host)[0].address;
            } catch (error) {
                unregister(this);
                queueMicrotask(() => this.emit("error", error));
                return this;
            }
            fd = sys.socket(isIPv4(address) ? sys.AF_INET : sys.AF_INET6);
            if (fd >= 0 && options.ipv6Only === true) sys.setV6Only(fd, true);
        }
        const fail = (result, syscall) => {
            if (fd >= 0) sys.close(fd);
            unregister(this);
            const error = errnoException(result, syscall, address, port, true);
            defer(() => this.emit("error", error));
            return this;
        };
        if (fd < 0) return fail(fd, "listen");
        sys.setReuseAddress(fd);
        let result = sys.bind(fd, socketAddress(address, port));
        if (result < 0) return fail(result, "listen");
        result = sys.listen(
            fd,
            options.backlog === undefined
                ? 511
                : Number(options.backlog) || 511,
        );
        if (result < 0) return fail(result, "listen");
        this._fd = fd;
        watch(this);
        this._sockname = sys.sockname(fd);
        this.listening = true;
        queueMicrotask(() => {
            if (this.listening) this.emit("listening");
        });
        return this;
    }
    address() {
        if (!this.listening) return null;
        const a = decodeAddress(this._sockname);
        return { address: a.address, family: a.family, port: a.port };
    }
    _interest() {
        return this._fd >= 0 ? READ : 0;
    }
    _ready() {
        for (let i = 0; i < 64 && this._fd >= 0; i++) {
            const fd = sys.accept(this._fd);
            if (fd === EAGAIN || fd === EINTR) return;
            if (fd < 0) {
                this.emit("error", errnoException(fd, "accept"));
                return;
            }
            if (
                this.maxConnections !== undefined &&
                this._connections.size >= this.maxConnections
            ) {
                sys.close(fd);
                continue;
            }
            const socket = new Socket({
                allowHalfOpen: !!this._options.allowHalfOpen,
            });
            socket._attach(fd);
            socket.server = this;
            if (this._options.noDelay) sys.setNoDelay(fd, true);
            this._connections.add(socket);
            this._onConnection(socket);
        }
    }
    /** Internal hook: node:http handles its connections without the 'connection' listener chain. */
    _onConnection(socket) {
        this.emit("connection", socket);
    }
    _removeConnection(socket) {
        this._connections.delete(socket);
        this._maybeClosed();
    }
    _maybeClosed() {
        if (
            this._closing &&
            this._fd < 0 &&
            this._connections.size === 0 &&
            !this._closeEmitted
        ) {
            this._closeEmitted = true;
            queueMicrotask(() => this.emit("close"));
        }
    }
    close(callback) {
        if (typeof callback === "function") {
            if (!this.listening)
                this.once("close", () =>
                    callback(
                        codedError(
                            "ERR_SERVER_NOT_RUNNING",
                            "Server is not running.",
                        ),
                    ),
                );
            else this.once("close", callback);
        }
        if (this._fd >= 0) {
            unwatch(this, true);
            sys.close(this._fd);
            this._fd = -1;
        }
        unregister(this);
        this.listening = false;
        this._closing = true;
        this._closeEmitted = false;
        this._maybeClosed();
        return this;
    }
    getConnections(callback) {
        const n = this._connections.size;
        queueMicrotask(() => callback(null, n));
        return this;
    }
    ref() {
        setRef(this, true);
        return this;
    }
    unref() {
        setRef(this, false);
        return this;
    }
    [Symbol.asyncDispose]() {
        return new Promise((resolve) => this.close(resolve));
    }
}
defaults(Server.prototype, {
    _options: Object.freeze({}),
    _fd: -1,
    _refed: true,
    _registered: false,
    _dirty: false,
    _watched: 0,
    _deadline: 0,
    _sockname: null,
    listening: false,
    maxConnections: undefined,
    _closing: false,
    _closeEmitted: false,
});
export function createServer(options, listener) {
    return new Server(options, listener);
}
export function connect(...args) {
    const socket = new Socket(
        args[0] !== null && typeof args[0] === "object" ? args[0] : undefined,
    );
    if (
        args[0] !== null &&
        typeof args[0] === "object" &&
        typeof args[0].timeout === "number"
    )
        socket.setTimeout(args[0].timeout);
    return socket.connect(...args);
}
export const createConnection = connect;
export function getDefaultAutoSelectFamily() {
    return false;
}
export function setDefaultAutoSelectFamily() {}
/** Internal hooks for node:http. */
export const _internal = { defer, lookup };
export default {
    Socket,
    Stream,
    Server,
    createServer,
    connect,
    createConnection,
    isIP,
    isIPv4,
    isIPv6,
    getDefaultAutoSelectFamily,
    setDefaultAutoSelectFamily,
};
