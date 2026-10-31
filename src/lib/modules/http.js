import { EventEmitter, captureRejections } from "node:events";
import { Buffer } from "node:buffer";
import * as net from "node:net";
import { Readable, defaults, clock, defer } from "nona:internal/stream";
import {
    parse as parseHead,
    latin1,
    write as writeString,
    copy as copyBytes,
    check as checkChars,
    slice as sliceBytes,
    headLines as nativeHeadLines,
    lowerNames as nativeLowerNames,
    headers as nativeHeaders,
    rememberHeaders,
    jsonBytes,
    registerHttpJson,
} from "nona:internal/native";
const bufferPrototype = Buffer.prototype;

export const METHODS = [
    "ACL",
    "BIND",
    "CHECKOUT",
    "CONNECT",
    "COPY",
    "DELETE",
    "GET",
    "HEAD",
    "LINK",
    "LOCK",
    "M-SEARCH",
    "MERGE",
    "MKACTIVITY",
    "MKCALENDAR",
    "MKCOL",
    "MOVE",
    "NOTIFY",
    "OPTIONS",
    "PATCH",
    "POST",
    "PROPFIND",
    "PROPPATCH",
    "PURGE",
    "PUT",
    "QUERY",
    "REBIND",
    "REPORT",
    "SEARCH",
    "SOURCE",
    "SUBSCRIBE",
    "TRACE",
    "UNBIND",
    "UNLINK",
    "UNLOCK",
    "UNSUBSCRIBE",
];
export const STATUS_CODES = {
    100: "Continue",
    101: "Switching Protocols",
    102: "Processing",
    103: "Early Hints",
    200: "OK",
    201: "Created",
    202: "Accepted",
    203: "Non-Authoritative Information",
    204: "No Content",
    205: "Reset Content",
    206: "Partial Content",
    207: "Multi-Status",
    208: "Already Reported",
    226: "IM Used",
    300: "Multiple Choices",
    301: "Moved Permanently",
    302: "Found",
    303: "See Other",
    304: "Not Modified",
    305: "Use Proxy",
    307: "Temporary Redirect",
    308: "Permanent Redirect",
    400: "Bad Request",
    401: "Unauthorized",
    402: "Payment Required",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    406: "Not Acceptable",
    407: "Proxy Authentication Required",
    408: "Request Timeout",
    409: "Conflict",
    410: "Gone",
    411: "Length Required",
    412: "Precondition Failed",
    413: "Payload Too Large",
    414: "URI Too Long",
    415: "Unsupported Media Type",
    416: "Range Not Satisfiable",
    417: "Expectation Failed",
    418: "I'm a Teapot",
    421: "Misdirected Request",
    422: "Unprocessable Entity",
    423: "Locked",
    424: "Failed Dependency",
    425: "Too Early",
    426: "Upgrade Required",
    428: "Precondition Required",
    429: "Too Many Requests",
    431: "Request Header Fields Too Large",
    451: "Unavailable For Legal Reasons",
    500: "Internal Server Error",
    501: "Not Implemented",
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout",
    505: "HTTP Version Not Supported",
    506: "Variant Also Negotiates",
    507: "Insufficient Storage",
    508: "Loop Detected",
    509: "Bandwidth Limit Exceeded",
    510: "Not Extended",
    511: "Network Authentication Required",
};
export const maxHeaderSize = 16384;
const closeToken = /(?:^|\W)close(?:$|\W)/i,
    keepAliveToken = /(?:^|\W)keep-alive(?:$|\W)/i,
    upgradeToken = /(?:^|\W)upgrade(?:$|\W)/i;
const chunkedToken = /(?:^|\W)chunked(?:$|\W)/i,
    continueToken = /(?:^|\W)100-continue(?:$|\W)/i;
// Flags of the native parser (src/runtime/http-native.ts).
const F_CHUNKED = 1,
    F_TE = 2,
    F_CL = 4,
    F_CLOSE = 8,
    F_KEEPALIVE = 16,
    F_UPGRADE_TOKEN = 32,
    F_UPGRADE = 64,
    F_EXPECT = 128,
    F_HOST = 256,
    F_OTHER_TE = 2048,
    F_OTHER_CONNECTION = 4096;
const MAX_HEADERS = 128;
const OUT = new Int32Array(11 + 4 * MAX_HEADERS);

function codedError(code, message, Type) {
    const error = new (Type || Error)(message);
    error.code = code;
    return error;
}
function invalidArgType(name, expected, value) {
    return codedError(
        "ERR_INVALID_ARG_TYPE",
        'The "' +
            name +
            '" argument must be ' +
            expected +
            ". Received " +
            (value === null
                ? "null"
                : value === undefined
                  ? "undefined"
                  : "type " + typeof value + " (" + String(value) + ")"),
        TypeError,
    );
}
const isToken = (text) => text.length > 0 && checkChars(text, 0) < 0;
export function validateHeaderName(name, label) {
    if (typeof name !== "string" || !isToken(name))
        throw codedError(
            "ERR_INVALID_HTTP_TOKEN",
            (label || "Header name") +
                ' must be a valid HTTP token ["' +
                name +
                '"]',
            TypeError,
        );
}
export function validateHeaderValue(name, value) {
    if (value === undefined)
        throw codedError(
            "ERR_HTTP_INVALID_HEADER_VALUE",
            'Invalid value "' + value + '" for header "' + name + '"',
            TypeError,
        );
    if (checkChars(typeof value === "string" ? value : String(value), 1) >= 0)
        throw codedError(
            "ERR_INVALID_CHAR",
            'Invalid character in header content ["' + name + '"]',
            TypeError,
        );
}
function headersSentError(action) {
    return codedError(
        "ERR_HTTP_HEADERS_SENT",
        "Cannot " + action + " headers after they are sent to the client",
    );
}

// ---- Small caches ------------------------------------------------------------
// Method names by a hash of their bytes (the native parser computes the same hash).
function methodHash(text) {
    let h = 0;
    for (let i = 0; i < text.length; i++)
        h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
    return h;
}
// A table indexed by the hash modulo its size (no two methods collide at
// 512; a collision would make the longer-method check below fail, so the
// size is checked when the module loads).
const METHOD_TABLE = 512;
const methodByHash = new Array(METHOD_TABLE).fill(undefined),
    methodHashes = new Int32Array(METHOD_TABLE);
for (const method of METHODS) {
    const hash = methodHash(method),
        slot = (hash >>> 0) % METHOD_TABLE;
    if (methodByHash[slot] !== undefined)
        throw new Error("HTTP method hash collision");
    methodByHash[slot] = method;
    methodHashes[slot] = hash;
}
// Lower-case header names: programs set the same few names over and over.
const lowerNames = new Map();
function lowerName(name) {
    let lower = lowerNames.get(name);
    if (lower === undefined) {
        lower = name.toLowerCase();
        if (lowerNames.size < 512) lowerNames.set(name, lower);
    }
    return lower;
}
// Status lines by code, for the standard reason phrase: {message, line}.
// STATUS_CODES is read once per code (a program that edits it does so
// before it serves).
const statusLines = new Array(1000).fill(undefined);
function standardStatus(code) {
    let entry = statusLines[code];
    if (entry === undefined) {
        const message = STATUS_CODES[code] || "unknown";
        entry = { message, line: "HTTP/1.1 " + code + " " + message + "\r\n" };
        statusLines[code] = entry;
    }
    return entry;
}
function statusLine(code, message) {
    const standard = standardStatus(code);
    if (message === standard.message) return standard.line;
    return "HTTP/1.1 " + code + " " + message + "\r\n";
}
let dateSecond = -1,
    dateField = "",
    dateExpiry = 0;
/**
 * The Date header field, formatted once per second. The clock is read again
 * when the event loop's time (one clock read per poll) says the second has
 * passed; without a loop (clock.now is 0) it is read every time.
 */
function dateLine() {
    const loop = clock.now;
    if (loop >= dateExpiry) {
        const now = Date.now(),
            second = (now / 1000) | 0;
        dateExpiry = loop === 0 ? 0 : loop + (1000 - (now - second * 1000));
        if (second !== dateSecond) {
            dateSecond = second;
            dateField = "Date: " + new Date(now).toUTCString() + "\r\n";
        }
    }
    return dateField;
}
// One output buffer for all writes: a message is encoded into it and sent at once.
let outBuffer = new Uint8Array(65536);
let lastBody = null,
    lastBytes = null;
function reserve(size) {
    if (outBuffer.length < size)
        outBuffer = new Uint8Array(Math.max(size, outBuffer.length * 2));
    return outBuffer;
}

// ---- Deferred notifications ----------------------------------------------------
// Per-request events that Node.js emits on a later tick run in one job for
// every batch of requests, and only for objects that have listeners.
let laterQueue = [],
    laterScheduled = false;
function later(target, kind) {
    laterQueue.push(target, kind);
    if (!laterScheduled) {
        laterScheduled = true;
        queueMicrotask(runLater);
    }
}
function runLater() {
    laterScheduled = false;
    const queue = laterQueue;
    laterQueue = [];
    for (let i = 0; i < queue.length; i += 2) {
        const target = queue[i],
            kind = queue[i + 1];
        if (kind === 0) {
            target.writableFinished = true;
            target.emit("finish");
        } else if (kind === 1) {
            target._closed = true;
            target.emit("close");
        } else if (kind === 2) target._dumpNow();
    }
}
function hasListener(emitter, type) {
    if (emitter._eventsCount === 0) return false;
    const events = emitter._events;
    return events !== undefined && events[type] !== undefined;
}

// ---- Header field merging (IncomingMessage.headers) ---------------------------
const firstWins = new Set([
    "age",
    "authorization",
    "content-length",
    "content-type",
    "etag",
    "expires",
    "from",
    "host",
    "if-modified-since",
    "if-unmodified-since",
    "last-modified",
    "location",
    "max-forwards",
    "proxy-authorization",
    "referer",
    "retry-after",
    "server",
    "user-agent",
]);
/**
 * The lower-case names of a raw header array, one per field: natively when
 * it is a plain array of strings with distinct names (the usual request),
 * else null and the caller merges repeated fields itself.
 */
const internedNames = [];
// The strings of recent header fields, kept alive for the native field
// cache: 128 entries of {name, value} (src/runtime/http-field-cache.ts).
const fieldStrings = [];
for (let i = 0; i < 256; i++) fieldStrings.push(undefined);
function distinctLowerNames(raw) {
    const lower = nativeLowerNames(raw, internedNames);
    return lower === undefined ? null : lower;
}
function mergeHeaders(raw, joinDuplicates) {
    const lower = distinctLowerNames(raw);
    if (lower !== null) {
        // No repeated names: every field is set once. The same names as a
        // recent request give the same object natively (its shape is
        // remembered when the fields are all strings).
        let out = nativeHeaders(lower, raw);
        if (out !== undefined) return out;
        out = {};
        let strings = true;
        for (let i = 0; i < raw.length; i += 2) {
            const field = lower[i >> 1],
                value = raw[i + 1];
            if (field === "set-cookie") {
                strings = false;
                out[field] = [value];
            } else {
                // An inherited name (a method, or a setter that defines the
                // property itself) must keep being assigned.
                if (field in Object.prototype) strings = false;
                out[field] = value;
            }
        }
        if (strings) rememberHeaders(out, lower);
        return out;
    }
    const out = {};
    for (let i = 0; i < raw.length; i += 2) {
        const field = lowerName(raw[i]),
            value = raw[i + 1],
            existing = out[field];
        if (existing === undefined)
            out[field] = field === "set-cookie" ? [value] : value;
        else if (field === "set-cookie") existing.push(value);
        else if (field === "cookie") out[field] = existing + "; " + value;
        else if (!firstWins.has(field) || joinDuplicates)
            out[field] = existing + ", " + value;
    }
    return out;
}
function distinctHeaders(raw) {
    const out = {};
    for (let i = 0; i < raw.length; i += 2) {
        const field = lowerName(raw[i]);
        (out[field] || (out[field] = [])).push(raw[i + 1]);
    }
    return out;
}

