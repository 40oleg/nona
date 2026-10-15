// node:zlib (issue #302): Nona's own DEFLATE codec with raw, zlib and gzip
// framing, Adler-32 and CRC-32, and the synchronous API. The engines are
// incremental: an Inflater takes input in chunks and resumes where the
// previous chunk ended, a Deflater compresses chunk by chunk and honours the
// zlib flush modes, so that the stream classes can drive them.
// Brotli and Zstandard are not provided.
import { Buffer } from "node:buffer";

// ---- constants ------------------------------------------------------------

const Z_NO_FLUSH = 0,
    Z_PARTIAL_FLUSH = 1,
    Z_SYNC_FLUSH = 2,
    Z_FULL_FLUSH = 3,
    Z_FINISH = 4,
    Z_BLOCK = 5;
const Z_FILTERED = 1,
    Z_HUFFMAN_ONLY = 2,
    Z_RLE = 3,
    Z_FIXED = 4,
    Z_DEFAULT_STRATEGY = 0;
const DEFLATE = 1,
    INFLATE = 2,
    GZIP = 3,
    GUNZIP = 4,
    DEFLATERAW = 5,
    INFLATERAW = 6,
    UNZIP = 7;

const constants = Object.assign(Object.create(null), {
    Z_NO_FLUSH: 0,
    Z_PARTIAL_FLUSH: 1,
    Z_SYNC_FLUSH: 2,
    Z_FULL_FLUSH: 3,
    Z_FINISH: 4,
    Z_BLOCK: 5,
    Z_OK: 0,
    Z_STREAM_END: 1,
    Z_NEED_DICT: 2,
    Z_ERRNO: -1,
    Z_STREAM_ERROR: -2,
    Z_DATA_ERROR: -3,
    Z_MEM_ERROR: -4,
    Z_BUF_ERROR: -5,
    Z_VERSION_ERROR: -6,
    Z_NO_COMPRESSION: 0,
    Z_BEST_SPEED: 1,
    Z_BEST_COMPRESSION: 9,
    Z_DEFAULT_COMPRESSION: -1,
    Z_FILTERED: 1,
    Z_HUFFMAN_ONLY: 2,
    Z_RLE: 3,
    Z_FIXED: 4,
    Z_DEFAULT_STRATEGY: 0,
    ZLIB_VERNUM: 4880,
    DEFLATE: 1,
    INFLATE: 2,
    GZIP: 3,
    GUNZIP: 4,
    DEFLATERAW: 5,
    INFLATERAW: 6,
    UNZIP: 7,
    BROTLI_DECODE: 8,
    BROTLI_ENCODE: 9,
    Z_MIN_WINDOWBITS: 8,
    Z_MAX_WINDOWBITS: 15,
    Z_DEFAULT_WINDOWBITS: 15,
    Z_MIN_CHUNK: 64,
    Z_MAX_CHUNK: Infinity,
    Z_DEFAULT_CHUNK: 16384,
    Z_MIN_MEMLEVEL: 1,
    Z_MAX_MEMLEVEL: 9,
    Z_DEFAULT_MEMLEVEL: 8,
    Z_MIN_LEVEL: -1,
    Z_MAX_LEVEL: 9,
    Z_DEFAULT_LEVEL: -1,
});

const codes = {
    Z_OK: 0,
    Z_STREAM_END: 1,
    Z_NEED_DICT: 2,
    Z_ERRNO: -1,
    Z_STREAM_ERROR: -2,
    Z_DATA_ERROR: -3,
    Z_MEM_ERROR: -4,
    Z_BUF_ERROR: -5,
    Z_VERSION_ERROR: -6,
};
for (const name of Object.keys(codes)) codes[codes[name]] = name;
Object.freeze(codes);

// ---- errors and argument validation ---------------------------------------

/** The error zlib reports for corrupt or truncated data (code Z_DATA_ERROR, Z_BUF_ERROR, Z_NEED_DICT). */
function zlibError(message, errno) {
    const error = new Error(message);
    error.errno = errno;
    error.code = codes[errno];
    return error;
}
function dataError(message) {
    return zlibError(message, -3);
}

/** Node's description of a received argument ("Received type number (5)"). */
function received(value) {
    if (value == null) return " Received " + value;
    if (typeof value === "function")
        return " Received function " + (value.name || "<anonymous>");
    if (typeof value === "object") {
        const constructor = value.constructor;
        if (constructor && constructor.name)
            return " Received an instance of " + constructor.name;
        return " Received [Object: null prototype]";
    }
    let shown;
    if (typeof value === "string") {
        shown = value.length > 28 ? value.slice(0, 25) + "..." : value;
        shown = "'" + shown + "'";
    } else if (typeof value === "bigint") shown = value + "n";
    else shown = String(value);
    return " Received type " + typeof value + " (" + shown + ")";
}
function invalidArgType(name, expected, value) {
    const error = new TypeError(
        'The "' +
            name +
            '" ' +
            (name.includes(".") ? "property" : "argument") +
            " must be " +
            expected +
            "." +
            received(value),
    );
    error.code = "ERR_INVALID_ARG_TYPE";
    return error;
}
function formatNumber(value) {
    if (Number.isInteger(value) && Math.abs(value) > 2 ** 32) {
        let digits = String(Math.abs(value)),
            result = "";
        while (digits.length > 3) {
            result = "_" + digits.slice(-3) + result;
            digits = digits.slice(0, -3);
        }
        return (value < 0 ? "-" : "") + digits + result;
    }
    return String(value);
}
function outOfRange(name, range, value) {
    const error = new RangeError(
        'The value of "' +
            name +
            '" is out of range. It must be ' +
            range +
            ". Received " +
            formatNumber(value),
    );
    error.code = "ERR_OUT_OF_RANGE";
    return error;
}
function unsupported(name) {
    return function () {
        const error = new Error("zlib." + name + " is not supported by Nona");
        error.code = "ERR_NONA_UNSUPPORTED";
        throw error;
    };
}

/** false when number is undefined or NaN (use the default); throws for other non-finite values. */
function checkFiniteNumber(number, name) {
    if (number === undefined) return false;
    if (Number.isFinite(number)) return true;
    if (Number.isNaN(number)) return false;
    if (typeof number !== "number")
        throw invalidArgType(name, "of type number", number);
    throw outOfRange(name, "a finite number", number);
}
function checkRange(number, name, lower, upper, def) {
    if (!checkFiniteNumber(number, name)) return def;
    if (number < lower || number > upper)
        throw outOfRange(name, ">= " + lower + " and <= " + upper, number);
    return number;
}

function viewBytes(view) {
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}
/** The bytes of a zlib function's input (string, ArrayBuffer or any ArrayBuffer view). */
function inputBytes(buffer) {
    if (typeof buffer === "string") return viewBytes(Buffer.from(buffer));
    if (ArrayBuffer.isView(buffer)) return viewBytes(buffer);
    if (
        buffer instanceof ArrayBuffer ||
        (typeof SharedArrayBuffer === "function" &&
            buffer instanceof SharedArrayBuffer)
    )
        return new Uint8Array(buffer);
    throw invalidArgType(
        "buffer",
        "of type string or an instance of Buffer, TypedArray, DataView, or ArrayBuffer",
        buffer,
    );
}

const kMaxLength = 2 ** 53 - 1;

/** Node's validation and defaults of the zlib options for a mode (DEFLATE ... UNZIP). */
function zlibOptions(mode, opts) {
    const inflating = mode === INFLATE || mode === GUNZIP || mode === UNZIP;
    const options = {
        chunkSize: 16384,
        windowBits: inflating ? 0 : 15,
        level: -1,
        memLevel: 8,
        strategy: Z_DEFAULT_STRATEGY,
        dictionary: undefined,
        flush: Z_NO_FLUSH,
        finishFlush: Z_FINISH,
        maxOutputLength: kMaxLength,
        info: false,
    };
    if (opts == null || typeof opts !== "object") return options;
    if (checkFiniteNumber(opts.chunkSize, "options.chunkSize")) {
        if (opts.chunkSize < 64)
            throw outOfRange("options.chunkSize", ">= 64", opts.chunkSize);
        options.chunkSize = opts.chunkSize;
    }
    if ((opts.windowBits == null || opts.windowBits === 0) && inflating)
        options.windowBits = 0;
    else if (mode === GZIP && opts.windowBits === 8)
        throw outOfRange("options.windowBits", ">= 9 and <= 15", 8);
    else
        options.windowBits = checkRange(
            opts.windowBits,
            "options.windowBits",
            8,
            15,
            15,
        );
    options.level = checkRange(opts.level, "options.level", -1, 9, -1);
    options.memLevel = checkRange(opts.memLevel, "options.memLevel", 1, 9, 8);
    options.strategy = checkRange(
        opts.strategy,
        "options.strategy",
        Z_DEFAULT_STRATEGY,
        Z_FIXED,
        Z_DEFAULT_STRATEGY,
    );
    let dictionary = opts.dictionary;
    if (dictionary !== undefined) {
        if (ArrayBuffer.isView(dictionary)) dictionary = viewBytes(dictionary);
        else if (dictionary instanceof ArrayBuffer)
            dictionary = new Uint8Array(dictionary);
        else
            throw invalidArgType(
                "options.dictionary",
                "an instance of Buffer, TypedArray, DataView, or ArrayBuffer",
                dictionary,
            );
        options.dictionary = dictionary;
    }
    options.flush = checkRange(
        opts.flush,
        "options.flush",
        Z_NO_FLUSH,
        Z_BLOCK,
        Z_NO_FLUSH,
    );
    options.finishFlush = checkRange(
        opts.finishFlush,
        "options.finishFlush",
        Z_NO_FLUSH,
        Z_BLOCK,
        Z_FINISH,
    );
    options.maxOutputLength = checkRange(
        opts.maxOutputLength,
        "options.maxOutputLength",
        1,
        kMaxLength,
        kMaxLength,
    );
    options.info = !!opts.info;
    return options;
}

