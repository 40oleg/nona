// String kernels of the Nona vs optimized C++ comparison (#401).
// ../cpp/strings.cpp is the C++ twin: every kernel below has a C++ kernel with
// the same name, the same inputs and the same algorithm over UTF-16 code units
// (std::u16string), so the checksums agree exactly.
//
//   strings <kernel> <iterations> <seed>
//
// The program builds the kernel's inputs from <seed> (xorshift32, as in
// arith.js), times only the kernel call with performance.now() and prints one
// JSON line: {"kernel", "n", "ns", "checksum", "units", "allocUnits"}. "n" is
// the iteration count (bench/cpp/run.mjs derives it from N and the kernel's
// divisor, so large inputs get bounded counts). Nothing is printed inside the
// timed region. The arguments are the last three of process.argv.
//
// Kernel names: str_<op>_<encoding>_<size>[_<needle>]. Unit: one UTF-16 code
// unit. Encodings (inputs are words of 2..7 code points separated by one
// space, U+0020):
// - ascii: the 16 letters "abcdeghilmnorstu";
// - bmp: 8 Cyrillic letters (U+0430..U+0437) and 8 CJK ideographs, one code
//   unit each, no ASCII except the space;
// - astral: the letters "abcdeghi" and the emoji U+1F600..U+1F607 (a
//   surrogate pair each, two code units). A pair that would not fit at the
//   end becomes "a".
// Sizes (code units, not bytes; UTF-16 storage is twice as many bytes):
// short 16, medium 1024, large 1048576. Every input string is built from an
// array of code units with String.fromCharCode before the timed region, so it
// is a flat string, and strings that are compared are built separately.
//
// One iteration of each kernel (r is the iteration index; L the input length):
// - scan: for j < s.length: acc = (acc + (s.charCodeAt(j) ^ (r & 255))) >>> 0.
//   units = iterations * L.
// - equal / compare: a === c / a < c, c = cands[r & 3]: an equal copy, a copy
//   whose last unit differs, one whose middle unit (L >> 1) differs, and a
//   second equal copy (unit ^ 1 in both cases). Checksum: the count of true
//   results. units: the code units a code-unit-order comparison examines
//   (L, L, (L >> 1) + 1, L).
// - slice: t = s.slice(b, b + m), m = L / 4, b = starts[r & 1023] (seeded,
//   0 <= b <= L - m); slicing may cut a surrogate pair, as in JavaScript.
//   units = allocUnits = iterations * m.
// - indexof_n<k>: p = s.indexOf(needles[r & 15]); 16 needles of k code units
//   cut from the second half of s (k = 4 or 64; short inputs only k = 4).
//   units: p + k per found search, L otherwise.
// - concat: s = s + pieces[r & 15] (16 seeded pieces of P units: 4, 16, 1024
//   for short, medium, large); when s.length reaches L, sample(s) and s = "".
//   Every concatenation is a new immutable string of the summed length:
//   units = allocUnits = the sum of those lengths.
// - builder: parts.push(pieces[r & 15]); after L / P pushes, out =
//   parts.join(""), sample(out), parts = []. units = iterations * P,
//   allocUnits = the joined code units.
// - splitjoin: parts = inputs[r & 3].split(" "); out = parts.join("-").
//   inputs are 4 rotations of the text (cut at L/4 steps, moved past a low
//   surrogate). units = iterations * L; allocUnits = the parts plus out.
// - replace / replaceall: inputs[r & 3].replace(pat, "[#]") / .replaceAll:
//   pat = "ou", "ав" or U+1F600 for ascii, bmp, astral; the pattern is also
//   written into the text at (L >> 1) + 1 so every input has a match.
//   replaceall_log_large: a 1 MiB-unit log of "line <i> request <i> took
//   1ms\n" lines with pat "request " and replacement "req#" (#387).
//   units = iterations * L; allocUnits = the output lengths.
// - format_int: String(x), x = vals[r & 1023] + (r >>> 10): integer-valued
//   doubles below 2^53, so the shortest round-trip form is the decimal
//   integer, as std::to_chars(chars_format::fixed) prints it.
//   units = allocUnits = the output lengths.
// - parse_int: x = Number(strs[r & 1023]) (the decimal strings of vals),
//   acc = acc + x in order. units = the input lengths.
//
// Checksums: mix(h, x) = Math.imul(h ^ x, 16777619) >>> 0. Kernels that make
// strings mix sample(s) = length, first, middle and last unit of their outputs
// in the loop, and after timing the full contents and length of their last
// output or unfinished state ("tail"). Others return their accumulator.
// "u32:<decimal>", or "f64:<16 hex digits>" for parse_int.
const SIZES = { short: 16, medium: 1024, large: 1 << 20 };
const PIECE = { short: 4, medium: 16, large: 1024 };
const SPACE = 32;