// The message classes are base classes whose prototype chains are set
// afterwards (as in Node.js, where they are functions): a derived
// constructor pays for every level of super(), and a request creates two
// messages. Their constructors initialize the emitter themselves (the base
// constructors of Readable and EventEmitter do nothing else for them).
// (Inlined in the hot constructors: a call is about 150 instructions.)
function initEmitter(emitter) {
    if (captureRejections) EventEmitter.call(emitter);
    else {
        emitter._events = { __proto__: null };
        emitter._eventsCount = 0;
        emitter._maxListeners = undefined;
    }
}
// ---- IncomingMessage -----------------------------------------------------------
export class IncomingMessage {
    constructor(socket) {
        if (captureRejections) EventEmitter.call(this);
        else {
            this._events = { __proto__: null };
            this._eventsCount = 0;
            this._maxListeners = undefined;
        }
        this.socket = socket;
    }
    get connection() {
        return this.socket;
    }
    set connection(value) {
        this.socket = value;
    }
    get rawHeaders() {
        if (this._raw === null) this._raw = [];
        return this._raw;
    }
    set rawHeaders(value) {
        this._raw = value;
    }
    get headers() {
        if (this._headers === null)
            this._headers = mergeHeaders(
                this.rawHeaders,
                this.joinDuplicateHeaders,
            );
        return this._headers;
    }
    set headers(value) {
        this._headers = value;
    }
    get headersDistinct() {
        return distinctHeaders(this.rawHeaders);
    }
    get trailers() {
        if (this._trailers === null)
            this._trailers = mergeHeaders(
                this.rawTrailers,
                this.joinDuplicateHeaders,
            );
        return this._trailers;
    }
    set trailers(value) {
        this._trailers = value;
    }
    get trailersDistinct() {
        return distinctHeaders(this.rawTrailers);
    }
    get rawTrailers() {
        if (this._rawTrailers === null) this._rawTrailers = [];
        return this._rawTrailers;
    }
    set rawTrailers(value) {
        this._rawTrailers = value;
    }
    setTimeout(msecs, callback) {
        if (callback) this.on("timeout", callback);
        if (this.socket) this.socket.setTimeout(msecs);
        return this;
    }
    read(n) {
        this._consuming = true;
        return super.read(n);
    }
    on(type, listener) {
        if (type === "data" || type === "readable") this._consuming = true;
        return super.on(type, listener);
    }
    resume() {
        this._consuming = true;
        return super.resume();
    }
    _read() {
        if (this._socketPaused && this.socket && !this.socket.destroyed) {
            this._socketPaused = false;
            this.socket.resume();
        }
    }
    // Like Node.js, a message destroys itself (and emits 'close') after 'end'.
    _ended_() {
        if (this._destroyed) return;
        // A complete message with the stock destroy path: what destroy()
        // would do, without its callback closure.
        if (
            this.complete &&
            this.destroy === readableDestroy &&
            this._destroy === IncomingMessage.prototype._destroy
        ) {
            this._destroyed = true;
            defer(this, "_closeTask");
        } else this.destroy();
    }
    /** The request's response is done: unread data is discarded. */
    _dump() {
        if (this._dumped) return;
        this._dumped = true;
        // Nobody can observe a message without listeners: finish it in place.
        if (this._events === undefined || this._eventsCount === 0) {
            this._queue = null;
            this._queued = 0;
            if (this._ended) {
                this._endEmitted = true;
                this._destroyed = true;
                this._closed = true;
            } else this._flowing = true;
            return;
        }
        later(this, 2);
    }
    _dumpNow() {
        this.removeAllListeners("data");
        super.resume();
    }
    _destroy(error, callback) {
        if (!this._endEmitted || !this.complete) {
            this.aborted = true;
            this.emit("aborted");
        }
        if (this.socket && !this.socket.destroyed && this.aborted)
            this.socket.destroy(error);
        callback(error && this.listenerCount("error") > 0 ? error : null);
    }
}
Object.setPrototypeOf(IncomingMessage.prototype, Readable.prototype);
const readableDestroy = Readable.prototype.destroy,
    readablePush = Readable.prototype.push;
Object.setPrototypeOf(IncomingMessage, Readable);
defaults(IncomingMessage.prototype, {
    httpVersionMajor: 1,
    httpVersionMinor: 1,
    httpVersion: "1.1",
    complete: false,
    aborted: false,
    upgrade: false,
    url: "",
    method: null,
    statusCode: null,
    statusMessage: null,
    joinDuplicateHeaders: false,
    socket: null,
    _rawTrailers: null,
    _raw: null,
    _headers: null,
    _trailers: null,
    _consuming: false,
    _dumped: false,
    _socketPaused: false,
});

// ---- OutgoingMessage -------------------------------------------------------------
/**
 * Headers set with setHeader live in three parallel arrays (lower-case name,
 * name as given, value); messages carry a handful, so a linear search beats
 * any table. The head is composed once, when the first bytes are written.
 */