// ---- checksums -------------------------------------------------------------

const crcTables = new Int32Array(1024);

/** CRC-32 (gzip polynomial) of bytes[start, end) continuing from crc. */
function crc32Update(crc, bytes, start, end) {
    const t = crcTables;
    let c = ~crc,
        i = start;
    for (const last = end - 4; i <= last; i += 4) {
        c ^=
            bytes[i] |
            (bytes[i + 1] << 8) |
            (bytes[i + 2] << 16) |
            (bytes[i + 3] << 24);
        c =
            t[768 + (c & 255)] ^
            t[512 + ((c >>> 8) & 255)] ^
            t[256 + ((c >>> 16) & 255)] ^
            t[c >>> 24];
    }
    for (; i < end; i++) c = t[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return ~c >>> 0;
}

/** Adler-32 of bytes[start, end) continuing from adler. */
function adler32Update(adler, bytes, start, end) {
    let a = adler & 0xffff,
        b = adler >>> 16,
        i = start;
    while (i < end) {
        const stop = Math.min(end, i + 5552);
        for (; i < stop; i++) {
            a += bytes[i];
            b += a;
        }
        a %= 65521;
        b %= 65521;
    }
    return ((b << 16) | a) >>> 0;
}

function crc32(data, value = 0) {
    let bytes;
    if (typeof data === "string") bytes = viewBytes(Buffer.from(data));
    else if (ArrayBuffer.isView(data)) bytes = viewBytes(data);
    else
        throw invalidArgType(
            "data",
            "of type string or an instance of Buffer, TypedArray, or DataView",
            data,
        );
    if (typeof value !== "number")
        throw invalidArgType("value", "of type number", value);
    if (!Number.isInteger(value))
        throw outOfRange("value", "an integer", value);
    if (value < 0 || value > 4294967295)
        throw outOfRange("value", ">= 0 && <= 4294967295", value);
    initTables();
    return crc32Update(value, bytes, 0, bytes.length);
}

// ---- DEFLATE tables --------------------------------------------------------

const LENGTH_BASE = new Uint16Array([
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67,
    83, 99, 115, 131, 163, 195, 227, 258,
]);
const LENGTH_EXTRA = new Uint8Array([
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5,
    5, 5, 5, 0,
]);
const DIST_BASE = new Uint16Array([
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513,
    769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
]);
const DIST_EXTRA = new Uint8Array([
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10,
    11, 11, 12, 12, 13, 13,
]);
/** The order in which a dynamic block header lists the code length code lengths. */
const CODE_LENGTH_ORDER = new Uint8Array([
    16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
]);

/** Code index (0..28) of a match length minus 3. */
const LENGTH_CODE = new Uint8Array(256);
/** Code (0..29) of a match distance minus 1: [dist] below 256, [256 + (dist >> 7)] above. */
const DIST_CODE = new Uint8Array(512);
function distCode(dist) {
    return dist < 256 ? DIST_CODE[dist] : DIST_CODE[256 + (dist >>> 7)];
}

function reverseBits(code, length) {
    let result = 0;
    for (let i = 0; i < length; i++) {
        result = (result << 1) | (code & 1);
        code >>>= 1;
    }
    return result;
}

/** Canonical Huffman codes (bit-reversed, ready to send LSB first) for lengths[0, n). */
function canonicalCodes(lengths, n, codesOut) {
    const count = new Uint16Array(16),
        next = new Uint16Array(16);
    for (let i = 0; i < n; i++) count[lengths[i]]++;
    count[0] = 0;
    let code = 0;
    for (let bits = 1; bits < 16; bits++) {
        code = (code + count[bits - 1]) << 1;
        next[bits] = code;
    }
    for (let i = 0; i < n; i++) {
        const length = lengths[i];
        codesOut[i] = length ? reverseBits(next[length]++, length) : 0;
    }
}

// ---- inflate ---------------------------------------------------------------

const FAST_BITS = 9,
    FAST_MASK = (1 << FAST_BITS) - 1;

/** A decoding table: count[len] and symbols in canonical order for slow decoding, plus a 9-bit lookup table. */
class HuffmanTable {
    constructor(symbols) {
        this.count = new Uint16Array(16);
        this.symbols = new Uint16Array(symbols);
        this.offsets = new Uint16Array(16);
        // sym << 4 | length for codes of at most FAST_BITS bits, 0 otherwise.
        this.fast = new Int32Array(1 << FAST_BITS);
    }
    /** Build from lengths[start, start + n). 0: complete, 1: incomplete, -1: over-subscribed; max is in this.max. */
    build(lengths, start, n) {
        const count = this.count,
            offsets = this.offsets,
            symbols = this.symbols,
            fast = this.fast;
        count.fill(0);
        for (let i = 0; i < n; i++) count[lengths[start + i]]++;
        count[0] = 0;
        let max = 15;
        while (max > 0 && count[max] === 0) max--;
        this.max = max;
        if (max === 0) {
            // No codes at all: zlib accepts it, any code read is invalid.
            this.fast.fill(0);
            return 0;
        }
        let left = 1;
        for (let len = 1; len < 16; len++) {
            left = (left << 1) - count[len];
            if (left < 0) return -1;
        }
        offsets[1] = 0;
        for (let len = 1; len < 15; len++)
            offsets[len + 1] = offsets[len] + count[len];
        for (let i = 0; i < n; i++) {
            const len = lengths[start + i];
            if (len) symbols[offsets[len]++] = i;
        }
        fast.fill(0);
        let code = 0,
            index = 0;
        for (let len = 1; len <= FAST_BITS; len++) {
            for (let k = 0; k < count[len]; k++) {
                const entry = (symbols[index++] << 4) | len;
                for (
                    let r = reverseBits(code++, len);
                    r <= FAST_MASK;
                    r += 1 << len
                )
                    fast[r] = entry;
            }
            code <<= 1;
        }
        return left > 0 ? 1 : 0;
    }
}

/** Decode a code longer than FAST_BITS bit by bit: (len << 16 | sym), -1 when bits run out, -2 for an invalid code. */
function slowDecode(table, bitBuf, bitCnt) {
    const count = table.count,
        symbols = table.symbols;
    if (table.max === 0) return bitCnt > 0 ? -2 : -1;
    let code = 0,
        first = 0,
        index = 0;
    for (let len = 1; len < 16; len++) {
        if (len > bitCnt) return -1;
        code |= (bitBuf >>> (len - 1)) & 1;
        const c = count[len];
        if (code - first < c)
            return (len << 16) | symbols[index + code - first];
        index += c;
        first = (first + c) << 1;
        code <<= 1;
    }
    return -2;
}

const fixedLengthTable = new HuffmanTable(288),
    fixedDistTable = new HuffmanTable(32);

// Inflater formats and states.
const RAW = 0,
    ZLIB = 1,
    GZIP_FORMAT = 2,
    AUTO = 3;
const S_HEADER = 0,
    S_BLOCK = 1,
    S_STORED = 2,
    S_CODES = 3,
    S_TRAILER = 4,
    S_MEMBER_END = 5,
    S_DONE = 6;
const UNDERFLOW = { underflow: true };
const WINDOW = 32768;

/**
 * Incremental inflate. push(bytes, final) consumes input and decodes as far
 * as it can; when a chunk ends inside a symbol or a header, the Inflater
 * rewinds to the start of that piece and resumes there with the next chunk.
 * Output accumulates in this.out from this.outStart to this.outLen;
 * takeOutput() returns it and keeps the last 32 KiB as the window.
 */
class Inflater {
    constructor(format, windowBits, dictionary) {
        initTables();
        this.format = format;
        this.windowBits = windowBits;
        this.dictionary = dictionary;
        this.inp = new Uint8Array(0);
        this.pos = 0;
        this.end = 0;
        this.bitBuf = 0;
        this.bitCnt = 0;
        this.out = new Uint8Array(1024);
        this.outLen = 0;
        this.outStart = 0;
        this.histStart = 0;
        this.checkPos = 0;
        this.check = 0;
        this.total = 0;
        this.state = S_HEADER;
        this.last = false;
        this.stored = 0;
        this.lengthTable = fixedLengthTable;
        this.distTable = fixedDistTable;
        this.dynLength = null;
        this.dynDist = null;
        this.lengths = null;
        this.limit = kMaxLength;
        if (format === RAW) {
            this.state = S_BLOCK;
            if (dictionary) this.preset(dictionary);
        }
    }
    get ended() {
        return this.state === S_DONE;
    }
    /** Put a preset dictionary into the window in front of the output. */
    preset(dictionary) {
        const bytes =
            dictionary.length > WINDOW
                ? dictionary.subarray(dictionary.length - WINDOW)
                : dictionary;
        this.ensure(bytes.length);
        this.out.set(bytes, this.outLen);
        this.outLen += bytes.length;
        this.outStart = this.checkPos = this.outLen;
    }
    /** Make room for extra more output bytes; returns the (possibly new) buffer. */
    ensure(extra) {
        const need = this.outLen + extra;
        if (need > this.out.length) {
            if (need - this.outStart > this.limit + 258) this.tooLarge();
            let size = this.out.length * 2;
            while (size < need) size *= 2;
            const grown = new Uint8Array(size);
            grown.set(this.out.subarray(0, this.outLen));
            this.out = grown;
        }
        return this.out;
    }
    tooLarge() {
        const error = new RangeError(
            "Cannot create a Buffer larger than " + this.limit + " bytes",
        );
        error.code = "ERR_BUFFER_TOO_LARGE";
        throw error;
    }
    /** Fold the output not yet checksummed into the running check value. */
    updateCheck() {
        if (this.format !== RAW && this.checkPos < this.outLen) {
            this.check =
                this.format === ZLIB
                    ? adler32Update(
                          this.check,
                          this.out,
                          this.checkPos,
                          this.outLen,
                      )
                    : crc32Update(
                          this.check,
                          this.out,
                          this.checkPos,
                          this.outLen,
                      );
            this.total += this.outLen - this.checkPos;
        }
        this.checkPos = this.outLen;
    }
    /** The output decoded since the last call; the window keeps the last 32 KiB. */
    takeOutput() {
        const result = this.out.slice(this.outStart, this.outLen);
        this.updateCheck();
        if (this.outLen > 2 * WINDOW) {
            const shift = this.outLen - WINDOW;
            this.out.copyWithin(0, shift, this.outLen);
            this.outLen = WINDOW;
            this.checkPos = WINDOW;
            this.histStart = Math.max(0, this.histStart - shift);
        }
        this.outStart = this.outLen;
        return result;
    }
    /** Consume bytes; final marks the end of the input. Throws zlib errors. */
    push(bytes, final) {
        if (this.state !== S_DONE && bytes.length) {
            const rest = this.end - this.pos;
            if (rest === 0) {
                this.inp = bytes;
                this.pos = 0;
                this.end = bytes.length;
            } else {
                const joined = new Uint8Array(rest + bytes.length);
                joined.set(this.inp.subarray(this.pos, this.end));
                joined.set(bytes, rest);
                this.inp = joined;
                this.pos = 0;
                this.end = joined.length;
            }
        }
        this.run(final);
        if (final && this.state !== S_DONE)
            throw zlibError("unexpected end of file", -5);
    }
    /** Unconsumed input bytes (after the end of the stream, trailing data). */
    get remaining() {
        return this.end - this.pos + (this.bitCnt >>> 3);
    }
    need(n) {
        while (this.bitCnt < n) {
            if (this.pos >= this.end) throw UNDERFLOW;
            this.bitBuf |= this.inp[this.pos++] << this.bitCnt;
            this.bitCnt += 8;
        }
    }
    bits(n) {
        if (this.bitCnt < n) this.need(n);
        const value = this.bitBuf & ((1 << n) - 1);
        this.bitBuf >>>= n;
        this.bitCnt -= n;
        return value;
    }
    align() {
        const drop = this.bitCnt & 7;
        this.bitBuf >>>= drop;
        this.bitCnt -= drop;
    }
    byte() {
        if (this.bitCnt >= 8) {
            const value = this.bitBuf & 255;
            this.bitBuf >>>= 8;
            this.bitCnt -= 8;
            return value;
        }
        if (this.pos >= this.end) throw UNDERFLOW;
        return this.inp[this.pos++];
    }
    /** The byte the next byte() call returns, or -1 at the end of the input (aligned only). */
    peekByte() {
        if (this.bitCnt >= 8) return this.bitBuf & 255;
        return this.pos < this.end ? this.inp[this.pos] : -1;
    }
    run(final) {
        for (;;) {
            const pos = this.pos,
                bitBuf = this.bitBuf,
                bitCnt = this.bitCnt;
            try {
                switch (this.state) {
                    case S_HEADER:
                        this.header(final);
                        break;
                    case S_BLOCK:
                        this.blockHeader();
                        break;
                    case S_STORED:
                        if (!this.copyStored()) return;
                        break;
                    case S_CODES:
                        if (!this.codes()) return;
                        break;
                    case S_TRAILER:
                        this.trailer();
                        break;
                    case S_MEMBER_END:
                        if (!this.memberEnd(final)) return;
                        break;
                    default:
                        return;
                }
            } catch (error) {
                if (error !== UNDERFLOW) throw error;
                this.pos = pos;
                this.bitBuf = bitBuf;
                this.bitCnt = bitCnt;
                return;
            }
        }
    }
    header(final) {
        let format = this.format;
        if (format === AUTO) {
            const first = this.byte();
            if (first === 0x1f) {
                if (this.peekByte() < 0) throw UNDERFLOW;
                format = this.peekByte() === 0x8b ? GZIP_FORMAT : ZLIB;
            } else format = ZLIB;
            // Re-read the first byte as part of the header.
            this.bitBuf = (this.bitBuf << 8) | first;
            this.bitCnt += 8;
            this.format = format;
        }
        this.check = format === ZLIB ? 1 : 0;
        this.total = 0;
        this.histStart = this.outLen;
        this.checkPos = this.outLen;
        if (format === ZLIB) {
            const cmf = this.byte(),
                flg = this.byte();
            if (((cmf << 8) | flg) % 31)
                throw dataError("incorrect header check");
            if ((cmf & 15) !== 8) throw dataError("unknown compression method");
            const bits = (cmf >>> 4) + 8;
            if (this.windowBits === 0) this.windowBits = bits;
            if (bits > 15 || bits > this.windowBits)
                throw dataError("invalid window size");
            if (flg & 0x20) {
                const id =
                    ((this.byte() << 24) |
                        (this.byte() << 16) |
                        (this.byte() << 8) |
                        this.byte()) >>>
                    0;
                const dictionary = this.dictionary;
                if (!dictionary) throw zlibError("Missing dictionary", 2);
                if (adler32Update(1, dictionary, 0, dictionary.length) !== id)
                    throw zlibError("Bad dictionary", 2);
                this.preset(dictionary);
                this.checkPos = this.outLen;
            }
        } else {
            let crc = 0;
            const read = () => {
                const value = this.byte();
                crc = ~(crcTables[(~crc ^ value) & 255] ^ (~crc >>> 8));
                return value;
            };
            if (read() !== 0x1f || read() !== 0x8b)
                throw dataError("incorrect header check");
            if (read() !== 8) throw dataError("unknown compression method");
            const flags = read();
            if (flags & 0xe0) throw dataError("unknown header flags set");
            for (let i = 0; i < 6; i++) read();
            if (flags & 4) {
                let length = read();
                length |= read() << 8;
                while (length--) read();
            }
            if (flags & 8) while (read() !== 0);
            if (flags & 16) while (read() !== 0);
            if (flags & 2) {
                const expected = crc & 0xffff;
                const value = this.byte() | (this.byte() << 8);
                if (value !== expected) throw dataError("header crc mismatch");
            }
        }
        this.state = S_BLOCK;
    }
    blockHeader() {
        const header = this.bits(3);
        this.last = (header & 1) === 1;
        switch (header >>> 1) {
            case 0: {
                this.align();
                const length = this.byte() | (this.byte() << 8);
                const inverse = this.byte() | (this.byte() << 8);
                if ((length ^ 0xffff) !== inverse)
                    throw dataError("invalid stored block lengths");
                this.stored = length;
                this.state = S_STORED;
                return;
            }
            case 1:
                this.lengthTable = fixedLengthTable;
                this.distTable = fixedDistTable;
                this.state = S_CODES;
                return;
            case 2:
                this.dynamicHeader();
                this.state = S_CODES;
                return;
            default:
                throw dataError("invalid block type");
        }
    }
    dynamicHeader() {
        const nlen = this.bits(5) + 257,
            ndist = this.bits(5) + 1,
            ncode = this.bits(4) + 4;
        if (nlen > 286 || ndist > 30)
            throw dataError("too many length or distance symbols");
        if (!this.lengths) {
            this.lengths = new Uint8Array(320);
            this.dynLength = new HuffmanTable(288);
            this.dynDist = new HuffmanTable(32);
            this.codeTable = new HuffmanTable(19);
        }
        const lengths = this.lengths;
        lengths.fill(0, 0, 19);
        for (let i = 0; i < ncode; i++)
            lengths[CODE_LENGTH_ORDER[i]] = this.bits(3);
        const codeTable = this.codeTable;
        if (codeTable.build(lengths, 0, 19) !== 0)
            throw dataError("invalid code lengths set");
        const total = nlen + ndist;
        let have = 0;
        while (have < total) {
            let n, sym;
            if (codeTable.max === 0) {
                // zlib reads an empty code length code as 1-bit zero lengths.
                this.need(1);
                n = 1;
                sym = 0;
            } else {
                // The code length code is complete and at most 7 bits long.
                while (this.bitCnt < 7 && this.pos < this.end) {
                    this.bitBuf |= this.inp[this.pos++] << this.bitCnt;
                    this.bitCnt += 8;
                }
                const entry = codeTable.fast[this.bitBuf & FAST_MASK];
                n = entry & 15;
                sym = entry >>> 4;
                if (n === 0 || n > this.bitCnt) throw UNDERFLOW;
            }
            this.bitBuf >>>= n;
            this.bitCnt -= n;
            if (sym < 16) {
                lengths[have++] = sym;
                continue;
            }
            let value = 0,
                copy;
            if (sym === 16) {
                if (have === 0) throw dataError("invalid bit length repeat");
                value = lengths[have - 1];
                copy = 3 + this.bits(2);
            } else if (sym === 17) copy = 3 + this.bits(3);
            else copy = 11 + this.bits(7);
            if (have + copy > total)
                throw dataError("invalid bit length repeat");
            while (copy--) lengths[have++] = value;
        }
        if (lengths[256] === 0)
            throw dataError("invalid code -- missing end-of-block");
        let status = this.dynLength.build(lengths, 0, nlen);
        if (status < 0 || (status > 0 && this.dynLength.max !== 1))
            throw dataError("invalid literal/lengths set");
        status = this.dynDist.build(lengths, nlen, ndist);
        if (status < 0 || (status > 0 && this.dynDist.max !== 1))
            throw dataError("invalid distances set");
        this.lengthTable = this.dynLength;
        this.distTable = this.dynDist;
    }
    /** Copy what is available of a stored block; false when the input is exhausted. */
    copyStored() {
        while (this.stored > 0 && this.bitCnt >= 8) {
            this.ensure(1)[this.outLen++] = this.byte();
            this.stored--;
        }
        const n = Math.min(this.stored, this.end - this.pos);
        if (n > 0) {
            this.ensure(n).set(
                this.inp.subarray(this.pos, this.pos + n),
                this.outLen,
            );
            this.outLen += n;
            this.pos += n;
            this.stored -= n;
        }
        if (this.stored > 0) return false;
        this.state = this.last ? this.afterBlocks() : S_BLOCK;
        return true;
    }
    afterBlocks() {
        if (this.format === RAW) return S_DONE;
        this.align();
        return S_TRAILER;
    }
    /** Decode literals and matches up to the end of the block; false when the input is exhausted. */
    codes() {
        const inp = this.inp,
            end = this.end,
            lengthTable = this.lengthTable,
            distTable = this.distTable,
            lengthFast = lengthTable.fast,
            distFast = distTable.fast,
            hist = this.histStart;
        let pos = this.pos,
            bb = this.bitBuf,
            bc = this.bitCnt,
            out = this.out,
            ol = this.outLen;
        let cpPos = pos,
            cpBb = bb,
            cpBc = bc,
            status = 0;
        for (;;) {
            cpPos = pos;
            cpBb = bb;
            cpBc = bc;
            if (ol + 258 > out.length) {
                this.outLen = ol;
                out = this.ensure(258);
            }
            while (bc <= 24 && pos < end) {
                bb |= inp[pos++] << bc;
                bc += 8;
            }
            let entry = lengthFast[bb & FAST_MASK],
                n = entry & 15,
                sym = entry >>> 4;
            if (n === 0 || n > bc) {
                const decoded = slowDecode(lengthTable, bb, bc);
                if (decoded === -1) break;
                if (decoded === -2) {
                    status = 1;
                    break;
                }
                n = decoded >>> 16;
                sym = decoded & 0xffff;
            }
            bb >>>= n;
            bc -= n;
            if (sym < 256) {
                out[ol++] = sym;
                continue;
            }
            if (sym === 256) {
                status = 3;
                break;
            }
            sym -= 257;
            if (sym >= 29) {
                status = 1;
                break;
            }
            let length = LENGTH_BASE[sym];
            const lengthExtra = LENGTH_EXTRA[sym];
            if (lengthExtra) {
                if (bc < lengthExtra) break;
                length += bb & ((1 << lengthExtra) - 1);
                bb >>>= lengthExtra;
                bc -= lengthExtra;
            }
            while (bc <= 24 && pos < end) {
                bb |= inp[pos++] << bc;
                bc += 8;
            }
            entry = distFast[bb & FAST_MASK];
            n = entry & 15;
            sym = entry >>> 4;
            if (n === 0 || n > bc) {
                const decoded = slowDecode(distTable, bb, bc);
                if (decoded === -1) break;
                if (decoded === -2) {
                    status = 2;
                    break;
                }
                n = decoded >>> 16;
                sym = decoded & 0xffff;
            }
            bb >>>= n;
            bc -= n;
            if (sym >= 30) {
                status = 2;
                break;
            }
            let dist = DIST_BASE[sym];
            const distExtra = DIST_EXTRA[sym];
            if (distExtra) {
                while (bc <= 24 && pos < end) {
                    bb |= inp[pos++] << bc;
                    bc += 8;
                }
                if (bc < distExtra) break;
                dist += bb & ((1 << distExtra) - 1);
                bb >>>= distExtra;
                bc -= distExtra;
            }
            if (dist > ol - hist) {
                status = 4;
                break;
            }
            let from = ol - dist;
            if (dist >= length && length > 16) {
                out.copyWithin(ol, from, from + length);
                ol += length;
            } else
                for (const stop = ol + length; ol < stop;)
                    out[ol++] = out[from++];
        }
        this.outLen = ol;
        if (status === 3) {
            this.pos = pos;
            this.bitBuf = bb;
            this.bitCnt = bc;
            this.state = this.last ? this.afterBlocks() : S_BLOCK;
            return true;
        }
        this.pos = cpPos;
        this.bitBuf = cpBb;
        this.bitCnt = cpBc;
        if (status === 1) throw dataError("invalid literal/length code");
        if (status === 2) throw dataError("invalid distance code");
        if (status === 4) throw dataError("invalid distance too far back");
        return false;
    }
    trailer() {
        this.updateCheck();
        if (this.format === ZLIB) {
            const value =
                ((this.byte() << 24) |
                    (this.byte() << 16) |
                    (this.byte() << 8) |
                    this.byte()) >>>
                0;
            if (value !== this.check) throw dataError("incorrect data check");
            this.state = S_DONE;
            return;
        }
        const crc =
            (this.byte() |
                (this.byte() << 8) |
                (this.byte() << 16) |
                (this.byte() << 24)) >>>
            0;
        if (crc !== this.check) throw dataError("incorrect data check");
        const size =
            (this.byte() |
                (this.byte() << 8) |
                (this.byte() << 16) |
                (this.byte() << 24)) >>>
            0;
        if (size !== this.total >>> 0)
            throw dataError("incorrect length check");
        this.state = S_MEMBER_END;
    }
    /** After a gzip member: another member follows unless the input ends or continues with a zero byte (padding). */
    memberEnd(final) {
        const next = this.peekByte();
        if (next < 0) {
            if (final) this.state = S_DONE;
            return final;
        }
        if (next === 0) {
            this.state = S_DONE;
            return true;
        }
        this.state = S_HEADER;
        return true;
    }
}

// ---- deflate ---------------------------------------------------------------

const MIN_MATCH = 3,
    MAX_MATCH = 258,
    MIN_LOOKAHEAD = MAX_MATCH + MIN_MATCH + 1,
    TOO_FAR = 4096;
const NEED_MORE = 0,
    BLOCK_DONE = 1,
    FINISH_DONE = 2;
const L_CODES = 286,
    D_CODES = 30,
    BL_CODES = 19;

/** zlib's configuration per level: good_length, max_lazy, nice_length, max_chain, function (0 stored, 1 fast, 2 slow). */
const CONFIG = [
    [0, 0, 0, 0, 0],
    [4, 4, 8, 4, 1],
    [4, 5, 16, 8, 1],
    [4, 6, 32, 32, 1],
    [4, 4, 16, 16, 2],
    [8, 16, 32, 32, 2],
    [8, 16, 128, 128, 2],
    [8, 32, 128, 256, 2],
    [32, 128, 258, 1024, 2],
    [32, 258, 258, 4096, 2],
];

const fixedLengthLens = new Uint8Array(288),
    fixedLengthCodes = new Uint16Array(288),
    fixedDistLens = new Uint8Array(30).fill(5),
    fixedDistCodes = new Uint16Array(30);

/** Build the CRC-32 and Huffman tables on first use (cheap module loading). */
let tablesReady = false;
function initTables() {
    if (tablesReady) return;
    tablesReady = true;
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++)
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crcTables[n] = c;
    }
    for (let n = 0; n < 256; n++) {
        let c = crcTables[n];
        for (let k = 1; k < 4; k++) {
            c = crcTables[c & 255] ^ (c >>> 8);
            crcTables[k * 256 + n] = c;
        }
    }
    let length = 0;
    for (let code = 0; code < 28; code++)
        for (let n = 0; n < 1 << LENGTH_EXTRA[code]; n++)
            LENGTH_CODE[length++] = code;
    LENGTH_CODE[255] = 28;
    let dist = 0;
    for (let code = 0; code < 16; code++)
        for (let n = 0; n < 1 << DIST_EXTRA[code]; n++)
            DIST_CODE[dist++] = code;
    dist >>= 7;
    for (let code = 16; code < 30; code++)
        for (let n = 0; n < 1 << (DIST_EXTRA[code] - 7); n++)
            DIST_CODE[256 + dist++] = code;
    const lengths = new Uint8Array(320);
    lengths.fill(8, 0, 144);
    lengths.fill(9, 144, 256);
    lengths.fill(7, 256, 280);
    lengths.fill(8, 280, 288);
    lengths.fill(5, 288, 320);
    fixedLengthTable.build(lengths, 0, 288);
    fixedDistTable.build(lengths, 288, 32);
    fixedLengthLens.fill(8, 0, 144);
    fixedLengthLens.fill(9, 144, 256);
    fixedLengthLens.fill(7, 256, 280);
    fixedLengthLens.fill(8, 280, 288);
    canonicalCodes(fixedLengthLens, 288, fixedLengthCodes);
    for (let i = 0; i < 30; i++) fixedDistCodes[i] = reverseBits(i, 5);
}

