// node:zlib (issue #298): DEFLATE (RFC 1951) with the zlib (RFC 1950) and
// gzip (RFC 1952) wrappers, in JavaScript on top of Buffer and node:stream.
// The decoder is complete and incremental: streams accept input split at any
// byte. The compressor (LZ77 with hash chains, then a stored, fixed or
// dynamic Huffman block, whichever is smallest) writes valid streams that
// any inflater reads, but not the same bytes as the zlib library. Brotli and
// Zstandard are not provided: their functions throw ERR_NONA_UNSUPPORTED.
import { Buffer } from "node:buffer";
import { Transform } from "node:stream";

function unsupported(name) {
    return function () {
        const error = new Error(name + " is not supported by Nona");
        error.code = "ERR_NONA_UNSUPPORTED";
        throw error;
    };
}

const zlibConstants = {
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
    ZSTD_DECOMPRESS: 11,
    ZSTD_COMPRESS: 10,
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
};
const brotliNames =
    "OPERATION_PROCESS OPERATION_FLUSH OPERATION_FINISH OPERATION_EMIT_METADATA PARAM_MODE MODE_GENERIC MODE_TEXT MODE_FONT DEFAULT_MODE PARAM_QUALITY MIN_QUALITY MAX_QUALITY DEFAULT_QUALITY PARAM_LGWIN MIN_WINDOW_BITS MAX_WINDOW_BITS LARGE_MAX_WINDOW_BITS DEFAULT_WINDOW PARAM_LGBLOCK MIN_INPUT_BLOCK_BITS MAX_INPUT_BLOCK_BITS PARAM_DISABLE_LITERAL_CONTEXT_MODELING PARAM_SIZE_HINT PARAM_LARGE_WINDOW PARAM_NPOSTFIX PARAM_NDIRECT DECODER_RESULT_ERROR DECODER_RESULT_SUCCESS DECODER_RESULT_NEEDS_MORE_INPUT DECODER_RESULT_NEEDS_MORE_OUTPUT DECODER_PARAM_DISABLE_RING_BUFFER_REALLOCATION DECODER_PARAM_LARGE_WINDOW DECODER_NO_ERROR DECODER_SUCCESS DECODER_NEEDS_MORE_INPUT DECODER_NEEDS_MORE_OUTPUT";
const brotliValues = [
    0, 1, 2, 3, 0, 0, 1, 2, 0, 1, 0, 11, 11, 2, 10, 24, 30, 22, 3, 16, 24, 4,
    5, 6, 7, 8, 0, 1, 2, 3, 0, 1, 0, 1, 2, 3,
];
const brotliErrors =
    "EXUBERANT_NIBBLE RESERVED EXUBERANT_META_NIBBLE SIMPLE_HUFFMAN_ALPHABET SIMPLE_HUFFMAN_SAME CL_SPACE HUFFMAN_SPACE CONTEXT_MAP_REPEAT BLOCK_LENGTH_1 BLOCK_LENGTH_2 TRANSFORM DICTIONARY WINDOW_BITS PADDING_1 PADDING_2 DISTANCE";
const brotliAllocErrors = [
    ["DICTIONARY_NOT_SET", -19],
    ["INVALID_ARGUMENTS", -20],
    ["ALLOC_CONTEXT_MODES", -21],
    ["ALLOC_TREE_GROUPS", -22],
    ["ALLOC_CONTEXT_MAP", -25],
    ["ALLOC_RING_BUFFER_1", -26],
    ["ALLOC_RING_BUFFER_2", -27],
    ["ALLOC_BLOCK_TYPE_TREES", -30],
    ["UNREACHABLE", -31],
];
const zstdConstants =
    "e_continue:0 e_flush:1 e_end:2 fast:1 dfast:2 greedy:3 lazy:4 lazy2:5 btlazy2:6 btopt:7 btultra:8 btultra2:9 c_compressionLevel:100 c_windowLog:101 c_hashLog:102 c_chainLog:103 c_searchLog:104 c_minMatch:105 c_targetLength:106 c_strategy:107 c_enableLongDistanceMatching:160 c_ldmHashLog:161 c_ldmMinMatch:162 c_ldmBucketSizeLog:163 c_ldmHashRateLog:164 c_contentSizeFlag:200 c_checksumFlag:201 c_dictIDFlag:202 c_nbWorkers:400 c_jobSize:401 c_overlapLog:402 d_windowLogMax:100 CLEVEL_DEFAULT:3 error_no_error:0 error_GENERIC:1 error_prefix_unknown:10 error_version_unsupported:12 error_frameParameter_unsupported:14 error_frameParameter_windowTooLarge:16 error_corruption_detected:20 error_checksum_wrong:22 error_literals_headerWrong:24 error_dictionary_corrupted:30 error_dictionary_wrong:32 error_dictionaryCreation_failed:34 error_parameter_unsupported:40 error_parameter_combination_unsupported:41 error_parameter_outOfBound:42 error_tableLog_tooLarge:44 error_maxSymbolValue_tooLarge:46 error_maxSymbolValue_tooSmall:48 error_stabilityCondition_notRespected:50 error_stage_wrong:60 error_init_missing:62 error_memory_allocation:64 error_workSpace_tooSmall:66 error_dstSize_tooSmall:70 error_srcSize_wrong:72 error_dstBuffer_null:74 error_noForwardProgress_destFull:80 error_noForwardProgress_inputEmpty:82";

const constantsObject = Object.assign({}, zlibConstants);
brotliNames.split(" ").forEach((name, index) => {
    constantsObject["BROTLI_" + name] = brotliValues[index];
});
brotliErrors.split(" ").forEach((name, index) => {
    constantsObject["BROTLI_DECODER_ERROR_FORMAT_" + name] = -1 - index;
});
for (const [name, value] of brotliAllocErrors)
    constantsObject["BROTLI_DECODER_ERROR_" + name] = value;
for (const entry of zstdConstants.split(" ")) {
    const colon = entry.indexOf(":");
    constantsObject["ZSTD_" + entry.slice(0, colon)] = Number(
        entry.slice(colon + 1),
    );
}
export const constants = constantsObject;

const codesObject = {};
for (const name of [
    "Z_OK",
    "Z_STREAM_END",
    "Z_NEED_DICT",
    "Z_ERRNO",
    "Z_STREAM_ERROR",
    "Z_DATA_ERROR",
    "Z_MEM_ERROR",
    "Z_BUF_ERROR",
    "Z_VERSION_ERROR",
])
    codesObject[name] = zlibConstants[name];