export class OutgoingMessage {
    constructor() {
        initEmitter(this);
    }
    get connection() {
        return this.socket;
    }
    set connection(value) {
        this.socket = value;
    }
    get headersSent() {
        return this._header !== null;
    }
    get writableEnded() {
        return this.finished;
    }
    get writable() {
        return !this.destroyed && !this.finished;
    }
    get writableObjectMode() {
        return false;
    }
    get writableCorked() {
        return this._corked;
    }
    get writableHighWaterMark() {
        return 16384;
    }
    get writableLength() {
        let buffered = this._chunkLength;
        if (buffered !== 0)
            buffered +=
                buffered.toString(16).length +
                4 +
                (!this._headerSent && this._header !== null
                    ? this._header.length
                    : 0);
        return (
            this._outputSize +
            buffered +
            (this.socket ? this.socket.writableLength : 0)
        );
    }
    get writableNeedDrain() {
        return (
            !this.destroyed && !this.finished && this.writableLength >= 16384
        );
    }
    get closed() {
        return this._closed;
    }
    get errored() {
        return null;
    }
    /**
     * Index of the field's entry in _fields ([key, name, value, info, ...];
     * info is the name's record in fieldNames), or -1. The entries end at
     * _fieldEnd: the array has room for more (undefined elements), so that
     * adding a field stores into existing elements instead of appending.
     */
    _find(key) {
        const fields = this._fields;
        if (fields !== null)
            for (let i = 0, end = this._fieldEnd; i < end; i += 4)
                if (fields[i] === key) return i;
        return -1;
    }
    setHeader(name, value) {
        if (this._header !== null) throw headersSentError("set");
        // A name seen before (validated then): its key and special flags.
        let info = fieldNames[name];
        if (info === undefined) {
            validateHeaderName(name);
            const key = lowerName(name),
                special = specialFields.get(key);
            info = {
                key,
                special: special === undefined ? 0 : special,
                checked: undefined,
                bit: fieldKeyBit(key),
                // The last line fieldLines composed for the name and value.
                line: "",
                lineValue: undefined,
            };
            if (fieldNameCount < 512) {
                fieldNames[name] = info;
                fieldNameCount++;
            }
        }
        // The last string value validated for the name (the same literal
        // is set on every response) is not checked again.
        if (typeof value === "string") {
            if (value !== info.checked) {
                if (checkChars(value, 1) >= 0)
                    throw codedError(
                        "ERR_INVALID_CHAR",
                        'Invalid character in header content ["' + name + '"]',
                        TypeError,
                    );
                info.checked = value;
            }
        } else validateHeaderValue(name, value);
        const key = info.key,
            fields = this._fields,
            bit = info.bit;
        if (info.special !== 0) this._special |= info.special;
        if (fields === null) {
            this._fields = [key, name, value, info];
            this._fieldEnd = 4;
            this._keys = bit;
            return this;
        }
        const end = this._fieldEnd;
        // _keys has the bit of every key in _fields (removeHeader leaves
        // it): a clear bit means the key is not there.
        let index = -1;
        if (bit !== 0 && (this._keys & bit) === 0) this._keys |= bit;
        else
            for (let i = 0; i < end; i += 4)
                if (fields[i] === key) {
                    index = i;
                    break;
                }
        if (index >= 0) {
            fields[index + 1] = name;
            fields[index + 2] = value;
            fields[index + 3] = info;
        } else {
            if (end < fields.length) {
                fields[end] = key;
                fields[end + 1] = name;
                fields[end + 2] = value;
                fields[end + 3] = info;
            } else if (end === 4) {
                // The second field: room for four.
                // prettier-ignore
                this._fields = [
                    fields[0], fields[1], fields[2], fields[3],
                    key, name, value, info,
                    undefined, undefined, undefined, undefined,
                    undefined, undefined, undefined, undefined,
                ];
            } else fields.push(key, name, value, info);
            this._fieldEnd = end + 4;
        }
        return this;
    }
    appendHeader(name, value) {
        if (this._header !== null) throw headersSentError("append");
        validateHeaderName(name);
        validateHeaderValue(name, value);
        const index = this._find(lowerName(name));
        if (index < 0) return this.setHeader(name, value);
        this._special |= SPECIAL_ARRAY;
        const existing = this._fields[index + 2];
        this._fields[index + 2] = (
            Array.isArray(existing) ? existing : [existing]
        ).concat(value);
        return this;
    }
    setHeaders(headers) {
        if (this._header !== null) throw headersSentError("set");
        if (!headers || typeof headers.forEach !== "function")
            throw invalidArgType(
                "headers",
                "an instance of Headers or Map",
                headers,
            );
        headers.forEach((value, key) => this.setHeader(key, value));
        return this;
    }
    getHeader(name) {
        if (typeof name !== "string")
            throw invalidArgType("name", "of type string", name);
        const index = this._find(lowerName(name));
        return index < 0 ? undefined : this._fields[index + 2];
    }
    getHeaderNames() {
        const out = [];
        if (this._fields !== null)
            for (let i = 0; i < this._fieldEnd; i += 4)
                out.push(this._fields[i]);
        return out;
    }
    getRawHeaderNames() {
        const out = [];
        if (this._fields !== null)
            for (let i = 1; i < this._fieldEnd; i += 4)
                out.push(this._fields[i]);
        return out;
    }
    getHeaders() {
        const out = Object.create(null);
        if (this._fields !== null)
            for (let i = 0; i < this._fieldEnd; i += 4)
                out[this._fields[i]] = this._fields[i + 2];
        return out;
    }
    hasHeader(name) {
        if (typeof name !== "string")
            throw invalidArgType("name", "of type string", name);
        return this._find(lowerName(name)) >= 0;
    }
    removeHeader(name) {
        if (typeof name !== "string")
            throw invalidArgType("name", "of type string", name);
        if (this._header !== null) throw headersSentError("remove");
        const key = lowerName(name);
        this._special |= SPECIAL_REMOVED;
        if (key === "connection") this._removedConnection = true;
        else if (key === "content-length") this._removedContLen = true;
        else if (key === "transfer-encoding") this._removedTE = true;
        else if (key === "date") this.sendDate = false;
        const index = this._find(key);
        if (index >= 0) {
            this._fields.splice(index, 4);
            this._fieldEnd -= 4;
        }
    }
    /**
     * Composes the head: the first line, the given fields (this message's own,
     * or the object or array passed to writeHead, validated here), then Date,
     * Connection/Keep-Alive and the body framing the fields did not decide.
     */
    _compose(firstLine, fields) {
        const state = {
            head: firstLine,
            date: false,
            connection: false,
            length: false,
            encoding: false,
            trailer: false,
            expect: false,
        };
        if (fields === this) {
            const own = this._fields;
            if (own !== null)
                for (let i = 0; i < this._fieldEnd; i += 4)
                    this._field(state, own[i + 1], own[i + 2], false);
        } else if (Array.isArray(fields)) {
            if (fields.length && Array.isArray(fields[0]))
                for (const entry of fields)
                    this._field(state, entry[0], entry[1], true);
            else {
                if (fields.length % 2 !== 0)
                    throw codedError(
                        "ERR_INVALID_ARG_VALUE",
                        "The argument 'headers' is invalid.",
                        TypeError,
                    );
                for (let i = 0; i < fields.length; i += 2)
                    this._field(state, fields[i], fields[i + 1], true);
            }
        } else if (fields)
            for (const key in fields)
                if (Object.prototype.hasOwnProperty.call(fields, key))
                    this._field(state, key, fields[key], true);
        let head = state.head;
        if (this.sendDate && !state.date) head += dateLine();
        if (
            this.chunkedEncoding &&
            (this.statusCode === 204 || this.statusCode === 304)
        ) {
            this.chunkedEncoding = false;
            this.shouldKeepAlive = false;
        }
        if (this._removedConnection) this._last = !this.shouldKeepAlive;
        else if (!state.connection) {
            if (
                this.shouldKeepAlive &&
                (state.length || this.useChunkedEncodingByDefault || this.agent)
            ) {
                if (this.maxRequestsOnConnectionReached)
                    head += "Connection: close\r\n";
                else {
                    const server =
                        this._connection === null
                            ? null
                            : this._connection.server;
                    if (
                        server !== null &&
                        server.keepAliveTimeout &&
                        this._defaultKeepAlive
                    )
                        head += keepAliveLines(server);
                    else head += "Connection: keep-alive\r\n";
                }
            } else {
                this._last = true;
                head += "Connection: close\r\n";
            }
        }
        if (!state.length && !state.encoding) {
            if (!this._hasBody) this.chunkedEncoding = false;
            else if (!this.useChunkedEncodingByDefault) this._last = true;
            else if (
                !state.trailer &&
                !this._removedContLen &&
                typeof this._contentLength === "number"
            )
                head += "Content-Length: " + this._contentLength + "\r\n";
            else if (!this._removedTE) {
                head += "Transfer-Encoding: chunked\r\n";
                this.chunkedEncoding = true;
            } else this._last = true;
        }
        if (this.chunkedEncoding !== true && state.trailer)
            throw codedError(
                "ERR_HTTP_TRAILER_INVALID",
                "Trailers are invalid with this transfer encoding",
            );
        this._header = head + "\r\n";
        this._headerSent = false;
        if (state.expect) this._emit(null, null, null, null);
    }
    _field(state, name, value, validate) {
        if (validate) validateHeaderName(name);
        if (Array.isArray(value)) {
            if (value.length < 2 || lowerName(name) !== "cookie") {
                for (let i = 0; i < value.length; i++)
                    this._line(state, name, value[i], validate);
                return;
            }
            value = value.join("; ");
        }
        this._line(state, name, value, validate);
    }
    _line(state, name, value, validate) {
        if (validate) validateHeaderValue(name, value);
        state.head += name + ": " + value + "\r\n";
        const n = name.length;
        if (n < 4 || n > 17) return;
        switch (lowerName(name)) {
            case "connection":
                state.connection = true;
                this._removedConnection = false;
                if (closeToken.test(value)) this._last = true;
                else this.shouldKeepAlive = true;
                break;
            case "transfer-encoding":
                state.encoding = true;
                this._removedTE = false;
                if (chunkedToken.test(value)) this.chunkedEncoding = true;
                break;
            case "content-length":
                state.length = true;
                this._contentLength = +value;
                this._removedContLen = false;
                break;
            case "date":
                state.date = true;
                break;
            case "expect":
                state.expect = true;
                break;
            case "trailer":
                state.trailer = true;
                break;
            case "keep-alive":
                this._defaultKeepAlive = false;
                break;
        }
    }
    /**
     * Encodes [the head, if not sent yet] + prefix + body + suffix into the
     * output buffer and hands it to the socket (or keeps a copy until there is
     * one). body is a string (in the given encoding) or bytes; prefix and suffix are
     * ASCII.
     */
    _emit(prefix, body, encoding, suffix, callback) {
        const head = this._headerSent ? null : this._header;
        const latin =
            encoding === "latin1" ||
            encoding === "binary" ||
            encoding === "ascii";
        let size = 0,
            bodyBytes = null;
        if (head !== null) size += head.length;
        if (prefix !== null) size += prefix.length;
        if (body !== null) {
            if (typeof body !== "string") size += body.length;
            else if (latin) size += body.length;
            else if (
                encoding === null ||
                encoding === undefined ||
                encoding === "utf8" ||
                encoding === "utf-8"
            )
                size += writeString(body, undefined, 0, false);
            else {
                bodyBytes = Buffer.from(body, encoding);
                size += bodyBytes.length;
            }
        }
        if (suffix !== null) size += suffix.length;
        const out = reserve(size);
        let offset = 0;
        if (head !== null) {
            offset += writeString(head, out, offset, true);
            this._headerSent = true;
        }
        if (prefix !== null) offset += writeString(prefix, out, offset, true);
        if (body !== null) {
            if (bodyBytes !== null) {
                copyBytes(bodyBytes, 0, bodyBytes.length, out, offset);
                offset += bodyBytes.length;
            } else if (typeof body === "string")
                offset += writeString(body, out, offset, latin);
            else {
                copyBytes(body, 0, body.length, out, offset);
                offset += body.length;
            }
        }
        if (suffix !== null) offset += writeString(suffix, out, offset, true);
        return this._writeOut(out, offset, callback);
    }
    _writeOut(bytes, length, callback) {
        const socket = this.socket;
        if (
            socket !== null &&
            socket._httpMessage === this &&
            !socket.connecting &&
            !socket._destroyed
        ) {
            if (this._output !== null) this._flushOutput();
            if (length === 0) {
                if (callback) done(callback, null);
                return true;
            }
            return socket._sendNow(bytes, length, callback);
        }
        if (socket !== null && socket._destroyed) {
            if (callback && typeof callback === "function")
                queueMicrotask(() =>
                    callback(
                        codedError(
                            "ERR_STREAM_DESTROYED",
                            "Cannot call write after a stream was destroyed",
                        ),
                    ),
                );
            return false;
        }
        const copy = sliceBytes(bytes, 0, length);
        if (this._output === null) this._output = [];
        this._output.push(copy, callback);
        this._outputSize += length;
        return this._outputSize < 16384;
    }
    _flushOutput() {
        const output = this._output,
            socket = this.socket;
        this._output = null;
        this._outputSize = 0;
        let ok = true;
        for (let i = 0; i < output.length; i += 2) {
            const bytes = output[i],
                callback = output[i + 1];
            if (bytes.length === 0) {
                if (callback) done(callback, null);
                continue;
            }
            ok = socket._sendNow(bytes, bytes.length, callback);
        }
        return ok;
    }
    _implicitHeader() {
        throw codedError(
            "ERR_METHOD_NOT_IMPLEMENTED",
            "The _implicitHeader() method is not implemented",
        );
    }
    write(chunk, encoding, callback) {
        if (typeof encoding === "function") {
            callback = encoding;
            encoding = null;
        }
        return this._write(chunk, encoding, callback, false);
    }
    _write(chunk, encoding, callback, fromEnd) {
        if (typeof callback !== "function") callback = undefined;
        if (chunk === null)
            throw codedError(
                "ERR_STREAM_NULL_VALUES",
                "May not write null values to stream",
                TypeError,
            );
        if (typeof chunk !== "string" && !(chunk instanceof Uint8Array))
            throw invalidArgType(
                "chunk",
                "of type string or an instance of Buffer or Uint8Array",
                chunk,
            );
        if (this.finished || this.destroyed) {
            const error = this.finished
                ? codedError("ERR_STREAM_WRITE_AFTER_END", "write after end")
                : codedError(
                      "ERR_STREAM_DESTROYED",
                      "Cannot call write after a stream was destroyed",
                  );
            if (!this.destroyed && this.listenerCount("error") > 0)
                queueMicrotask(() => this.emit("error", error));
            if (callback) queueMicrotask(() => callback(error));
            return false;
        }
        if (this._header === null) {
            if (fromEnd) this._contentLength = byteLength(chunk, encoding);
            this._implicitHeader();
        }
        if (!this._hasBody) {
            if (this._headerSent) {
                if (callback) queueMicrotask(callback);
                return true;
            }
            return this._emit(null, null, null, null, callback);
        }
        if (this.chunkedEncoding) {
            const length = byteLength(chunk, encoding);
            // As in Node.js, a write corks the message until the next tick;
            // the chunks written meanwhile go out as one chunk (uncork, end).
            if (!fromEnd && this._corked === 0 && this.socket !== null) {
                this._corked = 1;
                queueMicrotask(() => {
                    if (this._corked !== 0) this.uncork();
                });
            }
            if (this._corked !== 0 && (length !== 0 || this._chunks !== null)) {
                if (this._chunks === null) this._chunks = [];
                this._chunks.push(chunk, encoding, callback);
                this._chunkLength += length;
                // The chunks reach the socket within the tick, which applies
                // backpressure from there ('drain' is the socket's).
                return true;
            }
            if (length === 0)
                return this._headerSent
                    ? true
                    : this._emit(null, null, null, null, callback);
            return this._emit(
                length.toString(16) + "\r\n",
                chunk,
                encoding,
                "\r\n",
                callback,
            );
        }
        return this._emit(null, chunk, encoding, null, callback);
    }
    addTrailers(headers) {
        this._trailer = "";
        const isArray = Array.isArray(headers);
        for (const key of Object.keys(headers)) {
            const field = isArray ? headers[key][0] : key,
                value = isArray ? headers[key][1] : headers[key];
            validateHeaderName(field, "Trailer name");
            const values =
                Array.isArray(value) && value.length > 1
                    ? value
                    : [Array.isArray(value) ? value.join("; ") : value];
            for (const item of values) {
                if (checkChars(String(item), 1) >= 0)
                    throw codedError(
                        "ERR_INVALID_CHAR",
                        'Invalid character in trailer content ["' +
                            field +
                            '"]',
                        TypeError,
                    );
                this._trailer += field + ": " + item + "\r\n";
            }
        }
    }
    end(chunk, encoding, callback) {
        if (typeof chunk === "function") {
            callback = chunk;
            chunk = null;
            encoding = null;
        } else if (typeof encoding === "function") {
            callback = encoding;
            encoding = null;
        }
        if (chunk) {
            if (typeof chunk !== "string" && !(chunk instanceof Uint8Array))
                throw invalidArgType(
                    "chunk",
                    "of type string or an instance of Buffer or Uint8Array",
                    chunk,
                );
            if (this.finished) {
                const error = codedError(
                    "ERR_STREAM_WRITE_AFTER_END",
                    "write after end",
                );
                if (this.listenerCount("error") > 0)
                    queueMicrotask(() => this.emit("error", error));
                if (typeof callback === "function")
                    queueMicrotask(() => callback(error));
                return this;
            }
        } else if (this.finished) {
            if (typeof callback === "function") {
                if (!this.writableFinished) this.once("finish", callback);
                else
                    callback(
                        codedError(
                            "ERR_STREAM_ALREADY_FINISHED",
                            "Cannot call end after a stream was finished",
                        ),
                    );
            }
            return this;
        }
        if (typeof callback === "function") this.once("finish", callback);
        if (this._header === null) {
            this._contentLength = chunk ? byteLength(chunk, encoding) : 0;
            this._implicitHeader();
        }
        this.finished = true;
        if (this._corked !== 0) {
            // The last data joins the chunks written in this tick (Node.js).
            if (this._hasBody && this.chunkedEncoding && chunk) {
                const length = byteLength(chunk, encoding);
                if (length !== 0) {
                    if (this._chunks === null) this._chunks = [];
                    this._chunks.push(chunk, encoding, undefined);
                    this._chunkLength += length;
                }
                chunk = null;
            }
            this._corked = 0;
            if (this._chunks !== null) this._flushChunks();
        }
        // Head, last data and terminator go out in one write.
        const done = this;
        if (chunk && this._hasBody) {
            if (this.chunkedEncoding) {
                const length = byteLength(chunk, encoding);
                if (length === 0)
                    this._emit(
                        null,
                        null,
                        null,
                        "0\r\n" + this._trailer + "\r\n",
                        done,
                    );
                else
                    this._emit(
                        length.toString(16) + "\r\n",
                        chunk,
                        encoding,
                        "\r\n0\r\n" + this._trailer + "\r\n",
                        done,
                    );
            } else this._emit(null, chunk, encoding, null, done);
        } else if (this._hasBody && this.chunkedEncoding)
            this._emit(
                null,
                null,
                null,
                "0\r\n" + this._trailer + "\r\n",
                done,
            );
        else this._emit(null, null, null, null, done);
        return this;
    }
    /**
     * end(JSON.stringify(value, replacer, space)) without the intermediate
     * string (#155): the JSON text is serialized straight into UTF-8 bytes, so
     * Content-Length is their count and nothing is encoded again. A cycle or a
     * BigInt throws before anything is sent; a value JSON.stringify returns
     * undefined for ends the message without a body. The lowering sends
     * x.end(JSON.stringify(...)) here when x.end is this method.
     */
    _endJson(value, replacer, space) {
        return this.end(jsonBytes(value, replacer, space));
    }
    /** Write completion when the message itself is the callback (no closure per message). */
    _sent(error) {
        if (!error) this._finished();
    }
    /** All bytes of the message are with the socket. */
    _finished() {
        if (this.socket !== null && this.socket._hadError) return;
        if (hasListener(this, "finish")) later(this, 0);
        else this.writableFinished = true;
        this._afterFinish();
    }
    _afterFinish() {}
    flushHeaders() {
        if (this._header === null) this._implicitHeader();
        if (!this._headerSent) this._emit(null, null, null, null);
    }
    setTimeout(msecs, callback) {
        if (callback) this.on("timeout", callback);
        if (!this.socket)
            this.once("socket", (socket) => socket.setTimeout(msecs));
        else this.socket.setTimeout(msecs);
        return this;
    }
    destroy(error) {
        if (this.destroyed) return this;
        this.destroyed = true;
        if (this._chunks !== null) this._flushChunks(error);
        if (this.socket) this.socket.destroy(error);
        else this.once("socket", (socket) => socket.destroy(error));
        return this;
    }
    pipe() {
        this.emit(
            "error",
            codedError("ERR_STREAM_CANNOT_PIPE", "Cannot pipe, not readable"),
        );
    }
    cork() {
        this._corked++;
    }
    uncork() {
        if (this._corked === 0) return;
        if (--this._corked === 0 && this._chunks !== null) this._flushChunks();
    }
    /**
     * Sends the chunks written while the message was corked as one chunk; a
     * destroyed message reports the error to their callbacks instead.
     */
    _flushChunks(error) {
        const chunks = this._chunks,
            length = this._chunkLength;
        this._chunks = null;
        this._chunkLength = 0;
        if (this.destroyed) {
            if (!error)
                error = codedError(
                    "ERR_STREAM_DESTROYED",
                    "Cannot call write after a stream was destroyed",
                );
            for (let i = 2; i < chunks.length; i += 3) {
                const callback = chunks[i];
                if (callback) queueMicrotask(() => callback(error));
            }
            return;
        }
        let prefix = length.toString(16) + "\r\n";
        for (let i = 0; i < chunks.length; i += 3) {
            this._emit(
                prefix,
                chunks[i],
                chunks[i + 1],
                i + 3 === chunks.length ? "\r\n" : null,
                chunks[i + 2],
            );
            prefix = null;
        }
    }
}
Object.setPrototypeOf(OutgoingMessage.prototype, EventEmitter.prototype);
Object.setPrototypeOf(OutgoingMessage, EventEmitter);
defaults(OutgoingMessage.prototype, {
    _special: 0,
    _corked: 0,
    _chunks: null,
    _chunkLength: 0,
    _fields: null,
    _fieldEnd: 0,
    _keys: 0,
    _connection: null,
    _header: null,
    _headerSent: false,
    finished: false,
    writableFinished: false,
    destroyed: false,
    _closed: false,
    chunkedEncoding: false,
    useChunkedEncodingByDefault: true,
    shouldKeepAlive: true,
    sendDate: false,
    _last: false,
    _hasBody: true,
    _contentLength: null,
    _removedConnection: false,
    _removedContLen: false,
    _removedTE: false,
    _defaultKeepAlive: true,
    maxRequestsOnConnectionReached: false,
    _trailer: "",
    socket: null,
    _output: null,
    _outputSize: 0,
    strictContentLength: false,
    agent: undefined,
});
/** Calls a write callback: a function, or a message (its _sent method). */
function done(callback, error) {
    if (typeof callback === "function") callback(error);
    else callback._sent(error);
}
function byteLength(chunk, encoding) {
    if (typeof chunk !== "string") return chunk.length;
    if (
        encoding === null ||
        encoding === undefined ||
        encoding === "utf8" ||
        encoding === "utf-8"
    )
        return writeString(chunk, undefined, 0, false);
    return Buffer.byteLength(chunk, encoding);
}
// Header fields that change how a head is composed (see _compose). A message
// whose fields include none of them can use ServerResponse's fast path.
const SPECIAL_ARRAY = 256,
    SPECIAL_REMOVED = 512;