/**
 * Code lengths limited to maxBits for freq[0, n) into lens (Huffman code by
 * the in-place Moffat-Katajainen method, then the counts are adjusted to the
 * limit). Uses at least two symbols so that every code is complete.
 */
function buildLengths(freq, n, maxBits, lens) {
    lens.fill(0, 0, n);
    const keys = [];
    for (let i = 0; i < n; i++) if (freq[i]) keys.push(freq[i] * 512 + i);
    if (keys.length < 2) {
        const used = keys.length ? keys[0] % 512 : -1;
        for (let i = 0; keys.length < 2; i++) if (i !== used) keys.push(i);
    }
    keys.sort((a, b) => a - b);
    const count = keys.length,
        a = new Int32Array(count);
    for (let i = 0; i < count; i++) a[i] = Math.floor(keys[i] / 512);
    // Moffat-Katajainen: a[] (ascending weights) becomes code lengths.
    a[0] += a[1];
    let root = 0,
        leaf = 2;
    for (let next = 1; next < count - 1; next++) {
        if (leaf >= count || a[root] < a[leaf]) {
            a[next] = a[root];
            a[root++] = next;
        } else a[next] = a[leaf++];
        if (leaf >= count || (root < next && a[root] < a[leaf])) {
            a[next] += a[root];
            a[root++] = next;
        } else a[next] += a[leaf++];
    }
    a[count - 2] = 0;
    for (let next = count - 3; next >= 0; next--) a[next] = a[a[next]] + 1;
    let avail = 1,
        used = 0,
        depth = 0;
    root = count - 2;
    let next = count - 1;
    while (avail > 0) {
        while (root >= 0 && a[root] === depth) {
            used++;
            root--;
        }
        while (avail > used) {
            a[next--] = depth;
            avail--;
        }
        avail = 2 * used;
        depth++;
        used = 0;
    }
    // Limit the lengths to maxBits, keeping the Kraft sum at exactly one.
    const num = new Int32Array(33);
    for (let i = 0; i < count; i++) num[Math.min(a[i], 32)]++;
    for (let i = maxBits + 1; i <= 32; i++) num[maxBits] += num[i];
    let total = 0;
    for (let i = maxBits; i > 0; i--) total += num[i] << (maxBits - i);
    while (total !== 1 << maxBits) {
        num[maxBits]--;
        for (let i = maxBits - 1; i > 0; i--)
            if (num[i]) {
                num[i]--;
                num[i + 1] += 2;
                break;
            }
        total--;
    }
    // The most frequent symbols (at the end of keys) get the shortest codes.
    let j = count;
    for (let len = 1; len <= maxBits; len++)
        for (let k = num[len]; k > 0; k--) lens[keys[--j] % 512] = len;
}

