// Arithmetic and call kernels of the Nona vs optimized C++ comparison (#401).
// ../cpp/arith.cpp is the C++ twin: every kernel below has a C++ kernel with
// the same name, the same inputs and the same order of operations, so the
// checksums agree exactly (no tolerance).
//
//   arith <kernel> <n> <seed>
//
// The program builds the kernel's inputs from <seed> (xorshift32), times only
// the kernel call with performance.now() and prints one JSON line:
// {"kernel", "n", "ns", "checksum"}. Nothing is printed inside the timed region.
// The arguments are the last three of process.argv (Node.js passes the script
// path in argv[1], a Nona executable does not).
//
// Contract: one "operation" is one arithmetic operation of the named kind on a
// value of the named type; a kernel performs exactly n of them.
// - f64_*: JS Number arithmetic, C++ double (IEEE binary64, no fast-math, no
//   FMA contraction). u32_*: wrapping 32-bit arithmetic, (a + b) >>> 0 and
//   Math.imul(a, b) >>> 0, C++ uint32_t.
// - Inputs come from a 1024-entry seeded table (8 KiB of doubles or 4 KiB of
//   u32, L1-resident); operation i reads t[i & 1023]. The loop, the masked
//   index and the load are part of every iteration; loop_control has the same
//   loop, index and load with an XOR instead of the measured operation.
// - *_chain: one accumulator, each operation depends on the previous one
//   (latency). *_x4: four independent accumulators, n / 4 iterations of four
//   operations (throughput; n must be a multiple of 4). The accumulators are
//   combined once after the loop: (s0 op s1) op (s2 op s3).
// - Multiplication chains: f64 factors are 1 ± k·2^-30 with k in 1..1024, so
//   every factor is in [1 - 2^-20, 1 + 2^-20] and the table holds each factor
//   with its mirror; the product stays near 1 and never reaches 0, Inf or NaN.
//   u32 factors are odd, so the product is never 0.
// - *_direct: n calls of the named function add(a, b) / multiply(a, b), one
//   operation per call. *_indirect: n calls through a function taken from an
//   array whose layout depends on the seed (C++: a function pointer chosen
//   the same way; *_stdfn in C++ is the same pointer in a std::function and
//   runs against this kernel). *_closure: n calls of a closure that captured
//   the seeded table, (s, i) => s op t[i & 1023] (C++: a lambda capturing
//   the table pointer by value, called through std::function). Function
//   selection and closure creation happen before the timed region.
// - f64_array_<size>: n element updates a[j] = a[j] * k + c over a
//   Float64Array of <size> bytes (4 KiB, 1 MiB, 64 MiB), restarting at a[0]
//   after the last element; k and c come from the seed. One operation is one
//   element update (one multiplication and one addition, 8 bytes read and 8
//   written). The checksum is the sum of the array, computed after timing.
// - Checksums: "f64:<16 hex digits>" (bits of the double) or "u32:<decimal>".
const MASK = 1023;

const [kernel, nText, seedText] = process.argv.slice(-3);
const n = Number(nText);
if (!(n >= 0 && Math.floor(n) === n))
    throw new Error("usage: arith <kernel> <n> <seed>");
const seed = Number(seedText) >>> 0;

let state = seed || 0x9e3779b9;
function next() {
    state = (state ^ (state << 13)) >>> 0;
    state = (state ^ (state >>> 17)) >>> 0;
    state = (state ^ (state << 5)) >>> 0;
    return state;
}

// Doubles in [0, 1) with 24 significant bits.
function f64AddTable() {
    const t = new Float64Array(MASK + 1);
    for (let j = 0; j <= MASK; j++) t[j] = (next() >>> 8) / 16777216;
    return t;
}
// Factors 1 + d and 1 - d, d = k * 2^-30, k in 1..1024.
function f64MulTable() {
    const t = new Float64Array(MASK + 1);
    for (let j = 0; j < 512; j++) {
        const d = (1 + (next() % 1024)) / 1073741824;
        t[j] = 1 + d;
        t[j + 512] = 1 - d;
    }
    return t;
}
function u32Table(odd) {
    const t = new Uint32Array(MASK + 1);
    for (let j = 0; j <= MASK; j++) t[j] = odd ? (next() | 1) >>> 0 : next();
    return t;
}