for (const name of Object.keys(codesObject))
    codesObject[codesObject[name]] = name;
export const codes = Object.freeze(codesObject);

function zlibError(message, code) {
    const error = new Error(message);
    error.errno = zlibConstants[code];
    error.code = code;
    return error;
}
const dataError = (message) => zlibError(message, "Z_DATA_ERROR");

function describe(value) {
    if (value === null || value === undefined) return " Received " + value;
    if (typeof value === "function")
        return " Received function " + (value.name || "<anonymous>");
    if (typeof value === "object")
        return value.constructor && value.constructor.name
            ? " Received an instance of " + value.constructor.name
            : " Received " + String(value);
    let shown = String(value);
    if (typeof value === "string") shown = "'" + shown + "'";
    return " Received type " + typeof value + " (" + shown + ")";
}
function invalidArgType(name, expected, value) {
    const error = new TypeError(
        'The "' + name + '" argument must be ' + expected + "." + describe(value),
    );
    error.code = "ERR_INVALID_ARG_TYPE";
    return error;
}

function toBytes(value, name) {
    if (typeof value === "string") return Buffer.from(value);
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value))
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    throw invalidArgType(
        name,
        "of type string or an instance of Buffer, TypedArray, DataView, or ArrayBuffer",
        value,
    );
}

