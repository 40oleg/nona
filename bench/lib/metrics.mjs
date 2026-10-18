// Labels and categories of the metrics the benchmark scripts print, for the
// tables of bench/report.mjs and the geometric means per category of its
// summary (tests/bench-report.test.ts checks that every metric is listed).

import { fmtRatio, geomean, mdTable } from "./stats.mjs";

export const categories = {
    startup: "Start-up (hello world, lodash loaded)",
    compute: "Compute (calls, numbers, typed arrays)",
    alloc: "Allocation, objects and collections",
    strings: "Strings, RegExp and JSON",
    io: "I/O and the event loop",
    real: "Real programs",
    awfy: "Are-We-Fast-Yet (steady state)",
    game: "Benchmarks Game (whole process)",
};
export const metricInfo = {
    "05_array": {
        push: ["`push` × N", "alloc"],
        from: ["`Array.from({length: N})`", "alloc"],
        prealloc: ["`new Array(N)` + fill", "alloc"],
        forsum: ["Sum with a `for` loop", "compute"],
        mfr: ["`map` → `filter` → `reduce`", "alloc"],
        sort: ["`sort` N numbers with a comparator", "compute"],
    },
    "06_objects": {
        create: ["Create N objects `{id, x, y, name}`", "alloc"],
        access: ["Read 3 properties × N", "compute"],
        mapSet: ["`Map.set` × N", "alloc"],
        mapGet: ["`Map.get` × N", "alloc"],
        set: ["`Set.add` + `Set.has` × N", "alloc"],
    },
    "07_strings": {
        concat: ['`s += "abc" + i` × 20 000', "strings"],
        splitJoin: ['`split("1")` + `join("-")`', "strings"],
        indexOf: ["`indexOf` in a loop", "strings"],
        regex: ["`/abc(\\d{3})-/g.exec` in a loop", "strings"],
    },
    "08_numeric": {
        fib32: ["`fib(32)` recursive", "compute"],
        matmul200: ["200×200 matrix multiply", "compute"],
        bigfact3000: ["BigInt factorial 3000!", "compute"],
    },
    "09_gc": { alloc5M: ["5M short-lived objects", "alloc"] },
    "10_async": {
        promise1M: ["Promise chain, `.then` × 100 000", "io"],
        timeout10k: ["10 000 sequential `setTimeout(fn, 0)`", "io"],
    },
    "11_json": {
        stringify: ["`JSON.stringify`, 30 000 objects", "strings"],
        parse: ["`JSON.parse`, 2.9 MB", "strings"],
    },
    "12_fs": {
        write100MB: [
            "`writeFileSync` × 10 of 1 MB chunks (SCALE × 100 MB)",
            "io",
        ],
        read100MB: ["`readFileSync` of the same file", "io"],
    },
    "13_typed": { f64_10M: ["`Float64Array`: fill, sum, map, 1M", "compute"] },
    "14_calls": {
        calls10M: ["Call `add(a, b)` × 10N", "compute"],
        closures1M: ["Create and call N closures", "compute"],
        callApply4M: ["`call` + `apply` × 4N", "compute"],
    },
    "15_classes": {
        mono5M: ["Method through an inheritance chain", "compute"],
        poly5M: ["Polymorphic call, 3 classes", "compute"],
        new1M: ["`new Square(i)` × N", "alloc"],
    },
    "16_string_scan": {
        equals: ["Long-string equality", "strings"],
        search: ["Substring search", "strings"],
        split: ["`split`/`replaceAll`", "strings"],
        keys: ["Long `Map` keys", "strings"],
    },
    "17_typed_arrays": {
        fill: ["Typed array `fill`", "compute"],
        copy: ["Typed array `copyWithin`/`set`", "compute"],
        search: ["Typed array searches", "compute"],
        loops: ["Typed array loops", "compute"],
    },
    acorn: {
        first: ["acorn 8.18.0: first parse of its own 230 KB", "real"],
        parse10: ["acorn: 10 more parses", "real"],
    },
    marked: {
        first: ["marked 12.0.2: first render", "real"],
        render5: ["marked: 5 more renders", "real"],
    },
    lodash: {
        collections: [
            "lodash 4.17.21: groupBy/sortBy/uniqBy, 50 000 records",
            "real",
        ],
        functional: ["lodash: chunk/sumBy/countBy/pick", "real"],
        strings: [
            "lodash: camelCase/kebabCase/capitalize × 150 000",
            "strings",
        ],
        deep: ["lodash: cloneDeep/isEqual/merge, 10 000 records", "real"],
    },
    prettier: {
        first: ["Prettier 3.6.2: first format of 2 000 lines", "real"],
        format3: ["Prettier: 3 more formats", "real"],
    },
    "log-scan": {
        match: [
            "log-scan: `match` with an alternation, 11 MB (#389)",
            "strings",
        ],
        replaceAll: [
            "log-scan: `replaceAll`, 200 000 matches (#387)",
            "strings",
        ],
        execLoop: [
            "log-scan: capturing `exec` loop over 200 000 lines",
            "strings",
        ],
        splitFilter: [
            "log-scan: `split` + `indexOf`/`includes` filters",
            "strings",
        ],
        sort: ["log-scan: default `sort` of 50 000 strings (#388)", "strings"],
        group: ["log-scan: `slice` keys into a `Map`", "strings"],
    },
    "json-big": {
        stringify: ["JSON: `stringify` 100 000 records (20 MB)", "strings"],
        read: ["JSON: read the 20 MB file", "io"],
        parse: ["JSON: `parse` 20 MB", "strings"],
        pretty: ["JSON: `stringify(…, null, 2)`", "strings"],
    },
};

// The summary table: per category, the number of cases, the geometric mean of
// the Nona/Node ratios and how many cases Nona wins, ties and loses, where
// ratios within ×1.5 either way count as noise.
export function summaryTable(ratios) {
    const rows = [];
    for (const [id, text] of Object.entries(categories)) {
        const in_ = ratios.filter(
            (r) => r.category === id && Number.isFinite(r.ratio),
        );
        if (in_.length === 0) continue;
        const wins = in_.filter((r) => r.ratio < 1 / 1.5).length;
        const losses = in_.filter((r) => r.ratio > 1.5).length;
        rows.push([
            text,
            in_.length,
            fmtRatio(geomean(in_.map((r) => r.ratio))),
            wins,
            in_.length - wins - losses,
            losses,
        ]);
    }
    return mdTable(
        [
            "Category",
            "Cases",
            "Geomean Nona / Node",
            "Nona faster (>×1.5)",
            "Within noise",
            "Node faster (>×1.5)",
        ],
        rows,
    );
}
