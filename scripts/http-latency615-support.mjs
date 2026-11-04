// Import-safe boundaries for the single issue615 retained-image experiment.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import path from "node:path";
export const sha256 = (bytes) =>
    createHash("sha256").update(bytes).digest("hex");
export const PINS = Object.freeze({
    repository: "40oleg/nona",
    branch: "nona/issue-615",
    sourceHead: "3c4fe0d93964bebf243bf39fdd72880bca1abb2c",
    checkout: "3c7e9bc4bf6b4296d3495f6c8af268bb162d6b42",
    sourceTree: "fa52079546f11af45f7212e06f6f3799f67c8f6d",
    fixtureCommit: "ab5ea083d793e0a665fde8b0a4b33bc1fa67208e",
    fixture: "3bae7410ac2d9afcb9a9e1431919a2aa5b5ca352db578769810a24f0ac718f60",
    driver: "31be9600805b228135b665969320e4554c6f95236e6bb85f55f8116b2678f47d",
    native: "f9676ffbdd58017622c4f0d34d42dd2134fe22e8916e911032aef17c5c20fa97",
    run: 41476110342,
    job: 125381994170,
    artifact: 13158691140,
    zipSize: 4569517,
    zip: "237b876954736a60cdc9bd9102a680099f9811377ad7f9c79919e005f59493dc",
    workflowPath: ".github/workflows/http-keepalive.yml",
    node: "v26.9.0",
});
export const BUDGET = Object.freeze({
    total: 1680000,
    arm: 480000,
    cleanup: 20000,
    preflight: 60000,
    gap: 5000,
    observer: 20000,
    report: 30000,
    headroom: 60000,
    job: 1860000,
    sharedSetupUpload: 180000,
});
const exact = (got, expected, name) => assert.equal(got, expected, name);
const hex = (s, n) =>
    typeof s === "string" && new RegExp(`^[a-f0-9]{${n}}$`).test(s);