/**
 * Incremental deflate. push(bytes, flush) compresses the bytes and returns
 * the output produced; flush is a zlib flush mode (Z_NO_FLUSH keeps the tail
 * buffered, Z_SYNC_FLUSH/Z_FULL_FLUSH end on a byte boundary, Z_FINISH ends
 * the stream with the trailer).
 */
class Deflater {
    constructor(format, level, windowBits, memLevel, strategy, dictionary) {
        initTables();
        if (level === -1) level = 6;
        if (windowBits === 8) windowBits = 9;
        this.format = format;
        this.level = level;
        this.strategy = strategy;
        this.wbits = windowBits;
        this.wsize = 1 << windowBits;
        this.wmask = this.wsize - 1;
        this.windowSize = 2 * this.wsize;
        this.window = new Uint8Array(this.windowSize);
        this.prev = new Uint16Array(this.wsize);
        this.hashBits = memLevel + 7;
        this.hashSize = 1 << this.hashBits;
        this.hashMask = this.hashSize - 1;
        this.hashShift = Math.floor(
            (this.hashBits + MIN_MATCH - 1) / MIN_MATCH,
        );
        this.head = new Uint16Array(this.hashSize);
        this.insH = 0;
        const config = CONFIG[level];
        this.goodMatch = config[0];
        this.maxLazy = config[1];
        this.niceMatch = config[2];
        this.maxChain = config[3];
        this.func = config[4];
        this.strstart = 0;
        this.blockStart = 0;
        this.lookahead = 0;
        this.insert = 0;
        this.matchLength = MIN_MATCH - 1;
        this.prevLength = MIN_MATCH - 1;
        this.matchAvailable = false;
        this.matchStart = 0;
        this.prevMatch = 0;
        const litBufsize = 1 << (memLevel + 6);
        this.symDist = new Uint16Array(litBufsize);
        this.symLc = new Uint8Array(litBufsize);
        this.symNext = 0;
        this.symEnd = litBufsize - 1;
        this.lengthFreq = new Int32Array(L_CODES);
        this.distFreq = new Int32Array(D_CODES);
        this.blFreq = new Int32Array(BL_CODES);
        this.lengthLens = new Uint8Array(L_CODES);
        this.lengthCodes = new Uint16Array(L_CODES);
        this.distLens = new Uint8Array(D_CODES);
        this.distCodes = new Uint16Array(D_CODES);
        this.blLens = new Uint8Array(BL_CODES);
        this.blCodes = new Uint16Array(BL_CODES);
        this.out = new Uint8Array(1024);
        this.outLen = 0;
        this.bitBuf = 0;
        this.bitCnt = 0;
        this.input = null;
        this.inPos = 0;
        this.inEnd = 0;
        this.headerDone = false;
        this.finished = false;
        this.lastFlush = -2;
        this.check = format === ZLIB ? 1 : 0;
        this.total = 0;
        this.dictId = -1;
        if (dictionary && format !== GZIP_FORMAT)
            this.setDictionary(dictionary);
    }
    get ended() {
        return this.finished;
    }
    setDictionary(dictionary) {
        if (this.format === ZLIB)
            this.dictId = adler32Update(1, dictionary, 0, dictionary.length);
        let bytes = dictionary;
        if (bytes.length >= this.wsize)
            bytes = bytes.subarray(bytes.length - this.wsize);
        const window = this.window,
            length = bytes.length;
        window.set(bytes, 0);
        if (length >= MIN_MATCH) {
            let h = window[0];
            h = ((h << this.hashShift) ^ window[1]) & this.hashMask;
            for (let str = 0; str <= length - MIN_MATCH; str++) {
                h = ((h << this.hashShift) ^ window[str + 2]) & this.hashMask;
                this.prev[str & this.wmask] = this.head[h];
                this.head[h] = str;
            }
            this.insH = h;
        }
        this.strstart = this.blockStart = length;
        this.insert = Math.min(length, MIN_MATCH - 1);
    }
    // -- output bits --
    ensure(extra) {
        const need = this.outLen + extra;
        if (need > this.out.length) {
            let size = this.out.length * 2;
            while (size < need) size *= 2;
            const grown = new Uint8Array(size);
            grown.set(this.out.subarray(0, this.outLen));
            this.out = grown;
        }
    }
    putByte(value) {
        this.ensure(1);
        this.out[this.outLen++] = value;
    }
    sendBits(value, length) {
        this.bitBuf |= value << this.bitCnt;
        this.bitCnt += length;
        if (this.bitCnt >= 16) {
            this.ensure(2);
            this.out[this.outLen++] = this.bitBuf & 255;
            this.out[this.outLen++] = (this.bitBuf >>> 8) & 255;
            this.bitBuf >>>= 16;
            this.bitCnt -= 16;
        }
    }
    /** Write out the pending bits, padding to a byte boundary. */
    windup() {
        this.ensure(2);
        while (this.bitCnt > 0) {
            this.out[this.outLen++] = this.bitBuf & 255;
            this.bitBuf >>>= 8;
            this.bitCnt -= 8;
        }
        this.bitBuf = 0;
        this.bitCnt = 0;
    }
    /** Write out the whole pending bytes, keeping fewer than 8 bits. */
    flushBits() {
        this.ensure(2);
        while (this.bitCnt >= 8) {
            this.out[this.outLen++] = this.bitBuf & 255;
            this.bitBuf >>>= 8;
            this.bitCnt -= 8;
        }
    }
    // -- stream framing --
    writeHeader() {
        this.headerDone = true;
        if (this.format === ZLIB) {
            const level = this.level;
            const levelFlags =
                this.strategy >= Z_HUFFMAN_ONLY || level < 2
                    ? 0
                    : level < 6
                      ? 1
                      : level === 6
                        ? 2
                        : 3;
            let header = (8 + ((this.wbits - 8) << 4)) << 8;
            header |= levelFlags << 6;
            if (this.dictId >= 0) header |= 0x20;
            header += 31 - (header % 31);
            this.putByte(header >>> 8);
            this.putByte(header & 255);
            if (this.dictId >= 0) this.putUint32BE(this.dictId);
        } else if (this.format === GZIP_FORMAT) {
            const xfl =
                this.level === 9
                    ? 2
                    : this.strategy >= Z_HUFFMAN_ONLY || this.level < 2
                      ? 4
                      : 0;
            const os =
                typeof process === "object" && process.platform === "win32"
                    ? 10
                    : 3;
            for (const b of [0x1f, 0x8b, 8, 0, 0, 0, 0, 0, xfl, os])
                this.putByte(b);
        }
    }
    putUint32BE(value) {
        this.putByte((value >>> 24) & 255);
        this.putByte((value >>> 16) & 255);
        this.putByte((value >>> 8) & 255);
        this.putByte(value & 255);
    }
    putUint32LE(value) {
        this.putByte(value & 255);
        this.putByte((value >>> 8) & 255);
        this.putByte((value >>> 16) & 255);
        this.putByte((value >>> 24) & 255);
    }
    /** Compress bytes with the flush mode; returns the output produced by this call. */
    push(bytes, flush) {
        if (this.finished) return new Uint8Array(0);
        if (!this.headerDone) this.writeHeader();
        const length = bytes.length;
        if (length) {
            if (this.format === ZLIB)
                this.check = adler32Update(this.check, bytes, 0, length);
            else if (this.format === GZIP_FORMAT)
                this.check = crc32Update(this.check, bytes, 0, length);
            this.total += length;
        }
        this.input = bytes;
        this.inPos = 0;
        this.inEnd = length;
        const rank = (f) => f * 2 - (f > 4 ? 9 : 0);
        if (
            length === 0 &&
            this.lookahead === 0 &&
            flush !== Z_FINISH &&
            rank(flush) <= rank(this.lastFlush)
        )
            return this.takeOutput();
        this.lastFlush = flush;
        let state;
        if (this.level === 0) state = this.deflateStored(flush);
        else if (this.strategy === Z_HUFFMAN_ONLY)
            state = this.deflateHuff(flush);
        else if (this.strategy === Z_RLE) state = this.deflateRle(flush);
        else if (this.func === 1) state = this.deflateFast(flush);
        else state = this.deflateSlow(flush);
        if (state === FINISH_DONE) {
            if (this.format === ZLIB) this.putUint32BE(this.check);
            else if (this.format === GZIP_FORMAT) {
                this.putUint32LE(this.check);
                this.putUint32LE(this.total >>> 0);
            }
            this.finished = true;
        } else if (state === BLOCK_DONE) {
            if (flush === Z_PARTIAL_FLUSH) {
                // An empty fixed block (zlib's _tr_align).
                this.sendBits(2, 3);
                this.sendBits(fixedLengthCodes[256], fixedLengthLens[256]);
                this.flushBits();
            } else if (flush !== Z_BLOCK) {
                this.storedBlock(0, 0, false);
                if (flush === Z_FULL_FLUSH) {
                    this.head.fill(0);
                    if (this.lookahead === 0) {
                        this.strstart = 0;
                        this.blockStart = 0;
                        this.insert = 0;
                    }
                }
            }
        }
        this.input = null;
        return this.takeOutput();
    }
    takeOutput() {
        const result = this.out.slice(0, this.outLen);
        this.outLen = 0;
        return result;
    }
    // -- window --
    fillWindow() {
        const wsize = this.wsize,
            window = this.window;
        do {
            let more = this.windowSize - this.lookahead - this.strstart;
            if (this.strstart >= wsize + (wsize - MIN_LOOKAHEAD)) {
                window.copyWithin(0, wsize, wsize + wsize - more);
                this.matchStart -= wsize;
                this.strstart -= wsize;
                this.blockStart -= wsize;
                if (this.insert > this.strstart) this.insert = this.strstart;
                const head = this.head,
                    prev = this.prev;
                for (let i = 0; i < head.length; i++) {
                    const m = head[i];
                    head[i] = m >= wsize ? m - wsize : 0;
                }
                for (let i = 0; i < wsize; i++) {
                    const m = prev[i];
                    prev[i] = m >= wsize ? m - wsize : 0;
                }
                more += wsize;
            }
            const available = this.inEnd - this.inPos;
            if (available === 0) break;
            const n = Math.min(available, more);
            window.set(
                this.input.subarray(this.inPos, this.inPos + n),
                this.strstart + this.lookahead,
            );
            this.inPos += n;
            this.lookahead += n;
            if (this.lookahead + this.insert >= MIN_MATCH) {
                let str = this.strstart - this.insert;
                const shift = this.hashShift,
                    mask = this.hashMask;
                let h = window[str];
                h = ((h << shift) ^ window[str + 1]) & mask;
                while (this.insert) {
                    h = ((h << shift) ^ window[str + MIN_MATCH - 1]) & mask;
                    this.prev[str & this.wmask] = this.head[h];
                    this.head[h] = str;
                    str++;
                    this.insert--;
                    if (this.lookahead + this.insert < MIN_MATCH) break;
                }
                this.insH = h;
            }
        } while (this.lookahead < MIN_LOOKAHEAD && this.inPos < this.inEnd);
    }
    /** Insert the string at str into the hash chains; returns the previous head of its chain. */
    insertString(str) {
        const h =
            ((this.insH << this.hashShift) ^ this.window[str + MIN_MATCH - 1]) &
            this.hashMask;
        this.insH = h;
        const match = this.head[h];
        this.prev[str & this.wmask] = match;
        this.head[h] = str;
        return match;
    }
    longestMatch(curMatch) {
        const window = this.window,
            prev = this.prev,
            wmask = this.wmask,
            strstart = this.strstart,
            maxDist = this.wsize - MIN_LOOKAHEAD;
        let chain = this.maxChain,
            bestLen = this.prevLength,
            niceMatch = this.niceMatch;
        const limit = strstart > maxDist ? strstart - maxDist : 0;
        if (this.prevLength >= this.goodMatch) chain >>= 2;
        if (niceMatch > this.lookahead) niceMatch = this.lookahead;
        let scanEnd1 = window[strstart + bestLen - 1],
            scanEnd = window[strstart + bestLen];
        const scan0 = window[strstart],
            scan1 = window[strstart + 1],
            maxLen = MAX_MATCH;
        do {
            const match = curMatch;
            if (
                window[match + bestLen] !== scanEnd ||
                window[match + bestLen - 1] !== scanEnd1 ||
                window[match] !== scan0 ||
                window[match + 1] !== scan1
            )
                continue;
            let len = 2;
            while (
                len < maxLen &&
                window[strstart + len] === window[match + len]
            )
                len++;
            if (len > bestLen) {
                this.matchStart = curMatch;
                bestLen = len;
                if (len >= niceMatch) break;
                scanEnd1 = window[strstart + bestLen - 1];
                scanEnd = window[strstart + bestLen];
            }
        } while ((curMatch = prev[curMatch & wmask]) > limit && --chain !== 0);
        return bestLen <= this.lookahead ? bestLen : this.lookahead;
    }
    // -- symbols --
    tallyLit(c) {
        this.symDist[this.symNext] = 0;
        this.symLc[this.symNext++] = c;
        this.lengthFreq[c]++;
        return this.symNext === this.symEnd;
    }
    tallyDist(dist, lc) {
        this.symDist[this.symNext] = dist;
        this.symLc[this.symNext++] = lc;
        this.lengthFreq[LENGTH_CODE[lc] + 257]++;
        this.distFreq[distCode(dist - 1)]++;
        return this.symNext === this.symEnd;
    }
    flushBlockOnly(last) {
        this.flushBlock(
            this.blockStart >= 0 ? this.blockStart : -1,
            this.strstart - this.blockStart,
            last,
        );
        this.blockStart = this.strstart;
    }
    // -- compression loops (zlib's deflate_stored/fast/slow/rle/huff) --
    deflateStored(flush) {
        const maxDist = this.wsize - MIN_LOOKAHEAD;
        for (;;) {
            if (this.lookahead <= 1) {
                this.fillWindow();
                if (this.lookahead === 0 && flush === Z_NO_FLUSH)
                    return NEED_MORE;
                if (this.lookahead === 0) break;
            }
            this.strstart += this.lookahead;
            this.lookahead = 0;
            const maxStart = this.blockStart + 65535;
            if (this.strstart >= maxStart) {
                this.lookahead = this.strstart - maxStart;
                this.strstart = maxStart;
                this.flushBlockOnly(false);
            }
            if (this.strstart - this.blockStart >= maxDist)
                this.flushBlockOnly(false);
        }
        this.insert = 0;
        if (flush === Z_FINISH) {
            this.flushBlockOnly(true);
            return FINISH_DONE;
        }
        if (this.strstart > this.blockStart) this.flushBlockOnly(false);
        return BLOCK_DONE;
    }
    deflateFast(flush) {
        const maxDist = this.wsize - MIN_LOOKAHEAD,
            window = this.window;
        for (;;) {
            if (this.lookahead < MIN_LOOKAHEAD) {
                this.fillWindow();
                if (this.lookahead < MIN_LOOKAHEAD && flush === Z_NO_FLUSH)
                    return NEED_MORE;
                if (this.lookahead === 0) break;
            }
            let hashHead = 0;
            if (this.lookahead >= MIN_MATCH)
                hashHead = this.insertString(this.strstart);
            if (hashHead !== 0 && this.strstart - hashHead <= maxDist)
                this.matchLength = this.longestMatch(hashHead);
            let bflush;
            if (this.matchLength >= MIN_MATCH) {
                bflush = this.tallyDist(
                    this.strstart - this.matchStart,
                    this.matchLength - MIN_MATCH,
                );
                this.lookahead -= this.matchLength;
                if (
                    this.matchLength <= this.maxLazy &&
                    this.lookahead >= MIN_MATCH
                ) {
                    this.matchLength--;
                    do {
                        this.strstart++;
                        this.insertString(this.strstart);
                    } while (--this.matchLength !== 0);
                    this.strstart++;
                } else {
                    this.strstart += this.matchLength;
                    this.matchLength = 0;
                    this.insH =
                        ((window[this.strstart] << this.hashShift) ^
                            window[this.strstart + 1]) &
                        this.hashMask;
                }
            } else {
                bflush = this.tallyLit(window[this.strstart]);
                this.lookahead--;
                this.strstart++;
            }
            if (bflush) this.flushBlockOnly(false);
        }
        return this.finishLoop(
            flush,
            this.strstart < MIN_MATCH - 1 ? this.strstart : MIN_MATCH - 1,
        );
    }
    deflateSlow(flush) {
        const maxDist = this.wsize - MIN_LOOKAHEAD,
            window = this.window;
        for (;;) {
            if (this.lookahead < MIN_LOOKAHEAD) {
                this.fillWindow();
                if (this.lookahead < MIN_LOOKAHEAD && flush === Z_NO_FLUSH)
                    return NEED_MORE;
                if (this.lookahead === 0) break;
            }
            let hashHead = 0;
            if (this.lookahead >= MIN_MATCH)
                hashHead = this.insertString(this.strstart);
            this.prevLength = this.matchLength;
            this.prevMatch = this.matchStart;
            this.matchLength = MIN_MATCH - 1;
            if (
                hashHead !== 0 &&
                this.prevLength < this.maxLazy &&
                this.strstart - hashHead <= maxDist
            ) {
                this.matchLength = this.longestMatch(hashHead);
                if (
                    this.matchLength <= 5 &&
                    (this.strategy === Z_FILTERED ||
                        (this.matchLength === MIN_MATCH &&
                            this.strstart - this.matchStart > TOO_FAR))
                )
                    this.matchLength = MIN_MATCH - 1;
            }
            if (
                this.prevLength >= MIN_MATCH &&
                this.matchLength <= this.prevLength
            ) {
                const maxInsert = this.strstart + this.lookahead - MIN_MATCH;
                const bflush = this.tallyDist(
                    this.strstart - 1 - this.prevMatch,
                    this.prevLength - MIN_MATCH,
                );
                this.lookahead -= this.prevLength - 1;
                this.prevLength -= 2;
                do {
                    if (++this.strstart <= maxInsert)
                        this.insertString(this.strstart);
                } while (--this.prevLength !== 0);
                this.matchAvailable = false;
                this.matchLength = MIN_MATCH - 1;
                this.strstart++;
                if (bflush) this.flushBlockOnly(false);
            } else if (this.matchAvailable) {
                if (this.tallyLit(window[this.strstart - 1]))
                    this.flushBlockOnly(false);
                this.strstart++;
                this.lookahead--;
            } else {
                this.matchAvailable = true;
                this.strstart++;
                this.lookahead--;
            }
        }
        if (this.matchAvailable) {
            this.tallyLit(window[this.strstart - 1]);
            this.matchAvailable = false;
        }
        return this.finishLoop(
            flush,
            this.strstart < MIN_MATCH - 1 ? this.strstart : MIN_MATCH - 1,
        );
    }
    deflateRle(flush) {
        const window = this.window;
        for (;;) {
            if (this.lookahead <= MAX_MATCH) {
                this.fillWindow();
                if (this.lookahead <= MAX_MATCH && flush === Z_NO_FLUSH)
                    return NEED_MORE;
                if (this.lookahead === 0) break;
            }
            let length = 0;
            const strstart = this.strstart;
            if (this.lookahead >= MIN_MATCH && strstart > 0) {
                const previous = window[strstart - 1],
                    max = Math.min(MAX_MATCH, this.lookahead);
                while (length < max && window[strstart + length] === previous)
                    length++;
            }
            let bflush;
            if (length >= MIN_MATCH) {
                bflush = this.tallyDist(1, length - MIN_MATCH);
                this.lookahead -= length;
                this.strstart += length;
            } else {
                bflush = this.tallyLit(window[strstart]);
                this.lookahead--;
                this.strstart++;
            }
            if (bflush) this.flushBlockOnly(false);
        }
        return this.finishLoop(flush, 0);
    }
    deflateHuff(flush) {
        for (;;) {
            if (this.lookahead === 0) {
                this.fillWindow();
                if (this.lookahead === 0) {
                    if (flush === Z_NO_FLUSH) return NEED_MORE;
                    break;
                }
            }
            const bflush = this.tallyLit(this.window[this.strstart]);
            this.lookahead--;
            this.strstart++;
            if (bflush) this.flushBlockOnly(false);
        }
        return this.finishLoop(flush, 0);
    }
    finishLoop(flush, insert) {
        this.insert = insert;
        if (flush === Z_FINISH) {
            this.flushBlockOnly(true);
            return FINISH_DONE;
        }
        if (this.symNext) this.flushBlockOnly(false);
        return BLOCK_DONE;
    }
    // -- blocks (zlib's trees.c) --
    /** A stored block of window[buf, buf + length) (several when longer than 65535 bytes). */
    storedBlock(buf, length, last) {
        do {
            const n = Math.min(length, 65535);
            length -= n;
            this.sendBits(last && length === 0 ? 1 : 0, 3);
            this.windup();
            this.ensure(n + 4);
            const out = this.out;
            out[this.outLen++] = n & 255;
            out[this.outLen++] = n >>> 8;
            out[this.outLen++] = ~n & 255;
            out[this.outLen++] = (~n >>> 8) & 255;
            out.set(this.window.subarray(buf, buf + n), this.outLen);
            this.outLen += n;
            buf += n;
        } while (length > 0);
    }
    /** Bits of the block's symbols with the given code lengths. */
    dataBits(lengthLens, distLens) {
        const lengthFreq = this.lengthFreq,
            distFreq = this.distFreq;
        let bits = 0;
        for (let i = 0; i < L_CODES; i++) {
            const f = lengthFreq[i];
            if (f)
                bits +=
                    f * (lengthLens[i] + (i > 256 ? LENGTH_EXTRA[i - 257] : 0));
        }
        for (let i = 0; i < D_CODES; i++) {
            const f = distFreq[i];
            if (f) bits += f * (distLens[i] + DIST_EXTRA[i]);
        }
        return bits;
    }
    /** Count (send false) or send (send true) the code lengths of lens[0..maxCode] run-length encoded (zlib scan_tree/send_tree). */
    codeLengthRuns(lens, maxCode, send) {
        const blFreq = this.blFreq,
            blLens = this.blLens,
            blCodes = this.blCodes;
        const emit = (code) => {
            if (send) this.sendBits(blCodes[code], blLens[code]);
            else blFreq[code]++;
        };
        let prevlen = -1,
            nextlen = lens[0],
            count = 0,
            maxCount = 7,
            minCount = 4;
        if (nextlen === 0) {
            maxCount = 138;
            minCount = 3;
        }
        for (let n = 0; n <= maxCode; n++) {
            const curlen = nextlen;
            nextlen = n + 1 <= maxCode ? lens[n + 1] : -1;
            if (++count < maxCount && curlen === nextlen) continue;
            if (count < minCount) {
                do emit(curlen);
                while (--count !== 0);
            } else if (curlen !== 0) {
                if (curlen !== prevlen) {
                    emit(curlen);
                    count--;
                }
                emit(16);
                if (send) this.sendBits(count - 3, 2);
            } else if (count <= 10) {
                emit(17);
                if (send) this.sendBits(count - 3, 3);
            } else {
                emit(18);
                if (send) this.sendBits(count - 11, 7);
            }
            count = 0;
            prevlen = curlen;
            if (nextlen === 0) {
                maxCount = 138;
                minCount = 3;
            } else if (curlen === nextlen) {
                maxCount = 6;
                minCount = 3;
            } else {
                maxCount = 7;
                minCount = 4;
            }
        }
    }
    flushBlock(buf, storedLen, last) {
        let optLenb,
            staticLenb,
            lmax = 0,
            dmax = 0,
            blMax = 0;
        if (this.level > 0) {
            this.lengthFreq[256] = 1;
            buildLengths(this.lengthFreq, L_CODES, 15, this.lengthLens);
            buildLengths(this.distFreq, D_CODES, 15, this.distLens);
            lmax = L_CODES - 1;
            while (this.lengthLens[lmax] === 0) lmax--;
            dmax = D_CODES - 1;
            while (dmax > 0 && this.distLens[dmax] === 0) dmax--;
            this.blFreq.fill(0);
            this.codeLengthRuns(this.lengthLens, lmax, false);
            this.codeLengthRuns(this.distLens, dmax, false);
            buildLengths(this.blFreq, BL_CODES, 7, this.blLens);
            for (blMax = BL_CODES - 1; blMax >= 3; blMax--)
                if (this.blLens[CODE_LENGTH_ORDER[blMax]] !== 0) break;
            let optLen =
                this.dataBits(this.lengthLens, this.distLens) +
                3 * (blMax + 1) +
                14;
            for (let i = 0; i < BL_CODES; i++)
                optLen +=
                    this.blFreq[i] *
                    (this.blLens[i] +
                        (i === 16 ? 2 : i === 17 ? 3 : i === 18 ? 7 : 0));
            const staticLen = this.dataBits(fixedLengthLens, fixedDistLens);
            optLenb = (optLen + 3 + 7) >>> 3;
            staticLenb = (staticLen + 3 + 7) >>> 3;
            if (staticLenb <= optLenb || this.strategy === Z_FIXED)
                optLenb = staticLenb;
        } else optLenb = staticLenb = storedLen + 5;
        if (storedLen + 4 <= optLenb && buf !== -1)
            this.storedBlock(buf, storedLen, last);
        else if (staticLenb === optLenb) {
            this.sendBits(2 + (last ? 1 : 0), 3);
            this.compressBlock(
                fixedLengthLens,
                fixedLengthCodes,
                fixedDistLens,
                fixedDistCodes,
                staticLenb,
            );
        } else {
            this.sendBits(4 + (last ? 1 : 0), 3);
            canonicalCodes(this.lengthLens, L_CODES, this.lengthCodes);
            canonicalCodes(this.distLens, D_CODES, this.distCodes);
            canonicalCodes(this.blLens, BL_CODES, this.blCodes);
            this.sendBits(lmax + 1 - 257, 5);
            this.sendBits(dmax + 1 - 1, 5);
            this.sendBits(blMax + 1 - 4, 4);
            for (let rank = 0; rank <= blMax; rank++)
                this.sendBits(this.blLens[CODE_LENGTH_ORDER[rank]], 3);
            this.codeLengthRuns(this.lengthLens, lmax, true);
            this.codeLengthRuns(this.distLens, dmax, true);
            this.compressBlock(
                this.lengthLens,
                this.lengthCodes,
                this.distLens,
                this.distCodes,
                optLenb,
            );
        }
        this.lengthFreq.fill(0);
        this.distFreq.fill(0);
        this.symNext = 0;
        if (last) this.windup();
    }
    compressBlock(lengthLens, lengthCodes, distLens, distCodes, bytes) {
        this.ensure(bytes + 16);
        const out = this.out,
            symDist = this.symDist,
            symLc = this.symLc,
            count = this.symNext;
        let bb = this.bitBuf,
            bc = this.bitCnt,
            o = this.outLen;
        for (let i = 0; i < count; i++) {
            let dist = symDist[i];
            const lc = symLc[i];
            if (dist === 0) {
                bb |= lengthCodes[lc] << bc;
                bc += lengthLens[lc];
            } else {
                let code = LENGTH_CODE[lc];
                bb |= lengthCodes[code + 257] << bc;
                bc += lengthLens[code + 257];
                let extra = LENGTH_EXTRA[code];
                if (extra) {
                    if (bc >= 16) {
                        out[o++] = bb & 255;
                        out[o++] = (bb >>> 8) & 255;
                        bb >>>= 16;
                        bc -= 16;
                    }
                    bb |= (lc + 3 - LENGTH_BASE[code]) << bc;
                    bc += extra;
                }
                if (bc >= 16) {
                    out[o++] = bb & 255;
                    out[o++] = (bb >>> 8) & 255;
                    bb >>>= 16;
                    bc -= 16;
                }
                dist--;
                code = distCode(dist);
                bb |= distCodes[code] << bc;
                bc += distLens[code];
                extra = DIST_EXTRA[code];
                if (extra) {
                    if (bc >= 16) {
                        out[o++] = bb & 255;
                        out[o++] = (bb >>> 8) & 255;
                        bb >>>= 16;
                        bc -= 16;
                    }
                    bb |= (dist + 1 - DIST_BASE[code]) << bc;
                    bc += extra;
                }
            }
            if (bc >= 16) {
                out[o++] = bb & 255;
                out[o++] = (bb >>> 8) & 255;
                bb >>>= 16;
                bc -= 16;
            }
        }
        this.bitBuf = bb;
        this.bitCnt = bc;
        this.outLen = o;
        this.sendBits(lengthCodes[256], lengthLens[256]);
    }
}