const [kernel, nText, seedText] = process.argv.slice(-3);
const n = Number(nText);
if (!(n >= 0 && Math.floor(n) === n))
    throw new Error("usage: strings <kernel> <iterations> <seed>");
const seed = Number(seedText) >>> 0;

let state = seed || 0x9e3779b9;
function next() {
    state = (state ^ (state << 13)) >>> 0;
    state = (state ^ (state >>> 17)) >>> 0;
    state = (state ^ (state << 5)) >>> 0;
    return state;
}

function codesOf(text) {
    const codes = [];
    for (let j = 0; j < text.length; j++) codes.push(text.charCodeAt(j));
    return codes;
}
const ALPHABET = {
    ascii: codesOf("abcdeghilmnorstu"),
    bmp: [
        0x430, 0x431, 0x432, 0x433, 0x434, 0x435, 0x436, 0x437, 0x65e5, 0x672c,
        0x8a9e, 0x4e2d, 0x6587, 0x5b57, 0x6f22, 0x7247,
    ],
    astral: [
        ...codesOf("abcdeghi"),
        0x1f600,
        0x1f601,
        0x1f602,
        0x1f603,
        0x1f604,
        0x1f605,
        0x1f606,
        0x1f607,
    ],
};
const PATTERN = {
    ascii: codesOf("ou"),
    bmp: [0x430, 0x432],
    astral: [0xd83d, 0xde00],
};

// `length` code units of words over the encoding's alphabet.
function words(encoding, length) {
    const alphabet = ALPHABET[encoding];
    const units = [];
    let left = 2 + (next() % 6);
    while (units.length < length) {
        if (left === 0) {
            units.push(SPACE);
            left = 2 + (next() % 6);
            continue;
        }
        const cp = alphabet[next() % 16];
        if (cp <= 0xffff) units.push(cp);
        else if (units.length + 2 > length) units.push(alphabet[0]);
        else
            units.push(
                0xd800 + ((cp - 0x10000) >> 10),
                0xdc00 + ((cp - 0x10000) & 1023),
            );
        left--;
    }
    return units;
}
// A flat string of the code units.
function stringOf(units) {
    const chunks = [];
    for (let j = 0; j < units.length; j += 1024)
        chunks.push(String.fromCharCode(...units.slice(j, j + 1024)));
    return chunks.join("");
}
const isLow = (u) => u >= 0xdc00 && u <= 0xdfff;
// 4 rotations of `units`, cut at multiples of L/4 moved past a low surrogate.
function rotations(units) {
    const result = [];
    for (let k = 0; k < 4; k++) {
        let at = (k * units.length) >> 2;
        while (at < units.length && isLow(units[at])) at++;
        result.push(stringOf(units.slice(at).concat(units.slice(0, at))));
    }
    return result;
}

const mix = (h, x) => Math.imul(h ^ x, 16777619) >>> 0;
function sample(h, s) {
    const length = s.length;
    h = mix(h, length);
    if (length === 0) return h;
    h = mix(h, s.charCodeAt(0));
    h = mix(h, s.charCodeAt(length >> 1));
    return mix(h, s.charCodeAt(length - 1));
}
function full(h, s) {
    for (let j = 0; j < s.length; j++) h = mix(h, s.charCodeAt(j));
    return mix(h, s.length);
}

// Operations on existing storage.
function scan(s, iterations) {
    let acc = 0;
    for (let r = 0; r < iterations; r++) {
        const k = r & 255;
        for (let j = 0; j < s.length; j++)
            acc = (acc + (s.charCodeAt(j) ^ k)) >>> 0;
    }
    return acc;
}
function equal(a, cands, iterations) {
    let count = 0;
    for (let r = 0; r < iterations; r++) if (a === cands[r & 3]) count++;
    return count;
}
function compare(a, cands, iterations) {
    let count = 0;
    for (let r = 0; r < iterations; r++) if (a < cands[r & 3]) count++;
    return count;
}
function indexOf(s, needles, iterations) {
    let h = 0;
    for (let r = 0; r < iterations; r++)
        h = mix(h, s.indexOf(needles[r & 15]) + 1);
    return h;
}
function parse(strs, iterations) {
    let acc = 0;
    for (let r = 0; r < iterations; r++) acc = acc + Number(strs[r & 1023]);
    return acc;
}