/** Header names given to setHeader: {key (lower case), special}. */
// (A null-prototype object: a lookup by a name that is the same string
// object as before, as literals are, hits the key hash cache.)
const fieldNames = { __proto__: null };
let fieldNameCount = 0;
// One bit per lower-case key for the first 30 keys (OutgoingMessage._keys),
// 0 for the others.
const fieldKeyBits = { __proto__: null };
let fieldKeyCount = 0;
function fieldKeyBit(key) {
    const bit = fieldKeyBits[key];
    if (bit !== undefined) return bit;
    if (fieldKeyCount >= 30) return 0;
    return (fieldKeyBits[key] = 1 << fieldKeyCount++);
}
const specialFields = new Map([
    ["connection", 1],
    ["transfer-encoding", 2],
    ["content-length", 4],
    ["date", 8],
    ["expect", 16],
    ["trailer", 32],
    ["keep-alive", 64],
    ["cookie", 128],
]);
/** "Content-Length: N" and the end of the head, kept for small lengths. */
const contentLengthLines = new Array(4096).fill(undefined);
function contentLengthLine(length) {
    if (length < 4096) {
        let line = contentLengthLines[length];
        if (line === undefined) {
            line = "Content-Length: " + length + "\r\n\r\n";
            contentLengthLines[length] = line;
        }
        return line;
    }
    return "Content-Length: " + length + "\r\n\r\n";
}
/**
 * The lines of one header field set with setHeader (validated then), info
 * being the name's record. A program sets the same few fields with the same
 * values on every response: the last line composed for a name is kept on
 * its record and reused while its value is the same string.
 */
function fieldLines(info, name, value) {
    if (Array.isArray(value)) {
        let lines = "";
        for (let i = 0; i < value.length; i++)
            lines += name + ": " + value[i] + "\r\n";
        return lines;
    }
    if (info.lineValue !== value) {
        info.lineValue = value;
        info.line = name + ": " + value + "\r\n";
    }
    return info.line;
}
/**
 * The last head end() composed, its parts and its bytes. A server sends the
 * same head on most responses (the same status line, field lines, Date,
 * Connection and Content-Length lines): when every part is the same string
 * as last time, the head is reused flat and its bytes are copied instead of
 * concatenated and encoded again.
 */
let headParts = [],
    headText = "",
    headBytes = null;
/** The Connection and Keep-Alive lines of a server, kept on it for its current settings. */
function keepAliveLines(server) {
    const timeout = server.keepAliveTimeout,
        maxRequests = server.maxRequestsPerSocket;
    if (
        server._keepAliveLines === undefined ||
        server._keepAliveFor !== timeout ||
        server._keepAliveMax !== maxRequests
    ) {
        server._keepAliveFor = timeout;
        server._keepAliveMax = maxRequests;
        server._keepAliveLines =
            "Connection: keep-alive\r\nKeep-Alive: timeout=" +
            ((timeout / 1000) | 0) +
            (~~maxRequests > 0 ? ", max=" + maxRequests : "") +
            "\r\n";
    }
    return server._keepAliveLines;
}

// ---- Parse errors ------------------------------------------------------------------
const parseMessages = {
    HPE_INVALID_METHOD: "Invalid method encountered",
    HPE_INVALID_CONSTANT: "Expected HTTP/",
    HPE_INVALID_VERSION: "Invalid HTTP version",
    HPE_INVALID_URL: "Invalid URL",
    HPE_INVALID_HEADER_TOKEN: "Invalid header token",
    HPE_HEADER_OVERFLOW: "Header overflow",
    HPE_INVALID_CONTENT_LENGTH: "Invalid character in Content-Length",
    HPE_UNEXPECTED_CONTENT_LENGTH:
        "Content-Length can't be present with Transfer-Encoding",
    HPE_INVALID_CHUNK_SIZE: "Invalid character in chunk size",
    HPE_INVALID_STATUS: "Invalid status code",
    HPE_INVALID_TRANSFER_ENCODING:
        "Request has invalid \x60Transfer-Encoding\x60",
    HPE_INVALID_EOF_STATE: "Invalid EOF state",
    HPE_LF_EXPECTED: "Missing expected LF after chunk data",
};
// Native parser results -1..-7.
const nativeErrors = [
    null,
    "HPE_INVALID_METHOD",
    "HPE_INVALID_URL",
    "HPE_INVALID_VERSION",
    "HPE_INVALID_HEADER_TOKEN",
    "HPE_INVALID_CONTENT_LENGTH",
    "HPE_HEADER_OVERFLOW",
    "HPE_HEADER_OVERFLOW",
];
function parseError(code, data, start, end, message) {
    const error = new Error(
        "Parse Error: " + (message || parseMessages[code] || code),
    );
    error.code = code;
    error.bytesParsed = 0;
    if (data) {
        const raw = Buffer.allocUnsafe(end - start);
        copyBytes(data, start, end, raw, 0);
        error.rawPacket = raw;
    }
    return error;
}

// ---- Chunked bodies --------------------------------------------------------------
/** Server body chunks from this size on are views of node:net's read arena. */
const shareBytes = 8192;
/**
 * During ServerConnection.onData with node:net's read arena: the end of the
 * last shared chunk, 0 before one, or -1 when chunks must be copied. A module
 * variable rather than a field: reads are never nested.
 */
let readShared = -1;
/**
 * Decodes a chunked body fed in pieces. Partial size and trailer lines are
 * kept as text, so every byte offered is consumed until the message ends.
 * feed() returns the offset after the last byte of the message, -1 when the
 * piece was consumed and more is needed, or -2 on a malformed body. With
 * shared >= 0 (see ServerConnection.onData) large chunks are views of data
 * and shared becomes the end of the last one.
 */
class ChunkedDecoder {
    constructor(onChunk) {
        this.onChunk = onChunk;
        this.state = 0;
        this.remaining = 0;
        this.line = "";
        this.trailers = [];
        this.shared = -1;
    }
    feed(data, start, end) {
        let i = start;
        while (i < end) {
            if (this.state === 1) {
                const n = Math.min(this.remaining, end - i);
                let chunk;
                if (n >= shareBytes && this.shared >= 0) {
                    chunk = sliceBytes(data, i, i + n, bufferPrototype, 1);
                    this.shared = i + n;
                } else chunk = sliceBytes(data, i, i + n, bufferPrototype);
                i += n;
                this.remaining -= n;
                this.onChunk(chunk);
                if (this.remaining === 0) this.state = 2;
                continue;
            }
            // States 0 (size line), 2 (CRLF after data), 3 (trailer lines): read a line.
            let j = i;
            while (j < end && data[j] !== 10) j++;
            if (j === end) {
                this.line += latin1(data, i, end);
                return -1;
            }
            let line = this.line + latin1(data, i, j);
            this.line = "";
            i = j + 1;
            if (line.length > 0 && line.charCodeAt(line.length - 1) === 13)
                line = line.slice(0, -1);
            if (this.state === 2) {
                if (line !== "") return -2;
                this.state = 0;
                continue;
            }
            if (this.state === 0) {
                const size = line.split(";")[0].trim();
                if (!/^[0-9a-fA-F]+$/.test(size)) return -2;
                this.remaining = parseInt(size, 16);
                this.state = this.remaining === 0 ? 3 : 1;
                continue;
            }
            if (line === "") {
                this.state = 4;
                return i;
            }
            const colon = line.indexOf(":");
            if (colon > 0)
                this.trailers.push(
                    line.slice(0, colon),
                    line.slice(colon + 1).trim(),
                );
        }
        return -1;
    }
}

// ---- ServerResponse ----------------------------------------------------------------
export class ServerResponse {
    constructor(req, options) {
        if (captureRejections) EventEmitter.call(this);
        else {
            this._events = { __proto__: null };
            this._eventsCount = 0;
            this._maxListeners = undefined;
        }
        this.req = req;
        if (req.method === "HEAD") this._hasBody = false;
        if (req.httpVersionMajor < 1 || req.httpVersionMinor < 1) {
            this.useChunkedEncodingByDefault = chunkedToken.test(
                req.headers.te || "",
            );
            this.shouldKeepAlive = false;
        }
    }
    assignSocket(socket) {
        if (socket._httpMessage)
            throw codedError(
                "ERR_HTTP_SOCKET_ASSIGNED",
                "Socket already assigned",
            );
        socket._httpMessage = this;
        this.socket = socket;
        if (hasListener(this, "socket")) this.emit("socket", socket);
        if (this._output !== null) this._flushOutput();
    }
    detachSocket(socket) {
        if (socket._httpMessage === this) socket._httpMessage = null;
        this.socket = null;
    }
    _raw(text, callback) {
        const out = reserve(text.length);
        return this._writeOut(out, writeString(text, out, 0, true), callback);
    }
    writeContinue(callback) {
        this._raw("HTTP/1.1 100 Continue\r\n\r\n", callback);
        this._sent100 = true;
    }
    writeProcessing(callback) {
        this._raw("HTTP/1.1 102 Processing\r\n\r\n", callback);
    }
    writeEarlyHints(hints, callback) {
        let head = "HTTP/1.1 103 Early Hints\r\n";
        for (const key of Object.keys(hints)) {
            const value = hints[key];
            head +=
                key +
                ": " +
                (Array.isArray(value) ? value.join(", ") : value) +
                "\r\n";
        }
        this._raw(head + "\r\n", callback);
    }
    _implicitHeader() {
        this.writeHead(this.statusCode);
    }
    writeHead(statusCode, reason, obj) {
        if (this._header !== null) throw headersSentError("write");
        const original = statusCode;
        statusCode |= 0;
        if (statusCode < 100 || statusCode > 999)
            throw codedError(
                "ERR_HTTP_INVALID_STATUS_CODE",
                "Invalid status code: " + original,
                RangeError,
            );
        if (typeof reason === "string") this.statusMessage = reason;
        else {
            if (!this.statusMessage)
                this.statusMessage = STATUS_CODES[statusCode] || "unknown";
            if (obj === undefined || obj === null) obj = reason;
        }
        this.statusCode = statusCode;
        let fields = obj;
        if (this._fields !== null) {
            if (Array.isArray(obj)) {
                if (obj.length % 2 !== 0)
                    throw codedError(
                        "ERR_INVALID_ARG_VALUE",
                        "The argument 'headers' is invalid.",
                        TypeError,
                    );
                for (let n = 0; n < obj.length; n += 2)
                    this.removeHeader(obj[n]);
                for (let n = 0; n < obj.length; n += 2)
                    if (obj[n]) this.appendHeader(obj[n], obj[n + 1]);
            } else if (obj)
                for (const key of Object.keys(obj))
                    if (key) this.setHeader(key, obj[key]);
            fields = this;
        }
        if (checkChars(this.statusMessage, 1) >= 0)
            throw codedError(
                "ERR_INVALID_CHAR",
                "Invalid character in statusMessage",
                TypeError,
            );
        if (
            statusCode === 204 ||
            statusCode === 304 ||
            (statusCode >= 100 && statusCode <= 199)
        )
            this._hasBody = false;
        if (this._expect_continue && !this._sent100)
            this.shouldKeepAlive = false;
        this._compose(statusLine(statusCode, this.statusMessage), fields);
        return this;
    }
    writeHeader(statusCode, reason, obj) {
        return this.writeHead(statusCode, reason, obj);
    }
    /**
     * end(body) before any head was written, for the common response: no
     * fields that change framing, a string body (or none). Builds the same head
     * _compose would, without validating fields twice, and sends head and body
     * in one write.
     */
    end(chunk, encoding, callback) {
        if (
            this._header !== null ||
            callback !== undefined ||
            encoding !== undefined ||
            this._special !== 0 ||
            !this.useChunkedEncodingByDefault ||
            (chunk !== undefined &&
                chunk !== null &&
                typeof chunk !== "string" &&
                !(chunk instanceof Uint8Array)) ||
            this.finished ||
            this.destroyed
        )
            return super.end(chunk, encoding, callback);
        const code = this.statusCode | 0;
        if (code < 100 || code > 999 || code !== this.statusCode)
            return super.end(chunk, encoding, callback);
        let standard = statusLines[code];
        if (standard === undefined) standard = standardStatus(code);
        let message = this.statusMessage,
            head;
        if (!message) {
            this.statusMessage = standard.message;
            head = standard.line;
        } else if (message === standard.message) head = standard.line;
        else if (checkChars(message, 1) >= 0)
            return super.end(chunk, encoding, callback);
        else head = "HTTP/1.1 " + code + " " + message + "\r\n";
        const date = !this.sendDate
            ? ""
            : clock.now < dateExpiry
              ? dateField
              : dateLine();
        let connection;
        if (!this.shouldKeepAlive) {
            this._last = true;
            connection = "Connection: close\r\n";
        } else if (this.maxRequestsOnConnectionReached)
            connection = "Connection: close\r\n";
        else {
            const server =
                this._connection === null ? null : this._connection.server;
            if (
                server !== null &&
                server.keepAliveTimeout &&
                this._defaultKeepAlive
            )
                connection =
                    server._keepAliveFor === server.keepAliveTimeout &&
                    server._keepAliveMax === server.maxRequestsPerSocket
                        ? server._keepAliveLines
                        : keepAliveLines(server);
            else connection = "Connection: keep-alive\r\n";
        }
        const hasBody =
            this._hasBody &&
            code !== 204 &&
            code !== 304 &&
            (code < 100 || code > 199);
        if (!hasBody) this._hasBody = false;
        const body = hasBody && chunk ? chunk : "";
        // Bytes (a Buffer, or the UTF-8 of _endJson) are copied as they are.
        const bytes = typeof body !== "string";
        // A large body that was just sent is likely sent again (a cached page):
        // its bytes are kept and copied instead of encoded twice per response.
        const cached = !bytes && body.length >= 2048 && body === lastBody;
        const length = bytes
            ? body.length
            : body === ""
              ? 0
              : cached
                ? lastBytes.length
                : writeString(body, undefined, 0, false);
        this._contentLength = chunk
            ? typeof chunk === "string"
                ? length || writeString(chunk, undefined, 0, false)
                : chunk.length
            : 0;
        let ending = "\r\n";
        if (hasBody) {
            const length = this._contentLength,
                line = length < 4096 ? contentLengthLines[length] : undefined;
            ending = line !== undefined ? line : contentLengthLine(length);
        }
        // The head: the status line, the field lines, Date, Connection and
        // the end (the last head when they are the same strings).
        const fields = this._fields,
            count = this._fieldEnd >> 2,
            parts = headParts;
        let same =
            parts.length === count + 4 &&
            parts[0] === head &&
            parts[count + 1] === date &&
            parts[count + 2] === connection &&
            parts[count + 3] === ending;
        // A field's line is the last head's when its record composed that
        // line for the same value (array values compose new lines).
        if (same)
            for (let i = 0, k = 1; k <= count; i += 4, k++) {
                const info = fields[i + 3];
                if (
                    info.lineValue !== fields[i + 2] ||
                    parts[k] !== info.line
                ) {
                    same = false;
                    break;
                }
            }
        let reuse = false;
        if (same) {
            head = headText;
            reuse = headBytes !== null;
        } else {
            if (parts.length !== count + 4) parts.length = count + 4;
            parts[0] = head;
            for (let i = 0, k = 1; k <= count; i += 4, k++) {
                const line = fieldLines(
                    fields[i + 3],
                    fields[i + 1],
                    fields[i + 2],
                );
                parts[k] = line;
                head += line;
            }
            parts[count + 1] = date;
            parts[count + 2] = connection;
            parts[count + 3] = ending;
            head += date;
            head += connection;
            head += ending;
            headText = head;
            headBytes = null;
        }
        this._header = head;
        this.finished = true;
        const out = reserve(head.length + length);
        let size;
        if (reuse) {
            size = headBytes.length;
            copyBytes(headBytes, 0, size, out, 0);
        } else {
            size = writeString(head, out, 0, true);
            // A head sent a second time keeps its bytes.
            if (same) {
                headBytes = new Uint8Array(size);
                copyBytes(out, 0, size, headBytes, 0);
            }
        }
        this._headerSent = true;
        if (bytes) {
            copyBytes(body, 0, length, out, size);
            size += length;
        } else if (cached) {
            copyBytes(lastBytes, 0, length, out, size);
            size += length;
        } else if (length > 0) {
            const written = writeString(body, out, size, false);
            if (body.length >= 2048) {
                lastBody = body;
                lastBytes = new Uint8Array(written);
                copyBytes(out, size, size + written, lastBytes, 0);
            }
            size += written;
        }
        // The socket takes the bytes directly when it is this message's turn
        // (what _writeOut would do, without its own call).
        const socket = this.socket;
        if (
            socket !== null &&
            socket._httpMessage === this &&
            this._output === null &&
            !socket.connecting &&
            !socket._destroyed
        )
            socket._sendNow(out, size, this);
        else this._writeOut(out, size, this);
        return this;
    }
    /** Write completion (the message is its own write callback): the connection moves on. */
    _sent(error) {
        if (error) return;
        const socket = this.socket;
        if (socket !== null && socket._hadError) return;
        if (this._eventsCount !== 0 && hasListener(this, "finish"))
            later(this, 0);
        else this.writableFinished = true;
        if (this._connection !== null) this._connection.finished(this);
    }
    _afterFinish() {
        if (this._connection !== null) this._connection.finished(this);
    }
}
Object.setPrototypeOf(ServerResponse.prototype, OutgoingMessage.prototype);
Object.setPrototypeOf(ServerResponse, OutgoingMessage);
defaults(ServerResponse.prototype, {
    statusCode: 200,
    statusMessage: undefined,
    sendDate: true,
    _sent100: false,
    _expect_continue: false,
    req: null,
});