const positive = (n) => Number.isSafeInteger(n) && n > 0;
export function nonce(value) {
    assert.match(value, /^[a-z0-9][a-z0-9-]{7,63}$/, "nonce");
    return value;
}
export function admit(a) {
    for (const [k, v] of Object.entries({
        event: "workflow_dispatch",
        mode: "latency615-triad",
        repository: PINS.repository,
        headRepository: PINS.repository,
        ref: "refs/heads/" + PINS.branch,
        actor: "40oleg",
        triggeringActor: "40oleg",
        attempt: "1",
        actions: "true",
        contextEnvironment: "github-hosted",
        runnerEnvironment: "github-hosted",
        platform: "win32",
        arch: "x64",
        node: PINS.node,
        runnerOS: "Windows",
        runnerArch: "X64",
    }))
        exact(a[k], v, k);
    assert.ok(
        hex(a.expectedHead, 40) &&
            hex(a.expectedTree, 40) &&
            hex(a.expectedWorkflowHash, 64) &&
            hex(a.sourceIdentityHash, 64),
        "parent-supplied future pins required",
    );
    for (const k of ["sha", "checkout", "workflowSha"])
        exact(a[k], a.expectedHead, k);
    exact(a.tree, a.expectedTree, "tree");
    exact(a.workflowHash, a.expectedWorkflowHash, "workflow bytes");
    exact(
        a.workflowRef,
        `${PINS.repository}/${PINS.workflowPath}@refs/heads/${PINS.branch}`,
        "workflow ref",
    );
    assert.match(a.expectedWorkflowId, /^[1-9][0-9]*$/);
    assert.ok(positive(a.workflowId));
    exact(a.workflowId, Number(a.expectedWorkflowId), "workflow ID");
    for (const k of ["runner", "run", "job"])
        assert.ok(typeof a[k] === "string" && a[k].length > 0, k);
    assert.match(a.run, /^[1-9][0-9]*$/);
    nonce(a.nonce);
    return { ...a };
}
// Reject duplicate keys at every nesting level before JSON.parse loses them.
export function parseJson(raw) {
    const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : raw;
    assert.ok(Buffer.byteLength(text) <= 1048576, "JSON cap");
    let i = 0;
    const ws = () => {
        while (/\s/.test(text[i] ?? "") && i < text.length) i++;
    };
    const string = () => {
        const start = i++;
        while (i < text.length) {
            if (text[i] === "\\") {
                i += 2;
                continue;
            }
            if (text[i++] === '"') return JSON.parse(text.slice(start, i));
        }
        throw Error("unterminated JSON string");
    };
    function value(depth = 0) {
        assert.ok(depth < 64, "JSON nesting");
        ws();
        if (text[i] === "{") {
            i++;
            ws();
            const keys = new Set();
            if (text[i] === "}") {
                i++;
                return;
            }
            for (;;) {
                ws();
                assert.equal(text[i], '"');
                const key = string();
                assert.ok(!keys.has(key), "duplicate JSON key");
                keys.add(key);
                ws();
                assert.equal(text[i++], ":");
                value(depth + 1);
                ws();
                const end = text[i++];
                if (end === "}") break;
                assert.equal(end, ",");
            }
        } else if (text[i] === "[") {
            i++;
            ws();
            if (text[i] === "]") {
                i++;
                return;
            }
            for (;;) {
                value(depth + 1);
                ws();
                const end = text[i++];
                if (end === "]") break;
                assert.equal(end, ",");
            }
        } else if (text[i] === '"') string();
        else {
            const m =
                /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(
                    text.slice(i),
                );
            assert.ok(m, "JSON token");
            i += m[0].length;
        }
    }
    value();
    ws();
    exact(i, text.length, "JSON trailing bytes");
    return JSON.parse(text);
}
export function canonicalSource(r) {
    exact(r.schemaVersion, 1);
    const { repository: q, workflow: w, run: u, job: j, artifact: a } = r;
    assert.ok(positive(q.id) && positive(w.id) && positive(j.runnerId));
    assert.ok(
        typeof j.runnerGroupName === "string" && j.runnerGroupName.length > 0,
        "parent-pinned runner group",
    );
    for (const [got, want] of [
        [q.fullName, PINS.repository],
        [w.path, PINS.workflowPath],
        [u.id, PINS.run],
        [u.attempt, 1],
        [u.event, "pull_request"],
        [u.headRepository, PINS.repository],
        [u.headBranch, PINS.branch],
        [u.headSha, PINS.sourceHead],
        [j.id, PINS.job],
        [j.name, "HTTP keep-alive (windows-latest)"],
        [j.attempt, 1],
        [j.status, "completed"],
        [j.conclusion, "failure"],
        [j.runnerName, "GitHub Actions 1000035679"],
        [a.id, PINS.artifact],
        [a.name, "http-601-windows-latest"],
        [a.runId, PINS.run],
        [a.headSha, PINS.sourceHead],
        [a.sizeInBytes, PINS.zipSize],
        [a.digest, "sha256:" + PINS.zip],
    ])
        exact(got, want, "source identity");
    // Explicit fixed key order, independent of API property order.
    return JSON.stringify({
        schemaVersion: 1,
        repository: { id: q.id, fullName: q.fullName },
        workflow: { id: w.id, path: w.path },
        run: {
            id: u.id,
            attempt: u.attempt,
            event: u.event,
            headRepository: u.headRepository,
            headBranch: u.headBranch,
            headSha: u.headSha,
        },
        job: {
            id: j.id,
            name: j.name,
            attempt: j.attempt,
            status: j.status,
            conclusion: j.conclusion,
            runnerId: j.runnerId,
            runnerName: j.runnerName,
            runnerGroupName: j.runnerGroupName,
        },
        artifact: {
            id: a.id,
            name: a.name,
            runId: a.runId,
            headSha: a.headSha,
            sizeInBytes: a.sizeInBytes,
            digest: a.digest,
        },
    });
}
function safeName(name) {
    assert.ok(
        typeof name === "string" &&
            name.length > 0 &&
            name.length < 240 &&
            !/[\\:\x00-\x1f]/.test(name) &&
            !name.startsWith("/"),
        "archive path",
    );
    for (const part of name.split("/"))
        assert.ok(
            part &&
                part !== "." &&
                part !== ".." &&
                !/[. ]$/.test(part) &&
                !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
            "path alias",
        );
    return name;
}
export function ownedPath(root, candidate) {
    const p = path.win32;
    for (const v of [root, candidate]) {
        assert.match(v, /^[A-Za-z]:[\\/]/, "absolute local path");
        assert.ok(!v.startsWith("\\\\") && !v.slice(2).includes(":"));
        for (const part of v.slice(3).split(/[\\/]/)) safeName(part);
    }
    const r = p.resolve(root),
        c = p.resolve(candidate);
    assert.ok(
        c.toLowerCase().startsWith(r.toLowerCase() + "\\"),
        "strict owned child",
    );
    return c;
}
export function systemEnvironment(env) {
    const out = {};
    for (const [k, v] of Object.entries(env))
        if (
            [
                "systemroot",
                "windir",
                "path",
                "temp",
                "tmp",
                "comspec",
                "pathext",
            ].includes(k.toLowerCase())
        )
            out[k] = v;
    return out;
}
export function armEnvironment(env, server) {
    assert.ok(
        path.win32.isAbsolute(server) &&
            ["soak-server.exe", "soak-server.mjs"].includes(
                path.win32.basename(server),
            ),
        "approved server path",
    );
    return {
        ...systemEnvironment(env),
        NONA_SOAK_MINUTES: "5",
        NONA_SOAK_WARMUP_MINUTES: "1",
        NONA_SOAK_SAMPLE_SECONDS: "10",
        NONA_SOAK_CONNECTIONS: "1",
        NONA_SOAK_PAUSE_MS: "0",
        NONA_SOAK_MIX: "big=1",
        NONA_SOAK_SERVER: server,
    };
}
export function readArchive(
    b,
    pin = { size: PINS.zipSize, sha256: PINS.zip, entries: ARCHIVE_ENTRIES },
) {
    exact(b.length, pin.size, "archive size");
    exact(sha256(b), pin.sha256, "archive digest");
    assert.ok(b.length >= 22);
    let end = b.length - 22;
    while (
        end >= Math.max(0, b.length - 65557) &&
        b.readUInt32LE(end) !== 0x06054b50
    )
        end--;
    assert.ok(end >= 0, "ZIP end");
    exact(end + 22 + b.readUInt16LE(end + 20), b.length, "ZIP comment/trailer");
    exact(b.readUInt32LE(end + 4), 0, "single disk");
    const count = b.readUInt16LE(end + 10);
    exact(b.readUInt16LE(end + 8), count);
    exact(count, pin.entries.length);
    assert.ok(count <= 22);
    const start = b.readUInt32LE(end + 16),
        length = b.readUInt32LE(end + 12);
    exact(start + length, end);
    let offset = start,
        total = 0;
    const seen = new Set(),
        result = new Map();
    const ranges = [];
    for (let k = 0; k < count; k++) {
        assert.ok(offset + 46 <= end);
        exact(b.readUInt32LE(offset), 0x02014b50);
        const flags = b.readUInt16LE(offset + 8),
            method = b.readUInt16LE(offset + 10),
            compressed = b.readUInt32LE(offset + 20),
            size = b.readUInt32LE(offset + 24),
            nl = b.readUInt16LE(offset + 28),
            xl = b.readUInt16LE(offset + 30),
            cl = b.readUInt16LE(offset + 32),
            attrs = b.readUInt32LE(offset + 38),
            local = b.readUInt32LE(offset + 42);
        assert.ok(
            (flags & ~0x808) === 0 && [0, 8].includes(method),
            "ZIP flags/method",
        );
        exact(b.readUInt16LE(offset + 34), 0);
        assert.ok(offset + 46 + nl + xl + cl <= end);
        const name = safeName(
            b.subarray(offset + 46, offset + 46 + nl).toString("utf8"),
        );
        assert.ok(!seen.has(name.toLowerCase()), "duplicate ZIP name");
        seen.add(name.toLowerCase());
        const entry = pin.entries.find((e) => e.name === name);
        assert.ok(entry, "allowlisted entry");
        exact(size, entry.size);
        assert.ok(
            size <= 10 * 1024 * 1024 && (total += size) <= 20 * 1024 * 1024,
            "inflation bound",
        );
        assert.ok(
            ((attrs >>> 16) & 0xf000) === 0 ||
                ((attrs >>> 16) & 0xf000) === 0x8000,
            "ZIP link/type",
        );
        assert.ok(!(attrs & 0x410), "ZIP reparse/directory");
        assert.ok(local + 30 <= start);
        exact(b.readUInt32LE(local), 0x04034b50);
        exact(b.readUInt16LE(local + 6), flags);
        exact(b.readUInt16LE(local + 8), method);
        const lnl = b.readUInt16LE(local + 26),
            lxl = b.readUInt16LE(local + 28);
        exact(b.subarray(local + 30, local + 30 + lnl).toString("utf8"), name);
        if (!(flags & 8)) {
            exact(b.readUInt32LE(local + 18), compressed);
            exact(b.readUInt32LE(local + 22), size);
        }
        const from = local + 30 + lnl + lxl,
            to = from + compressed;
        assert.ok(to <= start);
        assert.ok(
            !ranges.some(([a, z]) => local < z && to > a),
            "overlapping entries",
        );
        ranges.push([local, to]);
        const raw = b.subarray(from, to);
        const data =
            method === 0
                ? Buffer.from(raw)
                : inflateRawSync(raw, { maxOutputLength: Math.max(1, size) });
        exact(data.length, size);
        exact(sha256(data), entry.sha256, "entry digest");
        result.set(name, data);
        offset += 46 + nl + xl + cl;
    }
    exact(offset, end);
    return result;
}
export function verifyNative(b) {
    exact(b.length, 9108992);
    exact(sha256(b), PINS.native);
    exact(b.toString("ascii", 0, 2), "MZ");
    const pe = b.readUInt32LE(60);
    assert.ok(pe + 6 < b.length);
    exact(b.readUInt32LE(pe), 0x4550);
    exact(b.readUInt16LE(pe + 4), 34404);
}
export function normalJobDigest(bytes) {
    const s = bytes.toString();
    const start = s.indexOf("    hosted-http:");
    assert.ok(start >= 0);
    const next = s.indexOf("\n    latency615-triad:", start);
    const end = next < 0 ? s.length : next + 1;
    return sha256(Buffer.from(s.slice(start, end)));
}
export function originalLatencyPass(head, tail) {
    return (
        !!head &&
        tail !== null &&
        (tail / head - 1 <= 0.2 || tail - head <= 0.5)
    );
}
function validateHistogram(h) {
    assert.ok(
        h &&
            Array.isArray(h.counts) &&
            h.counts.length === 2000 &&
            Number.isSafeInteger(h.n) &&
            h.n >= 0,
    );
    let sum = 0;
    for (const n of h.counts) {
        assert.ok(Number.isInteger(n) && n >= 0 && n <= 0xffffffff);
        sum += n;
    }
    exact(sum, h.n, "histogram count");
    return h;
}
function merged(hs) {
    const h = { n: 0, counts: Array(2000).fill(0) };
    for (const item of hs) {
        validateHistogram(item);
        h.n += item.n;
        item.counts.forEach((n, i) => {
            h.counts[i] += n;
            assert.ok(h.counts[i] <= 0xffffffff, "merged histogram overflow");
        });
    }
    return h;
}
export function histogramQuantile(h, q = 0.99) {
    validateHistogram(h);
    if (!h.n) return null;
    const target = Math.ceil(h.n * q);
    let n = 0;
    for (let i = 0; i < 2000; i++)
        if ((n += h.counts[i]) >= target)
            return Math.exp(i * Math.log(1.01)) / 1000;
    return null;
}
function validateAbsoluteIntervals(records) {
    assert.ok(records.length > 0, "absolute intervals required");
    const timeOrigin = records[0].absolute?.timeOrigin;
    const loadStart = records.find((r) => r.phase !== "baseline")?.absolute
        ?.loadStart;
    assert.ok(
        Number.isFinite(timeOrigin) && timeOrigin >= 0,
        "driver time origin",
    );
    assert.ok(
        Number.isFinite(loadStart) && loadStart >= 0,
        "driver load start",
    );
    for (const r of records) {
        const a = r.absolute;
        assert.ok(
            a && a.swap.length === 2 && a.stats.length === 2,
            "absolute brackets",
        );
        assert.ok(
            [a.start, a.end, ...a.swap, ...a.stats].every(
                (n) => Number.isFinite(n) && n >= 0,
            ),
            "finite absolute cuts",
        );
        exact(a.timeOrigin, timeOrigin, "one driver time origin");
        assert.ok(
            a.end >= a.start &&
                a.swap[0] >= a.end &&
                a.swap[1] >= a.swap[0] &&
                a.stats[0] >= a.swap[1] &&
                a.stats[1] >= a.stats[0],
            "ordered absolute brackets",
        );
        if (r.phase === "baseline") {
            exact(a.loadStart, null, "baseline precedes load start");
            assert.ok(a.stats[1] <= loadStart, "baseline before load");
            continue;
        }
        exact(a.loadStart, loadStart, "one driver load start");
        assert.ok(a.end > a.start, "positive selected interval");
        // These values share the driver's monotonic domain. Mirror the recorded
        // subtraction, avoiding rounding from adding loadStart back to a cut.
        exact(a.start - loadStart, r.start, "absolute/relative start");
        exact(a.end - loadStart, r.end, "absolute/relative end");
        a.swap.forEach((v, i) =>
            exact(v - loadStart, r.swap[i], "absolute/relative swap"),
        );
        exact(
            a.stats[0] - loadStart,
            r.stats.start,
            "absolute/relative stats start",
        );
        exact(
            a.stats[1] - loadStart,
            r.stats.end,
            "absolute/relative stats end",
        );
    }
}
export function validateIntervals(records, loadSeconds) {
    assert.ok(
        Number.isFinite(loadSeconds) && loadSeconds >= 300 && loadSeconds < 480,
    );
    assert.ok(records.length >= 32 && records.length <= 64);
    validateAbsoluteIntervals(records);
    exact(records[0].phase, "baseline");
    exact(records.at(-1).phase, "after");
    let last = 0;
    for (const [i, r] of records.entries()) {
        exact(r.index, i);
        validateHistogram(r.histogram);
        for (const n of [r.start, r.end, ...r.swap, r.stats.start, r.stats.end])
            assert.ok(Number.isFinite(n));
        assert.ok(
            r.end >= r.start &&
                r.swap[1] >= r.swap[0] &&
                r.swap[0] >= r.end &&
                r.stats.end >= r.stats.start &&
                r.stats.available === true,
        );
        if (i > 0) {
            exact(r.start, last, "contiguous cuts");
            assert.ok(
                r.end > r.start && r.histogram.n > 0,
                "populated interval",
            );
            if (i < records.length - 1) exact(r.phase, "load");
        }
        last = r.end;
    }
    const load = records.filter((r) => r.phase === "load");
    assert.ok(
        load.at(-1).end >= 300000 && load.at(-1).end <= loadSeconds * 1000,
    );
    const head = load.filter((r) => r.t > 60 && r.t <= 121),
        tail = load.filter((r) => r.t >= loadSeconds - 61);
    assert.ok(head.length && tail.length);
    return {
        headIndices: head.map((r) => r.index),
        tailIndices: tail.map((r) => r.index),
        head: merged(head.map((r) => r.histogram)),
        tail: merged(tail.map((r) => r.histogram)),
        after: records.at(-1).histogram,
    };
}
export function counterCoverage(points, start, end) {
    const validSpan =
        Number.isFinite(start) && Number.isFinite(end) && end > start;
    const before = points.findLastIndex(
        (p) =>
            p.receive <= start &&
            p.available === true &&
            Number.isFinite(p.totalMs),
    );
    const after = points.findIndex(
        (p) =>
            p.send >= end && p.available === true && Number.isFinite(p.totalMs),
    );
    const selected =
        before >= 0 && after >= before
            ? points.slice(before, after + 1)
            : points;
    const errors = [];
    if (!validSpan)
        errors.push({
            reason: "nonfinite, reversed or empty requested CPU span",
        });
    const known = {};
    let prior;
    for (const p of points) {
        const badClock =
            ![p.send, p.receive, p.ticks, p.frequency].every(Number.isFinite) ||
            p.receive < p.send ||
            p.frequency <= 0 ||
            (prior &&
                (p.send < prior.receive ||
                    p.ticks <= prior.ticks ||
                    p.frequency !== prior.frequency ||
                    p.sequence !== prior.sequence + 1 ||
                    p.identity !== prior.identity));
        if (badClock)
            errors.push({
                sequence: p.sequence,
                reason: "raw counter clock/sequence/identity violation",
            });
        for (const key of ["totalMs", "userMs", "privilegedMs"])
            if (Number.isFinite(p[key])) {
                if (
                    p[key] < 0 ||
                    (known[key] !== undefined && p[key] < known[key])
                )
                    errors.push({
                        sequence: p.sequence,
                        reason: "raw counter reset/negative: " + key,
                    });
                known[key] = p[key];
            }
        prior = p;
    }
    let maxGap = 0;
    const valid = [];
    let last;
    for (const p of selected) {
        const nums = [
            p.send,
            p.receive,
            p.totalMs,
            p.userMs,
            p.privilegedMs,
            p.ticks,
            p.frequency,
        ];
        let ok =
            nums.every((n) => Number.isFinite(n) && n >= 0) &&
            p.frequency > 0 &&
            p.available === true &&
            p.receive >= p.send &&
            positive(p.sequence) &&
            typeof p.identity === "string";
        if (last) {
            maxGap = Math.max(maxGap, p.receive - last.send);
            ok &&=
                p.sequence === last.sequence + 1 &&
                p.send >= last.receive &&
                p.identity === last.identity &&
                p.ticks > last.ticks &&
                p.frequency === last.frequency &&
                p.totalMs >= last.totalMs &&
                p.userMs >= last.userMs &&
                p.privilegedMs >= last.privilegedMs;
        }
        if (last && p.receive - last.send > 15000) ok = false;
        if (!ok)
            errors.push({
                sequence: p.sequence,
                reason: "unavailable/nonmonotonic/mismatched counter or >15s gap",
            });
        else valid.push(p);
        last = p;
    }
    const first = valid.find((p) => p.receive <= start),
        final = valid.find((p) => p.send >= end);
    const complete = validSpan && !!first && !!final && errors.length === 0;
    let uncoveredMs = validSpan ? end - start : null;
    if (complete) uncoveredMs = 0;
    return {
        complete,
        requested: [start, end],
        observed: valid.length ? [valid[0].send, valid.at(-1).receive] : null,
        uncoveredMs,
        maxGap,
        missingPoints: selected.length - valid.length,
        pointsOutsideRequestedSpan: points.length - selected.length,
        endpointUncertainty: valid.map((p) => p.receive - p.send),
        deltaMs: complete ? final.totalMs - first.totalMs : null,
        errors,
    };
}