// Allocating kernels: each returns {h, produced, tail}.
function slice(s, starts, m, iterations) {
    let h = 0,
        tail = "";
    for (let r = 0; r < iterations; r++) {
        const b = starts[r & 1023];
        const t = s.slice(b, b + m);
        h = mix(mix(h, t.length), t.charCodeAt(t.length - 1));
        tail = t;
    }
    return { h, produced: iterations * m, tail };
}
function concat(pieces, cap, iterations) {
    let s = "",
        h = 0,
        produced = 0;
    for (let r = 0; r < iterations; r++) {
        s = s + pieces[r & 15];
        produced += s.length;
        if (s.length >= cap) {
            h = sample(h, s);
            s = "";
        }
    }
    return { h, produced, tail: s };
}
function builder(pieces, count, iterations) {
    let parts = [],
        h = 0,
        produced = 0;
    for (let r = 0; r < iterations; r++) {
        parts.push(pieces[r & 15]);
        if (parts.length === count) {
            const out = parts.join("");
            produced += out.length;
            h = sample(h, out);
            parts = [];
        }
    }
    return { h, produced, tail: parts.join("") };
}
function splitJoin(inputs, iterations) {
    let h = 0,
        produced = 0,
        tail = "";
    for (let r = 0; r < iterations; r++) {
        const s = inputs[r & 3];
        const parts = s.split(" ");
        const out = parts.join("-");
        produced += s.length - (parts.length - 1) + out.length;
        h = sample(mix(h, parts.length), out);
        tail = out;
    }
    return { h, produced, tail };
}
function replaceFirst(inputs, pat, rep, iterations) {
    let h = 0,
        produced = 0,
        tail = "";
    for (let r = 0; r < iterations; r++) {
        const out = inputs[r & 3].replace(pat, rep);
        produced += out.length;
        h = sample(h, out);
        tail = out;
    }
    return { h, produced, tail };
}
function replaceAll(inputs, pat, rep, iterations) {
    let h = 0,
        produced = 0,
        tail = "";
    for (let r = 0; r < iterations; r++) {
        const out = inputs[r & 3].replaceAll(pat, rep);
        produced += out.length;
        h = sample(h, out);
        tail = out;
    }
    return { h, produced, tail };
}
function format(vals, iterations) {
    let h = 0,
        produced = 0,
        tail = "";
    for (let r = 0; r < iterations; r++) {
        const t = String(vals[r & 1023] + (r >>> 10));
        produced += t.length;
        h = mix(
            mix(mix(h, t.length), t.charCodeAt(0)),
            t.charCodeAt(t.length - 1),
        );
        tail = t;
    }
    return { h, produced, tail };
}

// Integer-valued doubles below 2^52 with 1 to 16 digits.
function intValues() {
    const vals = [];
    for (let j = 0; j < 1024; j++) {
        const hi = next() >>> 12;
        const lo = next();
        vals.push(Math.floor((hi * 4294967296 + lo) / 2 ** (next() % 52)));
    }
    return vals;
}

const bits = new Float64Array(1);
const words32 = new Uint32Array(bits.buffer);
const hex = (x) => x.toString(16).padStart(8, "0");
function f64Checksum(x) {
    bits[0] = x;
    return "f64:" + hex(words32[1]) + hex(words32[0]);
}