// The lowering's x.end(JSON.stringify(...)) (#155, json-response prelude):
// end is one of the two end methods above, already read from x.
if (registerHttpJson !== undefined) {
    const apply = Reflect.apply;
    registerHttpJson({
        end: OutgoingMessage.prototype.end,
        serverEnd: ServerResponse.prototype.end,
        endJson(receiver, end, value, replacer, space) {
            return apply(end, receiver, [jsonBytes(value, replacer, space)]);
        },
    });
}

// ---- Server --------------------------------------------------------------------------
export class Server extends net.Server {
    constructor(options, requestListener) {
        if (typeof options === "function") {
            requestListener = options;
            options = {};
        } else if (options === undefined || options === null) options = {};
        else if (typeof options !== "object")
            throw invalidArgType("options", "of type object", options);
        super({
            allowHalfOpen: true,
            noDelay: options.noDelay === undefined ? true : options.noDelay,
        });
        this._IncomingMessage = options.IncomingMessage || IncomingMessage;
        this._ServerResponse = options.ServerResponse || ServerResponse;
        this.maxHeaderSize = options.maxHeaderSize;
        this.requireHostHeader =
            options.requireHostHeader === undefined
                ? true
                : !!options.requireHostHeader;
        this.joinDuplicateHeaders = !!options.joinDuplicateHeaders;
        this.httpAllowHalfOpen = false;
        this.timeout = 0;
        this.maxHeadersCount = null;
        this.maxRequestsPerSocket = 0;
        this.headersTimeout =
            options.headersTimeout === undefined
                ? 60000
                : options.headersTimeout;
        this.requestTimeout =
            options.requestTimeout === undefined
                ? 300000
                : options.requestTimeout;
        this.keepAliveTimeout =
            options.keepAliveTimeout === undefined
                ? 5000
                : options.keepAliveTimeout;
        this.keepAliveTimeoutBuffer = 1000;
        if (requestListener) this.on("request", requestListener);
    }
    _onConnection(socket) {
        new ServerConnection(this, socket);
        if (hasListener(this, "connection")) this.emit("connection", socket);
    }
    setTimeout(msecs, callback) {
        this.timeout = msecs;
        if (callback) this.on("timeout", callback);
        return this;
    }
    close(callback) {
        this.closeIdleConnections();
        return super.close(callback);
    }
    closeAllConnections() {
        for (const socket of this._connections.values()) socket.destroy();
    }
    closeIdleConnections() {
        // As in Node.js, a connection is idle when no request is being
        // received and its response has ended (end() was called), even if
        // the write that completes it has not reported back yet; such a
        // socket closes once its queued bytes are out.
        for (const socket of this._connections.values()) {
            const connection = socket._httpConnection;
            if (!connection || connection.waiting.length > 0) continue;
            const incoming = connection.incoming,
                message = socket._httpMessage;
            if (incoming.length > 0 && !incoming[incoming.length - 1].complete)
                continue;
            if (message) {
                if (!message.finished) continue;
                socket.destroySoon();
            } else if (incoming.length === 0) socket.destroy();
        }
    }
}
export function createServer(options, requestListener) {
    return new Server(options, requestListener);
}

const badRequest = "HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n";
const fieldsTooLarge =
    "HTTP/1.1 431 Request Header Fields Too Large\r\nConnection: close\r\n\r\n";
/**
 * A request's body is complete: req.push(null), done here for the stock
 * push (its property reads are shared by every kind of stream).
 */
function completeRequest(req) {
    req.complete = true;
    if (req.push !== readablePush) req.push(null);
    else if (!req._destroyed && !req._ended) {
        req._ended = true;
        req._scheduleFlush();
    }
}
/**
 * One accepted connection. The socket hands it every read directly
 * (socket._consumer); bytes that do not complete a head stay in pending.
 * Requests are answered in order: a response that is not first waits in
 * waiting with its output buffered until the socket is its turn.
 */