// Checksums.
let crcTable = null;
function crcUpdate(crc, bytes, start, end) {
    if (crcTable === null) {
        // CRC-32 is linear: the entry of a ^ b is the entries of a and b xored.
        crcTable = new Int32Array(256);
        for (let bit = 1; bit < 256; bit <<= 1) {
            let c = bit;
            for (let k = 0; k < 8; k++)
                c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            for (let j = 0; j < bit; j++) crcTable[bit | j] = c ^ crcTable[j];
        }
    }
    let c = ~crc;
    for (let i = start; i < end; i++)
        c = crcTable[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return ~c >>> 0;
}
function adlerUpdate(adler, bytes, start, end) {
    let a = adler & 0xffff,
        b = adler >>> 16;
    while (start < end) {
        const stop = Math.min(end, start + 5552);
        for (; start < stop; start++) {
            a += bytes[start];
            b += a;
        }
        a %= 65521;
        b %= 65521;
    }
    return ((b << 16) | a) >>> 0;
}

export function crc32(data, value = 0) {
    let bytes;
    if (typeof data === "string") bytes = Buffer.from(data);
    else if (ArrayBuffer.isView(data))
        bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    else
        throw invalidArgType(
            "data",
            "of type string or an instance of Buffer, TypedArray, or DataView",
            data,
        );
    if (typeof value !== "number")
        throw invalidArgType("value", "of type number", value);
    return crcUpdate(value >>> 0, bytes, 0, bytes.length);
}

// DEFLATE tables (RFC 1951, 3.2.5).
const LENGTH_BASE = [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67,
    83, 99, 115, 131, 163, 195, 227, 258,
];
const LENGTH_EXTRA = [
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5,
    5, 5, 5, 0,
];
const DISTANCE_BASE = [
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513,
    769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DISTANCE_EXTRA = [
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10,
    11, 11, 12, 12, 13, 13,
];
const CODE_LENGTH_ORDER = [
    16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
];

let reversedBytes = null;
function reverseBits(code, length) {
    if (reversedBytes === null) {
        reversedBytes = new Uint8Array(256);
        for (let i = 1; i < 256; i++)
            reversedBytes[i] = (reversedBytes[i >> 1] >> 1) | ((i & 1) << 7);
    }
    return (
        ((reversedBytes[code & 255] << 8) | reversedBytes[code >> 8]) >>
        (16 - length)
    );
}
/** Canonical Huffman codes (RFC 1951, 3.2.2) for lengths, bit-reversed for LSB-first I/O. */
function canonicalCodes(lengths, count) {
    const perLength = new Int32Array(16),
        next = new Int32Array(16),
        codes = new Int32Array(count);
    for (let i = 0; i < count; i++) perLength[lengths[i]]++;
    perLength[0] = 0;
    let code = 0;
    for (let length = 1; length < 16; length++) {
        code = (code + perLength[length - 1]) << 1;
        next[length] = code;
    }
    for (let i = 0; i < count; i++)
        if (lengths[i]) codes[i] = reverseBits(next[lengths[i]]++, lengths[i]);
    return codes;
}

// Decoding: a table indexed by the next "bits" input bits whose entries are
// symbol * 16 + code length (0: no code). Returns null for an over-subscribed
// set and for an incomplete one, which zlib only accepts for a single code
// of length 1 (complete is true for the code length code).
function decodingTable(lengths, start, count, complete, codes) {
    const perLength = new Int32Array(16);
    let max = 0;
    for (let i = 0; i < count; i++) {
        const length = lengths[start + i];
        perLength[length]++;
        if (length > max) max = length;
    }
    if (max === 0) return { table: new Int32Array(2), bits: 1 };
    let left = 1;
    for (let length = 1; length < 16; length++) {
        left = left * 2 - perLength[length];
        if (left < 0) return null;
    }
    if (left > 0 && (complete || max !== 1)) return null;
    if (codes === undefined)
        codes = canonicalCodes(lengths.subarray(start, start + count), count);
    const size = 1 << max,
        table = new Int32Array(size);
    for (let symbol = 0; symbol < count; symbol++) {
        const length = lengths[start + symbol];
        if (length === 0) continue;
        for (let i = codes[symbol]; i < size; i += 1 << length)
            table[i] = (symbol << 4) | length;
    }
    return { table, bits: max };
}
let fixed = null;
/** The fixed Huffman code (RFC 1951, 3.2.6) of the 288 literal/length and 32 distance symbols. */
function fixedCode() {
    if (fixed === null) {
        const literalLengths = new Uint8Array(288),
            distanceLengths = new Uint8Array(32).fill(5);
        literalLengths.fill(8, 0, 144);
        literalLengths.fill(9, 144, 256);
        literalLengths.fill(7, 256, 280);
        literalLengths.fill(8, 280, 288);
        fixed = {
            literalLengths,
            literalCodes: canonicalCodes(literalLengths, 288),
            distanceLengths,
            distanceCodes: canonicalCodes(distanceLengths, 32),
            decoding: null,
        };
    }
    return fixed;
}

const NEED_INPUT = { needInput: true };
const WINDOW = 32768,
    OUTPUT_SIZE = WINDOW * 3,
    OUTPUT_LIMIT = OUTPUT_SIZE - 258;
const HEADER = 0,
    BLOCK = 1,
    STORED = 2,
    CODES = 3,
    TRAILER = 4,
    MEMBER = 5,
    DONE = 6;

/** An incremental inflater for the "zlib", "gzip", "raw" or "unzip" (zlib or gzip) format. */
class Inflater {
    constructor(format, strict) {
        this.format = format;
        this.strict = strict;
        this.mode = HEADER;
        this.input = new Uint8Array(0);
        this.position = 0;
        this.bitBuffer = 0;
        this.bitCount = 0;
        this.markPosition = 0;
        this.markBuffer = 0;
        this.markCount = 0;
        this.output = new Uint8Array(OUTPUT_SIZE);
        this.end = 0;
        this.emitted = 0;
        this.total = 0;
        this.check = 0;
        this.final = false;
        this.stored = 0;
        this.literals = null;
        this.distances = null;
        this.chunks = [];
        this.error = null;
    }
    write(bytes) {
        if (this.error) throw this.error;
        if (this.mode === DONE) return [];
        const rest = this.input.length - this.position;
        if (rest === 0) this.input = bytes;
        else {
            const joined = new Uint8Array(rest + bytes.length);
            joined.set(this.input.subarray(this.position));
            joined.set(bytes, rest);
            this.input = joined;
        }
        this.position = 0;
        this.run();
        return this.take();
    }
    flush() {
        return this.take();
    }
    finish() {
        if (this.error) throw this.error;
        if (this.mode !== DONE && this.mode !== MEMBER && this.strict) {
            this.chunks = [];
            this.error = zlibError("unexpected end of file", "Z_BUF_ERROR");
            throw this.error;
        }
        return this.take();
    }
    take() {
        this.emit();
        const chunks = this.chunks;
        this.chunks = [];
        return chunks;
    }
    run() {
        try {
            for (;;) {
                this.markPosition = this.position;
                this.markBuffer = this.bitBuffer;
                this.markCount = this.bitCount;
                if (!this.step()) return;
            }
        } catch (error) {
            if (error !== NEED_INPUT) {
                this.error = error;
                throw error;
            }
            this.position = this.markPosition;
            this.bitBuffer = this.markBuffer;
            this.bitCount = this.markCount;
        }
    }
    need(count) {
        while (this.bitCount < count) {
            if (this.position >= this.input.length) throw NEED_INPUT;
            this.bitBuffer |= this.input[this.position++] << this.bitCount;
            this.bitCount += 8;
        }
    }
    bits(count) {
        this.need(count);
        const value = this.bitBuffer & ((1 << count) - 1);
        this.bitBuffer >>>= count;
        this.bitCount -= count;
        return value;
    }
    decode(code) {
        const max = code.bits,
            input = this.input;
        while (this.bitCount < max && this.position < input.length) {
            this.bitBuffer |= input[this.position++] << this.bitCount;
            this.bitCount += 8;
        }
        const entry = code.table[this.bitBuffer & ((1 << max) - 1)],
            length = entry & 15;
        if (length === 0) {
            if (this.bitCount < max) throw NEED_INPUT;
            return -1;
        }
        if (length > this.bitCount) throw NEED_INPUT;
        this.bitBuffer >>>= length;
        this.bitCount -= length;
        return entry >> 4;
    }
    align() {
        const drop = this.bitCount & 7;
        this.bitBuffer >>>= drop;
        this.bitCount -= drop;
    }
    /** Hand the output written since the last call to the caller and the checksum. */
    emit() {
        if (this.end === this.emitted) return;
        const chunk = Buffer.allocUnsafe(this.end - this.emitted);
        chunk.set(this.output.subarray(this.emitted, this.end));
        if (this.format === "zlib")
            this.check = adlerUpdate(this.check, chunk, 0, chunk.length);
        else if (this.format === "gzip")
            this.check = crcUpdate(this.check, chunk, 0, chunk.length);
        this.total += chunk.length;
        this.chunks.push(chunk);
        this.emitted = this.end;
    }
    /** Keep the last 32 KiB of output as the window and make room after it. */
    slide() {
        this.emit();
        this.output.copyWithin(0, this.end - WINDOW, this.end);
        this.end = this.emitted = WINDOW;
    }
    step() {
        switch (this.mode) {
            case HEADER:
                return this.header();
            case BLOCK:
                return this.blockHeader();
            case STORED:
                return this.storedData();
            case CODES:
                return this.codes();
            case TRAILER:
                return this.trailer();
            case MEMBER: {
                let next;
                if (this.bitCount >= 8) next = this.bitBuffer & 255;
                else if (this.position < this.input.length)
                    next = this.input[this.position];
                else return false;
                if (next === 0x1f) {
                    this.mode = HEADER;
                    this.check = 0;
                    this.total = 0;
                } else this.mode = DONE;
                return true;
            }
            default:
                this.position = this.input.length;
                this.bitCount = this.bitBuffer = 0;
                return false;
        }
    }
    header() {
        if (this.format === "unzip") {
            this.need(16);
            this.format =
                (this.bitBuffer & 0xffff) === 0x8b1f ? "gzip" : "zlib";
        }
        if (this.format === "zlib") {
            const cmf = this.bits(8),
                flg = this.bits(8);
            if ((cmf * 256 + flg) % 31 !== 0)
                throw dataError("incorrect header check");
            if ((cmf & 15) !== 8) throw dataError("unknown compression method");
            if ((cmf >> 4) + 8 > 15) throw dataError("invalid window size");
            if (flg & 32)
                throw zlibError("Missing dictionary", "Z_NEED_DICT");
            this.check = 1;
        } else if (this.format === "gzip") {
            const start = this.position - (this.bitCount >> 3);
            if (this.bits(8) !== 0x1f || this.bits(8) !== 0x8b)
                throw dataError("incorrect header check");
            if (this.bits(8) !== 8)
                throw dataError("unknown compression method");
            const flags = this.bits(8);
            if (flags & 0xe0) throw dataError("unknown header flags set");
            for (let i = 0; i < 6; i++) this.bits(8);
            if (flags & 4) {
                const length = this.bits(16);
                for (let i = 0; i < length; i++) this.bits(8);
            }
            if (flags & 8) while (this.bits(8) !== 0);
            if (flags & 16) while (this.bits(8) !== 0);
            if (flags & 2) {
                const crc =
                    crcUpdate(0, this.input, start, this.position) & 0xffff;
                if (this.bits(16) !== crc)
                    throw dataError("header crc mismatch");
            }
            this.check = 0;
        }
        this.mode = BLOCK;
        return true;
    }
    blockHeader() {
        const final = this.bits(1) === 1,
            type = this.bits(2);
        if (type === 0) {
            this.align();
            const length = this.bits(16),
                complement = this.bits(16);
            if (length !== (~complement & 0xffff))
                throw dataError("invalid stored block lengths");
            this.stored = length;
            this.mode = STORED;
        } else if (type === 1) {
            const code = fixedCode();
            if (code.decoding === null)
                code.decoding = [
                    decodingTable(code.literalLengths, 0, 288, false, code.literalCodes),
                    decodingTable(code.distanceLengths, 0, 32, false, code.distanceCodes),
                ];
            this.literals = code.decoding[0];
            this.distances = code.decoding[1];
            this.mode = CODES;
        } else if (type === 2) this.dynamicHeader();
        else throw dataError("invalid block type");
        this.final = final;
        return true;
    }
    dynamicHeader() {
        const literalCount = this.bits(5) + 257,
            distanceCount = this.bits(5) + 1,
            codeLengthCount = this.bits(4) + 4;
        if (literalCount > 286 || distanceCount > 30)
            throw dataError("too many length or distance symbols");
        const codeLengths = new Uint8Array(19);
        for (let i = 0; i < codeLengthCount; i++)
            codeLengths[CODE_LENGTH_ORDER[i]] = this.bits(3);
        const lengthCode = decodingTable(codeLengths, 0, 19, true);
        if (lengthCode === null) throw dataError("invalid code lengths set");
        const count = literalCount + distanceCount,
            lengths = new Uint8Array(count);
        for (let i = 0; i < count; ) {
            const symbol = this.decode(lengthCode);
            if (symbol < 0) throw dataError("invalid code lengths set");
            if (symbol < 16) {
                lengths[i++] = symbol;
                continue;
            }
            let value = 0,
                repeat;
            if (symbol === 16) {
                if (i === 0) throw dataError("invalid bit length repeat");
                value = lengths[i - 1];
                repeat = 3 + this.bits(2);
            } else if (symbol === 17) repeat = 3 + this.bits(3);
            else repeat = 11 + this.bits(7);
            if (i + repeat > count)
                throw dataError("invalid bit length repeat");
            while (repeat-- > 0) lengths[i++] = value;
        }
        if (lengths[256] === 0)
            throw dataError("invalid code -- missing end-of-block");
        const literals = decodingTable(lengths, 0, literalCount, false);
        if (literals === null) throw dataError("invalid literal/lengths set");
        const distances = decodingTable(
            lengths,
            literalCount,
            distanceCount,
            false,
        );
        if (distances === null) throw dataError("invalid distances set");
        this.literals = literals;
        this.distances = distances;
        this.mode = CODES;
    }
    storedData() {
        while (this.stored > 0) {
            if (this.end > OUTPUT_LIMIT) this.slide();
            if (this.bitCount >= 8) {
                this.output[this.end++] = this.bitBuffer & 255;
                this.bitBuffer >>>= 8;
                this.bitCount -= 8;
                this.stored--;
                continue;
            }
            const available = this.input.length - this.position;
            if (available === 0) return false;
            const count = Math.min(
                this.stored,
                available,
                OUTPUT_SIZE - this.end,
            );
            this.output.set(
                this.input.subarray(this.position, this.position + count),
                this.end,
            );
            this.position += count;
            this.end += count;
            this.stored -= count;
        }
        this.mode = this.final ? TRAILER : BLOCK;
        return true;
    }
    codes() {
        const output = this.output,
            literals = this.literals,
            distances = this.distances;
        for (;;) {
            if (this.end > OUTPUT_LIMIT) this.slide();
            let symbol = this.decode(literals);
            if (symbol < 256) {
                if (symbol < 0) throw dataError("invalid literal/length code");
                output[this.end++] = symbol;
            } else if (symbol === 256) {
                this.mode = this.final ? TRAILER : BLOCK;
                return true;
            } else {
                symbol -= 257;
                if (symbol >= 29)
                    throw dataError("invalid literal/length code");
                const length =
                    LENGTH_BASE[symbol] + this.bits(LENGTH_EXTRA[symbol]);
                const code = this.decode(distances);
                if (code < 0 || code >= 30)
                    throw dataError("invalid distance code");
                const distance =
                    DISTANCE_BASE[code] + this.bits(DISTANCE_EXTRA[code]);
                if (distance > this.total + this.end - this.emitted)
                    throw dataError("invalid distance too far back");
                let to = this.end,
                    from = to - distance;
                const stop = to + length;
                while (to < stop) output[to++] = output[from++];
                this.end = stop;
            }
            this.markPosition = this.position;
            this.markBuffer = this.bitBuffer;
            this.markCount = this.bitCount;
        }
    }
    trailer() {
        this.emit();
        this.align();
        if (this.format === "zlib") {
            const check =
                ((this.bits(8) << 24) |
                    (this.bits(8) << 16) |
                    (this.bits(8) << 8) |
                    this.bits(8)) >>>
                0;
            if (check !== this.check) throw dataError("incorrect data check");
        } else if (this.format === "gzip") {
            const check = (this.bits(16) | (this.bits(16) << 16)) >>> 0;
            if (check !== this.check) throw dataError("incorrect data check");
            const size = (this.bits(16) | (this.bits(16) << 16)) >>> 0;
            if (size !== this.total >>> 0)
                throw dataError("incorrect length check");
            this.mode = MEMBER;
            return true;
        }
        this.mode = DONE;
        return true;
    }
}

// Encoding.
class BitWriter {
    constructor() {
        this.buffer = new Uint8Array(4096);
        this.length = 0;
        this.bitBuffer = 0;
        this.bitCount = 0;
    }
    reserve(count) {
        if (this.length + count <= this.buffer.length) return;
        let size = this.buffer.length * 2;
        while (size < this.length + count) size *= 2;
        const buffer = new Uint8Array(size);
        buffer.set(this.buffer.subarray(0, this.length));
        this.buffer = buffer;
    }
    bits(value, count) {
        this.bitBuffer |= value << this.bitCount;
        this.bitCount += count;
        while (this.bitCount >= 8) {
            if (this.length === this.buffer.length) this.reserve(1);
            this.buffer[this.length++] = this.bitBuffer & 255;
            this.bitBuffer >>>= 8;
            this.bitCount -= 8;
        }
    }
    align() {
        if (this.bitCount > 0) this.bits(0, 8 - this.bitCount);
    }
    bytes(bytes, start, end) {
        this.reserve(end - start);
        this.buffer.set(bytes.subarray(start, end), this.length);
        this.length += end - start;
    }
    take() {
        const chunk = Buffer.allocUnsafe(this.length);
        chunk.set(this.buffer.subarray(0, this.length));
        this.length = 0;
        return chunk;
    }
}

let lengthCodes = null,
    distanceCodes = null;
function distanceCode(distance) {
    return distance <= 256
        ? distanceCodes[distance - 1]
        : distanceCodes[256 + ((distance - 1) >> 7)];
}
function encodingTables() {
    if (lengthCodes !== null) return;
    lengthCodes = new Uint8Array(259);
    for (let code = 0; code < 29; code++)
        for (
            let length = LENGTH_BASE[code];
            length < LENGTH_BASE[code] + (1 << LENGTH_EXTRA[code]) &&
            length <= 258;
            length++
        )
            lengthCodes[length] = code;
    lengthCodes[258] = 28;
    // Distances up to 256 index the table directly, longer ones by 128s.
    distanceCodes = new Uint8Array(512);
    let code = 0;
    for (let distance = 1; distance <= 256; distance++) {
        while (DISTANCE_BASE[code + 1] <= distance) code++;
        distanceCodes[distance - 1] = code;
    }
    for (let index = 2; index < 256; index++) {
        while (code < 29 && DISTANCE_BASE[code + 1] <= (index << 7) + 1) code++;
        distanceCodes[256 + index] = code;
    }
}

/** Huffman code lengths of at most limit bits for the frequencies; at least two codes. */
function codeLengths(frequencies, count, limit) {
    const weights = Array.from(frequencies.subarray(0, count));
    let used = 0;
    for (let i = 0; i < count; i++) if (weights[i] > 0) used++;
    for (let i = 0; used < 2; i++)
        if (weights[i] === 0) {
            weights[i] = 1;
            used++;
        }
    for (;;) {
        const symbols = [];
        for (let i = 0; i < count; i++) if (weights[i] > 0) symbols.push(i);
        symbols.sort((a, b) => weights[a] - weights[b] || a - b);
        const leaves = symbols.length,
            nodes = 2 * leaves - 1;
        const weight = new Float64Array(nodes),
            parent = new Int32Array(nodes),
            depth = new Int32Array(nodes);
        for (let i = 0; i < leaves; i++) weight[i] = weights[symbols[i]];
        let leaf = 0,
            inner = leaves;
        for (let next = leaves; next < nodes; next++) {
            let pair = 0;
            for (let k = 0; k < 2; k++) {
                const node =
                    leaf < leaves && (inner >= next || weight[leaf] <= weight[inner])
                        ? leaf++
                        : inner++;
                parent[node] = next;
                pair += weight[node];
            }
            weight[next] = pair;
        }
        let max = 0;
        for (let i = nodes - 2; i >= 0; i--) {
            depth[i] = depth[parent[i]] + 1;
            if (depth[i] > max) max = depth[i];
        }
        if (max <= limit) {
            const lengths = new Uint8Array(count);
            for (let i = 0; i < leaves; i++) lengths[symbols[i]] = depth[i];
            return lengths;
        }
        for (let i = 0; i < count; i++)
            if (weights[i] > 0) weights[i] = (weights[i] >> 1) | 1;
    }
}

// Chain lengths of the match search by level (0 stores).
const CHAIN_BY_LEVEL = [0, 4, 8, 16, 32, 64, 128, 256, 1024, 4096];
const MAX_TOKENS = 16384;

/** Compresses blocks of data; matches stay within one call. */
class Deflater {
    constructor(level) {
        encodingTables();
        this.level = level;
        this.writer = new BitWriter();
        this.head = new Int32Array(32768);
        this.previous = new Int32Array(WINDOW);
        this.lengths = new Uint16Array(MAX_TOKENS);
        this.values = new Uint16Array(MAX_TOKENS);
    }
    compress(data, final) {
        const writer = this.writer;
        if (this.level === 0 || data.length === 0) {
            if (data.length === 0 && final) {
                writer.bits(1, 1);
                writer.bits(1, 2);
                writer.bits(0, 7);
            } else this.storedBlocks(data, 0, data.length, final);
            return;
        }
        this.head.fill(-1);
        let position = 0;
        while (position < data.length) {
            const start = position;
            const count = this.tokenize(data, position);
            position = this.position;
            this.block(
                data,
                start,
                position,
                count,
                final && position === data.length,
            );
        }
    }
    tokenize(data, position) {
        const end = data.length,
            head = this.head,
            previous = this.previous,
            lengths = this.lengths,
            values = this.values,
            chain = CHAIN_BY_LEVEL[this.level];
        let count = 0;
        while (position < end && count < MAX_TOKENS) {
            let best = 0,
                bestDistance = 0;
            if (position + 2 < end) {
                const hash =
                    ((data[position] << 10) ^
                        (data[position + 1] << 5) ^
                        data[position + 2]) &
                    32767;
                const max = Math.min(258, end - position);
                let candidate = head[hash],
                    budget = chain;
                while (
                    candidate >= 0 &&
                    position - candidate <= WINDOW &&
                    budget-- > 0
                ) {
                    if (data[candidate + best] === data[position + best]) {
                        let length = 0;
                        while (
                            length < max &&
                            data[candidate + length] === data[position + length]
                        )
                            length++;
                        if (length > best) {
                            best = length;
                            bestDistance = position - candidate;
                            if (length === max) break;
                        }
                    }
                    candidate = previous[candidate & (WINDOW - 1)];
                }
            }
            const step = best >= 3 ? best : 1;
            if (best >= 3) {
                lengths[count] = best;
                values[count] = bestDistance;
            } else {
                lengths[count] = 0;
                values[count] = data[position];
            }
            count++;
            for (let i = 0; i < step; i++, position++) {
                if (position + 2 >= end) continue;
                const hash =
                    ((data[position] << 10) ^
                        (data[position + 1] << 5) ^
                        data[position + 2]) &
                    32767;
                previous[position & (WINDOW - 1)] = head[hash];
                head[hash] = position;
            }
        }
        this.position = position;
        return count;
    }
    storedBlocks(data, start, end, final) {
        const writer = this.writer;
        do {
            const length = Math.min(65535, end - start);
            writer.bits(final && start + length === end ? 1 : 0, 1);
            writer.bits(0, 2);
            writer.align();
            writer.bits(length, 16);
            writer.bits(~length & 0xffff, 16);
            writer.bytes(data, start, start + length);
            start += length;
        } while (start < end);
    }
    block(data, start, end, count, final) {
        const writer = this.writer,
            lengths = this.lengths,
            values = this.values,
            fixed = fixedCode();
        const literalFrequencies = new Int32Array(286),
            distanceFrequencies = new Int32Array(30);
        let extraBits = 0,
            fixedCost = 7;
        for (let i = 0; i < count; i++) {
            if (lengths[i] === 0) {
                literalFrequencies[values[i]]++;
                fixedCost += fixed.literalLengths[values[i]];
            } else {
                const lengthCode = lengthCodes[lengths[i]],
                    code = distanceCode(values[i]);
                literalFrequencies[257 + lengthCode]++;
                distanceFrequencies[code]++;
                extraBits += LENGTH_EXTRA[lengthCode] + DISTANCE_EXTRA[code];
                fixedCost += fixed.literalLengths[257 + lengthCode] + 5;
            }
        }
        literalFrequencies[256] = 1;
        fixedCost += extraBits;
        // A dynamic code's header does not pay off for a small block.
        const plan =
            count >= SMALL_BLOCK
                ? dynamicPlan(
                      literalFrequencies,
                      distanceFrequencies,
                      extraBits,
                  )
                : null;
        const storedCost =
            (end - start) * 8 + Math.ceil((end - start + 1) / 65535) * 40;
        if (
            storedCost <= fixedCost &&
            (plan === null || storedCost <= plan.cost)
        ) {
            this.storedBlocks(data, start, end, final);
            return;
        }
        writer.bits(final ? 1 : 0, 1);
        let literalTable, literalCodes, distanceTable, distanceCodesOut;
        if (plan === null || fixedCost <= plan.cost) {
            writer.bits(1, 2);
            literalTable = fixed.literalLengths;
            literalCodes = fixed.literalCodes;
            distanceTable = fixed.distanceLengths;
            distanceCodesOut = fixed.distanceCodes;
        } else {
            writer.bits(2, 2);
            plan.writeHeader(writer);
            literalTable = plan.literalLengths;
            distanceTable = plan.distanceLengths;
            literalCodes = canonicalCodes(literalTable, 286);
            distanceCodesOut = canonicalCodes(distanceTable, 30);
        }
        for (let i = 0; i < count; i++) {
            const length = lengths[i];
            if (length === 0) {
                const value = values[i];
                writer.bits(literalCodes[value], literalTable[value]);
                continue;
            }
            const lengthCode = lengthCodes[length],
                distance = values[i],
                code = distanceCode(distance);
            writer.bits(
                literalCodes[257 + lengthCode],
                literalTable[257 + lengthCode],
            );
            writer.bits(
                length - LENGTH_BASE[lengthCode],
                LENGTH_EXTRA[lengthCode],
            );
            writer.bits(distanceCodesOut[code], distanceTable[code]);
            writer.bits(distance - DISTANCE_BASE[code], DISTANCE_EXTRA[code]);
        }
        writer.bits(literalCodes[256], literalTable[256]);
    }
}

const SMALL_BLOCK = 256;

/** The code lengths of a dynamic block, its size in bits and a writer of its header (RFC 1951, 3.2.7). */
function dynamicPlan(literalFrequencies, distanceFrequencies, extraBits) {
    const literalLengths = codeLengths(literalFrequencies, 286, 15),
        distanceLengths = codeLengths(distanceFrequencies, 30, 15);
    let literalCount = 286,
        distanceCount = 30;
    while (literalCount > 257 && literalLengths[literalCount - 1] === 0)
        literalCount--;
    while (distanceCount > 1 && distanceLengths[distanceCount - 1] === 0)
        distanceCount--;
    // Run-length encode the code lengths.
    const all = new Uint8Array(literalCount + distanceCount);
    all.set(literalLengths.subarray(0, literalCount));
    all.set(distanceLengths.subarray(0, distanceCount), literalCount);
    const runSymbols = [],
        runExtras = [],
        lengthFrequencies = new Int32Array(19);
    const run = (symbol, extra) => {
        runSymbols.push(symbol);
        runExtras.push(extra);
        lengthFrequencies[symbol]++;
    };
    for (let i = 0; i < all.length; ) {
        const value = all[i];
        let repeat = 1;
        while (i + repeat < all.length && all[i + repeat] === value) repeat++;
        i += repeat;
        if (value === 0) {
            while (repeat >= 11) {
                const part = Math.min(repeat, 138);
                run(18, part - 11);
                repeat -= part;
            }
            if (repeat >= 3) {
                run(17, repeat - 3);
                repeat = 0;
            }
        } else {
            run(value, 0);
            repeat--;
            while (repeat >= 3) {
                const part = Math.min(repeat, 6);
                run(16, part - 3);
                repeat -= part;
            }
        }
        while (repeat-- > 0) run(value, 0);
    }
    const lengthLengths = codeLengths(lengthFrequencies, 19, 7);
    let lengthCount = 19;
    while (
        lengthCount > 4 &&
        lengthLengths[CODE_LENGTH_ORDER[lengthCount - 1]] === 0
    )
        lengthCount--;
    let cost = 17 + 3 * lengthCount + extraBits;
    for (let i = 0; i < 19; i++)
        cost += lengthFrequencies[i] * lengthLengths[i];
    cost +=
        lengthFrequencies[16] * 2 +
        lengthFrequencies[17] * 3 +
        lengthFrequencies[18] * 7;
    for (let i = 0; i < 286; i++)
        cost += literalFrequencies[i] * literalLengths[i];
    for (let i = 0; i < 30; i++)
        cost += distanceFrequencies[i] * distanceLengths[i];
    return {
        cost,
        literalLengths,
        distanceLengths,
        writeHeader(writer) {
            writer.bits(literalCount - 257, 5);
            writer.bits(distanceCount - 1, 5);
            writer.bits(lengthCount - 4, 4);
            for (let i = 0; i < lengthCount; i++)
                writer.bits(lengthLengths[CODE_LENGTH_ORDER[i]], 3);
            const codes = canonicalCodes(lengthLengths, 19);
            for (let i = 0; i < runSymbols.length; i++) {
                const symbol = runSymbols[i];
                writer.bits(codes[symbol], lengthLengths[symbol]);
                if (symbol === 16) writer.bits(runExtras[i], 2);
                else if (symbol === 17) writer.bits(runExtras[i], 3);
                else if (symbol === 18) writer.bits(runExtras[i], 7);
            }
        },
    };
}

const SEGMENT = 65536;

/** An incremental compressor for the "zlib", "gzip" or "raw" format. */
class Compressor {
    constructor(format, level) {
        this.format = format;
        this.level = level === -1 ? 6 : level;
        this.deflater = new Deflater(this.level);
        this.pending = [];
        this.pendingLength = 0;
        this.started = false;
        this.check = format === "zlib" ? 1 : 0;
        this.total = 0;
    }
    start() {
        if (this.started) return;
        this.started = true;
        const writer = this.deflater.writer,
            level = this.level;
        if (this.format === "zlib") {
            writer.bits(0x78, 8);
            writer.bits(level < 2 ? 0x01 : level < 6 ? 0x5e : level === 6 ? 0x9c : 0xda, 8);
        } else if (this.format === "gzip") {
            for (const byte of [0x1f, 0x8b, 8, 0, 0, 0, 0, 0])
                writer.bits(byte, 8);
            writer.bits(level === 9 ? 2 : level === 1 ? 4 : 0, 8);
            // The operating system byte zlib writes (NTFS or Unix).
            writer.bits(process.platform === "win32" ? 10 : 3, 8);
        }
    }
    compressPending(final) {
        this.start();
        let data;
        if (this.pending.length === 1) data = this.pending[0];
        else {
            data = new Uint8Array(this.pendingLength);
            let at = 0;
            for (const chunk of this.pending) {
                data.set(chunk, at);
                at += chunk.length;
            }
        }
        this.pending = [];
        this.pendingLength = 0;
        if (this.format === "zlib")
            this.check = adlerUpdate(this.check, data, 0, data.length);
        else if (this.format === "gzip")
            this.check = crcUpdate(this.check, data, 0, data.length);
        this.total += data.length;
        if (data.length > 0 || final) this.deflater.compress(data, final);
    }
    write(bytes) {
        if (bytes.length > 0) {
            // The caller may reuse its buffer.
            this.pending.push(Uint8Array.from(bytes));
            this.pendingLength += bytes.length;
        }
        if (this.pendingLength < SEGMENT) return [];
        this.compressPending(false);
        return this.take();
    }
    flush() {
        this.compressPending(false);
        // An empty stored block ends on a byte boundary (a sync flush).
        const writer = this.deflater.writer;
        writer.bits(0, 3);
        writer.align();
        writer.bits(0, 16);
        writer.bits(0xffff, 16);
        return this.take();
    }
    finish() {
        this.compressPending(true);
        const writer = this.deflater.writer;
        writer.align();
        const check = this.check;
        if (this.format === "zlib")
            for (const shift of [24, 16, 8, 0])
                writer.bits((check >>> shift) & 255, 8);
        else if (this.format === "gzip")
            for (const value of [check, this.total >>> 0])
                for (const shift of [0, 8, 16, 24])
                    writer.bits((value >>> shift) & 255, 8);
        return this.take();
    }
    take() {
        const writer = this.deflater.writer;
        return writer.length > 0 ? [writer.take()] : [];
    }
}

function checkLevel(options) {
    const level = options && options.level;
    if (level === undefined) return -1;
    if (typeof level !== "number" || !Number.isInteger(level)) {
        throw invalidArgType("options.level", "of type number", level);
    }
    if (level < -1 || level > 9) {
        const error = new RangeError(
            'The value of "options.level" is out of range. It must be >= -1 and <= 9. Received ' +
                level,
        );
        error.code = "ERR_OUT_OF_RANGE";
        throw error;
    }
    return level;
}
function engineFor(kind, options) {
    if (options && options.dictionary !== undefined)
        unsupported("The zlib dictionary option")();
    switch (kind) {
        case "deflate":
            return new Compressor("zlib", checkLevel(options));
        case "deflateRaw":
            return new Compressor("raw", checkLevel(options));
        case "gzip":
            return new Compressor("gzip", checkLevel(options));
    }
    const finishFlush =
        options && options.finishFlush !== undefined
            ? options.finishFlush
            : zlibConstants.Z_FINISH;
    const format =
        kind === "inflate"
            ? "zlib"
            : kind === "inflateRaw"
              ? "raw"
              : kind === "gunzip"
                ? "gzip"
                : "unzip";
    return new Inflater(format, finishFlush === zlibConstants.Z_FINISH);
}

function syncFunction(kind) {
    return function (buffer, options) {
        const bytes = toBytes(buffer, "buffer"),
            engine = engineFor(kind, options);
        const chunks = engine.write(bytes).concat(engine.finish());
        return chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
    };
}
function callbackFunction(sync) {
    return function (buffer, options, callback) {
        if (typeof options === "function") {
            callback = options;
            options = {};
        }
        if (typeof callback !== "function")
            throw invalidArgType("callback", "of type function", callback);
        toBytes(buffer, "buffer");
        let result, error;
        try {
            result = sync(buffer, options);
        } catch (thrown) {
            error = thrown;
        }
        process.nextTick(() =>
            error === undefined ? callback(null, result) : callback(error),
        );
    };
}

const FLUSH_MARKERS = [];
class ZlibBase extends Transform {
    constructor(options, engine) {
        super(options);
        this._engine = engine;
        this.bytesWritten = 0;
        this._defaultFlushFlag =
            options && options.flush !== undefined
                ? options.flush
                : zlibConstants.Z_NO_FLUSH;
    }
    get bytesRead() {
        return this.bytesWritten;
    }
    _transform(chunk, encoding, callback) {
        let output;
        try {
            if (FLUSH_MARKERS.includes(chunk)) output = this._engine.flush();
            else {
                const bytes =
                    typeof chunk === "string"
                        ? Buffer.from(chunk, encoding)
                        : chunk;
                this.bytesWritten += bytes.length;
                output = this._engine.write(bytes);
                if (this._defaultFlushFlag !== zlibConstants.Z_NO_FLUSH)
                    output = output.concat(this._engine.flush());
            }
        } catch (error) {
            callback(error);
            return;
        }
        for (const chunk of output) this.push(chunk);
        callback();
    }
    _flush(callback) {
        let output;
        try {
            output = this._engine.finish();
        } catch (error) {
            callback(error);
            return;
        }
        for (const chunk of output) this.push(chunk);
        callback();
    }
    flush(kind, callback) {
        if (typeof kind === "function" || kind === undefined) {
            callback = kind;
            kind = zlibConstants.Z_FULL_FLUSH;
        }
        if (this.writableEnded) {
            if (callback) process.nextTick(callback);
            return;
        }
        const marker = Buffer.alloc(0);
        FLUSH_MARKERS.push(marker);
        this.write(marker, () => {
            FLUSH_MARKERS.splice(FLUSH_MARKERS.indexOf(marker), 1);
            if (callback) callback();
        });
    }
    params(level, strategy, callback) {
        if (callback) process.nextTick(callback);
    }
    reset() {}
    close(callback) {
        if (callback) this.once("close", callback);
        this.destroy();
    }
}
class Zlib extends ZlibBase {}

export class Deflate extends Zlib {
    constructor(options) {
        super(options, engineFor("deflate", options));
    }
}
export class Inflate extends Zlib {
    constructor(options) {
        super(options, engineFor("inflate", options));
    }
}
export class Gzip extends Zlib {
    constructor(options) {
        super(options, engineFor("gzip", options));
    }
}
export class Gunzip extends Zlib {
    constructor(options) {
        super(options, engineFor("gunzip", options));
    }
}
export class DeflateRaw extends Zlib {
    constructor(options) {
        super(options, engineFor("deflateRaw", options));
    }
}
export class InflateRaw extends Zlib {
    constructor(options) {
        super(options, engineFor("inflateRaw", options));
    }
}
export class Unzip extends Zlib {
    constructor(options) {
        super(options, engineFor("unzip", options));
    }
}
function unsupportedClass(name) {
    return class {
        constructor() {
            unsupported("zlib." + name)();
        }
    };
}
export const BrotliCompress = unsupportedClass("BrotliCompress"),
    BrotliDecompress = unsupportedClass("BrotliDecompress"),
    ZstdCompress = unsupportedClass("ZstdCompress"),
    ZstdDecompress = unsupportedClass("ZstdDecompress");

export const deflateSync = syncFunction("deflate"),
    inflateSync = syncFunction("inflate"),
    gzipSync = syncFunction("gzip"),
    gunzipSync = syncFunction("gunzip"),
    deflateRawSync = syncFunction("deflateRaw"),
    inflateRawSync = syncFunction("inflateRaw"),
    unzipSync = syncFunction("unzip");
export const deflate = callbackFunction(deflateSync),
    inflate = callbackFunction(inflateSync),
    gzip = callbackFunction(gzipSync),
    gunzip = callbackFunction(gunzipSync),
    deflateRaw = callbackFunction(deflateRawSync),
    inflateRaw = callbackFunction(inflateRawSync),
    unzip = callbackFunction(unzipSync);
export const createDeflate = (options) => new Deflate(options),
    createInflate = (options) => new Inflate(options),
    createGzip = (options) => new Gzip(options),
    createGunzip = (options) => new Gunzip(options),
    createDeflateRaw = (options) => new DeflateRaw(options),
    createInflateRaw = (options) => new InflateRaw(options),
    createUnzip = (options) => new Unzip(options);
export const brotliCompress = unsupported("zlib.brotliCompress"),
    brotliCompressSync = unsupported("zlib.brotliCompressSync"),
    brotliDecompress = unsupported("zlib.brotliDecompress"),
    brotliDecompressSync = unsupported("zlib.brotliDecompressSync"),
    createBrotliCompress = unsupported("zlib.createBrotliCompress"),
    createBrotliDecompress = unsupported("zlib.createBrotliDecompress");
export const zstdCompress = unsupported("zlib.zstdCompress"),
    zstdCompressSync = unsupported("zlib.zstdCompressSync"),
    zstdDecompress = unsupported("zlib.zstdDecompress"),
    zstdDecompressSync = unsupported("zlib.zstdDecompressSync"),
    createZstdCompress = unsupported("zlib.createZstdCompress"),
    createZstdDecompress = unsupported("zlib.createZstdDecompress");

const zlib = {
    crc32,
    Deflate,
    Inflate,
    Gzip,
    Gunzip,
    DeflateRaw,
    InflateRaw,
    Unzip,
    BrotliCompress,
    BrotliDecompress,
    ZstdCompress,
    ZstdDecompress,
    deflate,
    deflateSync,
    gzip,
    gzipSync,
    deflateRaw,
    deflateRawSync,
    unzip,
    unzipSync,
    inflate,
    inflateSync,
    gunzip,
    gunzipSync,
    inflateRaw,
    inflateRawSync,
    brotliCompress,
    brotliCompressSync,
    brotliDecompress,
    brotliDecompressSync,
    zstdCompress,
    zstdCompressSync,
    zstdDecompress,
    zstdDecompressSync,
    createDeflate,
    createInflate,
    createDeflateRaw,
    createInflateRaw,
    createGzip,
    createGunzip,
    createUnzip,
    createBrotliCompress,
    createBrotliDecompress,
    createZstdCompress,
    createZstdDecompress,
    constants,
    codes,
};
// The legacy top-level constants (zlib.Z_SYNC_FLUSH, ...): all but Brotli's.
for (const name of Object.keys(constants))
    if (!name.startsWith("BROTLI_"))
        Object.defineProperty(zlib, name, {
            value: constants[name],
            enumerable: false,
        });
export default zlib;