function add(a, b) {
    return a + b;
}
function multiply(a, b) {
    return a * b;
}
function addU32(a, b) {
    return (a + b) >>> 0;
}
function multiplyU32(a, b) {
    return Math.imul(a, b) >>> 0;
}

// Inline expressions.
function f64AddChain(t, n) {
    let s = 0;
    for (let i = 0; i < n; i++) s = s + t[i & MASK];
    return s;
}
function f64AddX4(t, n) {
    let s0 = 0,
        s1 = 0,
        s2 = 0,
        s3 = 0;
    for (let i = 0; i < n; i += 4) {
        s0 = s0 + t[i & MASK];
        s1 = s1 + t[(i + 1) & MASK];
        s2 = s2 + t[(i + 2) & MASK];
        s3 = s3 + t[(i + 3) & MASK];
    }
    return s0 + s1 + (s2 + s3);
}
function f64MulChain(t, n) {
    let p = 1;
    for (let i = 0; i < n; i++) p = p * t[i & MASK];
    return p;
}
function f64MulX4(t, n) {
    let p0 = 1,
        p1 = 1,
        p2 = 1,
        p3 = 1;
    for (let i = 0; i < n; i += 4) {
        p0 = p0 * t[i & MASK];
        p1 = p1 * t[(i + 1) & MASK];
        p2 = p2 * t[(i + 2) & MASK];
        p3 = p3 * t[(i + 3) & MASK];
    }
    return p0 * p1 * (p2 * p3);
}
function u32AddChain(t, n) {
    let s = 0;
    for (let i = 0; i < n; i++) s = (s + t[i & MASK]) >>> 0;
    return s;
}
function u32AddX4(t, n) {
    let s0 = 0,
        s1 = 0,
        s2 = 0,
        s3 = 0;
    for (let i = 0; i < n; i += 4) {
        s0 = (s0 + t[i & MASK]) >>> 0;
        s1 = (s1 + t[(i + 1) & MASK]) >>> 0;
        s2 = (s2 + t[(i + 2) & MASK]) >>> 0;
        s3 = (s3 + t[(i + 3) & MASK]) >>> 0;
    }
    return (((s0 + s1) >>> 0) + ((s2 + s3) >>> 0)) >>> 0;
}
function u32MulChain(t, n) {
    let p = 1;
    for (let i = 0; i < n; i++) p = Math.imul(p, t[i & MASK]) >>> 0;
    return p;
}
function u32MulX4(t, n) {
    let p0 = 1,
        p1 = 1,
        p2 = 1,
        p3 = 1;
    for (let i = 0; i < n; i += 4) {
        p0 = Math.imul(p0, t[i & MASK]) >>> 0;
        p1 = Math.imul(p1, t[(i + 1) & MASK]) >>> 0;
        p2 = Math.imul(p2, t[(i + 2) & MASK]) >>> 0;
        p3 = Math.imul(p3, t[(i + 3) & MASK]) >>> 0;
    }
    return Math.imul(Math.imul(p0, p1), Math.imul(p2, p3)) >>> 0;
}
function loopControl(t, n) {
    let c = 0;
    for (let i = 0; i < n; i++) c = (c ^ t[i & MASK]) >>> 0;
    return c;
}

// Direct calls of a known function.
function f64AddDirect(t, n) {
    let s = 0;
    for (let i = 0; i < n; i++) s = add(s, t[i & MASK]);
    return s;
}
function f64MulDirect(t, n) {
    let p = 1;
    for (let i = 0; i < n; i++) p = multiply(p, t[i & MASK]);
    return p;
}
function u32AddDirect(t, n) {
    let s = 0;
    for (let i = 0; i < n; i++) s = addU32(s, t[i & MASK]);
    return s;
}
function u32MulDirect(t, n) {
    let p = 1;
    for (let i = 0; i < n; i++) p = multiplyU32(p, t[i & MASK]);
    return p;
}

// Calls of a function value chosen at run time.
function callIndirect(f, t, n, init) {
    let s = init;
    for (let i = 0; i < n; i++) s = f(s, t[i & MASK]);
    return s;
}
// The function of slot `which` (0 = add, 1 = multiply) of an array whose
// order depends on the seed.
function pick(addFn, multiplyFn, which) {
    const swap = seed & 1;
    const fns = swap ? [multiplyFn, addFn] : [addFn, multiplyFn];
    return fns[which ^ swap];
}