class ServerConnection {
    constructor(server, socket) {
        this.server = server;
        this.socket = socket;
        this.pending = null;
        this.pendingLength = 0;
        this.incoming = [];
        this.waiting = [];
        this.body = null;
        this.bodyRemaining = 0;
        this.decoder = null;
        this.keepAliveSet = false;
        this.stopped = false;
        socket._consumer = this;
        socket._httpConnection = this;
        socket._httpMessage = null;
        socket.on("error", onServerSocketError);
        socket.on("close", onServerSocketClose);
        socket.on("timeout", onServerSocketTimeout);
        if (server.timeout) socket.setTimeout(server.timeout);
    }
    /**
     * bytes[0, n) were read. With arena (node:net's read arena) large body
     * chunks are views of bytes instead of copies; the result is then how
     * many bytes from the start the views cover (see keepRead in node:net).
     */
    onData(bytes, n, arena) {
        let data = bytes,
            end = n,
            start = 0;
        if (this.pendingLength === 0) readShared = arena ? 0 : -1;
        else {
            // Bytes copied into pending are never shared: pending is reused.
            readShared = -1;
            const total = this.pendingLength + n;
            if (this.pending.length < total) {
                const grown = new Uint8Array(
                    Math.max(total, 2 * this.pending.length),
                );
                copyBytes(this.pending, 0, this.pendingLength, grown, 0);
                this.pending = grown;
            }
            copyBytes(bytes, 0, n, this.pending, this.pendingLength);
            data = this.pending;
            end = total;
            this.pendingLength = 0;
        }
        while (start < end && !this.stopped) {
            if (this.body !== null) {
                const next =
                    this.decoder !== null
                        ? this.chunkedBody(data, start, end)
                        : this.fixedBody(data, start, end);
                if (next < 0) {
                    start = end;
                    break;
                }
                start = next;
                continue;
            }
            const result = parseHead(data, start, end, OUT);
            if (result === 0) {
                if (
                    end - start >
                    (this.server.maxHeaderSize || maxHeaderSize)
                ) {
                    this.fail(
                        parseError("HPE_HEADER_OVERFLOW", data, start, end),
                    );
                    return readShared;
                }
                break;
            }
            if (result < 0) {
                this.fail(parseError(nativeErrors[-result], data, start, end));
                return readShared;
            }
            if (
                result - OUT[10] >
                (this.server.maxHeaderSize || maxHeaderSize)
            ) {
                this.fail(parseError("HPE_HEADER_OVERFLOW", data, start, end));
                return readShared;
            }
            if (!this.request(data, start, result, end)) return readShared;
            start = result;
        }
        if (start < end && !this.stopped) {
            const rest = end - start;
            if (data === this.pending) copyBytes(data, start, end, data, 0);
            else {
                if (this.pending === null || this.pending.length < rest)
                    this.pending = new Uint8Array(Math.max(rest, 4096));
                copyBytes(data, start, end, this.pending, 0);
            }
            this.pendingLength = rest;
        }
        return readShared;
    }
    /** A complete head in data[start, headEnd): creates the request and its response. Returns false to stop reading. */
    request(data, start, headEnd, end) {
        const server = this.server,
            socket = this.socket;
        const hash = OUT[9],
            slot = (hash >>> 0) % METHOD_TABLE,
            method = methodByHash[slot];
        if (
            method === undefined ||
            methodHashes[slot] !== hash ||
            method.length !== OUT[1] - OUT[0]
        ) {
            this.fail(parseError("HPE_INVALID_METHOD", data, start, end));
            return false;
        }
        const major = OUT[4],
            minor = OUT[5],
            flags = OUT[7];
        if (major !== 1 || minor > 1) {
            if (major !== 0 || minor !== 9) {
                this.fail(parseError("HPE_INVALID_VERSION", data, start, end));
                return false;
            }
        }
        const req = new server._IncomingMessage(socket);
        req.method = method;
        req.url = latin1(data, OUT[2], OUT[3]);
        if (major !== 1 || minor !== 1) {
            req.httpVersionMajor = major;
            req.httpVersionMinor = minor;
            req.httpVersion = major + "." + minor;
        }
        // The header lines as strings now (one native call): the bytes
        // belong to the shared read buffer.
        req._raw = nativeHeadLines(data, OUT, fieldStrings);
        if (server.joinDuplicateHeaders) req.joinDuplicateHeaders = true;
        // Body framing.
        let chunked = false,
            length = OUT[8];
        if (flags & F_TE) {
            if (flags & F_CL) {
                this.fail(
                    parseError(
                        "HPE_UNEXPECTED_CONTENT_LENGTH",
                        data,
                        start,
                        end,
                    ),
                );
                return false;
            }
            if (flags & F_CHUNKED) chunked = true;
            else if (
                /(?:^|,)\s*chunked\s*$/i.test(req.headers["transfer-encoding"])
            )
                chunked = true;
            else {
                this.fail(
                    parseError(
                        "HPE_INVALID_TRANSFER_ENCODING",
                        data,
                        start,
                        end,
                    ),
                );
                return false;
            }
        }
        if (length === -2) length = Number(req.headers["content-length"]);
        let keepAlive,
            upgrade = method === "CONNECT";
        if (flags & F_OTHER_CONNECTION) {
            const connection = req.headersDistinct.connection.join(",");
            keepAlive =
                major === 1 && minor === 1
                    ? !closeToken.test(connection)
                    : keepAliveToken.test(connection);
            if (flags & F_UPGRADE && upgradeToken.test(connection))
                upgrade = true;
        } else {
            keepAlive =
                major === 1 && minor === 1
                    ? (flags & F_CLOSE) === 0
                    : (flags & F_KEEPALIVE) !== 0;
            if (flags & F_UPGRADE && flags & F_UPGRADE_TOKEN) upgrade = true;
        }
        if (upgrade) {
            const event = method === "CONNECT" ? "connect" : "upgrade";
            if (hasListener(server, event)) {
                // The rest of the input belongs to the new protocol.
                this.stopped = true;
                req.upgrade = true;
                socket._consumer = null;
                socket.removeListener("error", onServerSocketError);
                socket.removeListener("close", onServerSocketClose);
                socket.removeListener("timeout", onServerSocketTimeout);
                server._connections.delete(socket);
                socket.server = null;
                const rest = Buffer.allocUnsafe(end - headEnd);
                copyBytes(data, headEnd, end, rest, 0);
                req.complete = true;
                server.emit(event, req, socket, rest);
                return false;
            }
        }
        if (this.keepAliveSet) {
            socket._idleTimeout(server.timeout || 0);
            this.keepAliveSet = false;
        }
        this.incoming.push(req);
        const res = new server._ServerResponse(req);
        res._connection = this;
        if (!keepAlive) res.shouldKeepAlive = false;
        res.socket = socket;
        if (socket._httpMessage === null) socket._httpMessage = res;
        else this.waiting.push(res);
        if (chunked) {
            this.body = req;
            this.decoder = new ChunkedDecoder((chunk) => this.deliver(chunk));
        } else if (length > 0) {
            this.body = req;
            this.decoder = null;
            this.bodyRemaining = length;
        } else {
            completeRequest(req);
        }
        if (major === 1 && minor === 1) {
            if (server.requireHostHeader && (flags & F_HOST) === 0) {
                res.writeHead(400, ["Connection", "close"]);
                res.end();
                return true;
            }
            if (server.maxRequestsPerSocket > 0) {
                this.requests = (this.requests || 0) + 1;
                res.maxRequestsOnConnectionReached =
                    server.maxRequestsPerSocket <= this.requests;
                if (server.maxRequestsPerSocket < this.requests) {
                    server.emit("dropRequest", req, socket);
                    res.writeHead(503);
                    res.end();
                    return true;
                }
            }
            if (flags & F_EXPECT) {
                if (continueToken.test(req.headers.expect)) {
                    res._expect_continue = true;
                    if (hasListener(server, "checkContinue"))
                        server.emit("checkContinue", req, res);
                    else {
                        res.writeContinue();
                        server.emit("request", req, res);
                    }
                } else if (hasListener(server, "checkExpectation"))
                    server.emit("checkExpectation", req, res);
                else {
                    res.writeHead(417);
                    res.end();
                }
                return true;
            }
        }
        server.emit("request", req, res);
        return true;
    }
    deliver(chunk) {
        const req = this.body;
        if (req._destroyed) return;
        // A flowing request with nothing queued and no decoder gets the
        // chunk at once, as push() would give it.
        if (
            req._flowing === true &&
            req._queued === 0 &&
            !req._flushScheduled &&
            req._decoder === null &&
            !req._ended &&
            req.push === readablePush
        ) {
            req.emit("data", chunk);
            return;
        }
        if (req.push(chunk) === false && !this.socket.isPaused()) {
            req._socketPaused = true;
            this.socket.pause();
        }
    }
    fixedBody(data, start, end) {
        const n =
            this.bodyRemaining < end - start ? this.bodyRemaining : end - start;
        let chunk;
        if (n >= shareBytes && readShared >= 0) {
            chunk = sliceBytes(data, start, start + n, bufferPrototype, 1);
            readShared = start + n;
        } else chunk = sliceBytes(data, start, start + n, bufferPrototype);
        this.bodyRemaining -= n;
        this.deliver(chunk);
        if (this.bodyRemaining === 0) {
            const req = this.body;
            this.body = null;
            completeRequest(req);
        }
        return start + n;
    }
    chunkedBody(data, start, end) {
        const decoder = this.decoder;
        decoder.shared = readShared;
        const result = decoder.feed(data, start, end);
        readShared = decoder.shared;
        if (result === -2) {
            this.fail(parseError("HPE_INVALID_CHUNK_SIZE", data, start, end));
            return -1;
        }
        if (result === -1) return -1;
        const req = this.body;
        req.rawTrailers = this.decoder.trailers;
        this.body = null;
        this.decoder = null;
        completeRequest(req);
        return result;
    }
    onEnd() {
        if (this.stopped) return;
        if (this.pendingLength > 0 || this.body !== null) {
            this.fail(parseError("HPE_INVALID_EOF_STATE"));
            return;
        }
        const server = this.server,
            socket = this.socket;
        if (!server.httpAllowHalfOpen) {
            while (this.incoming.length > 0) this.incoming.shift().destroy();
            if (socket.writable) socket.end();
        } else if (this.waiting.length > 0)
            this.waiting[this.waiting.length - 1]._last = true;
        else if (socket._httpMessage) socket._httpMessage._last = true;
        else if (socket.writable) socket.end();
    }
    fail(error) {
        this.stopped = true;
        const socket = this.socket;
        if (!this.server.emit("clientError", error, socket)) {
            if (
                socket.writable &&
                socket.bytesWritten === 0 &&
                error.code.startsWith("HPE_")
            )
                socket.write(
                    error.code === "HPE_HEADER_OVERFLOW"
                        ? fieldsTooLarge
                        : badRequest,
                );
            socket.destroy();
        }
    }
    /** The response has handed all its bytes to the socket. */
    finished(res) {
        const req = res.req,
            socket = this.socket,
            server = this.server;
        const incoming = this.incoming;
        if (incoming.length === 1 && incoming[0] === req) incoming.pop();
        else if (incoming[0] === req) incoming.shift();
        else {
            const index = incoming.indexOf(req);
            if (index >= 0) incoming.splice(index, 1);
        }
        if (!req._consuming) req._dump();
        if (socket._httpMessage === res) socket._httpMessage = null;
        res.socket = null;
        if (res._eventsCount !== 0 && hasListener(res, "close")) later(res, 1);
        else res._closed = true;
        if (res._last) socket.destroySoon();
        else if (this.waiting.length > 0) {
            const next = this.waiting.shift();
            next.socket = socket;
            socket._httpMessage = next;
            if (next._output !== null) next._flushOutput();
        } else if (server.keepAliveTimeout) {
            socket._idleTimeout(
                server.keepAliveTimeout + server.keepAliveTimeoutBuffer,
            );
            this.keepAliveSet = true;
        }
    }
}
function onServerSocketError(error) {
    const connection = this._httpConnection;
    if (connection.stopped) return;
    connection.stopped = true;
    if (!connection.server.emit("clientError", error, this)) this.destroy();
}
function onServerSocketClose() {
    const connection = this._httpConnection;
    while (connection.incoming.length > 0) {
        const req = connection.incoming.shift();
        if (!req.complete) req.destroy(codedError("ECONNRESET", "aborted"));
        else if (!req._destroyed) req.destroy();
    }
    const active = this._httpMessage;
    if (active) {
        active.destroyed = true;
        active._closed = true;
        active.emit("close");
    }
    while (connection.waiting.length > 0) {
        const res = connection.waiting.shift();
        res.destroyed = true;
        res._closed = true;
        res.emit("close");
    }
}
function onServerSocketTimeout() {
    const connection = this._httpConnection,
        server = connection.server;
    const req = connection.body;
    const reqTimeout =
        req !== null && !req.complete && req.emit("timeout", this);
    const res = this._httpMessage;
    const resTimeout = res && res.emit("timeout", this);
    const serverTimeout = server.emit("timeout", this);
    if (!reqTimeout && !resTimeout && !serverTimeout) this.destroy();
}

// ---- Agent --------------------------------------------------------------------------
/**
 * Connection pool of the client: per host:port, sockets in use, free
 * keep-alive sockets (unreferenced, closed after the idle timeout) and
 * requests waiting for a socket when maxSockets is reached.
 */
export class Agent extends EventEmitter {
    constructor(options) {
        super();
        this.defaultPort = 80;
        this.protocol = "http:";
        this.options = Object.assign({ __proto__: null }, options);
        if (this.options.noDelay === undefined) this.options.noDelay = true;
        this.options.path = null;
        this.requests = Object.create(null);
        this.sockets = Object.create(null);
        this.freeSockets = Object.create(null);
        this.keepAliveMsecs = this.options.keepAliveMsecs || 1000;
        this.keepAlive = this.options.keepAlive || false;
        this.maxSockets = this.options.maxSockets || Agent.defaultMaxSockets;
        this.maxFreeSockets = this.options.maxFreeSockets || 256;
        this.scheduling = this.options.scheduling || "lifo";
        this.maxTotalSockets = this.options.maxTotalSockets || Infinity;
        this.totalSocketCount = 0;
        this._releasedSockets = [];
        this._cancelledRequests = Object.create(null);
        this._queueNames = Object.create(null);
        this._queueOrder = 0;
        this._draining = false;
    }
    static get defaultMaxSockets() {
        return Infinity;
    }
    createConnection(options, callback) {
        const socket = net.createConnection(options);
        if (callback) socket.once("connect", () => callback(null, socket));
        return socket;
    }
    getName(options) {
        options = options || {};
        let name = (options.host || "localhost") + ":";
        if (options.port) name += options.port;
        name += ":";
        if (options.localAddress) name += options.localAddress;
        if (options.family === 4 || options.family === 6)
            name += ":" + options.family;
        return name;
    }
    addRequest(req, options) {
        if (req.destroyed) return;
        options = Object.assign({ __proto__: null }, options, this.options);
        const name = this.getName(options);
        req._queuedAgentName = name;
        req._queuedAgentOptions = options;
        req._agentQueueOrder = ++this._queueOrder;
        this._queueNames[name] = true;
        list(this.requests, name).push(req);
        this._drain(name);
    }
    removeRequest(req) {
        const name = req._queuedAgentName;
        if (name !== undefined) removeFrom(this.requests, name, req);
        req._queuedAgentName = undefined;
        req._queuedAgentOptions = undefined;
        req._agentQueueOrder = undefined;
        if (
            name !== undefined &&
            !this.requests[name] &&
            !this._cancelledRequests[name]
        )
            delete this._queueNames[name];
    }
    _cancelRequest(req) {
        const name = req._queuedAgentName;
        const cancelled = list(this._cancelledRequests, name);
        let index = cancelled.length;
        while (index > 0 && cancelled[index - 1].order > req._agentQueueOrder)
            index--;
        cancelled.splice(index, 0, {
            order: req._agentQueueOrder,
            req,
        });
        this.removeRequest(req);
        // Node reports queued cancellation when a socket can be offered. Keep
        // just the terminal notification, without connection options/payloads.
        this._drain(name);
    }
    _nextRequest(name, offered) {
        const waiting = this.requests[name];
        while (
            waiting !== undefined &&
            waiting.length > 0 &&
            waiting[0].destroyed
        )
            this.removeRequest(waiting[0]);
        const cancelled = this._cancelledRequests[name];
        while (
            cancelled !== undefined &&
            cancelled.length > 0 &&
            (!waiting ||
                waiting.length === 0 ||
                cancelled[0].order < waiting[0]._agentQueueOrder)
        ) {
            const active = this.sockets[name] || [],
                free = this.freeSockets[name] || [];
            if (
                offered !== name &&
                free.length === 0 &&
                (active.length >= this.maxSockets ||
                    (offered === undefined &&
                        this.totalSocketCount >= this.maxTotalSockets))
            )
                return undefined;
            const entry = cancelled.shift();
            if (cancelled.length === 0) {
                delete this._cancelledRequests[name];
                if (!this.requests[name]) delete this._queueNames[name];
            }
            defer(entry.req, "_finishDestroy");
        }
        if (waiting !== undefined && waiting.length > 0) {
            const req = waiting[0];
            return req;
        }
        return undefined;
    }
    /** One iterative pump also covers synchronous/reentrant socket callbacks. */
    _drain(preferred) {
        this._drainAgain = true;
        if (preferred !== undefined) this._drainPreferred = preferred;
        if (this._draining) return;
        this._draining = true;
        try {
            while (this._drainAgain) {
                this._drainAgain = false;
                while (this._releasedSockets.length > 0)
                    this._releaseOne(this._releasedSockets.shift());
                const names = Object.keys(this._queueNames);
                const preferred = this._drainPreferred;
                this._drainPreferred = undefined;
                if (preferred !== undefined) {
                    const index = names.indexOf(preferred);
                    if (index >= 0) names.splice(index, 1);
                    names.unshift(preferred);
                }
                for (const name of names) {
                    let req;
                    while ((req = this._nextRequest(name)) !== undefined) {
                        const free = this.freeSockets[name];
                        let socket;
                        while (free !== undefined && free.length > 0) {
                            const candidate =
                                this.scheduling === "fifo"
                                    ? free[0]
                                    : free[free.length - 1];
                            if (!candidate.destroyed) {
                                removeFrom(this.freeSockets, name, candidate);
                                socket = candidate;
                                break;
                            }
                            this.removeSocket(candidate);
                        }
                        if (socket !== undefined) {
                            this.reuseSocket(socket, req);
                            list(this.sockets, name).push(socket);
                        } else {
                            const active = this.sockets[name];
                            if (
                                (active !== undefined &&
                                    active.length >= this.maxSockets) ||
                                this.totalSocketCount >= this.maxTotalSockets
                            )
                                break;
                            try {
                                socket = this.createSocket(
                                    req,
                                    req._queuedAgentOptions,
                                );
                            } catch (error) {
                                this.removeRequest(req);
                                throw error;
                            }
                        }
                        this.removeRequest(req);
                        assignSocket(this, req, socket);
                        if (this._releasedSockets.length > 0) break;
                    }
                }
            }
        } finally {
            this._draining = false;
        }
    }
    createSocket(req, options) {
        options = Object.assign({ __proto__: null }, options, this.options);
        const name = this.getName(options);
        options._agentKey = name;
        const socket = this.createConnection(options);
        this.totalSocketCount++;
        list(this.sockets, name).push(socket);
        socket._agent = this;
        socket._agentName = name;
        socket._agentOptions = options;
        socket.on("close", onAgentSocketClose);
        socket.on("timeout", onAgentSocketTimeout);
        return socket;
    }
    /** The response on socket is complete and its request finished. */
    _release(socket) {
        const active = this.sockets[socket._agentName];
        if (
            socket._agentReleased ||
            active === undefined ||
            active.indexOf(socket) < 0
        )
            return;
        socket._agentReleased = true;
        this._releasedSockets.push(socket);
        this._drain(socket._agentName);
    }
    _releaseOne(socket) {
        const name = socket._agentName;
        const active = this.sockets[name];
        if (active === undefined || active.indexOf(socket) < 0) {
            socket._agentReleased = false;
            return;
        }
        this.emit("free", socket, socket._agentOptions);
        socket._agentReleased = false;
        if (active.indexOf(socket) < 0) return;
        if (!socket.writable || socket.destroyed) {
            socket.destroy();
            return;
        }
        const waiting = this._nextRequest(name, name);
        if (waiting !== undefined) {
            const req = waiting;
            this.removeRequest(req);
            assignSocket(this, req, socket);
            return;
        }
        const req = socket._httpMessage;
        socket._httpMessage = null;
        if (!req || !req.shouldKeepAlive || !this.keepAlive) {
            socket.destroy();
            return;
        }
        const free = this.freeSockets[name] || [];
        if (
            this.totalSocketCount > this.maxTotalSockets ||
            free.length >= this.maxFreeSockets ||
            !this.keepSocketAlive(socket)
        ) {
            socket.destroy();
            return;
        }
        this.freeSockets[name] = free;
        removeFrom(this.sockets, name, socket);
        free.push(socket);
        socket.once("error", freeSocketError);
        // Node can offer an idle connection to cross-origin cancellation. Only
        // terminal notifications use this opportunity: idle sockets still count,
        // and an earlier eligible live request retains its turn.
        for (const pending of Object.keys(this._queueNames)) {
            const active = this.sockets[pending] || [];
            if (pending !== name && active.length >= this.maxSockets) continue;
            if (this._nextRequest(pending, name) !== undefined) break;
        }
    }
    removeSocket(socket) {
        const name = socket._agentName;
        if (
            removeFrom(this.sockets, name, socket) |
            removeFrom(this.freeSockets, name, socket)
        ) {
            this.totalSocketCount--;
            socket.removeListener("error", freeSocketError);
            this._drain(name);
        }
    }
    keepSocketAlive(socket) {
        socket.setKeepAlive(true, this.keepAliveMsecs);
        socket.unref();
        let timeout = this.options.timeout;
        if (socket._keepAliveHint !== undefined)
            timeout =
                timeout === undefined
                    ? socket._keepAliveHint
                    : Math.min(timeout, socket._keepAliveHint);
        if (timeout !== undefined) socket.setTimeout(timeout);
        return true;
    }
    reuseSocket(socket, req) {
        socket.removeListener("error", freeSocketError);
        req.reusedSocket = true;
        socket.ref();
    }
    destroy() {
        for (const table of [this.freeSockets, this.sockets])
            for (const name of Object.keys(table))
                for (const socket of table[name].slice()) socket.destroy();
    }
}
function list(table, name) {
    return table[name] || (table[name] = []);
}
function removeFrom(table, name, socket) {
    const sockets = table[name];
    if (sockets === undefined) return false;
    const index = sockets.indexOf(socket);
    if (index < 0) return false;
    sockets.splice(index, 1);
    if (sockets.length === 0) delete table[name];
    return true;
}
function freeSocketError() {}
function onAgentSocketClose() {
    this._agent.removeSocket(this);
}
function onAgentSocketTimeout() {
    const agent = this._agent,
        free = agent.freeSockets[this._agentName];
    if (free !== undefined && free.indexOf(this) >= 0) {
        this.destroy();
        agent.emit("timeout");
    }
}
function assignSocket(agent, req, socket) {
    req.onSocket(socket);
    const agentTimeout = agent.options.timeout || 0;
    if (req.timeout !== undefined && req.timeout !== agentTimeout)
        socket.setTimeout(req.timeout);
}
export let globalAgent = new Agent({
    keepAlive: true,
    scheduling: "lifo",
    timeout: 5000,
});

