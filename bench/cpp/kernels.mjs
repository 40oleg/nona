// The kernels of the Nona vs C++ comparison (#401) and the C++ builds, shared
// by build.mjs, check-asm.mjs and run.mjs.
//
// A row pairs a JavaScript kernel (js/<program>.js, argument `js`) with a C++
// kernel (cpp/<program>.cpp, argument `cpp`). The C++ kernel is the function
// `symbol` in the disassembly; check-asm.mjs looks for a loop in it that still
// contains an instruction of class `expect`. Every row does `n` operations of
// the kind `unit` describes; the kernel files state the full contract.

// The C++ builds. o3 is the headline baseline; the others are diagnostic
// columns and are labelled as such. -march=x86-64 is the x86-64 baseline ISA
// (SSE2, no AVX); -ffp-contract=off keeps a * b + c as two IEEE operations, as
// in JavaScript.
const common = [
    "-std=c++17",
    "-O3",
    "-DNDEBUG",
    "-fno-fast-math",
    "-ffp-contract=off",
];
export const BUILDS = {
    o3: {
        flags: [...common, "-march=x86-64", "-mtune=generic"],
        label: "optimized (-O3, x86-64 baseline ISA)",
    },
    noinline: {
        flags: [
            ...common,
            "-march=x86-64",
            "-mtune=generic",
            "-fno-inline",
            "-DBENCH_NOINLINE",
        ],
        label: "diagnostic: -fno-inline and noinline callees (call overhead)",
        rows: (row) => row.kind === "call",
    },
    native: {
        flags: [...common, "-march=native", "-flto"],
        label: "diagnostic: -march=native -flto (host ISA, not portable)",
    },
};

// Builds run.mjs measures unless --builds says otherwise.
export const DEFAULT_BUILDS = ["o3", "noinline"];

// The instruction classes check-asm.mjs accepts as the measured operation.
export const EXPECT = {
    f64add: "addsd/addpd (or the VEX forms)",
    f64mul: "mulsd/mulpd (or the VEX forms)",
    f64muladd: "mulsd/mulpd and addsd/addpd",
    u32add: "add/lea of 32-bit registers or paddd",
    u32mul: "imul or pmulld/pmuludq",
    xor: "xor or pxor",
    strwork:
        "a call of the string routine, or an inner loop, in the iteration loop",
};

const rows = [];
for (const type of ["f64", "u32"])
    for (const op of ["add", "mul"]) {
        const expect = type + op;
        const unit = `one ${type} ${op === "add" ? "addition" : "multiplication"}`;
        rows.push(
            {
                id: `${type}_${op}_chain`,
                kind: "arith",
                expect,
                unit,
                variant: "inline, dependent chain (latency)",
            },
            {
                id: `${type}_${op}_x4`,
                kind: "arith",
                expect,
                unit,
                variant: "inline, 4 independent accumulators (throughput)",
            },
            {
                id: `${type}_${op}_direct`,
                kind: "call",
                call: "direct",
                expect,
                unit: unit + " in one call",
                variant: `direct call of ${op === "add" ? "add" : "multiply"}(a, b)`,
            },
            {
                id: `${type}_${op}_indirect`,
                cppSymbol: `k_${type}_indirect`,
                kind: "call",
                call: "indirect",
                expect,
                unit: unit + " in one call",
                variant:
                    "indirect call of a function chosen at run time (C++: function pointer)",
            },
            {
                id: `${type}_${op}_stdfn`,
                js: `${type}_${op}_indirect`,
                cppSymbol: `k_${type}_stdfn`,
                kind: "call",
                call: "indirect",
                expect,
                unit: unit + " in one call",
                variant:
                    "indirect call of a function chosen at run time (C++: std::function over the pointer)",
            },
            {
                id: `${type}_${op}_closure`,
                cppSymbol: `k_${type}_closure`,
                kind: "call",
                call: "closure",
                expect,
                unit: unit + " in one closure call",
                variant:
                    "closure over the seeded table (C++: lambda capturing by value in std::function)",
            },
        );
    }
rows.push({
    id: "loop_control",
    kind: "control",
    expect: "xor",
    unit: "one iteration of the shared loop, index and load, with a u32 XOR",
    variant: "loop/checksum control (not subtracted)",
});
for (const [size, bytes] of [
    ["4k", 4096],
    ["1m", 1 << 20],
    ["64m", 64 << 20],
])
    rows.push({
        id: `f64_array_${size}`,
        cppSymbol: "k_f64_array",
        kind: "array",
        expect: "f64muladd",
        payloadBytes: bytes,
        unit: "one element update a[j] = a[j] * k + c (8 B read, 8 B written)",
        variant: `Float64Array / std::vector<double> of ${bytes} bytes`,
    });