// Calls of a closure over the seeded table.
function callClosure(f, n, init) {
    let s = init;
    for (let i = 0; i < n; i++) s = f(s, i);
    return s;
}
function closure(type, op, t) {
    if (type === "f64")
        return op === "add"
            ? (s, i) => s + t[i & MASK]
            : (s, i) => s * t[i & MASK];
    return op === "add"
        ? (s, i) => (s + t[i & MASK]) >>> 0
        : (s, i) => Math.imul(s, t[i & MASK]) >>> 0;
}

// Element-wise update of a typed array (#240).
function f64Array(a, n, k, c) {
    const length = a.length;
    for (let done = 0; done < n; done += length) {
        const m = n - done < length ? n - done : length;
        for (let j = 0; j < m; j++) a[j] = a[j] * k + c;
    }
    return a;
}

const bits = new Float64Array(1);
const words = new Uint32Array(bits.buffer);
const hex = (x) => x.toString(16).padStart(8, "0");
function f64Checksum(x) {
    bits[0] = x;
    return "f64:" + hex(words[1]) + hex(words[0]);
}

const PAYLOAD = { "4k": 4096, "1m": 1 << 20, "64m": 64 << 20 };
// timed() is the timed region; finish(result) makes the checksum after it.
let timed, finish;
const [type, op, form] = kernel.split("_");
if (kernel === "loop_control") {
    const t = u32Table(false);
    timed = () => loopControl(t, n);
    finish = (c) => "u32:" + c;
} else if (type === "f64" && op === "array") {
    if (!PAYLOAD[form]) throw new Error("unknown kernel " + kernel);
    const a = new Float64Array(PAYLOAD[form] / 8);
    for (let j = 0; j < a.length; j++) a[j] = (next() >>> 8) / 16777216;
    const k = 0.5 + ((seed >>> 3) % 8) / 1024;
    const c = (seed % 1024) / 1024;
    timed = () => f64Array(a, n, k, c);
    finish = () => {
        let sum = 0;
        for (let j = 0; j < a.length; j++) sum = sum + a[j];
        return f64Checksum(sum);
    };
} else {
    if ((type !== "f64" && type !== "u32") || (op !== "add" && op !== "mul"))
        throw new Error("unknown kernel " + kernel);
    if (form === "x4" && n % 4 !== 0)
        throw new Error("n must be a multiple of 4 for " + kernel);
    const t =
        type === "f64"
            ? op === "add"
                ? f64AddTable()
                : f64MulTable()
            : u32Table(op === "mul");
    const init = op === "add" ? 0 : 1;
    const kernels = {
        f64_add_chain: f64AddChain,
        f64_add_x4: f64AddX4,
        f64_mul_chain: f64MulChain,
        f64_mul_x4: f64MulX4,
        u32_add_chain: u32AddChain,
        u32_add_x4: u32AddX4,
        u32_mul_chain: u32MulChain,
        u32_mul_x4: u32MulX4,
        f64_add_direct: f64AddDirect,
        f64_mul_direct: f64MulDirect,
        u32_add_direct: u32AddDirect,
        u32_mul_direct: u32MulDirect,
    };
    if (form === "indirect") {
        const which = op === "add" ? 0 : 1;
        const f =
            type === "f64"
                ? pick(add, multiply, which)
                : pick(addU32, multiplyU32, which);
        timed = () => callIndirect(f, t, n, init);
    } else if (form === "closure") {
        const f = closure(type, op, t);
        timed = () => callClosure(f, n, init);
    } else {
        const k = kernels[kernel];
        if (!k) throw new Error("unknown kernel " + kernel);
        timed = () => k(t, n);
    }
    finish = (x) => (type === "u32" ? "u32:" + x : f64Checksum(x));
}

const t0 = performance.now();
const result = timed();
const t1 = performance.now();
console.log(
    JSON.stringify({
        kernel,
        n,
        ns: Math.round((t1 - t0) * 1e6),
        checksum: finish(result),
    }),
);