// ---- ClientRequest -----------------------------------------------------------------
function parseUrl(input) {
    const match =
        /^([a-zA-Z][a-zA-Z0-9+.-]*:)\/\/(?:([^@\/?#]*)@)?(\[[^\]]*\]|[^:\/?#]*)(?::(\d*))?([^?#]*)(\?[^#]*)?/.exec(
            input,
        );
    if (match === null)
        throw codedError("ERR_INVALID_URL", "Invalid URL", TypeError);
    return {
        protocol: match[1].toLowerCase(),
        auth: match[2] === undefined ? undefined : decodeURIComponent(match[2]),
        hostname: match[3].toLowerCase(),
        port: match[4] === undefined ? "" : match[4],
        pathname: match[5] || "/",
        search: match[6] || "",
    };
}
function urlOptions(url) {
    const hostname =
        typeof url.hostname === "string" && url.hostname.startsWith("[")
            ? url.hostname.slice(1, -1)
            : url.hostname;
    const options = {
        protocol: url.protocol,
        hostname,
        hash: url.hash,
        search: url.search,
        pathname: url.pathname,
        path: (url.pathname || "") + (url.search || ""),
        href: url.href,
    };
    if (url.port !== "" && url.port !== undefined)
        options.port = Number(url.port);
    if (url.username || url.password)
        options.auth =
            decodeURIComponent(url.username) +
            ":" +
            decodeURIComponent(url.password);
    else if (url.auth) options.auth = url.auth;
    return options;
}
function checkHost(host, name) {
    if (host !== null && host !== undefined && typeof host !== "string")
        throw invalidArgType(
            "options." + name,
            "of type string or one of undefined or null",
            host,
        );
    return host;
}
function hangUp(message) {
    return codedError("ECONNRESET", message);
}
export class ClientRequest extends OutgoingMessage {
    constructor(input, options, callback) {
        super();
        if (typeof input === "string") input = urlOptions(parseUrl(input));
        else if (
            input !== null &&
            typeof input === "object" &&
            typeof input.href === "string" &&
            typeof input.hostname === "string"
        )
            input = urlOptions(input);
        else {
            callback = options;
            options = input;
            input = null;
        }
        if (typeof options === "function") {
            callback = options;
            options = input || {};
        } else options = Object.assign({}, input, options);
        const defaultAgent = options._defaultAgent || globalAgent;
        let agent = options.agent;
        if (agent === false) agent = new defaultAgent.constructor();
        else if (agent === null || agent === undefined) {
            if (typeof options.createConnection !== "function")
                agent = defaultAgent;
        } else if (typeof agent.addRequest !== "function")
            throw invalidArgType(
                "options.agent",
                "of type Agent-like Object, undefined, or false",
                agent,
            );
        this.agent = agent;
        const protocol = options.protocol || defaultAgent.protocol;
        const expected =
            agent && agent.protocol ? agent.protocol : defaultAgent.protocol;
        if (protocol !== expected)
            throw codedError(
                "ERR_INVALID_PROTOCOL",
                'Protocol "' +
                    protocol +
                    '" not supported. Expected "' +
                    expected +
                    '"',
                TypeError,
            );
        const defaultPort =
            options.defaultPort || (agent && agent.defaultPort) || 80;
        const port = (options.port = options.port || defaultPort);
        const host = (options.host =
            checkHost(options.hostname, "hostname") ||
            checkHost(options.host, "host") ||
            "localhost");
        if (options.timeout !== undefined) {
            if (typeof options.timeout !== "number")
                throw invalidArgType(
                    "timeout",
                    "of type number",
                    options.timeout,
                );
            this.timeout = options.timeout;
        }
        const method = options.method;
        if (
            method !== null &&
            method !== undefined &&
            typeof method !== "string"
        )
            throw invalidArgType("options.method", "of type string", method);
        if (method) {
            if (!isToken(method))
                throw codedError(
                    "ERR_INVALID_HTTP_TOKEN",
                    'Method must be a valid HTTP token ["' + method + '"]',
                    TypeError,
                );
            this.method = method.toUpperCase();
        } else this.method = "GET";
        this.path = options.path || "/";
        if (checkChars(this.path, 2) >= 0)
            throw codedError(
                "ERR_UNESCAPED_CHARACTERS",
                "Request path contains unescaped characters",
                TypeError,
            );
        if (callback) this.once("response", callback);
        const m = this.method;
        this.useChunkedEncodingByDefault = !(
            m === "GET" ||
            m === "HEAD" ||
            m === "DELETE" ||
            m === "OPTIONS" ||
            m === "TRACE" ||
            m === "CONNECT"
        );
        this.res = null;
        this.aborted = false;
        this.reusedSocket = false;
        this.upgradeOrConnect = false;
        this.maxHeadersCount = null;
        this.host = host;
        this.protocol = protocol;
        this.joinDuplicateHeaders = !!options.joinDuplicateHeaders;
        this._responseEnded = false;
        this._errorEmitted = false;
        this._released = false;
        this._requestDone = false;
        if (agent) {
            if (!agent.keepAlive && !Number.isFinite(agent.maxSockets)) {
                this._last = true;
                this.shouldKeepAlive = false;
            } else {
                this._last = false;
                this.shouldKeepAlive = true;
            }
        }
        if (!Array.isArray(options.headers)) {
            if (options.headers)
                for (const key of Object.keys(options.headers))
                    this.setHeader(key, options.headers[key]);
            if (
                host &&
                !this.getHeader("host") &&
                (options.setHost === undefined || options.setHost)
            ) {
                let field = host;
                const colon = field.indexOf(":");
                if (
                    colon !== -1 &&
                    field.includes(":", colon + 1) &&
                    field.charCodeAt(0) !== 91
                )
                    field = "[" + field + "]";
                if (port && +port !== defaultPort) field += ":" + port;
                this.setHeader("Host", field);
            }
            if (options.auth && !this.getHeader("Authorization"))
                this.setHeader(
                    "Authorization",
                    "Basic " + Buffer.from(options.auth).toString("base64"),
                );
            if (this.getHeader("expect")) this._implicitHeader();
        } else
            this._compose(
                this.method + " " + this.path + " HTTP/1.1\r\n",
                options.headers,
            );
        const connectOptions = Object.assign({}, options);
        delete connectOptions.signal;
        if (agent) agent.addRequest(this, connectOptions);
        else {
            this._last = true;
            this.shouldKeepAlive = false;
            this.onSocket(
                typeof options.createConnection === "function"
                    ? options.createConnection(connectOptions)
                    : net.createConnection(connectOptions),
            );
        }
        if (options.signal) {
            const signal = options.signal,
                abort = () =>
                    this.destroy(
                        codedError("ABORT_ERR", "The operation was aborted"),
                    );
            if (signal.aborted) abort();
            else if (typeof signal.addEventListener === "function") {
                this._abortSignal = signal;
                this._abortListener = abort;
                signal.addEventListener("abort", abort, { once: true });
            }
        }
    }
    _implicitHeader() {
        if (this._header !== null) throw headersSentError("render");
        this._compose(this.method + " " + this.path + " HTTP/1.1\r\n", this);
    }
    abort() {
        if (this.aborted) return;
        this.aborted = true;
        defer(this, "_abortTask");
        this.destroy();
    }
    _abortTask() {
        this.emit("abort");
    }
    destroy(error) {
        if (this.destroyed) return this;
        this.destroyed = true;
        if (this.res) this.res._dump();
        this._destroyError = error;
        if (this.socket && this._chunks !== null) {
            this._destroyChunks = this._chunks;
            // Stream tasks run before the socket's close task, including when
            // destroy is called from its deferred assignment or abort task.
            defer(this, "_finishDestroyWrites");
        }
        this._clearRequest();
        if (this.socket) this.socket.destroy(error);
        else if (this._queuedAgentName !== undefined)
            this.agent._cancelRequest(this);
        else if (!this._offeredSocket) defer(this, "_finishDestroy");
        return this;
    }
    _flushChunks(error) {
        // Auto-uncork may run before a destroyed socket's error/close task.
        // Leave its batch for that task so the original error and ordering
        // survive instead of sending it to an already destroyed transport.
        if (this.socket && this.socket.destroyed && !this.destroyed) return;
        super._flushChunks(error);
    }
    _finishDestroyWrites(error) {
        const chunks = this._destroyChunks || this._chunks;
        this._destroyChunks = null;
        this._clearRequest();
        if (!chunks) return;
        // Socket error/close tasks also run before auto-uncork. Detach the
        // batch before user callbacks can destroy or uncork the request again.
        const emitError = error || this._destroyError;
        if (!error)
            error =
                this._destroyError ||
                codedError(
                    "ERR_STREAM_DESTROYED",
                    "Cannot call write after a stream was destroyed",
                );
        if (emitError) this._error(error);
        for (let i = 2; i < chunks.length; i += 3) {
            const callback = chunks[i];
            if (callback) callback(error);
        }
    }
    _clearRequest() {
        // Queued writes have no socket to complete their callbacks. Assigned
        // corked writes keep their completion task across this cleanup.
        this._output = null;
        this._outputSize = 0;
        this._chunks = null;
        this._chunkLength = 0;
        if (this._connectListener && this.socket)
            this.socket.removeListener("connect", this._connectListener);
        this._connectListener = null;
        if (this._abortSignal) {
            this._abortSignal.removeEventListener("abort", this._abortListener);
            this._abortSignal = null;
            this._abortListener = null;
        }
        if (this.destroyed) {
            this.removeAllListeners("response");
            this.removeAllListeners("finish");
            this.removeAllListeners("socket");
            this.removeAllListeners("timeout");
        }
    }
    _finishDestroy() {
        if (this._closed) return;
        const error = this._destroyError;
        this._destroyError = null;
        this._error(
            error ||
                (!this.res && (!this.aborted || this.socket)
                    ? hangUp("socket hang up")
                    : null),
        );
        this._closed = true;
        this.emit("close");
    }
    _error(error) {
        if (error === null || this._errorEmitted) return;
        this._errorEmitted = true;
        this.emit("error", error);
    }
    // A deferred stream task, like the process.nextTick Node.js uses: it runs
    // before the 'close' of a response whose 'end' freed the socket.
    onSocket(socket) {
        this._offeredSocket = socket;
        defer(this, "_offeredSocketTask");
    }
    _offeredSocketTask() {
        const socket = this._offeredSocket;
        this._offeredSocket = null;
        this._useSocket(socket);
    }
    _useSocket(socket) {
        if (this.destroyed) {
            // The offer itself is deferred. Cancellation may have happened
            // after the Agent dequeued us but before this task could run.
            if (this.agent) this.agent._release(socket);
            else socket.destroy();
            this._finishDestroy();
            return;
        }
        this.socket = socket;
        socket._httpMessage = this;
        socket._consumer = new ResponseReader(this, socket);
        socket.on("error", onClientSocketError);
        socket.on("close", onClientSocketClose);
        if (this.timeout !== undefined)
            socket.on("timeout", onClientSocketTimeout);
        this.emit("socket", socket);
        if (this.destroyed) return;
        if (socket.connecting) {
            this._connectListener = () => this._flushWhenReady();
            socket.once("connect", this._connectListener);
        } else this._flushWhenReady();
    }
    _flushWhenReady() {
        this._connectListener = null;
        const socket = this.socket;
        if (socket === null || socket._httpMessage !== this || socket.destroyed)
            return;
        if (this._output !== null) this._flushOutput();
    }
    _afterFinish() {
        this._requestDone = true;
        if (this._responseEnded) this._release();
    }
    /** Response complete and request finished: the socket goes back to the agent (or closes). */
    _release() {
        if (this._released) return;
        this._released = true;
        this._clearRequest();
        const socket = this.socket;
        socket.removeListener("error", onClientSocketError);
        socket.removeListener("close", onClientSocketClose);
        socket.removeListener("timeout", onClientSocketTimeout);
        socket._consumer = null;
        if (this.timeout !== undefined) socket.setTimeout(0);
        if (this.res) this.res.socket = null;
        queueMicrotask(() => {
            if (!this._closed) {
                this._closed = true;
                this.emit("close");
            }
            if (this.agent) this.agent._release(socket);
            else socket.destroy();
        });
    }
    setTimeout(msecs, callback) {
        if (callback) this.once("timeout", callback);
        this.timeout = msecs;
        const socket = this.socket;
        if (socket) {
            socket.setTimeout(msecs);
            socket.removeListener("timeout", onClientSocketTimeout);
            socket.on("timeout", onClientSocketTimeout);
        } else this.once("socket", (socket) => socket.setTimeout(msecs));
        return this;
    }
    setNoDelay(noDelay) {
        if (this.socket) this.socket.setNoDelay(noDelay);
        else this.once("socket", (socket) => socket.setNoDelay(noDelay));
    }
    setSocketKeepAlive(enable, delay) {
        if (this.socket) this.socket.setKeepAlive(enable, delay);
        else
            this.once("socket", (socket) => socket.setKeepAlive(enable, delay));
    }
    clearTimeout(callback) {
        this.setTimeout(0, callback);
    }
}
function onClientSocketError(error) {
    const req = this._httpMessage;
    if (!req) return;
    this._hadError = true;
    req._destroyError = error;
    req._finishDestroyWrites(error);
    req._error(error);
}
function onClientSocketClose() {
    const req = this._httpMessage;
    if (!req || req.socket !== this) return;
    this._httpMessage = null;
    this._consumer = null;
    this.removeListener("error", onClientSocketError);
    this.removeListener("close", onClientSocketClose);
    this.removeListener("timeout", onClientSocketTimeout);
    req.destroyed = true;
    req._finishDestroyWrites();
    const res = req.res;
    if (res) {
        if (!res.complete) res.destroy(hangUp("aborted"));
        req._finishDestroy();
        if (!res.aborted && res.readable) res.push(null);
    } else {
        req._finishDestroy();
    }
}
function onClientSocketTimeout() {
    const req = this._httpMessage;
    if (!req) return;
    if (req.res) req.res.emit("timeout");
    req.emit("timeout");
}
/**
 * Reads responses for a ClientRequest from its socket: the head is
 * collected as latin1 text, the body is copied out of the read buffer.
 */
class ResponseReader {
    constructor(req, socket) {
        this.req = req;
        this.socket = socket;
        this.text = "";
        this.res = null;
        this.mode = 0; // 0 head, 1 fixed length, 2 chunked, 3 until EOF, 4 done
        this.remaining = 0;
        this.decoder = null;
    }
    onData(data, n) {
        let start = 0;
        while (start < n && this.mode !== 4) {
            if (this.mode === 0) {
                const before = this.text.length;
                this.text += latin1(data, start, n);
                const end = this.text.indexOf("\r\n\r\n");
                if (end < 0) {
                    if (this.text.length > maxHeaderSize) {
                        this.fail(
                            parseError("HPE_HEADER_OVERFLOW", data, start, n),
                        );
                        return;
                    }
                    return;
                }
                const consumed = end + 4 - before;
                const head = this.text.slice(0, end);
                this.text = "";
                start += consumed;
                const next = this.head(head, data, start, n);
                if (next === -1) return;
                if (next === -2) continue; // informational response: read the next head
            } else if (this.mode === 1) {
                const take = Math.min(this.remaining, n - start);
                const chunk = sliceBytes(
                    data,
                    start,
                    start + take,
                    bufferPrototype,
                );
                start += take;
                this.remaining -= take;
                this.deliver(chunk);
                if (this.remaining === 0) this.complete([]);
            } else if (this.mode === 2) {
                const result = this.decoder.feed(data, start, n);
                if (result === -2) {
                    this.fail(
                        parseError("HPE_INVALID_CHUNK_SIZE", data, start, n),
                    );
                    return;
                }
                if (result === -1) return;
                start = result;
                this.complete(this.decoder.trailers);
            } else {
                const chunk = sliceBytes(data, start, n, bufferPrototype);
                start = n;
                this.deliver(chunk);
            }
        }
    }
    deliver(chunk) {
        const res = this.res;
        if (
            !res._destroyed &&
            res.push(chunk) === false &&
            !this.socket.isPaused()
        ) {
            res._socketPaused = true;
            this.socket.pause();
        }
    }
    /** Parses a response head; returns -1 to stop, -2 after an informational response, else 0. */
    head(text, data, bodyStart, end) {
        const req = this.req;
        const lines = text.split("\r\n");
        const status = /^HTTP\/(\d)\.(\d) (\d{3})(?: (.*))?$/.exec(lines[0]);
        if (status === null) {
            if (/^HTTP\/\d\.\d /.test(lines[0]))
                this.fail(parseError("HPE_INVALID_STATUS"));
            else
                this.fail(
                    parseError(
                        "HPE_INVALID_CONSTANT",
                        null,
                        0,
                        0,
                        "Expected HTTP/, RTSP/ or ICE/",
                    ),
                );
            return -1;
        }
        const raw = [];
        let length = null,
            chunked = false,
            encoding = false,
            connection = "";
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i],
                colon = line.indexOf(":");
            if (colon <= 0 || !isToken(line.slice(0, colon))) {
                this.fail(parseError("HPE_INVALID_HEADER_TOKEN"));
                return -1;
            }
            const name = line.slice(0, colon),
                value = line.slice(colon + 1).replace(/^[ \t]+|[ \t]+$/g, "");
            raw.push(name, value);
            const key = lowerName(name);
            if (key === "content-length") {
                if (
                    !/^\d+$/.test(value) ||
                    (length !== null && length !== Number(value))
                ) {
                    this.fail(parseError("HPE_INVALID_CONTENT_LENGTH"));
                    return -1;
                }
                length = Number(value);
            } else if (key === "transfer-encoding") {
                encoding = true;
                chunked = /(?:^|,)\s*chunked\s*$/i.test(value);
            } else if (key === "connection")
                connection += (connection ? "," : "") + value;
        }
        const major = Number(status[1]),
            minor = Number(status[2]),
            code = Number(status[3]);
        const res = new IncomingMessage(this.socket);
        res.httpVersionMajor = major;
        res.httpVersionMinor = minor;
        res.httpVersion = major + "." + minor;
        res.statusCode = code;
        res.statusMessage = status[4] === undefined ? "" : status[4];
        res._raw = raw;
        res.joinDuplicateHeaders = req.joinDuplicateHeaders;
        if (code >= 100 && code < 200 && code !== 101) {
            if (code === 100) req.emit("continue");
            req.emit("information", {
                statusCode: code,
                statusMessage: res.statusMessage,
                httpVersion: res.httpVersion,
                httpVersionMajor: major,
                httpVersionMinor: minor,
                headers: res.headers,
                rawHeaders: raw,
            });
            return -2;
        }
        if (
            code === 101 ||
            (req.method === "CONNECT" && code >= 200 && code < 300)
        ) {
            this.mode = 4;
            req.res = res;
            res.req = req;
            req.upgradeOrConnect = true;
            const socket = this.socket,
                event = req.method === "CONNECT" ? "connect" : "upgrade";
            socket._consumer = null;
            socket.removeListener("error", onClientSocketError);
            socket.removeListener("close", onClientSocketClose);
            socket.removeListener("timeout", onClientSocketTimeout);
            socket._httpMessage = null;
            const head = Buffer.allocUnsafe(end - bodyStart);
            copyBytes(data, bodyStart, end, head, 0);
            if (hasListener(req, event)) {
                if (socket._agent) {
                    socket.removeListener("close", onAgentSocketClose);
                    socket.removeListener("timeout", onAgentSocketTimeout);
                    socket._agent.removeSocket(socket);
                }
                req._clearRequest();
                req.emit(event, res, socket, head);
                req.destroyed = true;
                req._closed = true;
                req.emit("close");
            } else socket.destroy();
            return -1;
        }
        const http11 = major === 1 && minor === 1;
        let keepAlive = http11
            ? !closeToken.test(connection)
            : keepAliveToken.test(connection);
        const noBody = req.method === "HEAD" || code === 204 || code === 304;
        if (noBody) this.mode = 4;
        else if (chunked) {
            this.mode = 2;
            this.decoder = new ChunkedDecoder((chunk) => this.deliver(chunk));
        } else if (length !== null) {
            this.mode = length === 0 ? 4 : 1;
            this.remaining = length;
        } else {
            this.mode = 3;
            keepAlive = false;
        }
        this.res = res;
        req.res = res;
        res.req = req;
        if (req.shouldKeepAlive && !keepAlive) req.shouldKeepAlive = false;
        const hint = res.headers["keep-alive"];
        if (typeof hint === "string") {
            const match = /timeout=(\d+)/.exec(hint);
            if (match)
                this.socket._keepAliveHint = Math.max(
                    0,
                    Number(match[1]) * 1000 - 1000,
                );
        }
        res.on("end", onResponseEnd);
        if (req.aborted || !req.emit("response", res)) res._dump();
        if (this.mode === 4) this.complete([]);
        return 0;
    }
    complete(trailers) {
        this.mode = 4;
        const res = this.res;
        res.rawTrailers = trailers;
        res.complete = true;
        res.push(null);
    }
    onEnd() {
        const req = this.req;
        if (this.mode === 3) {
            this.complete([]);
            this.socket.destroy();
            return;
        }
        if (!req.res && !this.socket._hadError) {
            this.socket._hadError = true;
            req._error(hangUp("socket hang up"));
        }
        if (req.res && !req.res.complete) req.res.destroy(hangUp("aborted"));
        this.socket.destroy();
    }
    fail(error) {
        this.mode = 4;
        const socket = this.socket;
        socket._consumer = null;
        socket.destroy();
        socket._hadError = true;
        this.req._error(error);
    }
}
function onResponseEnd() {
    const req = this.req,
        socket = req.socket;
    req._responseEnded = true;
    if (!req.shouldKeepAlive) {
        if (socket && socket.writable) socket.destroySoon();
    } else if (req._requestDone) req._release();
}

export function request(url, options, callback) {
    return new ClientRequest(url, options, callback);
}
export function get(url, options, callback) {
    const req = request(url, options, callback);
    req.end();
    return req;
}
export function setMaxIdleHTTPParsers(max) {}
export default {
    METHODS,
    STATUS_CODES,
    Agent,
    ClientRequest,
    IncomingMessage,
    OutgoingMessage,
    Server,
    ServerResponse,
    createServer,
    validateHeaderName,
    validateHeaderValue,
    get,
    request,
    setMaxIdleHTTPParsers,
    maxHeaderSize,
    get globalAgent() {
        return globalAgent;
    },
    set globalAgent(value) {
        globalAgent = value;
    },
};
