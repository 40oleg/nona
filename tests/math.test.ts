import { test } from "node:test";
import { expectProgram } from "./helpers/program.js";
import { runOracle } from "./helpers/oracle.js";
import { compile, compileToIR } from "../src/compiler.js";
import { generate } from "../src/backend/x64/codegen.js";
import { hostTarget, linkHost } from "./helpers/program.js";
import { runNative } from "./helpers/native.js";
import { runOnHost } from "./helpers/host.js";
import { getTarget } from "../src/target.js";
import assert from "node:assert/strict";

const cases: [string, string][] = [
    ["pow basics", `console.log(Math.pow(2,5),Math.pow(-2,3),Math.pow(4,.5));`],
    [
        "pow conversions",
        `var s='';var a={valueOf:function(){s+='a';return 2;}},b={valueOf:function(){s+='b';return 3;}};console.log(Math.pow(a,b),s);`,
    ],
    [
        "pow missing arguments",
        `var a=Math.pow(),b=Math.pow(2);console.log(a!==a,b!==b);`,
    ],
    [
        "min and max values",
        `console.log(Math.min(),Math.max(),Math.min(5,2,8,-3),Math.max(5,2,8,-3),Math.min(1,'-2',true),Math.max(1,'2',true));`,
    ],
    [
        "min and max NaN and signed zero",
        `console.log(Math.min(NaN,2),Math.max(2,NaN),Object.is(Math.min(0,-0),-0),Object.is(Math.min(-0,0),-0),Object.is(Math.max(0,-0),0),Object.is(Math.max(-0,0),0));`,
    ],
    [
        "min and max convert every argument",
        `var s='';function v(n){return {valueOf:function(){s+=n;return n==='b'?NaN:3;}};}console.log(Math.min(v('a'),v('b'),v('c')),s);s='';console.log(Math.max(v('a'),v('b'),v('c')),s);`,
    ],
    [
        "min and max metadata",
        `console.log(Math.min.length,Math.max.length,Object.keys(Math).length,Object.getOwnPropertyDescriptor(Math,'min').enumerable);`,
    ],
    [
        "unary numeric methods",
        `console.log(Math.abs(-7),Math.sign(-7),Math.sqrt(81),Math.trunc(-7.9),Math.trunc(7.9));`,
    ],
    [
        "unary missing and nonfinite",
        `for(var f of [Math.abs,Math.sign,Math.sqrt,Math.trunc]){var x=f();console.log(x!==x);}console.log(Math.abs(-Infinity),Math.sign(-Infinity),Math.sqrt(Infinity),Math.trunc(Infinity));`,
    ],
    [
        "unary signed zero",
        `console.log(Object.is(Math.abs(-0),0),Object.is(Math.sign(-0),-0),Object.is(Math.sqrt(-0),-0),Object.is(Math.trunc(-0),-0),Object.is(Math.trunc(-0.5),-0));`,
    ],
    [
        "unary coercion and metadata",
        `var x={valueOf:function(){return -4.8;}};console.log(Math.abs(x),Math.sign(x),Math.sqrt(4),Math.trunc(x),Math.abs.length,Math.sign.length,Math.sqrt.length,Math.trunc.length);`,
    ],
    [
        "floor and ceil",
        `console.log(Math.floor(3.9),Math.floor(-3.9),Math.ceil(3.1),Math.ceil(-3.1),Object.is(Math.floor(-0),-0),Object.is(Math.ceil(-0.5),-0),Math.floor(-Infinity),Math.ceil(Infinity));`,
    ],
    [
        "round ties and boundaries",
        `console.log(Math.round(1.5),Math.round(-1.5),Math.round(-1.6),Object.is(Math.round(-0.5),-0),Math.round(0.49999999999999994),Math.round(-0.5000000000000001));`,
    ],
    [
        "Math tag",
        `console.log(Object.prototype.toString.call(Math),Math[Symbol.toStringTag]);`,
    ],
    [
        "Math constants",
        `console.log(Math.E,Math.LN10,Math.LN2,Math.LOG10E,Math.LOG2E,Math.PI,Math.SQRT1_2,Math.SQRT2);console.log(Object.getOwnPropertyDescriptor(Math,'PI').writable,Object.getOwnPropertyDescriptor(Math,'PI').enumerable,Object.getOwnPropertyDescriptor(Math,'PI').configurable);`,
    ],
    [
        "imul signed 32-bit product",
        `console.log(Math.imul(0xffffffff,5),Math.imul(0x7fffffff,2),Math.imul(-1,-1),Math.imul(),Math.imul(2));`,
    ],
    [
        "clz32 leading zero counts",
        `console.log(Math.clz32(),Math.clz32(0),Math.clz32(1),Math.clz32(0x80000000),Math.clz32(-1),Math.clz32(0x100000000));`,
    ],
    [
        "integer Math coercion and metadata",
        `var s='';function v(x){return {valueOf(){s+=x;return x;}};}console.log(Math.imul(v(2),v(3)),s,Math.clz32(v(8)),Math.imul.length,Math.clz32.length);`,
    ],
    [
        "fround conversion and rounding",
        `console.log(Math.fround(1.337),Math.fround(1e50),Math.fround(1e-50),Object.is(Math.fround(-0),-0),Math.fround.length);`,
    ],
    [
        "fround missing and coercion",
        `var x=Math.fround();var s='';var y={valueOf(){s+='v';return 1.5;}};console.log(x!==x,Math.fround(y),s);`,
    ],
    [
        "hypot scaled values and specials",
        `console.log(Math.hypot(),Math.hypot(3,4),Math.hypot(1e308,1e308),Math.hypot(1e-300,1e-300),Math.hypot(NaN,Infinity),Math.hypot(Infinity,NaN),Math.hypot(-0,0),Math.hypot.length);`,
    ],
    [
        "hypot converts every argument in order",
        `var s='';function v(x){return {valueOf(){s+=x;return x==='a'?NaN:x==='b'?Infinity:3;}};}console.log(Math.hypot(v('a'),v('b'),v('c')),s);`,
    ],
    [
        "random range, metadata and advancing state",
        `var a=Math.random(),b=Math.random();console.log(a>=0,a<1,b>=0,b<1,a!==b,Math.random.length,Math.random.name);`,
    ],
];
for (const [name, source] of cases)
    test(`Math: ${name}`, () =>
        expectProgram(source, runOracle(source).stdout));

