import { RuntimeBuilder } from "../../runtime/abi.js";
import { Arm64Assembler } from "./assembler.js";
import { withNativeTarget } from "../machine/context.js";
import { linkElf } from "../elf/writer.js";
import { emitTrigReduce } from "../../runtime/numeric/trig-reduce.js";
import {
    emitSoftwareMath,
    ABS,
    bits,
    constant,
} from "../../runtime/numeric/software-math.js";

export const arm64MathCases: {
    name: string;
    input: number;
    second?: number;
    expected: number;
    exact?: boolean;
}[] = [
    ...[
        -1,
        -0,
        0,
        Number.MIN_VALUE,
        1e-300,
        0.5,
        1,
        1 + Number.EPSILON,
        2,
        10,
        1000,
        1e300,
        Infinity,
        NaN,
    ].map((input) => ({ name: "log", input, expected: Math.log(input) })),
    ...(["log2", "log10"] as const).flatMap((name) =>
        [Number.MIN_VALUE, 0.5, 1, 2, 8, 10, 1000, 1e300].map((input) => ({
            name,
            input,
            expected: Math[name](input),
        })),
    ),
    ...[
        -Infinity,
        -1000,
        -746,
        -745,
        -710,
        -10,
        -1,
        -0,
        0,
        0.5,
        1,
        10,
        100,
        709,
        709.7827,
        710,
        NaN,
        Infinity,
    ].map((input) => ({
        name: "exp",
        input,
        expected: Math.exp(input),
        exact: input === 1,
    })),
    ...[
        -Infinity,
        -2,
        -1,
        -0.9,
        -0.5,
        -1e-10,
        -Number.MIN_VALUE,
        -0,
        0,
        Number.MIN_VALUE,
        1e-10,
        0.5,
        1,
        1e20,
        Infinity,
        NaN,
    ].map((input) => ({ name: "log1p", input, expected: Math.log1p(input) })),
    ...[
        -Infinity,
        -10,
        -1,
        -0.5,
        -1e-10,
        -Number.MIN_VALUE,
        -0,
        0,
        Number.MIN_VALUE,
        1e-10,
        0.5,
        1,
        10,
        Infinity,
        NaN,
    ].map((input) => ({ name: "expm1", input, expected: Math.expm1(input) })),
    ...(["sin", "cos", "tan"] as const).flatMap((name) =>
        [
            -1e300,
            -10,
            -0.5,
            -Number.MIN_VALUE,
            -0,
            0,
            Number.MIN_VALUE,
            0.5,
            10,
            1e300,
            Infinity,
            NaN,
        ].map((input) => ({ name, input, expected: Math[name](input) })),
    ),
    ...[
        -Infinity,
        -1e300,
        -10,
        -1,
        -0.5,
        -Number.MIN_VALUE,
        -0,
        0,
        Number.MIN_VALUE,
        0.5,
        1,
        10,
        1e300,
        Infinity,
        NaN,
    ].map((input) => ({ name: "atan", input, expected: Math.atan(input) })),
    ...(
        [
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
            [0, 1],
            [-0, 1],
            [0, -1],
            [-0, -1],
            [1, 0],
            [-1, -0],
            [Infinity, Infinity],
            [-Infinity, -Infinity],
            [Infinity, 1],
            [1, -Infinity],
            [Number.MIN_VALUE, 1e300],
            [NaN, 1],
        ] as const
    ).map(([input, second]) => ({
        name: "atan2",
        input,
        second,
        expected: Math.atan2(input, second),
    })),
];

/** Native execution gate, including signed zeros, subnormals and non-finites. */
export function arm64MathProbe(): Uint8Array {
    return withNativeTarget("linux-arm64", () => {
        const b = new RuntimeBuilder();
        emitArm64Math(b);
        const a = new Arm64Assembler("math.start");
        a.initializeStack();
        const failures: { label: string; stage: number }[] = [];
        for (const [index, c] of arm64MathCases.entries()) {
            const failed = a.unique("mathFailure");
            failures.push({ label: failed, stage: index + 1 });
            constant(a, "xmm0", c.input);
            if (c.second !== undefined) constant(a, "xmm1", c.second);
            a.call("rt.armMath." + c.name);
            if (Number.isNaN(c.expected)) {
                a.ucomisd("xmm0", "xmm0");
                a.jcc("np", failed);
            } else if (
                c.exact ||
                !Number.isFinite(c.expected) ||
                c.expected === 0 ||
                Math.abs(c.expected) === Number.MIN_VALUE
            ) {
                a.movqFromXmm("r10", "xmm0");
                a.mov("rax", bits(c.expected));
                a.cmp("rax", "r10");
                a.jcc("ne", failed);
            } else {
                constant(a, "xmm1", c.expected);
                a.subsd("xmm0", "xmm1");
                a.movqFromXmm("rax", "xmm0");
                a.mov("r10", ABS);
                a.and("rax", "r10");
                a.movqToXmm("xmm0", "rax");
                constant(
                    a,
                    "xmm1",
                    Math.max(
                        Number.MIN_VALUE * 2,
                        Math.abs(c.expected) * 4e-14,
                    ),
                );
                a.ucomisd("xmm0", "xmm1");
                a.jcc("p", failed);
                a.jcc("a", failed);
            }
        }
        a.mov("rdi", 1);
        a.lea("rsi", { rip: "math.message" });
        a.mov("rdx", 6);
        a.syscall(64);
        a.mov("rdi", 0);
        a.syscall(93);
        for (const failure of failures) {
            a.label(failure.label);
            a.mov("rdi", failure.stage);
            a.syscall(93);
        }
        return linkElf(
            {
                entry: "math.start",
                imports: [],
                functions: [],
                fragments: [
                    { ...a.finish(), name: "math.start", section: ".text" },
                    ...b.bundle.fragments,
                    {
                        name: "math.message",
                        section: ".rdata",
                        bytes: new TextEncoder().encode("hello\n"),
                        symbols: {},
                        fixups: [],
                    },
                ],
            },
            { machine: "arm64" },
        );
    });
}

/** The ARM64 math support of the runtime: range reduction and the rt.armMath.* routines. */
export function emitArm64Math(b: RuntimeBuilder): void {
    emitTrigReduce(b);
    emitSoftwareMath(b);
}
