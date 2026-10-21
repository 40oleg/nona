import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The statistics, formatting and metric labels behind bench/report.mjs (#392).
type Summary = {
    n: number;
    median: number;
    min: number;
    max: number;
    q1: number;
    q3: number;
};
type Stats = {
    median: (v: number[]) => number;
    quantile: (v: number[], q: number) => number;
    summarize: (v: number[]) => Summary;
    geomean: (v: number[]) => number;
    fmt: (v: number, digits?: number) => string;
    fmtRatio: (v: number, o?: { noise?: number }) => string;
    fmtSpread: (s: Summary | undefined, kind?: string) => string;
    mdTable: (h: string[], rows: unknown[][]) => string;
    lastJson: (s: string) => unknown;
    aggregate: (runs: unknown[]) => Record<
        string,
        {
            failed: number;
            wall: Summary;
            metrics: Record<string, Summary>;
            checks: string[];
        }
    >;
};
type Metrics = {
    categories: Record<string, string>;
    metricInfo: Record<string, Record<string, [string, string]>>;
    summaryTable: (
        ratios: { key: string; category: string; ratio: number }[],
    ) => string;
};
const load = async <T>(file: string) =>
    (await import(pathToFileURL(resolve(file)).href)) as T;

test("median, quantiles and geometric mean", async () => {
    const s = await load<Stats>("bench/lib/stats.mjs");
    assert.equal(s.median([3, 1, 2]), 2);
    assert.equal(s.median([4, 1, 3, 2]), 2.5);
    assert.ok(Number.isNaN(s.median([])));
    assert.equal(s.quantile([1, 2, 3, 4, 5], 0.25), 2);
    assert.equal(s.quantile([1, 2, 3, 4, 5], 0.75), 4);
    assert.equal(s.quantile([1, 2, NaN, 3], 1), 3);
    const sum = s.summarize([5, 1, 4, 2, 3]);
    assert.deepEqual(sum, { n: 5, median: 3, min: 1, max: 5, q1: 2, q3: 4 });
    assert.ok(Math.abs(s.geomean([2, 8]) - 4) < 1e-12);
    assert.ok(Math.abs(s.geomean([0.5, 2]) - 1) < 1e-12);
    assert.ok(Number.isNaN(s.geomean([NaN, 0, -1])));
    assert.ok(Math.abs(s.geomean([NaN, 4]) - 4) < 1e-12);
});

test("numbers are printed with three significant digits", async () => {
    const s = await load<Stats>("bench/lib/stats.mjs");
    assert.equal(s.fmt(0.28), "0.280");
    assert.equal(s.fmt(5.8612), "5.86");
    assert.equal(s.fmt(56.249), "56.2");
    assert.equal(s.fmt(365.4), "365");
    assert.equal(s.fmt(1210), "1 210");
    assert.equal(s.fmt(1234567), "1 234 567");
    assert.equal(s.fmt(0), "0");
    assert.equal(s.fmt(NaN), "—");
    assert.equal(s.fmtRatio(0.6), "×0.6");
    assert.equal(s.fmtRatio(1.2), "≈×1.2");
    assert.equal(s.fmtRatio(1 / 1.4), "≈×0.7");
    assert.equal(s.fmtRatio(1.6), "×1.6");
    assert.equal(s.fmtRatio(98.4), "×98");
    assert.equal(s.fmtRatio(1.2, { noise: 1.1 }), "×1.2");
    assert.equal(s.fmtRatio(Infinity), "—");
    const sum = s.summarize([1, 2, 3, 4, 5]);
    assert.equal(s.fmtSpread(sum), "3.00 (2.00–4.00)");
    assert.equal(s.fmtSpread(sum, "range"), "3.00 (1.00–5.00)");
    assert.equal(s.fmtSpread(undefined), "—");
    assert.equal(
        s.mdTable(["a", "b"], [[1, "x"]]),
        "| a | b |\n| --- | --- |\n| 1 | x |",
    );
});

test("the last JSON line of a program's output is its metrics", async () => {
    const s = await load<Stats>("bench/lib/stats.mjs");
    assert.deepEqual(s.lastJson('noise\n{"a":1}\n{"b":2}\n'), { b: 2 });
    assert.deepEqual(s.lastJson('{"a":1}\ntrailing text'), { a: 1 });
    assert.equal(s.lastJson("nothing"), null);
    assert.equal(s.lastJson(""), null);
});

test("runs are aggregated per runtime with medians and check values", async () => {
    const s = await load<Stats>("bench/lib/stats.mjs");
    const run = (
        rt: string,
        wall: number,
        x: number,
        check: unknown,
        rc = 0,
    ) => ({
        rt,
        rc,
        wall,
        rss: 10,
        metrics: rc === 0 ? { x, check } : null,
    });
    const agg = s.aggregate([
        run("node", 1, 10, 7),
        run("node", 3, 30, 7),
        run("node", 2, 20, 7),
        run("nona", 5, 50, 8),
        run("nona", 0, 0, 0, 1),
    ]);
    const node = agg.node!,
        nona = agg.nona!;
    assert.equal(node.wall.median, 2);
    assert.equal(node.metrics.x!.median, 20);
    assert.equal(node.metrics.x!.n, 3);
    assert.deepEqual(node.checks, ["7"]);
    assert.equal(node.failed, 0);
    assert.equal(nona.failed, 1);
    assert.equal(nona.metrics.x!.n, 1);
    assert.deepEqual(nona.checks, ["8"]);
    assert.equal("check" in nona.metrics, false);
});

test("the summary table has one row per category with the geometric mean", async () => {
    const m = await load<Metrics>("bench/lib/metrics.mjs");
    const table = m.summaryTable([
        { key: "a", category: "compute", ratio: 2 },
        { key: "b", category: "compute", ratio: 8 },
        { key: "c", category: "compute", ratio: 0.5 },
        { key: "d", category: "strings", ratio: 1.2 },
        { key: "e", category: "strings", ratio: NaN },
    ]);
    const rows = table.split("\n").slice(2);
    assert.equal(rows.length, 2);
    assert.match(
        rows[0] ?? "",
        /^\| Compute .* \| 3 \| ×2\.0 \| 1 \| 0 \| 2 \|$/,
    );
    assert.match(
        rows[1] ?? "",
        /^\| Strings.* \| 1 \| ≈×1\.2 \| 0 \| 1 \| 0 \|$/,
    );
    for (const [, info] of Object.entries(m.metricInfo))
        for (const [key, [label, category]] of Object.entries(info)) {
            assert.equal(typeof label, "string", key);
            assert.ok(
                typeof category === "string" && category in m.categories,
                `${label}: ${category}`,
            );
        }
});

// Every metric the micro-benchmarks print has a label and a category, so a
// new timing shows up in the report with a name instead of a raw key.
test("every micro-benchmark metric is labelled", async () => {
    const m = await load<Metrics>("bench/lib/metrics.mjs");
    const scripts = readdirSync("bench").filter(
        (f) => /^\d\d_.*\.m?js$/.test(f) && !f.startsWith("01_"),
    );
    assert.ok(scripts.length >= 12);
    for (const script of scripts) {
        const name = script.replace(/\.m?js$/, "");
        if (name === "12_fs" && process.platform === "win32") continue;
        const r = spawnSync("node", [script], {
            cwd: "bench",
            encoding: "utf8",
            env: { ...process.env, SCALE: "0.001" },
            timeout: 60000,
        });
        assert.equal(r.status, 0, `${script}: ${r.stderr}`);
        const metrics = JSON.parse(
            r.stdout.trim().split("\n").pop() ?? "",
        ) as Record<string, unknown>;
        assert.ok("check" in metrics, `${script} prints no check`);
        const info = m.metricInfo[name];
        assert.ok(info, `${name} has no metric labels`);
        for (const [key, value] of Object.entries(metrics))
            if (key !== "check" && typeof value === "number")
                assert.ok(
                    key in info || key === "bytes",
                    `${name}: metric ${key} has no label`,
                );
    }
});