export const ARCHIVE_ENTRIES = Object.freeze([
    {
        name: "backpressure-tls.tap",
        size: 2561,
        sha256: "6fc72429413345e037bd4c6f5ce5a79f06ef8db10414f26986b9163434935773",
    },
    {
        name: "keepalive-server.exe",
        size: 9071616,
        sha256: "b497228ce5a9ad3a7571a39219aa6e4e83c7a82ac428150658ab072945c42983",
    },
    {
        name: "keepalive-server.mjs",
        size: 1081,
        sha256: "3fd3087db1658e460544869ea79dc10c71d57ff1f6b02dc6f51acff2b72fa5fb",
    },
    {
        name: "native.json",
        size: 130103,
        sha256: "cdb76649b3c3c2daba52f570bd3025b7b1534249c077c62dd028c50241e7f445",
    },
    {
        name: "native.stderr.log",
        size: 0,
        sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
    {
        name: "native.stdout.log",
        size: 1516,
        sha256: "6da7a9a84fcf40a4b4cd6e5f56d2b0d20a66b54d0cca04292f10d1db616194d5",
    },
    {
        name: "node.json",
        size: 130094,
        sha256: "ef63f66ac198ead3f0548478a107b2e5603433746cf9e5a1e087c3b250ae03f5",
    },
    {
        name: "node.stderr.log",
        size: 0,
        sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
    {
        name: "node.stdout.log",
        size: 1516,
        sha256: "6da7a9a84fcf40a4b4cd6e5f56d2b0d20a66b54d0cca04292f10d1db616194d5",
    },
    {
        name: "runner.json",
        size: 331,
        sha256: "ce206a5c4292dca1c11370817a1daffcefd48564d051092a67bd55cf36bca199",
    },
    {
        name: "soak/harness-exit.json",
        size: 44,
        sha256: "543c2ba497314d2831887554f5d520d2439d5764494bed09a78217754de0a731",
    },
    {
        name: "soak/harness.stderr.log",
        size: 184,
        sha256: "30a56dc82a5f4a3507a5f1097dab740d79a8360dc8d23c4ea3cd9f73e0e9764a",
    },
    {
        name: "soak/harness.stdout.log",
        size: 4705,
        sha256: "35db9b67feb982fa6745dbbe5a8d7c90e5b365393171991663400c5f962c55dc",
    },
    {
        name: "soak/http-soak.executed.mjs",
        size: 29459,
        sha256: "eaac7957840042336395c6c11a6b9d4ed20a4892fbabcaa792105ac8ca7249b8",
    },
    {
        name: "soak/http-soak.json",
        size: 19122,
        sha256: "e80eb1f3424414f07e4fe5bc6befa7411f7631f92bc3dc00559269f81681805f",
    },
    {
        name: "soak/http-soak.md",
        size: 4136,
        sha256: "e8ef365920c4f4fd8f039b237cfe34898df7eb66e3aeed079940e4ad96fe27d5",
    },
    {
        name: "soak/http-soak.original.mjs",
        size: 28490,
        sha256: "31be9600805b228135b665969320e4554c6f95236e6bb85f55f8116b2678f47d",
    },
    {
        name: "soak/server-events.jsonl",
        size: 243,
        sha256: "8d775db6fe65a68c63e14b3b07e74aad665728ea5c6c6134ec70d7ec503dde7c",
    },
    {
        name: "soak/server.stderr.log",
        size: 0,
        sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
    {
        name: "soak/server.stdout.log",
        size: 12,
        sha256: "4f5a65450be30acd60be1c7ff643c008545f066ab99965cc0729fb77393e644e",
    },
    {
        name: "soak/soak-server.exe",
        size: 9108992,
        sha256: "f9676ffbdd58017622c4f0d34d42dd2134fe22e8916e911032aef17c5c20fa97",
    },
    {
        name: "soak/verification.json",
        size: 3218,
        sha256: "bd6a6dad958422c84483ab77a986fcd6063e8bb7719a337f53f98c375928a879",
    },
]);

// Serialized into a disposable, hash-verified original driver. Every call is
// observational, bounded and non-throwing; no await is inserted into scheduling.
function telemetryRuntime(append, write, directory) {
    const state = {
        sequence: 0,
        bytes: 0,
        writes: 0,
        writeMs: 0,
        errors: [],
        logicalStart: 0,
        loadStart: null,
        complete: false,
    };
    const error = (e) => ({
        name: e.name,
        code: e.code,
        message: e.message,
        stack: e.stack,
    });
    function safe(fn) {
        try {
            return fn();
        } catch (e) {
            if (state.errors.length < 32) state.errors.push(error(e));
            return null;
        }
    }
    function output(file, data, replace = false) {
        return safe(() => {
            const b = Buffer.isBuffer(data) ? data : Buffer.from(data);
            if (state.bytes + b.length > 8 * 1024 * 1024)
                throw Error("telemetry byte cap");
            const t = performance.now();
            (replace ? write : append)(directory + "/" + file, b);
            state.writeMs += performance.now() - t;
            state.bytes += b.length;
            state.writes++;
        });
    }
    function event(kind, value = {}) {
        return safe(() => {
            if (++state.sequence > 4000) throw Error("telemetry event cap");
            const e = {
                sequence: state.sequence,
                kind,
                mono: performance.now(),
                timeOrigin: performance.timeOrigin,
                wall: Date.now(),
                ...value,
            };
            output("events.jsonl", JSON.stringify(e) + "\n");
            if (
                [
                    "origin",
                    "server.spawn",
                    "load.start",
                    "load.drained",
                ].includes(kind)
            )
                process.stdout.write(
                    "__latency615__" + JSON.stringify(e) + "\n",
                );
            return e;
        });
    }
    const cpu = () => ({ mono: performance.now(), ...process.cpuUsage() });
    event("origin", { pid: process.pid, cpu: cpu() });
    process.on("uncaughtExceptionMonitor", (e) =>
        event("uncaughtExceptionMonitor", { error: error(e) }),
    );
    process.on("exit", (code) => {
        event("harness.jsExit", { code });
        output(
            "telemetry-state.json",
            JSON.stringify({
                ...state,
                exitCode: code,
                cpu: cpu(),
                writeLedgerScope:
                    "all prior observer writes; this final ledger write is excluded from its own receipt",
            }),
            true,
        );
    });
    return {
        state,
        event,
        cpu,
        server(child, serverPath, before) {
            safe(() => {
                event("server.spawn", {
                    pid: child.pid,
                    serverPath,
                    executable: child.spawnfile,
                    args: child.spawnargs,
                    before,
                    after: Date.now(),
                });
                for (const stream of ["stdout", "stderr"]) {
                    const p = child[stream];
                    p.on("data", (b) => output("server." + stream + ".log", b));
                    for (const kind of ["end", "close"])
                        p.on(kind, () =>
                            event("server." + stream + "." + kind),
                        );
                    p.on("error", (e) =>
                        event("server." + stream + ".error", {
                            error: error(e),
                        }),
                    );
                }
                child.on("error", (e) =>
                    event("server.error", { error: error(e) }),
                );
                child.on("exit", (code, signal) =>
                    event("server.exit", {
                        code,
                        signal,
                        hex: code > 255 ? "0x" + code.toString(16) : null,
                    }),
                );
                child.on("close", (code, signal) =>
                    event("server.close", { code, signal }),
                );
            });
        },
        start(mono) {
            safe(() => {
                state.loadStart = mono;
                state.logicalStart = mono;
                event("load.start", { at: mono, cpu: cpu() });
            });
        },
        cut(now, current, counters) {
            return safe(() => ({
                start: state.logicalStart,
                end: now,
                swap: [performance.now()],
                atCut: structuredClone(counters),
                current: {
                    requests: current.requests,
                    deliberate: current.deliberate,
                    failed: current.failed,
                },
            }));
        },
        swapped(cut) {
            safe(() => {
                cut.swap.push(performance.now());
                cut.statsStart = performance.now();
                state.logicalStart = cut.end;
            });
        },
        stats(cut, stats) {
            safe(() => {
                cut.statsEnd = performance.now();
                cut.statsAvailable = stats !== null;
            });
        },
        interval(index, s, current, cut, counters) {
            safe(() => {
                const origin = state.loadStart;
                const r = {
                    index,
                    phase: s.phase,
                    t: s.t,
                    start: s.phase === "baseline" ? 0 : cut.start - origin,
                    end: s.phase === "baseline" ? 0 : cut.end - origin,
                    swap:
                        s.phase === "baseline"
                            ? [0, 0]
                            : cut.swap.map((t) => t - origin),
                    absolute: {
                        timeOrigin: performance.timeOrigin,
                        start: cut.start,
                        end: cut.end,
                        loadStart: origin,
                        swap: cut.swap,
                        stats: [cut.statsStart, cut.statsEnd],
                    },
                    histogram: {
                        n: current.hist.n,
                        counts: Array.from(current.hist.counts),
                    },
                    current: cut.current,
                    atCut: cut.atCut,
                    afterStats: structuredClone(counters),
                    sample: s,
                    stats: {
                        start:
                            s.phase === "baseline"
                                ? 0
                                : cut.statsStart - origin,
                        end: s.phase === "baseline" ? 0 : cut.statsEnd - origin,
                        available: cut.statsAvailable,
                    },
                    cpu: cpu(),
                };
                output("intervals.jsonl", JSON.stringify(r) + "\n");
                event("sample", { index, cpu: cpu() });
            });
        },
        residual(kind, interval, counters) {
            event(kind, {
                histogram: {
                    n: interval.hist.n,
                    counts: Array.from(interval.hist.counts),
                },
                requests: interval.requests,
                deliberate: interval.deliberate,
                failed: interval.failed,
                counters: structuredClone(counters),
                cpu: cpu(),
            });
        },
        final(value) {
            safe(() => {
                state.complete =
                    output("telemetry.json", JSON.stringify(value), true) !==
                    null;
                event("final", { cpu: cpu() });
            });
        },
    };
}
export function patchDriver(bytes) {
    exact(bytes.length, 28490, "original bytes");
    exact(sha256(bytes), PINS.driver, "original source pin");
    let source = bytes.toString("utf8");
    const recipe = [];
    function insert(id, marker, text, after = false) {
        exact(source.split(marker).length, 2, "unique patch marker: " + id);
        const span = `/* latency615:${id}:begin */\n${text}\n/* latency615:${id}:end */\n`;
        source = source.replace(marker, after ? marker + span : span + marker);
        recipe.push({ id, marker, after, span });
    }
    insert(
        "imports",
        'import http from "node:http";',
        'import { appendFileSync as __l615Append, writeFileSync as __l615Write } from "node:fs";',
    );
    insert(
        "runtime",
        "function envNumber(name, fallback)",
        `const __l615 = (${telemetryRuntime.toString()})(__l615Append, __l615Write, outDir);\nlet __l615Cut;`,
    );
    insert(
        "spawn-before",
        "const child = /\\.[cm]?js$/.test(serverPath)",
        "const __l615SpawnBefore = Date.now();",
    );
    insert(
        "server",
        "let stopping = false;",
        "__l615.server(child, serverPath, __l615SpawnBefore);",
    );
    insert(
        "cut",
        "    interval = { requests: 0, deliberate: 0, failed: 0, hist: newHistogram() };",
        "    __l615Cut = __l615.cut(now, current, counters);",
    );
    insert(
        "interval-init",
        "let interval = { requests: 0, deliberate: 0, failed: 0, hist: newHistogram() };",
        "\n__l615.state.logicalStart = performance.now();\n",
        true,
    );
    insert(
        "swapped",
        "    const stats = await fetchStats();",
        "    __l615.swapped(__l615Cut);",
    );
    insert(
        "stats",
        '    if (!stats && phase !== "baseline" && crash === null)',
        "    __l615.stats(__l615Cut, stats);",
    );
    insert(
        "interval",
        "    histograms.push(current.hist);",
        "\n    __l615.interval(samples.length - 1, s, current, __l615Cut, counters);\n",
        true,
    );
    insert(
        "start",
        "lastSampleAt = loadStart;",
        "\n__l615.start(loadStart);\n",
        true,
    );
    insert(
        "stop",
        "running = false;\nawait Promise.all(workers);",
        '__l615.event("load.stop");',
    );
    insert(
        "drained",
        "for (const agent of agents) agent.destroy();",
        '__l615.residual("load.drained", interval, counters);',
    );
    insert(
        "settle",
        "if (crash === null) await sleep(config.settleSeconds * 1000);",
        '__l615.event("settle.start", {loadSeconds});',
    );
    insert(
        "kill",
        "stopping = true;\nkillServer();",
        '__l615.event("settle.end");\n__l615.event("server.kill.request");',
    );
    insert(
        "final",
        'writeFileSync(join(outDir, "http-soak.json"), JSON.stringify(report, null, 2));',
        `__l615.residual("residual.final", interval, counters);\n__l615.final({loadSeconds, loadStart, timeOrigin:performance.timeOrigin, p99Head,p99Tail,p99Growth, pass, criteria, headIndices:headWindow.map(({s})=>samples.indexOf(s)),tailIndices:tailWindow.map(({s})=>samples.indexOf(s)),head:{n:merge(headWindow.map(({h})=>h)).n,counts:Array.from(merge(headWindow.map(({h})=>h)).counts)},tail:{n:merge(tailWindow.map(({h})=>h)).n,counts:Array.from(merge(tailWindow.map(({h})=>h)).counts)}});`,
    );
    const result = Buffer.from(source);
    assert.deepEqual(unpatchDriver(result, recipe), bytes);
    return { source: result, recipe, sha256: sha256(result) };
}
export function unpatchDriver(bytes, recipe) {
    let s = bytes.toString("utf8");
    for (const { span } of [...recipe].reverse()) {
        exact(s.split(span).length, 2, "exact patch span");
        s = s.replace(span, "");
    }
    return Buffer.from(s);
}

// Guest counter sources remain separate. Windows Stopwatch ticks are never
// subtracted from Node time; every remote point uses its Node query bracket.
export function triadCounterCoverage(input) {
    const {
        counters,
        events,
        mapping,
        intervals,
        windows,
        identities,
        cpuCount,
        harnessPid,
    } = input;
    validateAbsoluteIntervals(intervals);
    assert.ok(
        mapping &&
            Number.isFinite(mapping.driverMono) &&
            mapping.coordinatorUpper >= mapping.coordinatorLower,
    );
    const lower = mapping.coordinatorLower - mapping.driverMono,
        upper = mapping.coordinatorUpper - mapping.driverMono;
    const originalSpans = [windows.headIndices, windows.tailIndices].map(
        (indices) => [
            intervals[indices[0]].absolute.start,
            intervals[indices.at(-1)].absolute.end,
        ],
    );
    const mappedSpans = originalSpans.map(([a, z]) => [a + lower, z + upper]);
    const sources = [],
        errors = [];
    const base = (r, i, identity) => ({
        sequence: i + 1,
        send: r.send,
        receive: r.receive,
        ticks: r.ticksEnd,
        frequency: r.frequency,
        identity,
    });
    const add = (source, points, spans = mappedSpans) =>
        sources.push({
            source,
            spans: spans.map(([a, z]) => counterCoverage(points, a, z)),
        });
    for (const [key, identity] of Object.entries(identities)) {
        const points = counters.map((r, i) => {
            const p = r.points?.find((p) => p.key === key);
            if (p?.identity !== identity)
                errors.push({
                    source: key,
                    sequence: i + 1,
                    error: "creation identity changed/unknown",
                });
            return {
                ...base(r, i, p?.identity),
                available: p?.available === true,
                totalMs: p?.totalMs,
                userMs: p?.userMs,
                privilegedMs: p?.privilegedMs,
            };
        });
        add(key, points);
    }
    const observerIdentity = counters.find((r) => r.observer?.identity)
        ?.observer.identity;
    add(
        "observer",
        counters.map((r, i) => {
            const p = r.observer;
            if (p?.identity !== observerIdentity || !observerIdentity)
                errors.push({
                    source: "observer",
                    sequence: i + 1,
                    error: "observer identity unknown/changed",
                });
            return {
                ...base(r, i, p?.identity),
                available: p?.available === true,
                totalMs: p?.totalMs,
                userMs: p?.userMs,
                privilegedMs: p?.privilegedMs,
            };
        }),
    );
    for (const r of counters) {
        if (r.host?.cpus?.length !== cpuCount)
            errors.push({
                source: "host",
                error: "logical CPU count changed/unknown",
            });
        if (!Number.isFinite(r.ticksStart) || r.ticksStart > r.ticksEnd)
            errors.push({
                source: "observer",
                error: "invalid query tick bracket",
            });
    }
    for (let core = 0; core < cpuCount; core++)
        add(
            "host.cpu." + core,
            counters.map((r, i) => {
                const p = r.host?.cpus?.[core],
                    valid =
                        p &&
                        ["user", "nice", "sys", "idle", "irq"].every(
                            (k) => Number.isFinite(p[k]) && p[k] >= 0,
                        );
                return {
                    sequence: i + 1,
                    send: r.host?.at,
                    receive: r.host?.receive,
                    ticks: r.host?.at,
                    frequency: 1000,
                    identity: `host.cpu.${core}/${cpuCount}`,
                    available: !!valid,
                    totalMs: valid
                        ? Object.values(p).reduce((n, v) => n + v, 0)
                        : null,
                    userMs: p?.user,
                    privilegedMs: p?.sys,
                };
            }),
        );
    const us = (n) => (Number.isFinite(n) ? n / 1000 : null);
    add(
        "coordinator",
        counters.map((r, i) => {
            const p = r.host?.coordinatorCpu;
            return {
                sequence: i + 1,
                send: r.host?.at,
                receive: r.host?.receive,
                ticks: r.host?.at,
                frequency: 1000,
                identity: "coordinator",
                available:
                    Number.isFinite(p?.user) && Number.isFinite(p?.system),
                totalMs:
                    Number.isFinite(p?.user) && Number.isFinite(p?.system)
                        ? (p.user + p.system) / 1000
                        : null,
                userMs: us(p?.user),
                privilegedMs: us(p?.system),
            };
        }),
    );
    const driver = events
        .filter((e) => e.cpu)
        .map((e, i) => ({
            sequence: i + 1,
            send: e.cpu.mono,
            receive: e.cpu.mono,
            ticks: e.cpu.mono,
            frequency: 1000,
            identity: "driver/" + harnessPid,
            available:
                Number.isFinite(e.cpu.user) && Number.isFinite(e.cpu.system),
            totalMs:
                Number.isFinite(e.cpu.user) && Number.isFinite(e.cpu.system)
                    ? (e.cpu.user + e.cpu.system) / 1000
                    : null,
            userMs: us(e.cpu.user),
            privilegedMs: us(e.cpu.system),
        }));
    add("driver", driver, originalSpans);
    return {
        complete:
            errors.length === 0 &&
            sources.every((s) => s.spans.every((s) => s.complete)),
        sources,
        errors,
        mapping,
        originalSpans,
        mappedSpans,
        policy: "15s maximum coarse-point gap; unproven requested spans stay uncovered, no zero filling/interpolation or overhead subtraction",
    };
}