test("Math: min and max survive coercion callbacks under stress GC", () => {
    const source = `var a={valueOf:function(){for(var i=0;i<30;i++)({x:i});return -0;}};var b={valueOf:function(){for(var i=0;i<30;i++)({x:i});return 0;}};console.log(Object.is(Math.min(b,a),-0),Object.is(Math.max(a,b),0));`;
    const run = runNative(
        linkHost(generate(compileToIR(source), { gcStress: true })),
    );
    assert.equal(run.status, 0, run.stderr.toString());
    assert.equal(run.stdout.toString(), runOracle(source).stdout);
});
test("Math: hypot survives coercion callbacks under stress GC", () => {
    const source = `var s='';function v(n){return {valueOf(){for(var i=0;i<25;i++)({x:i});s+=n;return n;}};}console.log(Math.hypot(v(3),v(4)),s);`;
    const run = runNative(
        linkHost(generate(compileToIR(source), { gcStress: true })),
    );
    assert.equal(run.status, 0, run.stderr.toString());
    assert.equal(run.stdout.toString(), runOracle(source).stdout);
});
test("Math: sin cos tan finite values and signed zero", () => {
    const source = `console.log(Math.sin(0.5),Math.cos(0.5),Math.tan(0.5),Object.is(Math.sin(-0),-0),Math.cos(0),Object.is(Math.tan(-0),-0));`;
    const run = runNative(linkHost(generate(compileToIR(source))));
    assert.equal(run.status, 0, run.stderr.toString());
    const parts = run.stdout.toString().trim().split(" ");
    for (const [i, expected] of [
        Math.sin(0.5),
        Math.cos(0.5),
        Math.tan(0.5),
    ].entries())
        assert.ok(
            Math.abs(Number(parts[i]) - expected) < 1e-15,
            `${i}: ${parts[i]}`,
        );
    assert.deepEqual(parts.slice(3), ["true", "1", "true"]);
});
test("Math: sin cos tan stay within one ulp of Node.js for large arguments", () => {
    let seed = 454;
    const random = () => {
        seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
        return seed / 2 ** 32;
    };
    const values = [
        Math.PI,
        Math.PI / 2,
        -Math.PI,
        (3 * Math.PI) / 2,
        1e5,
        -1e5,
        1e15,
        2 ** 62,
        2 ** 63,
        1e300,
        -1e300,
        0.7853981633974483,
        0.7853981633974484,
        1e-300,
        710.5,
        355,
        103993,
        1647099.3291652855,
        1647099.3291652858,
        6381956970095103 * 2 ** 797,
        ...Array.from(
            { length: 24 },
            () => (random() < 0.5 ? -1 : 1) * 10 ** (-3 + 23 * random()),
        ),
    ];
    const source = `for (const x of [${values.map(String).join(",")}]) console.log(Math.sin(x), Math.cos(x), Math.tan(x));`;
    const run = runNative(linkHost(generate(compileToIR(source))));
    assert.equal(run.status, 0, run.stderr.toString());
    const lines = run.stdout.toString().trim().split(/\r?\n/);
    assert.equal(lines.length, values.length);
    const software = getTarget(hostTarget)!.arch === "arm64";
    const ordered = (x: number) => {
        const bits = new BigInt64Array(new Float64Array([x]).buffer)[0]!;
        return bits < 0n ? -(bits & 0x7fffffffffffffffn) : bits;
    };
    for (const [i, x] of values.entries()) {
        const actual = lines[i]!.split(" ").map(Number);
        for (const [j, expected] of [
            Math.sin(x),
            Math.cos(x),
            Math.tan(x),
        ].entries()) {
            const distance = ordered(actual[j]!) - ordered(expected);
            // The ARM64 software tan divides two ~0.5-ulp polynomials, so
            // it can land 2 ulps away (about 3% of arguments).
            const ulps = j === 2 && software ? 2n : 1n;
            assert.ok(
                distance >= -ulps && distance <= ulps,
                `${["sin", "cos", "tan"][j]}(${x}) = ${actual[j]}, expected ${expected}`,
            );
        }
    }
    // The exact repro strings come from the x87 kernel on x64.
    if (software) return;
    const repro = `console.log(Math.sin(Math.PI), Math.cos(Math.PI / 2), Math.sin(1e15), Math.sin(2 ** 62), Math.tan(Math.PI / 2));`;
    const exact = runNative(linkHost(generate(compileToIR(repro))));
    assert.equal(exact.status, 0, exact.stderr.toString());
    assert.equal(
        exact.stdout.toString().trim(),
        "1.2246467991473532e-16 6.123233995736766e-17 0.8582727931702359 -0.7029224436192089 16331239353195370",
    );
});
test("Math: trigonometric argument coercion survives stress GC", () => {
    const source = `var x={valueOf(){for(var i=0;i<40;i++)({v:i});return 0;}};console.log(Math.sin(x),Math.cos(x),Math.tan(x));`;
    const run = runNative(
        linkHost(generate(compileToIR(source), { gcStress: true })),
    );
    assert.equal(run.status, 0, run.stderr.toString());
    assert.equal(run.stdout.toString(), runOracle(source).stdout);
});
test("Math: logarithms track finite reference values", () => {
    const values = [0.5, 2, 10, 1000, Math.E, 1e-30, 1e30];
    const source = `console.log(${values.flatMap((v) => [`Math.log(${v})`, `Math.log2(${v})`, `Math.log10(${v})`]).join(",")});`;
    const run = runNative(linkHost(generate(compileToIR(source))));
    assert.equal(run.status, 0, run.stderr.toString());
    const actual = run.stdout.toString().trim().split(" ").map(Number);
    const expected = values.flatMap((v) => [
        Math.log(v),
        Math.log2(v),
        Math.log10(v),
    ]);
    for (const [i, value] of expected.entries())
        assert.ok(
            Math.abs(actual[i]! - value) <=
                2e-14 * Math.max(1, Math.abs(value)),
            `${i}: ${actual[i]} vs ${value}`,
        );
});
test("Math: logarithm argument coercion survives stress GC", () => {
    const source = `var x={valueOf(){for(var i=0;i<40;i++)({v:i});return 1;}};console.log(Math.log(x),Math.log2(x),Math.log10(x));`;
    const run = runNative(
        linkHost(generate(compileToIR(source), { gcStress: true })),
    );
    assert.equal(run.status, 0, run.stderr.toString());
    assert.equal(run.stdout.toString(), runOracle(source).stdout);
});
test("Math: exp finite values and boundaries", () => {
    const values = [-745, -10, -1, -0, 0, 1, 10, 100, 709, 710];
    const source = `console.log(${values.map((v) => `Math.exp(${Object.is(v, -0) ? "-0" : v})`).join(",")});`;
    const run = runNative(linkHost(generate(compileToIR(source))));
    assert.equal(run.status, 0, run.stderr.toString());
    const actual = run.stdout.toString().trim().split(" ").map(Number);
    for (const [i, value] of values.entries()) {
        const expected = Math.exp(value),
            got = actual[i]!;
        assert.ok(
            expected === Infinity
                ? got === Infinity
                : Math.abs(got - expected) <=
                      3e-13 * Math.max(Number.MIN_VALUE, Math.abs(expected)),
            `${value}: ${got} vs ${expected}`,
        );
    }
});
test("Math: exp argument coercion survives stress GC", () => {
    const source = `var x={valueOf(){for(var i=0;i<40;i++)({v:i});return 0;}};console.log(Math.exp(x));`;
    const run = runNative(
        linkHost(generate(compileToIR(source), { gcStress: true })),
    );
    assert.equal(run.status, 0, run.stderr.toString());
    assert.equal(run.stdout.toString(), runOracle(source).stdout);
});
test("Math: expm1 near zero and signed zero", () => {
    const values = [
        -10, -1, -0.5, -1e-5, -1e-10, -0, 0, 1e-10, 1e-5, 0.5, 1, 10,
    ];
    const source = `console.log(${values.map((v) => `Math.expm1(${Object.is(v, -0) ? "-0" : v})`).join(",")},Object.is(Math.expm1(-0),-0));`;
    const run = runNative(linkHost(generate(compileToIR(source))));
    assert.equal(run.status, 0, run.stderr.toString());
    const parts = run.stdout.toString().trim().split(" ");
    assert.equal(parts.at(-1), "true");
    for (const [i, value] of values.entries()) {
        const expected = Math.expm1(value),
            got = Number(parts[i]);
        assert.ok(
            Math.abs(got - expected) <=
                5e-13 * Math.max(Number.MIN_VALUE, Math.abs(expected)),
            `${value}: ${got} vs ${expected}`,
        );
    }
});
test("Math: atan and atan2 quadrants and signed zero", () => {
    const pairs: [[number, number], ...[number, number][]] = [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
        [0, 1],
        [-0, 1],
        [0, -1],
        [-0, -1],
        [Infinity, Infinity],
        [-Infinity, -Infinity],
    ];
    const literal = (v: number) => (Object.is(v, -0) ? "-0" : String(v));
    const source = `console.log(Math.atan(1),Math.atan(-1),${pairs.map(([y, x]) => `Math.atan2(${literal(y)},${literal(x)})`).join(",")},Object.is(Math.atan(-0),-0),Object.is(Math.atan2(-0,1),-0));`;
    const run = runNative(linkHost(generate(compileToIR(source))));
    assert.equal(run.status, 0, run.stderr.toString());
    const parts = run.stdout.toString().trim().split(" ");
    const expected = [
        Math.atan(1),
        Math.atan(-1),
        ...pairs.map(([y, x]) => Math.atan2(y, x)),
    ];
    for (const [i, value] of expected.entries())
        assert.ok(
            Math.abs(Number(parts[i]) - value) <=
                2e-15 * Math.max(1, Math.abs(value)),
            `${i}: ${parts[i]} vs ${value}`,
        );
    assert.deepEqual(parts.slice(expected.length), ["true", "true"]);
});
test("Math: atan2 coerces both arguments under stress GC", () => {
    const source = `var s='';function v(n){return {valueOf(){for(var i=0;i<40;i++)({v:i});s+=n;return n;}}}console.log(Math.atan2(v(1),v(1)),s);`;
    const run = runNative(
        linkHost(generate(compileToIR(source), { gcStress: true })),
    );
    assert.equal(run.status, 0, run.stderr.toString());
    assert.equal(run.stdout.toString(), runOracle(source).stdout);
});
test("Math: log1p small values, domain, and signed zero", () => {
    const values = [
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
    ];
    const literal = (v: number) => (Object.is(v, -0) ? "-0" : String(v));
    const source = `console.log(${values.map((v) => `Math.log1p(${literal(v)})`).join(",")},Object.is(Math.log1p(-0),-0),Math.log1p(-2),Math.log1p(Infinity));`;
    const run = runNative(linkHost(generate(compileToIR(source))));
    assert.equal(run.status, 0, run.stderr.toString());
    const parts = run.stdout.toString().trim().split(" ");
    assert.deepEqual(parts.slice(values.length), ["true", "NaN", "Infinity"]);
    for (const [i, value] of values.entries()) {
        const expected = Math.log1p(value),
            got = Number(parts[i]);
        assert.ok(
            expected === -Infinity
                ? got === -Infinity
                : Math.abs(got - expected) <=
                      2e-14 * Math.max(Number.MIN_VALUE, Math.abs(expected)),
            `${value}: ${got} vs ${expected}`,
        );
    }
});
test("Math: log1p coercion survives stress GC", () => {
    const source = `var x={valueOf(){for(var i=0;i<40;i++)({v:i});return 0;}};console.log(Math.log1p(x),Object.is(Math.log1p(-0),-0));`;
    const run = runNative(
        linkHost(generate(compileToIR(source), { gcStress: true })),
    );
    assert.equal(run.status, 0, run.stderr.toString());
    assert.equal(run.stdout.toString(), runOracle(source).stdout);
});
test("Math: cbrt finite values and signed zero", () => {
    const values = [
        -1e300,
        -27,
        -8,
        -1,
        -1e-300,
        -Number.MIN_VALUE,
        -0,
        0,
        Number.MIN_VALUE,
        1e-300,
        1,
        8,
        27,
        1e300,
    ];
    const literal = (v: number) => (Object.is(v, -0) ? "-0" : String(v));
    const source = `console.log(${values.map((v) => `Math.cbrt(${literal(v)})`).join(",")},Object.is(Math.cbrt(-0),-0),Math.cbrt(-Infinity),Math.cbrt(Infinity));`;
    const run = runNative(linkHost(generate(compileToIR(source))));
    assert.equal(run.status, 0, run.stderr.toString());
    const parts = run.stdout.toString().trim().split(" ");
    assert.deepEqual(parts.slice(values.length), [
        "true",
        "-Infinity",
        "Infinity",
    ]);
    for (const [i, value] of values.entries()) {
        const expected = Math.cbrt(value),
            got = Number(parts[i]);
        assert.ok(
            Math.abs(got - expected) <=
                2e-13 * Math.max(Number.MIN_VALUE, Math.abs(expected)),
            `${value}: ${got} vs ${expected}`,
        );
    }
});
test("Math: cbrt coercion survives stress GC", () => {
    const source = `var x={valueOf(){for(var i=0;i<40;i++)({v:i});return -8;}};console.log(Math.cbrt(x)<-1.999999999999,Object.is(Math.cbrt(-0),-0));`;
    const run = runNative(
        linkHost(generate(compileToIR(source), { gcStress: true })),
    );
    assert.equal(run.status, 0, run.stderr.toString());
    assert.equal(run.stdout.toString(), runOracle(source).stdout);
});
test("Math: asin and acos finite values and domain", () => {
    const values = [-1, -0.9, -0.5, -0, 0, 0.5, 0.9, 1];
    const literal = (v: number) => (Object.is(v, -0) ? "-0" : String(v));
    const source = `console.log(${values.flatMap((v) => [`Math.asin(${literal(v)})`, `Math.acos(${literal(v)})`]).join(",")},Object.is(Math.asin(-0),-0),Math.asin(2),Math.acos(-2));`;
    const run = runNative(linkHost(generate(compileToIR(source))));
    assert.equal(run.status, 0, run.stderr.toString());
    const parts = run.stdout.toString().trim().split(" ");
    assert.deepEqual(parts.slice(values.length * 2), ["true", "NaN", "NaN"]);
    const expected = values.flatMap((v) => [Math.asin(v), Math.acos(v)]);
    for (const [i, value] of expected.entries())
        assert.ok(
            Math.abs(Number(parts[i]) - value) <=
                2e-15 * Math.max(1, Math.abs(value)),
            `${i}: ${parts[i]} vs ${value}`,
        );
});
test("Math: inverse trigonometric coercion survives stress GC", () => {
    const source = `var x={valueOf(){for(var i=0;i<40;i++)({v:i});return 0;}};console.log(Math.asin(x),Math.acos(x));`;
    const run = runNative(
        linkHost(generate(compileToIR(source), { gcStress: true })),
    );
    assert.equal(run.status, 0, run.stderr.toString());
    assert.equal(run.stdout.toString(), runOracle(source).stdout);
});
test("Math: atanh finite values, domain, and signed zero", () => {
    const values = [
        -1, -0.9999999999999999, -0.75, -0.1, -1e-12, -0, 0, 1e-12, 0.1, 0.75,
        0.9999999999999999, 1,
    ];
    const literal = (v: number) => (Object.is(v, -0) ? "-0" : String(v));
    const source = `console.log(${values.map((v) => `Math.atanh(${literal(v)})`).join(",")},Object.is(Math.atanh(-0),-0),Math.atanh(2),Math.atanh(-2));`;
    const run = runNative(linkHost(generate(compileToIR(source))));
    assert.equal(run.status, 0, run.stderr.toString());
    const parts = run.stdout.toString().trim().split(" ");
    assert.deepEqual(parts.slice(values.length), ["true", "NaN", "NaN"]);
    for (const [i, value] of values.entries()) {
        const expected = Math.atanh(value),
            got = Number(parts[i]);
        assert.ok(
            !Number.isFinite(expected)
                ? got === expected
                : Math.abs(got - expected) <=
                      3e-14 * Math.max(Number.MIN_VALUE, Math.abs(expected)),
            `${value}: ${got} vs ${expected}`,
        );
    }
});
test("Math: atanh coercion survives stress GC", () => {
    const source = `var x={valueOf(){for(var i=0;i<40;i++)({v:i});return 0;}};console.log(Math.atanh(x),Object.is(Math.atanh(-0),-0));`;
    const run = runNative(
        linkHost(generate(compileToIR(source), { gcStress: true })),
    );
    assert.equal(run.status, 0, run.stderr.toString());
    assert.equal(run.stdout.toString(), runOracle(source).stdout);
});
test("Math: asinh and acosh finite values and boundaries", () => {
    const asinhValues = [
        -1e300, -1e-300, -10, -1, -1e-12, -0, 0, 1e-12, 1, 10, 1e-300, 1e300,
    ];
    const acoshValues = [1, 1.0000000000000002, 1.1, 2, 10, 1e150, 1e300];
    const literal = (v: number) => (Object.is(v, -0) ? "-0" : String(v));
    const source = `console.log(${asinhValues
        .map((v) => `Math.asinh(${literal(v)})`)
        .concat(acoshValues.map((v) => `Math.acosh(${literal(v)})`))
        .join(
            ",",
        )},Object.is(Math.asinh(-0),-0),Math.acosh(0),Math.acosh(-1));`;
    const run = runNative(linkHost(generate(compileToIR(source))));
    assert.equal(run.status, 0, run.stderr.toString());
    const parts = run.stdout.toString().trim().split(" ");
    assert.deepEqual(parts.slice(asinhValues.length + acoshValues.length), [
        "true",
        "NaN",
        "NaN",
    ]);
    const expected = asinhValues
        .map(Math.asinh)
        .concat(acoshValues.map(Math.acosh));
    for (const [i, value] of expected.entries())
        assert.ok(
            Math.abs(Number(parts[i]) - value) <=
                4e-14 * Math.max(Number.MIN_VALUE, Math.abs(value)),
            `${i}: ${parts[i]} vs ${value}`,
        );
});
test("Math: asinh and acosh coercion survives stress GC", () => {
    const source = `var x={valueOf(){for(var i=0;i<40;i++)({v:i});return 1;}};console.log(Math.asinh(x)>0,Math.acosh(x));`;
    const run = runNative(
        linkHost(generate(compileToIR(source), { gcStress: true })),
    );
    assert.equal(run.status, 0, run.stderr.toString());
    assert.equal(run.stdout.toString(), runOracle(source).stdout);
});
test("Math: hyperbolic finite values, overflow, and signed zero", () => {
    const values = [
        -711, -710, -100, -20, -1, -1e-12, -0, 0, 1e-12, 1, 20, 100, 710, 711,
    ];
    const literal = (v: number) => (Object.is(v, -0) ? "-0" : String(v));
    const source = `console.log(${values.flatMap((v) => [`Math.sinh(${literal(v)})`, `Math.cosh(${literal(v)})`, `Math.tanh(${literal(v)})`]).join(",")},Object.is(Math.sinh(-0),-0),Object.is(Math.tanh(-0),-0));`;
    const run = runNative(linkHost(generate(compileToIR(source))));
    assert.equal(run.status, 0, run.stderr.toString());
    const parts = run.stdout.toString().trim().split(" ");
    assert.deepEqual(parts.slice(values.length * 3), ["true", "true"]);
    const expected = values.flatMap((v) => [
        Math.sinh(v),
        Math.cosh(v),
        Math.tanh(v),
    ]);
    for (const [i, value] of expected.entries()) {
        const got = Number(parts[i]);
        assert.ok(
            !Number.isFinite(value)
                ? got === value
                : Math.abs(got - value) <=
                      3e-13 * Math.max(Number.MIN_VALUE, Math.abs(value)),
            `${i}: ${got} vs ${value}`,
        );
    }
});
test("Math: hyperbolic coercion survives stress GC", () => {
    const source = `var x={valueOf(){for(var i=0;i<40;i++)({v:i});return 0;}};console.log(Math.sinh(x),Math.cosh(x),Math.tanh(x));`;
    const run = runNative(
        linkHost(generate(compileToIR(source), { gcStress: true })),
    );
    assert.equal(run.status, 0, run.stderr.toString());
    assert.equal(run.stdout.toString(), runOracle(source).stdout);
});
test("Math: trigonometric large-angle reduction", () => {
    const values = [
        2 ** 63,
        1e20,
        1e30,
        1e50,
        1e100,
        1e200,
        1e300,
        Number.MAX_VALUE,
        -1e20,
        -1e100,
        -Number.MAX_VALUE,
    ];
    const source = `console.log(${values.flatMap((v) => [`Math.sin(${v})`, `Math.cos(${v})`, `Math.tan(${v})`]).join(",")});`;
    const run = runNative(linkHost(generate(compileToIR(source))));
    assert.equal(run.status, 0, run.stderr.toString());
    const actual = run.stdout.toString().trim().split(" ").map(Number),
        expected = values.flatMap((v) => [
            Math.sin(v),
            Math.cos(v),
            Math.tan(v),
        ]);
    for (const [i, value] of expected.entries())
        assert.ok(
            Number.isFinite(actual[i]) &&
                Math.abs(actual[i]! - value) <=
                    3e-13 * Math.max(1, Math.abs(value)),
            `${i}: ${actual[i]} vs ${value}`,
        );
});
test("Math: large-angle reduction across binary exponents", () => {
    let seed = 0x13579bdf;
    const random = () =>
        (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    const values: number[] = [];
    for (let i = 0; i < 80; i++)
        values.push(
            (i & 1 ? -1 : 1) *
                (1 + random()) *
                2 ** (63 + Math.floor(random() * 960)),
        );
    const source = `console.log(${values.flatMap((v) => [`Math.sin(${v})`, `Math.cos(${v})`, `Math.tan(${v})`]).join(",")});`;
    const run = runNative(linkHost(generate(compileToIR(source))));
    assert.equal(run.status, 0, run.stderr.toString());
    const actual = run.stdout.toString().trim().split(" ").map(Number),
        expected = values.flatMap((v) => [
            Math.sin(v),
            Math.cos(v),
            Math.tan(v),
        ]);
    for (const [i, value] of expected.entries())
        assert.ok(
            Number.isFinite(actual[i]) &&
                Math.abs(actual[i]! - value) <=
                    8e-13 * Math.max(1, Math.abs(value)),
            `${i}: ${actual[i]} vs ${value}`,
        );
});

// Math.imul inline behind a callee check (#426): every case runs under GC
// stress and without it and is compared with Node.js.
function expectImul(source: string): void {
    const expected = runOracle(source).stdout;
    for (const gcStress of [true, false]) {
        const native = runOnHost(source, { gcStress });
        assert.equal(native.error, undefined);
        assert.equal(native.status, 0, native.stderr);
        assert.equal(native.stdout, expected, `gcStress: ${gcStress}`);
    }
}
const imulCases: [string, string][] = [
    [
        "int32 and uint32 operands",
        `function f(a,b){return Math.imul(a,b);}console.log(f(3,4),f(-5,7),f(-5,-7),f(0x7fffffff,2),f(0xffffffff,5),f(0x80000000,-1),f(-0x80000000,-0x80000000),f(65535,65537),f(0xdeadbeef,0x9e3779b9));`,
    ],
    [
        "operands of 2^31 and above",
        `function f(a,b){return Math.imul(a,b);}var xs=[2**31,2**32,2**32+3,2**53,-(2**53),2**53+2,2**63,-(2**63),2**64,2**70+2**40,1e300,-1e300,Number.MAX_VALUE,Number.MIN_VALUE];var out=[];for(var x of xs)out.push(f(x,3),f(7,x),f(x,x));console.log(out.join(' '));`,
    ],
    [
        "NaN, infinities and signed zero",
        `function f(a,b){return Math.imul(a,b);}console.log(f(NaN,3),f(3,NaN),f(Infinity,2),f(-Infinity,2),f(2,Infinity),Object.is(f(-0,5),0),Object.is(f(-5,0),0),Object.is(f(-0,-0),0),Object.is(f(0,-1),-0));`,
    ],
    [
        "fractions",
        `function f(a,b){return Math.imul(a,b);}console.log(f(2.9,3.9),f(-2.9,3.9),f(-0.5,8),f(0.99,-7),f(1e9+0.5,1e9+0.75),f(-(2**31)-0.5,1),f(2**32-0.5,1));`,
    ],
    [
        "strings, booleans, null and undefined",
        `function f(a,b){return Math.imul(a,b);}console.log(f('7',3),f('0x10','2'),f('abc',3),f(' 12 ',2),f(true,9),f(null,4),f(undefined,4),f([3],[5]));`,
    ],
    [
        "objects with valueOf convert in order",
        `var log=[];function v(n,x){return {valueOf(){log.push(n);return x;}};}function f(a,b){return Math.imul(a,b);}console.log(f(v('a',6),v('b',7)),f(5,v('c',-3)),f(v('d',2**32+5),4),log.join(''));`,
    ],
    [
        "BigInt and Symbol throw TypeError",
        `function f(a,b){return Math.imul(a,b);}for(var p of [[1n,2],[2,1n],[Symbol(),1],[1,Symbol()]]){try{f(p[0],p[1]);console.log('no');}catch(e){console.log(e instanceof TypeError);}}var log='';try{Math.imul({valueOf(){log+='a';return 1;}},1n);}catch(e){console.log(e instanceof TypeError,log);}`,
    ],
    [
        "zero, one and three arguments",
        `console.log(Math.imul(),Math.imul(5),Math.imul(3,4,5),Math.imul(...[6,7]),Math.imul.length,Math.imul.name);`,
    ],
    [
        "Math.imul replaced, deleted or read through a getter",
        `function f(a,b){return Math.imul(a,b);}var r=[f(3,4)];var original=Math.imul;Math.imul=function(a,b){return a+b;};r.push(f(3,4));delete Math.imul;try{f(3,4);}catch(e){r.push(e instanceof TypeError);}var log='';Object.defineProperty(Math,'imul',{configurable:true,get(){log+='g';return original;}});r.push(Math.imul((log+='a',3),(log+='b',5)),log);Object.defineProperty(Math,'imul',{configurable:true,writable:true,value:original});r.push(f(3,4));console.log(r.join(' '));`,
    ],
    [
        "a local Math and a reassigned global Math",
        `function g(a,b){return Math.imul(a,b);}var r=[g(6,7)];{const Math={imul:(a,b)=>a+b};r.push(Math.imul(6,7));}var saved=globalThis.Math;globalThis.Math={imul:(a,b)=>a-b};r.push(g(6,7));globalThis.Math=saved;r.push(g(6,7));console.log(r.join(' '));`,
    ],
    [
        "call, apply and other receivers",
        `var o={imul:Math.imul};console.log(Math.imul.call(null,6,7),Math.imul.apply(undefined,[0xffffffff,3]),o.imul(5,-5),[1,2,3].map((x)=>Math.imul(x,x)).join());`,
    ],
    [
        "hot loops: a product chain and FNV-1a",
        `var t=new Float64Array(1024);for(var i=0;i<1024;i++)t[i]=(i*2654435761)%4294967296;function chain(){var p=1;for(var i=0;i<3000;i++)p=Math.imul(p,t[i&1023]|1)>>>0;return p;}function fnv(s){var h=2166136261;for(var j=0;j<s.length;j++)h=Math.imul(h^s.charCodeAt(j),16777619)>>>0;return h;}var p=chain(),h=0,s='the quick brown fox jumps over the lazy dog';for(var k=0;k<20;k++)h^=fnv(s+k);console.log(p,h>>>0);`,
    ],
];
for (const [name, source] of imulCases)
    test(`Math.imul: ${name}`, () => expectImul(source));

test("Math.imul(a, b) is multiplied inline behind the callee check", () => {
    const source = `function f(a,b){return Math.imul(a,b);}console.log(f(3,4));`;
    const result = compile(source, {
        fileName: "/app.js",
        target: "linux-x64",
        printAsm: true,
    });
    assert.ok(result.ok, result.ok ? "" : JSON.stringify(result.diagnostics));
    assert.match(result.assembly!, /lea r10, \[rip\+rt\.Math\.imul\.fn\]/);
    assert.match(result.assembly!, /imul rcx, r10/);
});
