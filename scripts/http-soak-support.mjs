import { isDeepStrictEqual } from "node:util";
import { configuredPass } from "./http-soak-smoke-policy.mjs";
// Decisions shared by the real HTTP soak driver and cheap Node regressions.
const BIG = Buffer.alloc(1048576, "b");
const TEXT = "Hello, soak!";
const expectedDocument = { generated: "soak", version: 1, items: [], tags: {} };
for (let i = 0; i < 24; i++) {
    expectedDocument.items.push({
        id: i,
        name: "item-" + i,
        price: i * 1.25,
        active: i % 3 !== 0,
        sizes: [i, i + 1, i + 2],
        owner: { id: 1000 + i, login: "user" + i },
    });
    expectedDocument.tags["tag" + i] = i % 2 === 0;
}
const BUCKET_BASE = Math.log(1.01);
const BUCKETS = 2000;
function newHistogram() {
    return { counts: new Uint32Array(BUCKETS), n: 0 };
}
function record(histogram, ms) {
    const us = Math.max(1, ms * 1000);
    const i = Math.min(BUCKETS - 1, Math.ceil(Math.log(us) / BUCKET_BASE));
    histogram.counts[i]++;
    histogram.n++;
}
function merge(histograms) {
    const out = newHistogram();
    for (const h of histograms) {
        for (let i = 0; i < BUCKETS; i++) out.counts[i] += h.counts[i];
        out.n += h.n;
    }
    return out;
}
function quantile(histogram, q) {
    if (histogram.n === 0) return null;
    const target = Math.ceil(histogram.n * q);
    let seen = 0;
    for (let i = 0; i < BUCKETS; i++) {
        seen += histogram.counts[i];
        if (seen >= target) return Math.exp(i * BUCKET_BASE) / 1000;
    }
    return null;
}

