// Original, redistributable WASM fixtures (MIT, like Nona). No WAT compiler or
// downloaded binary is required. Keep binary construction separate from tests.
export const uleb = (n: number): number[] => {
    const out: number[] = [];
    do {
        const b = n % 128;
        n = Math.floor(n / 128);
        out.push(b | (n ? 128 : 0));
    } while (n);
    return out;
};
export const sleb = (value: bigint): number[] => {
    const out: number[] = [];
    for (;;) {
        const b = Number(value & 127n);
        value >>= 7n;
        const done =
            (value === 0n && !(b & 64)) || (value === -1n && !!(b & 64));
        out.push(b | (done ? 0 : 128));
        if (done) return out;
    }
};
export const vec = (items: number[][]): number[] => [
    ...uleb(items.length),
    ...items.flat(),
];
export const name = (s: string): number[] => [
    ...uleb(Buffer.byteLength(s)),
    ...Buffer.from(s),
];
export const section = (id: number, bytes: number[]): number[] => [
    id,
    ...uleb(bytes.length),
    ...bytes,
];
export const moduleBytes = (...sections: number[][]): number[] => [
    0,
    97,
    115,
    109,
    1,
    0,
    0,
    0,
    ...sections.flat(),
];
export const type = (params: number[], results: number[]): number[] => [
    96,
    ...vec(params.map((x) => [x])),
    ...vec(results.map((x) => [x])),
];
export const body = (ops: number[], locals: number[][] = []): number[] => {
    const bytes = [...vec(locals), ...ops, 11];
    return [...uleb(bytes.length), ...bytes];
};
export const exported = (s: string, kind: number, index: number): number[] => [
    ...name(s),
    kind,
    ...uleb(index),
];
export function functionModule(
    params: number[],
    results: number[],
    ops: number[],
    locals: number[][] = [],
): number[] {
    return moduleBytes(
        section(1, vec([type(params, results)])),
        section(3, vec([[0]])),
        section(7, vec([exported("run", 0, 0)])),
        section(10, vec([body(ops, locals)])),
    );
}
export const i32 = 127,
    i64 = 126,
    f32 = 125,
    f64 = 124;
export const callbackModule = moduleBytes(
    section(1, vec([type([i32, i32], [i32])])),
    section(2, vec([[...name("e"), ...name("f"), 0, 0]])),
    section(7, vec([exported("f", 0, 0)])),
);
export const memoryModule = moduleBytes(
    section(1, vec([type([i32], [i32]), type([i32, i64], [i64])])),
    section(2, vec([[...name("e"), ...name("m"), 2, 1, 1, 3]])),
    section(3, vec([[0], [1]])),
    section(
        7,
        vec([
            exported("grow", 0, 0),
            exported("store", 0, 1),
            exported("memory", 2, 0),
        ]),
    ),
    section(
        10,
        vec([
            body([32, 0, 64, 0]),
            body([32, 0, 32, 1, 55, 0, 0, 32, 0, 41, 0, 0]),
        ]),
    ),
    section(11, vec([[0, 65, 0, 11, 3, 0, 128, 255]])),
);
export const indirectModule = moduleBytes(
    section(1, vec([type([i32, i32], [i32]), type([i32, i32, i32], [i32])])),
    section(2, vec([[...name("e"), ...name("t"), 1, 112, 0, 1]])),
    section(3, vec([[1]])),
    section(7, vec([exported("run", 0, 0)])),
    section(10, vec([body([32, 0, 32, 1, 32, 2, 17, 0, 0])])),
);

// Standard scalar opcode groups; execution expectations come from Node, never
// from Nona's opcode tables. Include every scalar operation and saturating cast.
export const numericCases: {
    op: number;
    params: number[];
    results: number[];
}[] = [];
function group(
    first: number,
    last: number,
    param: number,
    result: number,
    unaryThrough: number,
) {
    for (let op = first; op <= last; op++)
        numericCases.push({
            op,
            params: op <= unaryThrough ? [param] : [param, param],
            results: [result],
        });
}
group(0x45, 0x4f, i32, i32, 0x45);
group(0x50, 0x5a, i64, i32, 0x50);
group(0x5b, 0x60, f32, i32, 0);
group(0x61, 0x66, f64, i32, 0);
group(0x67, 0x78, i32, i32, 0x69);
group(0x79, 0x8a, i64, i64, 0x7b);
group(0x8b, 0x98, f32, f32, 0x91);
group(0x99, 0xa6, f64, f64, 0x9f);
const conversions: [number, number][] = [
    [i64, i32],
    [f32, i32],
    [f32, i32],
    [f64, i32],
    [f64, i32],
    [i32, i64],
    [i32, i64],
    [f32, i64],
    [f32, i64],
    [f64, i64],
    [f64, i64],
    [i32, f32],
    [i32, f32],
    [i64, f32],
    [i64, f32],
    [f64, f32],
    [i32, f64],
    [i32, f64],
    [i64, f64],
    [i64, f64],
    [f32, f64],
    [f32, i32],
    [f64, i64],
    [i32, f32],
    [i64, f64],
    [i32, i32],
    [i32, i32],
    [i64, i64],
    [i64, i64],
    [i64, i64],
];
conversions.forEach(([p, r], i) =>
    numericCases.push({ op: 0xa7 + i, params: [p], results: [r] }),
);
for (let i = 0; i < 8; i++)
    numericCases.push({
        op: 0xfc00 + i,
        params: [i & 2 ? f64 : f32],
        results: [i < 4 ? i32 : i64],
    });