// timed() is the timed region; finish(result) returns [checksum, units,
// allocUnits] after it.
let timed, finish;
const [prefix, op, encoding, size, needle] = kernel.split("_");
const L = SIZES[size];
const known = (ok) => {
    if (!ok || prefix !== "str") throw new Error("unknown kernel " + kernel);
};
const allocating = (r) => ["u32:" + full(r.h, r.tail), r.produced, r.produced];
if (op === "format" || op === "parse") {
    known(encoding === "int" && size === "short" && !needle);
    const vals = intValues();
    if (op === "format") {
        timed = () => format(vals, n);
        finish = allocating;
    } else {
        const strs = vals.map((v) => stringOf(codesOf(String(v))));
        timed = () => parse(strs, n);
        finish = (acc) => {
            let units = 0;
            for (let k = 0; k < 1024; k++)
                units += strs[k].length * Math.floor((n - k + 1023) / 1024);
            return [f64Checksum(acc), units, 0];
        };
    }
} else if (encoding === "log") {
    known(op === "replaceall" && size === "large" && !needle);
    let text = "";
    for (let i = seed % 1000; text.length < L; i++)
        text += "line " + i + " request " + i + " took 1ms\n";
    const inputs = rotations(codesOf(text.slice(0, L)));
    timed = () => replaceAll(inputs, "request ", "req#", n);
    finish = (r) => ["u32:" + full(r.h, r.tail), n * L, r.produced];
} else {
    known(ALPHABET[encoding] && L);
    const units = words(encoding, L);
    const s = stringOf(units);
    // How many of the n iterations have r & mask === k.
    const times = (k, mask) => Math.floor((n - k + mask) / (mask + 1));
    if (op === "scan") {
        known(!needle);
        timed = () => scan(s, n);
        finish = (acc) => ["u32:" + acc, n * L, 0];
    } else if (op === "equal" || op === "compare") {
        known(!needle && encoding !== "astral");
        const changed = (at) => {
            const c = units.slice();
            c[at] ^= 1;
            return stringOf(c);
        };
        const cands = [
            stringOf(units),
            changed(L - 1),
            changed(L >> 1),
            stringOf(units),
        ];
        const examined = [L, L, (L >> 1) + 1, L];
        timed = () => (op === "equal" ? equal : compare)(s, cands, n);
        finish = (count) => {
            let total = 0;
            for (let k = 0; k < 4; k++) total += examined[k] * times(k, 3);
            return ["u32:" + count, total, 0];
        };
    } else if (op === "slice") {
        known(!needle);
        const m = L / 4;
        const starts = [];
        for (let k = 0; k < 1024; k++) starts.push(next() % (L - m + 1));
        timed = () => slice(s, starts, m, n);
        finish = allocating;
    } else if (op === "indexof") {
        const k = needle === "n4" ? 4 : needle === "n64" ? 64 : 0;
        known(k && k < L / 2);
        const needles = [];
        for (let j = 0; j < 16; j++) {
            const at = (L >> 1) + (next() % ((L >> 1) - k + 1));
            needles.push(stringOf(units.slice(at, at + k)));
        }
        timed = () => indexOf(s, needles, n);
        finish = (h) => {
            let total = 0;
            for (let j = 0; j < 16; j++) {
                const p = s.indexOf(needles[j]);
                total += (p >= 0 ? p + k : L) * times(j, 15);
            }
            return ["u32:" + h, total, 0];
        };
    } else if (op === "concat" || op === "builder") {
        known(!needle && encoding !== "astral");
        const pieces = [];
        for (let j = 0; j < 16; j++)
            pieces.push(stringOf(words(encoding, PIECE[size])));
        if (op === "concat") {
            timed = () => concat(pieces, L, n);
            finish = allocating;
        } else {
            timed = () => builder(pieces, L / PIECE[size], n);
            finish = (r) => [
                "u32:" + full(r.h, r.tail),
                n * PIECE[size],
                r.produced,
            ];
        }
    } else if (op === "splitjoin" || op === "replace" || op === "replaceall") {
        known(!needle && (op !== "splitjoin" || encoding !== "astral"));
        let inputs;
        if (op === "splitjoin") inputs = rotations(units);
        else {
            const pat = PATTERN[encoding];
            const c = units.slice();
            let at = (L >> 1) + 1;
            while (isLow(c[at])) at++;
            for (let j = 0; j < pat.length; j++) c[at + j] = pat[j];
            if (isLow(c[at + pat.length])) c[at + pat.length] = 0x61;
            inputs = rotations(c);
        }
        const pat = stringOf(PATTERN[encoding]);
        timed =
            op === "splitjoin"
                ? () => splitJoin(inputs, n)
                : op === "replace"
                  ? () => replaceFirst(inputs, pat, "[#]", n)
                  : () => replaceAll(inputs, pat, "[#]", n);
        finish = (r) => ["u32:" + full(r.h, r.tail), n * L, r.produced];
    } else known(false);
}

const t0 = performance.now();
const result = timed();
const t1 = performance.now();
const [checksum, units, allocUnits] = finish(result);
console.log(
    JSON.stringify({
        kernel,
        n,
        ns: Math.round((t1 - t0) * 1e6),
        checksum,
        units,
        allocUnits,
    }),
);