// ---- synchronous API -------------------------------------------------------

/** A new engine for mode (DEFLATE ... UNZIP) with validated options. */
function createEngine(mode, options) {
    switch (mode) {
        case DEFLATE:
        case GZIP:
        case DEFLATERAW:
            return new Deflater(
                mode === DEFLATE ? ZLIB : mode === GZIP ? GZIP_FORMAT : RAW,
                options.level,
                options.windowBits,
                options.memLevel,
                options.strategy,
                options.dictionary,
            );
        default: {
            const inflater = new Inflater(
                mode === INFLATE
                    ? ZLIB
                    : mode === GUNZIP
                      ? GZIP_FORMAT
                      : mode === INFLATERAW
                        ? RAW
                        : AUTO,
                mode === INFLATERAW && options.windowBits === 0
                    ? 15
                    : options.windowBits,
                mode === GUNZIP ? undefined : options.dictionary,
            );
            inflater.limit = options.maxOutputLength;
            return inflater;
        }
    }
}

function zlibBufferSync(mode, buffer, opts) {
    const options = zlibOptions(mode, opts);
    const bytes = inputBytes(buffer);
    const engine = createEngine(mode, options);
    let output;
    if (engine instanceof Deflater)
        output = engine.push(bytes, options.finishFlush);
    else {
        engine.push(bytes, options.finishFlush === Z_FINISH);
        output = engine.takeOutput();
    }
    if (output.length > options.maxOutputLength) {
        const error = new RangeError(
            "Cannot create a Buffer larger than " +
                options.maxOutputLength +
                " bytes",
        );
        error.code = "ERR_BUFFER_TOO_LARGE";
        throw error;
    }
    const result = Buffer.from(output.buffer, output.byteOffset, output.length);
    return options.info ? { buffer: result, engine } : result;
}