export const numericModule = moduleBytes(
    section(1, vec(numericCases.map((c) => type(c.params, c.results)))),
    section(3, vec(numericCases.map((_, i) => uleb(i)))),
    section(7, vec(numericCases.map((c, i) => exported("op" + c.op, 0, i)))),
    section(
        10,
        vec(
            numericCases.map((c) =>
                body([
                    ...c.params.flatMap((_, i) => [32, i]),
                    ...(c.op >= 0xfc00 ? [252, c.op - 0xfc00] : [c.op]),
                ]),
            ),
        ),
    ),
);

export const controlModule = moduleBytes(
    section(0, [...name("dylink.0"), 1, 2, 3]),
    section(1, vec([type([i32], [i32]), type([], [])])),
    section(2, vec([[...name("e"), ...name("g"), 3, i32, 1]])),
    section(3, vec([[0], [0], [1]])),
    section(6, vec([[i32, 0, 65, 42, 11]])),
    section(
        7,
        vec([
            exported("factorial", 0, 0),
            exported("choose", 0, 1),
            exported("g", 3, 0),
            exported("answer", 3, 1),
        ]),
    ),
    section(8, [2]),
    section(
        10,
        vec([
            body(
                [
                    65, 1, 33, 1, 2, 64, 3, 64, 32, 0, 69, 13, 1, 32, 1, 32, 0,
                    108, 33, 1, 32, 0, 65, 1, 107, 33, 0, 12, 0, 11, 11, 32, 1,
                ],
                [[1, i32]],
            ),
            body([32, 0, 4, i32, 35, 1, 5, 65, 7, 11]),
            body([35, 0, 65, 1, 106, 36, 0]),
        ]),
    ),
);

export const bulkModule = moduleBytes(
    section(1, vec([type([i32, i32, i32], [])])),
    section(3, vec([[0], [0], [0]])),
    section(5, vec([[0, 1]])),
    section(
        7,
        vec([
            exported("init", 0, 0),
            exported("copy", 0, 1),
            exported("fill", 0, 2),
            exported("memory", 2, 0),
        ]),
    ),
    section(12, [1]),
    section(
        10,
        vec([
            body([32, 0, 32, 1, 32, 2, 252, 8, 0, 0, 252, 9, 0]),
            body([32, 0, 32, 1, 32, 2, 252, 10, 0, 0]),
            body([32, 0, 32, 1, 32, 2, 252, 11, 0]),
        ]),
    ),
    section(11, vec([[1, 4, 0, 128, 255, 0]])),
);

export const accessModule = moduleBytes(
    section(
        1,
        vec([
            ...[i32, i64, f32, f64].map((t) => type([i32], [t])),
            ...[i32, i64, f32, f64].map((t) => type([i32, t], [])),
        ]),
    ),
    section(
        3,
        vec([
            ...[0, 1, 2, 3, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1].map((t) => [t]),
            ...[4, 5, 6, 7, 4, 4, 5, 5, 5].map((t) => [t]),
        ]),
    ),
    section(5, vec([[0, 1]])),
    section(
        7,
        vec([
            ...[...Array(23)].map((_, i) => exported("op" + (40 + i), 0, i)),
            exported("memory", 2, 0),
        ]),
    ),
    section(
        10,
        vec(
            [...Array(23)].map((_, i) =>
                body(
                    i < 14
                        ? [32, 0, 40 + i, 0, 0]
                        : [32, 0, 32, 1, 40 + i, 0, 0],
                ),
            ),
        ),
    ),
);

export const tableModule = moduleBytes(
    section(
        1,
        vec([type([], [i32]), type([i32, i32, i32], []), type([i32], [i32])]),
    ),
    section(3, vec([[0], [1], [1], [2], [2], [2]])),
    section(4, vec([[112, 1, 2, 5]])),
    section(
        7,
        vec([
            exported("f", 0, 0),
            exported("init", 0, 1),
            exported("copy", 0, 2),
            exported("call", 0, 3),
            exported("grow", 0, 4),
            exported("clear", 0, 5),
            exported("table", 1, 0),
        ]),
    ),
    section(9, vec([[1, 0, 1, 0]])),
    section(
        10,
        vec([
            body([65, 42]),
            body([32, 0, 32, 1, 32, 2, 252, 12, 0, 0, 252, 13, 0]),
            body([32, 0, 32, 1, 32, 2, 252, 14, 0, 0]),
            body([32, 0, 17, 0, 0]),
            body([210, 0, 32, 0, 252, 15, 0]),
            body([32, 0, 208, 112, 65, 1, 252, 17, 0, 252, 16, 0]),
        ]),
    ),
);
