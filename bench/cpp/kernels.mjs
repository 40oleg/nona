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

export const KERNELS = rows.map((row) => ({
    program: "arith",
    js: row.id,
    cpp: row.id,
    cppSymbol: "k_" + row.id,
    // Relative tolerance of f64 checksums; 0 = bit-exact. Every kernel keeps
    // the JavaScript order of operations, so none needs a tolerance.
    tolerance: 0,
    ...row,
}));

export const PROGRAMS = [...new Set(KERNELS.map((k) => k.program))];

// The calibration sizes and the headline size.
export const HEADLINE_N = 10_000_000;
export const CALIBRATION_SIZES = [1e5, 1e6, 1e7, 3e7];