function median(values) {
    const v = values.filter((x) => x !== null && x !== undefined);
    if (v.length === 0) return null;
    v.sort((a, b) => a - b);
    const m = v.length >> 1;
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function checkResponse(route, res, body) {
    const status = res.statusCode;
    switch (route) {
        case "text":
        case "close":
            if (status !== 200) return `status ${status}`;
            if (body.toString() !== TEXT) return "wrong body";
            return null;
        case "json": {
            if (status !== 200) return `status ${status}`;
            let doc;
            try {
                doc = JSON.parse(body.toString());
            } catch {
                return "invalid JSON";
            }
            if (!isDeepStrictEqual(doc, expectedDocument))
                return "wrong JSON content";
            return null;
        }
        case "big":
            if (status !== 200) return `status ${status}`;
            if (!/chunked/i.test(res.headers["transfer-encoding"] || ""))
                return "not chunked";
            if (!body.equals(BIG)) return `wrong body (${body.length} bytes)`;
            return null;
        case "missing":
            return status === 404 ? null : `status ${status}`;
        case "throw":
            return status === 500 ? null : `status ${status}`;
    }
    return `unknown route ${route}`;
}

function round(v) {
    return v === null ? null : Math.round(v * 1000) / 1000;
}
export function evaluateRun({
    config,
    samples,
    histograms,
    crash,
    counters,
    baseline,
    after,
    loadSeconds,
    failureExamples = [],
}) {
    const warmup = config.warmupMinutes * 60;
    const windowSeconds = config.windowMinutes * 60;
    const loadSamples = samples
        .map((s, i) => ({ s, h: histograms[i] }))
        .filter(({ s }) => s.phase === "load");
    // After a crash the windows would overlap: the RSS and latency criteria are
    // not evaluated (and fail).
    const fullRun =
        crash === null &&
        Number.isFinite(loadSeconds) &&
        loadSeconds >= config.minutes * 60;
    const missing = fullRun
        ? "not enough samples"
        : "not evaluated: the run ended early";
    // Only floating-point roundoff, not sampling or performance slack.
    const epsilon = Number.EPSILON * Math.max(1, loadSeconds) * 8;
    const bounds = ({ s }) => ({
        start: s.intervalStart ?? s.t - config.sampleSeconds,
        end: s.intervalEnd ?? s.t,
        explicit: s.intervalStart !== undefined && s.intervalEnd !== undefined,
    });
    const validHistogram = (h) => {
        if (
            !h ||
            !Number.isSafeInteger(h.n) ||
            h.n < 0 ||
            h.counts?.length !== BUCKETS
        )
            return false;
        let total = 0;
        for (let i = 0; i < BUCKETS; i++) {
            const count = h.counts[i];
            // Bins use Uint32 storage; validate before any merge can coerce them.
            if (!Number.isSafeInteger(count) || count < 0 || count > 0xffffffff)
                return false;
            total += count;
            if (!Number.isSafeInteger(total)) return false;
        }
        return total === h.n;
    };
    let observationsValid = true;
    const comparisonSamples = loadSamples.filter((entry, i) => {
        const { s, h } = entry;
        const { start, end, explicit } = bounds(entry);
        const previous = i > 0 ? bounds(loadSamples[i - 1]) : null;
        const validBounds =
            Number.isFinite(start) &&
            Number.isFinite(end) &&
            start >= 0 &&
            end > start &&
            end <= loadSeconds + epsilon &&
            (i !== loadSamples.length - 1 ||
                end + epsilon >= config.minutes * 60) &&
            // A single missing/null boundary is not legacy complete evidence.
            (explicit
                ? s.intervalStart !== null && s.intervalEnd !== null
                : s.intervalStart === undefined && s.intervalEnd === undefined);
        const contiguous = previous
            ? !explicit ||
              !previous.explicit ||
              Math.abs(start - previous.end) <= epsilon
            : !explicit || start <= epsilon;
        const complete = end + epsilon >= start + config.sampleSeconds;
        const terminalPartial =
            s.observation === "terminal-partial" &&
            fullRun &&
            explicit &&
            i === loadSamples.length - 1 &&
            previous?.explicit &&
            start < config.minutes * 60 &&
            end >= config.minutes * 60 &&
            end <= loadSeconds + epsilon &&
            !complete;
        observationsValid &&=
            validBounds &&
            contiguous &&
            validHistogram(h) &&
            Number.isFinite(s.t) &&
            (terminalPartial ||
                (complete &&
                    (s.observation === undefined ||
                        s.observation === "complete")));
        // Never filter by histogram emptiness. Unknown/malformed observations
        // invalidate coverage; legacy evidence is eligible only when complete.
        return !terminalPartial;
    });
    const headWindow = comparisonSamples.filter(
        ({ s }) =>
            fullRun &&
            (s.intervalStart ?? s.t - config.sampleSeconds) >= warmup &&
            (s.intervalEnd ?? s.t) <= warmup + windowSeconds + 1,
    );
    // A clipped snapshot closes accounting, not a comparison window. Anchor
    // that window at the preceding complete boundary so full/smoke runs still
    // require their original number of complete observations. The coverage
    // checks below remain relative to the actual load end, including its gap.
    const comparisonEndSeconds =
        comparisonSamples.length < loadSamples.length &&
        comparisonSamples.length
            ? bounds(comparisonSamples.at(-1)).end
            : loadSeconds;
    const tailWindow = comparisonSamples.filter(
        ({ s }) =>
            fullRun &&
            (s.intervalStart ?? s.t - config.sampleSeconds) >=
                comparisonEndSeconds - windowSeconds - 1,
    );
    const expectedSamples = Math.max(
        2,
        Math.ceil(windowSeconds / config.sampleSeconds),
    );
    const covered = (window, start, end) =>
        window.length >= expectedSamples &&
        window[0].s.t <= start + config.sampleSeconds + 1 &&
        window.at(-1).s.t >= end - config.sampleSeconds - 1 &&
        window.every(
            ({ s, h }, i) =>
                Number.isFinite(s.rss) &&
                validHistogram(h) &&
                h.n > 0 &&
                (i === 0 ||
                    s.t - window[i - 1].s.t <= config.sampleSeconds + 1),
        );
    const coverage =
        fullRun &&
        observationsValid &&
        covered(headWindow, warmup, warmup + windowSeconds) &&
        covered(tailWindow, loadSeconds - windowSeconds, loadSeconds);
    const criteria = [];
    function criterion(name, pass, value, limit) {
        criteria.push({ name, pass, value, limit });
    }

    criterion(
        "no crash",
        fullRun,
        fullRun
            ? "the server ran to the end"
            : crash === null
              ? `load ended early: ${loadSeconds} of ${config.minutes * 60} seconds`
              : JSON.stringify(crash),
        "no exit before the end",
    );
    criterion(
        "no failed requests",
        counters.failed === 0,
        String(counters.failed),
        "0 (404, 500 and aborted /slow are deliberate)",
    );

    criterion(
        "comparison sample coverage",
        coverage,
        `${headWindow.length}/${tailWindow.length} samples`,
        `at least ${expectedSamples} complete samples per window`,
    );

    const rssHead = median(headWindow.map(({ s }) => s.rss));
    const rssTail = median(tailWindow.map(({ s }) => s.rss));
    const rssGrowth =
        rssHead && rssTail !== null ? (rssTail - rssHead) / rssHead : null;
    criterion(
        "RSS growth after warm-up",
        coverage && rssGrowth !== null && rssGrowth < config.limits.rssGrowth,
        rssGrowth === null
            ? missing
            : `${(rssGrowth * 100).toFixed(1)}% (${(rssHead / 1048576).toFixed(1)} → ${(rssTail / 1048576).toFixed(1)} MB, medians)`,
        `< ${config.limits.rssGrowth * 100}%`,
    );

    function handleCheck(field, slack) {
        if (!after || baseline[field] === null || after[field] === null)
            return null;
        return {
            pass: after[field] <= baseline[field] + slack,
            text: `${field} ${baseline[field]} → ${after[field]}`,
        };
    }
    const handles = [
        handleCheck("openSockets", config.limits.socketSlack),
        handleCheck("fds", config.limits.fdSlack),
        handleCheck("activeResources", config.limits.resourceSlack),
    ].filter(Boolean);
    criterion(
        "handles back to the baseline",
        after !== null && handles.length > 0 && handles.every((h) => h.pass),
        after === null
            ? "no post-load sample"
            : handles.map((h) => h.text).join(", "),
        `baseline + ${config.limits.socketSlack} sockets, + ${config.limits.fdSlack} fds, + ${config.limits.resourceSlack} resources`,
    );

    // Missing histogram evidence fails coverage, while still producing a report.
    const p99Head = quantile(
        merge(headWindow.map(({ h }) => h).filter(validHistogram)),
        0.99,
    );
    const p99Tail = quantile(
        merge(tailWindow.map(({ h }) => h).filter(validHistogram)),
        0.99,
    );
    const p99Growth =
        p99Head && p99Tail !== null ? p99Tail / p99Head - 1 : null;
    criterion(
        "p99 latency stable",
        coverage &&
            p99Growth !== null &&
            p99Tail <= p99Head * (1 + config.limits.p99Growth),
        p99Growth === null
            ? missing
            : `${p99Head.toFixed(2)} → ${p99Tail.toFixed(2)} ms (${p99Growth >= 0 ? "+" : ""}${(p99Growth * 100).toFixed(1)}%)`,
        `last complete ${+config.windowMinutes.toFixed(2)} min ≤ first ${+config.windowMinutes.toFixed(2)} min after warm-up + ${config.limits.p99Growth * 100}%`,
    );

    const originalPass = criteria.every((c) => c.pass);
    const pass = configuredPass(config, criteria);
    const totalRequests =
        counters.ok +
        counters.deliberate.missing +
        counters.deliberate.throw +
        counters.deliberate.slowAborted +
        counters.failed;
    const summary = {
        pass,
        originalPass,
        loadSeconds: Math.round(loadSeconds),
        comparisonEndSeconds,
        requests: totalRequests,
        ok: counters.ok,
        deliberate: counters.deliberate,
        failed: counters.failed,
        failures: counters.failures,
        failuresNearCrash: counters.nearCrash,
        failureExamples,
        averageRps:
            Math.round((totalRequests / Math.max(1, loadSeconds)) * 10) / 10,
        rssHead,
        rssTail,
        p99Head: round(p99Head),
        p99Tail: round(p99Tail),
        baseline: {
            openSockets: baseline.openSockets,
            fds: baseline.fds,
            activeResources: baseline.activeResources,
        },
        after: after && {
            openSockets: after.openSockets,
            fds: after.fds,
            activeResources: after.activeResources,
        },
    };

    return { criteria, summary };
}
export { checkResponse, newHistogram, record, quantile };