const arithKernels = rows.map((row) => ({
    program: "arith",
    js: row.id,
    cpp: row.id,
    cppSymbol: "k_" + row.id,
    // Relative tolerance of f64 checksums; 0 = bit-exact. Every kernel keeps
    // the JavaScript order of operations, so none needs a tolerance.
    tolerance: 0,
    ...row,
}));

// String kernels (js/strings.js, cpp/strings.cpp; their headers are the
// contract). A string row does iterations = max(1, round(N / divisor))
// iterations, so medium and large inputs get bounded counts; run.mjs reports
// them as `iterations`, never as N operations. `alloc` separates kernels
// that create strings from those that read existing storage. `contract` says
// whether the C++ side does the JavaScript UTF-16 work or a labelled
// variant; variants run against the JavaScript kernel `js`. `work` is the
// check-asm.mjs criterion: a call matching `calls` in a loop of the kernel,
// or (`nested`) an inner loop inside the iteration loop, or (`load16`) a
// 16-bit load in the loop.
export const STRING_SIZES = { short: 16, medium: 1024, large: 1 << 20 };
const PIECE = { short: 4, medium: 16, large: 1024 };
export const UTF16 = "UTF-16 code units (std::u16string)";
const BYTES = "bytes (not equivalent)";
const FIND = "::find\\(|memchr|memcmp";
const ALLOC =
    "operator new|memcpy|memmove|_M_create|_M_construct|_M_append|_M_mutate|_M_replace|reserve";
const strings = [];
function str(op, encoding, size, divisor, fields) {
    const id = ["str", op, encoding, size, fields.needle]
        .filter(Boolean)
        .join("_");
    const base = {
        id,
        js: id,
        cpp: id,
        cppSymbol: "k_str_" + op,
        kind: "string",
        expect: "strwork",
        encoding,
        size,
        inputUnits: STRING_SIZES[size],
        divisor: divisor[size],
        contract: UTF16,
        ...fields,
    };
    delete base.variants;
    strings.push(base);
    for (const [suffix, v] of Object.entries(fields.variants ?? {}))
        strings.push({
            ...base,
            id: id + "_" + suffix,
            cpp: id + "_" + suffix,
            cppSymbol: "k_str_" + op + "_" + suffix,
            ...v,
        });
}
const ENCODINGS = ["ascii", "bmp", "astral"];
const SIZE_NAMES = Object.keys(STRING_SIZES);
const SCAN_DIVISOR = { short: 1, medium: 100, large: 100000 };
for (const encoding of ENCODINGS)
    for (const size of SIZE_NAMES) {
        str("scan", encoding, size, SCAN_DIVISOR, {
            alloc: false,
            unit: "s.length code units read with charCodeAt and summed",
            variant: "length + charCodeAt indexed scan",
            work: { nested: true },
            variants:
                encoding === "ascii"
                    ? {
                          bytes: {
                              contract: BYTES,
                              variant: "ASCII std::string byte scan",
                          },
                      }
                    : undefined,
        });
        if (encoding !== "astral")
            for (const op of ["equal", "compare"])
                str(op, encoding, size, SCAN_DIVISOR, {
                    alloc: false,
                    unit:
                        op === "equal"
                            ? "one a === c of separately built strings"
                            : "one a < c (code-unit order)",
                    variant:
                        "equal copies and copies differing at the end or the middle",
                    work: { calls: "compare|memcmp", nested: true },
                });
        str(
            "slice",
            encoding,
            size,
            { short: 1, medium: 10, large: 10000 },
            {
                alloc: true,
                unit: `one s.slice(b, b + ${STRING_SIZES[size] / 4}) (owning)`,
                variant: "owning substring (std::u16string::substr)",
                work: { calls: ALLOC + "|substr" },
                variants: {
                    view: {
                        contract:
                            "UTF-16, non-owning std::u16string_view: lower bound",
                        variant:
                            "non-owning view (std::u16string_view::substr)",
                        work: { load16: true },
                    },
                },
            },
        );
        for (const needle of ["n4", "n64"]) {
            if (needle === "n64" && size === "short") continue;
            str("indexof", encoding, size, SCAN_DIVISOR, {
                needle,
                alloc: false,
                unit: `one s.indexOf of a ${needle.slice(1)}-unit needle`,
                variant: `search, ${needle.slice(1)}-unit needle from the second half`,
                work: { calls: FIND, nested: true },
                variants:
                    encoding === "ascii"
                        ? {
                              bytes: {
                                  contract: BYTES,
                                  variant:
                                      "ASCII std::string::find (memchr/memcmp)",
                              },
                          }
                        : undefined,
            });
        }
        if (encoding !== "astral") {
            str(
                "concat",
                encoding,
                size,
                { short: 1, medium: 10, large: 5000 },
                {
                    alloc: true,
                    unit: `one s = s + piece (${PIECE[size]} units), s reset at ${STRING_SIZES[size]} units`,
                    variant:
                        "immutable concatenation (C++: new string of the summed length)",
                    work: { calls: ALLOC },
                    variants: {
                        append: {
                            contract: "UTF-16, mutable s += piece: lower bound",
                            variant: "in-place append (amortized growth)",
                        },
                    },
                },
            );
            str(
                "builder",
                encoding,
                size,
                { short: 10, medium: 10, large: 100 },
                {
                    alloc: true,
                    unit: `one parts.push(piece) (${PIECE[size]} units), join after ${STRING_SIZES[size] / PIECE[size]}`,
                    contract:
                        "UTF-16, reserved std::u16string append: architectural lower bound of push + join",
                    variant:
                        "builder: array push + join (C++: reserved append)",
                    work: { calls: ALLOC },
                    variants: {
                        join: {
                            contract: UTF16,
                            variant:
                                "builder: vector<u16string_view> push + one join",
                        },
                    },
                },
            );
            str(
                "splitjoin",
                encoding,
                size,
                { short: 10, medium: 1000, large: 1000000 },
                {
                    alloc: true,
                    unit: 'one s.split(" ").join("-")',
                    variant: "split into owning parts, join",
                    work: { calls: FIND, nested: true },
                },
            );
        }
        str(
            "replace",
            encoding,
            size,
            { short: 10, medium: 100, large: 100000 },
            {
                alloc: true,
                unit: "one s.replace(pattern, replacement) (first match)",
                variant: "replace the first match of a string pattern",
                work: { calls: FIND, nested: true },
            },
        );
        str(
            "replaceall",
            encoding,
            size,
            { short: 10, medium: 1000, large: 100000 },
            {
                alloc: true,
                unit: "one s.replaceAll(pattern, replacement)",
                variant: "replace every match of a string pattern",
                work: { calls: FIND, nested: true },
            },
        );
    }