function deflateSync(buffer, opts) {
    return zlibBufferSync(DEFLATE, buffer, opts);
}
function inflateSync(buffer, opts) {
    return zlibBufferSync(INFLATE, buffer, opts);
}
function gzipSync(buffer, opts) {
    return zlibBufferSync(GZIP, buffer, opts);
}
function gunzipSync(buffer, opts) {
    return zlibBufferSync(GUNZIP, buffer, opts);
}
function deflateRawSync(buffer, opts) {
    return zlibBufferSync(DEFLATERAW, buffer, opts);
}
function inflateRawSync(buffer, opts) {
    return zlibBufferSync(INFLATERAW, buffer, opts);
}
function unzipSync(buffer, opts) {
    return zlibBufferSync(UNZIP, buffer, opts);
}

const brotliCompressSync = unsupported("brotliCompressSync"),
    brotliDecompressSync = unsupported("brotliDecompressSync"),
    brotliCompress = unsupported("brotliCompress"),
    brotliDecompress = unsupported("brotliDecompress"),
    createBrotliCompress = unsupported("createBrotliCompress"),
    createBrotliDecompress = unsupported("createBrotliDecompress");

const zlib = {
    constants,
    codes,
    crc32,
    deflateSync,
    inflateSync,
    gzipSync,
    gunzipSync,
    deflateRawSync,
    inflateRawSync,
    unzipSync,
    brotliCompressSync,
    brotliDecompressSync,
    brotliCompress,
    brotliDecompress,
    createBrotliCompress,
    createBrotliDecompress,
};
// The legacy Z_* aliases of the constants (not enumerable, as in Node).
for (const name of Object.keys(constants))
    Object.defineProperty(zlib, name, {
        value: constants[name],
        enumerable: false,
        writable: false,
        configurable: false,
    });

export {
    constants,
    codes,
    crc32,
    deflateSync,
    inflateSync,
    gzipSync,
    gunzipSync,
    deflateRawSync,
    inflateRawSync,
    unzipSync,
    brotliCompressSync,
    brotliDecompressSync,
    brotliCompress,
    brotliDecompress,
    createBrotliCompress,
    createBrotliDecompress,
};
export default zlib;