str(
    "replaceall",
    "log",
    "large",
    { large: 1000000 },
    {
        alloc: true,
        unit: 'one log.replaceAll("request ", "req#") (#387)',
        variant: "log text with a match on every line",
        work: { calls: FIND, nested: true },
    },
);
str(
    "format",
    "int",
    "short",
    { short: 1 },
    {
        alloc: true,
        inputUnits: undefined,
        unit: "one String(x), x an integer-valued double < 2^53",
        variant:
            "number formatting (C++: to_chars fixed, widened to u16string)",
        work: { calls: "to_chars" },
        variants: {
            bytes: {
                contract: "char buffer, no string object: lower bound",
                variant: "to_chars into a stack buffer",
            },
        },
    },
);
str(
    "parse",
    "int",
    "short",
    { short: 1 },
    {
        alloc: false,
        inputUnits: undefined,
        unit: "one Number(s) of a decimal integer string (1-16 digits)",
        variant: "number parsing (C++: narrow to char, from_chars)",
        work: { calls: "from_chars|strtod" },
        variants: {
            bytes: {
                contract: "std::string digits, no narrowing: lower bound",
                variant: "from_chars on stored bytes",
            },
        },
    },
);
const stringKernels = strings.map((row) => ({
    program: "strings",
    tolerance: 0,
    ...row,
}));

export const KERNELS = [...arithKernels, ...stringKernels];

// The iteration count of a kernel at size N.
export const iterationsOf = (row, n) =>
    row.divisor ? Math.max(1, Math.round(n / row.divisor)) : n;

export const PROGRAMS = [...new Set(KERNELS.map((k) => k.program))];

// The calibration sizes and the headline size.
export const HEADLINE_N = 10_000_000;
export const CALIBRATION_SIZES = [1e5, 1e6, 1e7, 3e7];
