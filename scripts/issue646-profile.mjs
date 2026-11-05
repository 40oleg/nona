// One observation, never a repair or release acceptance signal. Safe to import
// for metadata tests; every execution/download entry point is hosted-only.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
    readFileSync,
    writeFileSync,
    renameSync,
    mkdirSync,
    mkdtempSync,
    existsSync,
    realpathSync,
    unlinkSync,
} from "node:fs";
import { join, resolve, win32 } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { sha256, peMetadata, validateMap, locate } from "./issue646-map.mjs";

const root = "native-gc-diagnosis/01-original";
const native = `${root}/executions/modules-2gJyVw`;
const oracle = `${root}/executions/module-oracle-EAPRMm`;
export const pins = Object.freeze({
    run: 41979548935,
    artifact: 13394086354,
    diagnostic: "5278ca50cff7356338332440bad4f73f510064c0",
    source: "b78f81820ff19105ab85fb10773fab4353b3d8f5",
    zipSha256:
        "c7350500cc5f8ca5c1c4be5b4dd3cbb7d7b5319d7f35e6696ca6355b8a7c68e1",
    zipSize: 28446976,
    imagePath: `${native}/image.bin`,
    imageSha256:
        "8157abc9333625725348fda654d2e5997693ee6779ae9b5d9ac33f61c3ac5451",
    requestPath: `${root}/request.json`,
});
export const capturePins = Object.freeze({
    artifact: 13397577754,
    run: 41990050032,
    head: "45ce52357468985128f807c600588a6a8d8a95d1",
    zipSize: 31957391,
    zipSha256:
        "8d9bb5d13e72b1625af64a2cecb2e5d15e20e6280d32e4c830da913bd4956cca",
    samplesSha256:
        "b7a30312f54b9ccef9f7efb43a17054f00c2256a3f028de00050f6334de16cc3",
    rows: 1626,
    samples: 7356,
    pid: 4020,
    creation: "134383386716948292",
    base: "0x7ff6c9160000",
});
export const captureMetadataPins = Object.freeze({
    artifact: 13398585305,
    run: capturePins.run,
    head: capturePins.head,
    zipSize: 12480,
    zipSha256:
        "03f705caf5f62092abbeab78a5b038ba5cc8de237fb57c7fd29e3e2854314edf",
});
export const captureNames =
    `artifact.json candidates.json historical-context.json historical-native-result.json historical-node-result.json identity.json image.bin inputs-verified.json launch.json native-attempt.json native-input.json native-result.json native.stderr.bin native.stdout.bin node-attempt.json node-input.json node-result.json node.stderr.bin node.stdout.bin observe-failure.json pe.json plan.json request.json retained.zip run.json sampler-exit.json sampler-ready.json sampler-result.json sampler.stderr.bin sampler.stdout.bin samples.jsonl selection-Sample-request.json selection-Sample-result.json stop.json target.json worker-identity.json worker-os.json worker-result.json worker.stderr.bin worker.stdout.bin WorkerIdentity-control.json`.split(
        " ",
    );
export const captureMetadataNames =
    `candidates.json identity.json inputs-verified.json metadata-index.json native-attempt.json native-result.json node-attempt.json node-result.json observe-failure.json plan.json sampler-exit.json sampler-ready.json sampler-result.json selection-Sample-request.json selection-Sample-result.json verification.json worker-identity.json worker-os.json worker-result.json WorkerIdentity-control.json`.split(
        " ",
    );

// UTC only, validated calendar, integer 100ns units. Date.parse alone would
// round away identity differences and accept normalized invalid dates.
export function utc100ns(value) {
    assert.equal(typeof value, "string", "unknown UTC timestamp");
    const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,7}))?Z$/.exec(
        value,
    );
    assert.ok(m, "invalid UTC timestamp");
    const ms = Date.parse(m[1] + "Z");
    assert.ok(
        Number.isFinite(ms) && new Date(ms).toISOString() === m[1] + ".000Z",
        "invalid UTC date",
    );
    return BigInt(ms) * 10000n + BigInt((m[2] ?? "").padEnd(7, "0"));
}
export function assertWorkerIdentity(actual, expected) {
    for (const x of [actual, expected]) {
        assert.ok(
            x &&
                Number.isSafeInteger(x.pid) &&
                x.pid > 0 &&
                Number.isSafeInteger(x.parentPid) &&
                x.parentPid > 0,
            "unknown worker identity",
        );
        assert.match(x.creation, /^\d+$/);
        assert.ok(
            typeof x.image === "string" && win32.isAbsolute(x.image),
            "unknown worker path",
        );
        assert.match(x.imageSha256, /^[a-f0-9]{64}$/);
        assert.ok(
            typeof x.commandLine === "string" && x.commandLine.length > 0,
            "unknown worker command",
        );
        assert.equal(x.commandLineTruncated, false);
        assert.equal(
            utc100ns(x.started) + 116444736000000000n,
            BigInt(x.creation),
            "worker creation/timestamp identity",
        );
    }
    assert.deepEqual(
        { ...actual, started: utc100ns(actual.started) },
        { ...expected, started: utc100ns(expected.started) },
    );
}
// Exact canonical ZIP entries only. Synthetic native-evidence-tests trees are
// deliberately unreachable; no basename or suffix search is used.
export const retainedFiles = Object.freeze([
    [pins.imagePath, "image.bin", 13835776, pins.imageSha256],
    [
        pins.requestPath,
        "request.json",
        6865,
        "4da6e469fca2be5525a2190f1c648ae6e3a2a62a0b8f54e3e31eb6ed368d23fc",
    ],
    [
        `${native}/input.json`,
        "native-input.json",
        6878,
        "797b79236b6ce0878870422de735b67b0ac63798917a41708238a49b78cabc21",
    ],
    [
        `${oracle}/input.json`,
        "node-input.json",
        6769,
        "74b46c79347d60ff2214f0c7bae0ec8fcd45e5e0f26fdf6ea2e54a2ae1a07f26",
    ],
    [
        `${native}/result.json`,
        "historical-native-result.json",
        1231,
        "a88e07f20447546e0acf0b96c006bd651ecc24f5cfc7310b22965ae1d946652a",
    ],
    [
        `${oracle}/result.json`,
        "historical-node-result.json",
        639,
        "fb0abaf4f9a81185bbae928123a6454a2b3ccb040677e039ca6bb8dc403d7e28",
    ],
    [
        "native-gc-provenance/context.json",
        "historical-context.json",
        367,
        "bf16b470d657927d9443d578e41c20852123bca8b7234029a6240d0880512a74",
    ],
]);
export const implementationFiles = [
    ".github/workflows/issue646-profile.yml",
    "scripts/issue646-profile.mjs",
    "scripts/issue646-sampler.ps1",
    "scripts/issue646-map.mjs",
    "scripts/issue646-profile-source.test.mjs",
];
export function changedProfileFiles(files) {
    assert.ok(
        Array.isArray(files) && files.length > 0 && files.length < 3000,
        "unknown/truncated commit filenames",
    );
    for (const f of files)
        assert.ok(
            typeof f.filename === "string" &&
                f.filename.length > 0 &&
                (f.previous_filename === undefined ||
                    typeof f.previous_filename === "string"),
            "unknown filename metadata",
        );
    return files.some(
        (f) =>
            implementationFiles.includes(f.filename) ||
            implementationFiles.includes(f.previous_filename),
    );
}
export function requireHosted() {
    assert.equal(
        process.env.GITHUB_ACTIONS,
        "true",
        "Profile requires GitHub-hosted Windows AMD64",
    );
    assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted");
    assert.equal(process.platform, "win32");
    assert.equal(process.arch, "x64");
    assert.equal(process.version, "v26.9.0");
    assert.equal(process.env.GITHUB_REPOSITORY, "40oleg/nona");
}
const json = (dir, name, value) => {
    writeFileSync(
        join(dir, name + ".pending"),
        JSON.stringify(value, null, 2) + "\n",
    );
    renameSync(join(dir, name + ".pending"), join(dir, name));
};
const readJson = (dir, name) =>
    JSON.parse(readFileSync(join(dir, name), "utf8"));
const errorJSON = (error) =>
    error
        ? Object.fromEntries(
              Object.getOwnPropertyNames(error).map((k) => [k, error[k]]),
          )
        : null;

// Metadata only: no process enumeration, sampling or C# on this path. Production
// canonicalization uses the filesystem (including Windows short/long aliases).
export function selectOwnedChild(
    expected,
    candidates,
    canonical = realpathSync.native,
) {
    assert.ok(
        Number.isInteger(expected.parentPid) &&
            expected.parentPid > 0 &&
            typeof expected.image === "string" &&
            /^[a-f0-9]{64}$/.test(expected.imageSha256) &&
            Number.isFinite(Date.parse(expected.started)) &&
            (expected.creation === undefined ||
                (typeof expected.creation === "string" &&
                    /^\d+$/.test(expected.creation))) &&
            (expected.pid === undefined ||
                (Number.isInteger(expected.pid) && expected.pid > 0)),
        "unknown target identity",
    );
    assert.ok(
        Array.isArray(candidates) && candidates.length <= 64,
        "candidate identity bound",
    );
    const expectedPath = canonical(expected.image).toLowerCase();
    const matches = candidates.filter((c) => {
        assert.ok(
            Number.isInteger(c.pid) &&
                c.pid > 0 &&
                Number.isInteger(c.parentPid) &&
                typeof c.creation === "string" &&
                /^\d+$/.test(c.creation) &&
                typeof c.image === "string" &&
                c.image.length > 0 &&
                typeof c.imageSha256 === "string" &&
                /^[a-f0-9]{64}$/.test(c.imageSha256) &&
                Number.isFinite(Date.parse(c.started)),
            "unknown candidate identity",
        );
        return (
            c.parentPid === expected.parentPid &&
            (expected.pid === undefined || c.pid === expected.pid) &&
            Math.abs(Date.parse(c.started) - Date.parse(expected.started)) <=
                2000 &&
            (!expected.creation || c.creation === expected.creation) &&
            canonical(c.image).toLowerCase() === expectedPath &&
            c.imageSha256 === expected.imageSha256
        );
    });
    assert.ok(matches.length <= 1, "ambiguous matching native children");
    return matches[0]
        ? {
              ...matches[0],
              canonicalImage: canonical(matches[0].image),
              expectedCanonicalImage: canonical(expected.image),
          }
        : null;
}

export async function superviseObservation({
    workerDone,
    samplerDone,
    readSampler,
    abort,
    bound,
}) {
    const events = [
        workerDone.then((workerExit) => ({ workerExit })),
        samplerDone.then((samplerExit) => ({ samplerExit })),
    ];
    if (bound) events.push(bound.then(() => ({ boundExceeded: true })));
    let first = await Promise.race(events);
    if (first.workerExit)
        return { aborted: false, workerExit: first.workerExit };
    let sampler;
    try {
        sampler = readSampler();
    } catch (error) {
        sampler = { complete: false, error: errorJSON(error) };
    }
    if (
        !first.boundExceeded &&
        first.samplerExit.status === 0 &&
        first.samplerExit.signal === null &&
        first.samplerExit.error === null &&
        sampler?.complete === true &&
        sampler.cleanup === true &&
        Number.isInteger(sampler.rows) &&
        sampler.rows > 0 &&
        sampler.rows <= 1800 &&
        Number.isInteger(sampler.samples) &&
        sampler.samples > 0 &&
        sampler.samples <= 57600 &&
        Array.isArray(sampler.errors) &&
        sampler.errors.length === 0
    ) {
        // Sampling can finish just before the worker flushes its raw result.
        const next = await Promise.race([
            workerDone.then((workerExit) => ({ workerExit })),
            ...(bound ? [bound.then(() => ({ boundExceeded: true }))] : []),
        ]);
        if (next.workerExit)
            return { aborted: false, workerExit: next.workerExit };
        first = { ...first, ...next };
    }
    const reason = {
        ...first,
        sampler,
        message:
            "Owned observation aborted: collection failed or outer bound exceeded",
    };
    await abort(reason);
    return {
        aborted: true,
        complete: false,
        deadlineExpired: false,
        reason,
        workerExit: await workerDone,
    };
}

const samplerScript = fileURLToPath(
    new URL("./issue646-sampler.ps1", import.meta.url),
);
function controlWorker(out, mode, pid) {
    const result = spawnSync(
        "pwsh",
        [
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-File",
            samplerScript,
            "-Output",
            out,
            "-Mode",
            mode,
            "-WorkerPid",
            String(pid),
        ],
        { windowsHide: true, timeout: 10000, maxBuffer: 1048576 },
    );
    json(out, `${mode}-control.json`, {
        status: result.status,
        signal: result.signal,
        error: errorJSON(result.error),
        stdout: result.stdout?.toString(),
        stderr: result.stderr?.toString(),
    });
    assert.equal(
        result.status,
        0,
        `${mode} failed; see control and cleanup receipts`,
    );
}

export function verifyInputs(files) {
    for (const [path, , size, hash] of retainedFiles) {
        assert.ok(files.has(path), `missing canonical entry ${path}`);
        const b = files.get(path);
        assert.equal(sha256(b), hash, `digest ${path}`);
        assert.equal(b.length, size);
    }
    const get = (p) => JSON.parse(files.get(p).toString("utf8"));
    const req = get(pins.requestPath),
        n = get(`${native}/input.json`),
        c = get(`${oracle}/input.json`),
        context = get("native-gc-provenance/context.json");
    return verifyProvenance(req, n, c, context, get(`${native}/result.json`));
}
export function verifyProvenance(req, n, c, context, historical) {
    assert.equal(req.id, "01-original");
    assert.equal(req.phase, "original");
    assert.equal(req.kind, "modules");
    assert.equal(req.source, pins.source);
    assert.equal(req.oracleArgs, null);
    assert.deepEqual(req.args, [n.input.files, n.input.entry, n.input.options]);
    assert.deepEqual(c.input.files, n.input.files);
    assert.deepEqual(c.input.options, n.input.options);
    assert.equal(c.input.entry, n.input.entry);
    assert.equal(n.input.entry, "main.mjs");
    assert.deepEqual(Object.keys(n.input.files), ["main.mjs"]);
    assert.equal(n.input.options.gcStress, true);
    assert.equal(typeof n.input.options.oracleSource, "string");
    assert.equal(n.input.timeoutMs, 180000);
    assert.equal(c.input.timeoutMs, 60000);
    assert.equal(n.input.target, "win32-x64");
    assert.equal(n.input.compilerMode, "compileModuleToIR/generate");
    assert.equal(n.input.link, "fullRuntimeLink");
    for (const x of [n, c]) {
        assert.equal(x.source, pins.source);
        assert.equal(x.node, "v26.9.0");
        assert.equal(x.platform, "win32");
        assert.equal(x.arch, "x64");
        assert.equal(x.gcSelection, "on");
    }
    assert.equal(context.source, pins.source);
    assert.equal(context.diagnosticCommit, pins.diagnostic);
    assert.equal(String(context.run), String(pins.run));
    assert.equal(historical.error.code, "ETIMEDOUT");
    assert.equal(historical.status, null);
    assert.equal(historical.signal, "SIGTERM");
    assert.equal(
        historical.error.path,
        "C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\nona-modules-OyJvPt\\image.exe",
    );
    return n.input;
}

// Small bounded ZIP reader: parse the central directory, then inflate only the
// seven exact pinned entries. The entire ZIP digest is checked before parsing.
export function selectZip(b, wanted, archive = pins, strictFlat = false) {
    assert.equal(sha256(b), archive.zipSha256, "ZIP digest");
    assert.equal(b.length, archive.zipSize);
    let end = b.length - 22;
    while (
        end >= Math.max(0, b.length - 65557) &&
        b.readUInt32LE(end) !== 0x06054b50
    )
        end--;
    assert.ok(
        end >= 0 && b.readUInt32LE(end) === 0x06054b50,
        "ZIP directory missing",
    );
    assert.equal(end + 22 + b.readUInt16LE(end + 20), b.length);
    assert.equal(b.readUInt16LE(end + 4), 0);
    assert.equal(b.readUInt16LE(end + 6), 0);
    const count = b.readUInt16LE(end + 10);
    assert.equal(b.readUInt16LE(end + 8), count);
    assert.ok(count > 0 && count < 10000, "ZIP entry bound");
    const offset = b.readUInt32LE(end + 16),
        size = b.readUInt32LE(end + 12);
    assert.ok(offset + size === end, "ZIP directory range");
    const found = new Map(),
        names = new Set();
    let p = offset;
    for (let i = 0; i < count; i++) {
        assert.ok(
            p + 46 <= end && b.readUInt32LE(p) === 0x02014b50,
            "ZIP central header",
        );
        const flags = b.readUInt16LE(p + 8),
            method = b.readUInt16LE(p + 10),
            packed = b.readUInt32LE(p + 20),
            unpacked = b.readUInt32LE(p + 24),
            len = b.readUInt16LE(p + 28),
            extra = b.readUInt16LE(p + 30),
            comment = b.readUInt16LE(p + 32),
            local = b.readUInt32LE(p + 42);
        assert.ok(p + 46 + len + extra + comment <= end);
        const name = b.toString("utf8", p + 46, p + 46 + len);
        assert.ok(!names.has(name), "duplicate ZIP name");
        names.add(name);
        if (strictFlat) {
            assert.ok(
                /^[A-Za-z0-9.-]+$/.test(name) && wanted.has(name),
                "unexpected/non-flat ZIP entry",
            );
            assert.notEqual(
                (b.readUInt32LE(p + 38) >>> 16) & 0xf000,
                0xa000,
                "ZIP symlink",
            );
            assert.equal(b.readUInt32LE(p + 38) & 16, 0, "ZIP directory");
        }
        if (wanted.has(name)) {
            assert.equal(flags & 1, 0, "encrypted ZIP entry");
            assert.ok(method === 0 || method === 8);
            if (wanted.get(name) !== null)
                assert.equal(unpacked, wanted.get(name));
            assert.ok(unpacked <= 33554432, "ZIP entry size bound");
            assert.ok(local + 30 <= offset);
            assert.equal(b.readUInt32LE(local), 0x04034b50);
            assert.equal(b.readUInt16LE(local + 6), flags);
            assert.equal(b.readUInt16LE(local + 8), method);
            const localLen = b.readUInt16LE(local + 26),
                localExtra = b.readUInt16LE(local + 28),
                start = local + 30 + localLen + localExtra;
            assert.ok(start + packed <= offset);
            assert.equal(
                b.toString("utf8", local + 30, local + 30 + localLen),
                name,
                "ZIP local/central name differs",
            );
            const bytes =
                method === 0
                    ? b.subarray(start, start + packed)
                    : inflateRawSync(b.subarray(start, start + packed), {
                          maxOutputLength: Math.max(1, unpacked),
                      });
            assert.equal(bytes.length, unpacked);
            assert.equal(crc32(bytes), b.readUInt32LE(p + 16), "ZIP CRC");
            found.set(name, bytes);
        }
        p += 46 + len + extra + comment;
    }
    assert.equal(p, end);
    assert.equal(found.size, wanted.size, "missing exact ZIP entries");
    return found;
}
function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let i = 0; i < 8; i++)
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}
export function decodeCapture(bytes, metadata = false) {
    return selectZip(
        bytes,
        new Map(
            (metadata ? captureMetadataNames : captureNames).map((n) => [
                n,
                null,
            ]),
        ),
        metadata ? captureMetadataPins : capturePins,
        true,
    );
}
async function api(endpoint) {
    const response = await fetch(
        `https://api.github.com/repos/40oleg/nona/${endpoint}`,
        {
            headers: {
                Authorization: `Bearer ${process.env.GH_TOKEN}`,
                Accept: "application/vnd.github+json",
            },
            signal: AbortSignal.timeout(30000),
            redirect: "manual",
        },
    );
    return response;
}
async function prepare(out) {
    json(out, "plan.json", {
        pins,
        nativeCount: 1,
        nodeCount: 1,
        nativeDeadlineMs: 180000,
        nodeDeadlineMs: 60000,
        jobMinutes: 15,
        intervalMs: 100,
        maxTicks: 1800,
        maxThreads: 32,
        maxSampleBytes: 33554432,
        source: pins.source,
        diagnosticHead: process.env.PROFILE_HEAD,
        run: process.env.GITHUB_RUN_ID,
        attempt: process.env.GITHUB_RUN_ATTEMPT,
        node: process.version,
        runner: process.env.RUNNER_NAME,
        imageOS: process.env.ImageOS,
        imageVersion: process.env.ImageVersion,
        at: new Date().toISOString(),
        historicalFailuresCleared: false,
        releaseAcceptance: false,
    });
    for (const endpoint of [
        `actions/runs/${pins.run}`,
        `actions/artifacts/${pins.artifact}`,
    ]) {
        const r = await api(endpoint);
        assert.equal(r.status, 200, `metadata ${endpoint}`);
        const data = await r.json();
        json(
            out,
            endpoint.includes("artifacts") ? "artifact.json" : "run.json",
            data,
        );
    }
    const a = readJson(out, "artifact.json"),
        r = readJson(out, "run.json");
    assert.equal(a.id, pins.artifact);
    assert.equal(a.expired, false);
    assert.equal(a.size_in_bytes, pins.zipSize);
    assert.equal(a.digest, `sha256:${pins.zipSha256}`);
    assert.equal(a.workflow_run.id, pins.run);
    assert.equal(a.workflow_run.head_sha, pins.diagnostic);
    assert.equal(r.id, pins.run);
    assert.equal(r.head_sha, pins.diagnostic);
    assert.equal(r.status, "completed");
    assert.equal(r.conclusion, "failure");
    const redirect = await api(`actions/artifacts/${pins.artifact}/zip`);
    assert.equal(redirect.status, 302, "ZIP redirect");
    const location = new URL(redirect.headers.get("location"));
    assert.equal(location.protocol, "https:");
    // Do not forward the GitHub bearer token to artifact storage.
    const response = await fetch(location, {
        signal: AbortSignal.timeout(60000),
    });
    assert.equal(response.status, 200);
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
        size += chunk.length;
        assert.ok(size <= pins.zipSize, "ZIP byte bound");
        chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    writeFileSync(join(out, "retained.zip"), bytes);
    const files = selectZip(
        bytes,
        new Map(retainedFiles.map(([p, , s]) => [p, s])),
    );
    verifyInputs(files);
    for (const [path, name] of retainedFiles)
        writeFileSync(join(out, name), files.get(path));
    json(out, "pe.json", peMetadata(files.get(pins.imagePath)));
    json(out, "inputs-verified.json", {
        pins,
        files: retainedFiles,
        verifiedAt: new Date().toISOString(),
    });
}
function filesFromDisk(out) {
    return new Map(
        retainedFiles.map(([p, n]) => [p, readFileSync(join(out, n))]),
    );
}
// This import never launches a worker, oracle, sampler or PowerShell helper.
async function downloadCapture(out, pin, prefix) {
    const metadata = [];
    for (const endpoint of [
        `actions/runs/${pin.run}`,
        `actions/artifacts/${pin.artifact}`,
    ]) {
        const response = await api(endpoint);
        assert.equal(response.status, 200);
        metadata.push(await response.json());
    }
    const [run, artifact] = metadata;
    json(out, `${prefix}-api.json`, { run, artifact });
    validateCaptureAPI(run, artifact, pin);
    const redirect = await api(`actions/artifacts/${pin.artifact}/zip`);
    assert.equal(redirect.status, 302);
    const location = new URL(redirect.headers.get("location"));
    assert.equal(location.protocol, "https:");
    const response = await fetch(location, {
        signal: AbortSignal.timeout(60000),
    });
    assert.equal(response.status, 200);
    let size = 0;
    const chunks = [];
    for await (const chunk of response.body) {
        size += chunk.length;
        assert.ok(size <= pin.zipSize, "capture ZIP byte bound");
        chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    writeFileSync(join(out, `${prefix}.zip`), bytes, { flag: "wx" });
    return bytes;
}
export function validateCaptureAPI(run, artifact, pin = capturePins) {
    assert.equal(run.id, pin.run);
    assert.equal(run.head_sha, pin.head);
    assert.equal(run.status, "completed");
    assert.equal(run.conclusion, "failure");
    assert.equal(run.path, ".github/workflows/issue646-profile.yml");
    assert.equal(artifact.id, pin.artifact);
    assert.equal(artifact.expired, false);
    assert.equal(artifact.size_in_bytes, pin.zipSize);
    assert.equal(artifact.digest, `sha256:${pin.zipSha256}`);
    assert.equal(artifact.workflow_run.id, pin.run);
    assert.equal(artifact.workflow_run.head_sha, pin.head);
}
function helperBinding() {
    assert.match(process.env.PROFILE_HEAD, /^[a-f0-9]{40}$/);
    assert.match(process.env.GITHUB_RUN_ID, /^\d+$/);
    assert.match(process.env.GITHUB_SHA, /^[a-f0-9]{40}$/);
    assert.match(process.env.GITHUB_RUN_ATTEMPT, /^\d+$/);
    const checkout = spawnSync("git", ["rev-parse", "HEAD"], {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        encoding: "utf8",
        timeout: 10000,
        windowsHide: true,
    });
    assert.equal(checkout.status, 0);
    assert.equal(
        checkout.stdout.trim(),
        process.env.PROFILE_HEAD,
        "current helper checkout/head",
    );
    return {
        run: process.env.GITHUB_RUN_ID,
        head: process.env.PROFILE_HEAD,
        workflowSha: process.env.GITHUB_SHA,
        attempt: process.env.GITHUB_RUN_ATTEMPT,
        profileSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
        mapHelperSha256: sha256(
            readFileSync(
                fileURLToPath(new URL("./issue646-map.mjs", import.meta.url)),
            ),
        ),
    };
}
async function prepareExisting(out) {
    const certificate = {
        mode: "mapping-only-existing-partial",
        capture: capturePins,
        metadata: captureMetadataPins,
        source: pins.source,
        helper: helperBinding(),
        newNativeLaunches: 0,
        newNodeOracleLaunches: 0,
        newSamplerLaunches: 0,
        completeCaptureAccepted: false,
        historicalFailuresCleared: false,
        releaseAcceptance: false,
    };
    json(out, "derivation-certificate.json", certificate);
    const bytes = await downloadCapture(out, capturePins, "capture");
    const files = decodeCapture(bytes);
    // Make the checked original errors/outcomes available to the small upload
    // even if the subsequent metadata download fails.
    for (const [name, raw] of files)
        writeFileSync(join(out, name), raw, { flag: "wx" });
    const metadataBytes = await downloadCapture(
        out,
        captureMetadataPins,
        "capture-metadata",
    );
    const metadata = decodeCapture(metadataBytes, true);
    for (const [name, raw] of metadata) {
        if (files.has(name))
            assert.ok(
                files.get(name).equals(raw),
                `capture/metadata disagreement ${name}`,
            );
        else {
            files.set(name, raw);
            writeFileSync(join(out, name), raw, { flag: "wx" });
        }
    }
    // Flat, exact names were validated before writes; preserve bytes, including
    // old verification and every error. No old plan/run field is substituted.
    certificate.files = [...files].map(([name, raw]) => ({
        name,
        size: raw.length,
        sha256: sha256(raw),
    }));
    json(out, "derivation-certificate.json", certificate);
    const validated = validateExistingCapture(files);
    json(out, "partial-input-validation.json", {
        ...partialFlags,
        validated: true,
        ...validated.summary,
    });
}
const partialFlags = Object.freeze({
    partial: true,
    completeCaptureAccepted: false,
    nativePassed: false,
    historicalFailuresCleared: false,
    releaseAcceptance: false,
});
export function validatePartialRows(raw, sampler, nativeResult, pe) {
    assert.ok(
        raw.length > 0 && raw.length <= 33554432 && raw.at(-1) === 10,
        "incomplete samples",
    );
    assert.equal(sha256(raw), sampler.samplesSha256, "sample digest");
    assert.match(sampler.base, /^0x[0-9a-f]+$/i);
    assert.equal(sampler.imageSize, pe.sizeOfImage);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
    const lines = text.slice(0, -1).split("\n");
    const rows = lines.map((line) => JSON.parse(line));
    assert.ok(rows.length > 0 && rows.length <= 1800);
    assert.equal(rows.length, sampler.rows);
    let previous = -1n,
        cpu = -1,
        totalSamples = 0,
        imageSamples = 0;
    const start = utc100ns(nativeResult.started),
        finish = utc100ns(nativeResult.finished),
        threads = new Map();
    assert.ok(start <= finish);
    for (const row of rows) {
        assert.equal(row.pid, sampler.pid);
        assert.equal(row.creation, sampler.creation);
        const at = utc100ns(row.at);
        assert.ok(
            at >= previous && at >= start && at <= finish,
            "sample outside native lifetime",
        );
        previous = at;
        assert.ok(
            Number.isFinite(row.cpuMs) &&
                row.cpuMs >= 0 &&
                row.cpuMs >= cpu &&
                Number.isSafeInteger(row.rss) &&
                row.rss > 0,
            "invalid CPU/RSS",
        );
        cpu = row.cpuMs;
        assert.ok(
            Array.isArray(row.threads) &&
                row.threads.length > 0 &&
                row.threads.length <= 32,
            "incomplete thread row",
        );
        const tids = new Set();
        for (const t of row.threads) {
            assert.ok(
                Number.isSafeInteger(t.tid) && t.tid > 0 && !tids.has(t.tid),
                "duplicate/invalid thread",
            );
            tids.add(t.tid);
            assert.match(t.creation, /^\d+$/);
            assert.match(t.rip, /^0x[0-9a-f]{1,16}$/i);
            if (threads.has(t.tid))
                assert.equal(
                    t.creation,
                    threads.get(t.tid),
                    "thread identity reused",
                );
            threads.set(t.tid, t.creation);
            const rva = BigInt(t.rip) - BigInt(sampler.base);
            totalSamples++;
            if (rva >= 0n && rva < BigInt(sampler.imageSize)) imageSamples++;
        }
    }
    assert.equal(totalSamples, sampler.samples, "sample count");
    assert.ok(imageSamples > 0, "no retained-image samples");
    return {
        rows,
        totalSamples,
        imageSamples,
        outsideImageSamples: totalSamples - imageSamples,
        observedWindow: {
            first: rows[0].at,
            last: rows.at(-1).at,
            duration100ns: (
                utc100ns(rows.at(-1).at) - utc100ns(rows[0].at)
            ).toString(),
        },
    };
}
export function validateExistingCapture(files) {
    const bytes = (name) => {
        assert.ok(files.has(name), `missing exact capture entry ${name}`);
        return files.get(name);
    };
    const get = (name) => JSON.parse(bytes(name));
    const input = verifyInputs(
        new Map(retainedFiles.map(([p, n]) => [p, bytes(n)])),
    );
    const original = selectZip(
        bytes("retained.zip"),
        new Map(retainedFiles.map(([p, , size]) => [p, size])),
    );
    verifyInputs(original);
    for (const [p, n] of retainedFiles)
        assert.ok(original.get(p).equals(bytes(n)));
    const plan = get("plan.json"),
        launch = get("launch.json"),
        n = get("native-result.json"),
        c = get("node-result.json"),
        s = get("sampler-result.json"),
        identity = get("identity.json"),
        target = get("target.json"),
        worker = get("worker-result.json"),
        workerIdentity = get("worker-identity.json");
    assert.deepEqual(plan.pins, pins);
    assert.equal(plan.source, pins.source);
    assert.equal(plan.diagnosticHead, capturePins.head);
    assert.equal(plan.run, String(capturePins.run));
    assert.equal(plan.nativeCount, 1);
    assert.equal(plan.nodeCount, 1);
    assert.equal(get("native-attempt.json").count, 1);
    assert.equal(get("node-attempt.json").count, 1);
    assert.equal(launch.source, pins.source);
    assert.equal(launch.imageSha256, pins.imageSha256);
    assert.deepEqual(launch.files, input.files);
    assert.equal(launch.entry, input.entry);
    assert.deepEqual(launch.args, []);
    assert.equal(launch.timeoutMs, 180000);
    assert.equal(launch.windowsHide, true);
    assert.equal(launch.maxBuffer, 1048576);
    assert.equal(launch.stdin, "pipe-closed-empty");
    assert.equal(win32.join(launch.cwd, "image.exe"), launch.image);
    assert.equal(n.imageSha256, pins.imageSha256);
    assert.equal(n.pid, capturePins.pid);
    assert.equal(n.timeoutMs, 180000);
    assert.equal(n.deadlineExpired, true);
    assert.equal(n.status, null);
    assert.equal(n.signal, "SIGTERM");
    assert.equal(n.error.code, "ETIMEDOUT");
    assert.equal(n.aborted, false);
    assert.equal(n.complete, true);
    assert.equal(n.error.path, launch.image);
    assert.deepEqual(n.error.spawnargs, []);
    assert.equal(n.launchSha256, sha256(bytes("launch.json")));
    assert.equal(c.timeoutMs, 60000);
    assert.equal(c.status, 0);
    assert.equal(c.signal, null);
    assert.equal(c.error, null);
    assert.equal(
        c.oracleSourceSha256,
        sha256(Buffer.from(input.options.oracleSource)),
    );
    for (const [prefix, r] of [
        ["native", n],
        ["node", c],
    ])
        for (const stream of ["stdout", "stderr"])
            assert.equal(
                sha256(bytes(`${prefix}.${stream}.bin`)),
                r[`${stream}Sha256`],
            );
    assert.ok(
        bytes("node.stdout.bin").equals(
            Buffer.from(
                get("historical-node-result.json").stdout.data,
                "base64",
            ),
        ),
    );
    assert.equal(bytes("node.stderr.bin").length, 0);
    assert.equal(worker.status, 0);
    assert.equal(worker.signal, null);
    assert.equal(worker.error, null);
    assert.equal(worker.boundExceeded, false);
    assert.equal(worker.aborted, false);
    assert.equal(worker.complete, true);
    assert.ok(
        Number.isSafeInteger(worker.logBytes) &&
            worker.logBytes >= 0 &&
            worker.logBytes <= 1048576,
    );
    assertWorkerIdentity(identity.worker, workerIdentity);
    assertWorkerIdentity(target.worker, workerIdentity);
    assertWorkerIdentity(get("worker-os.json"), workerIdentity);
    assert.equal(worker.pid, workerIdentity.pid);
    assert.equal(identity.parentPid, worker.pid);
    assert.equal(launch.parentPid, workerIdentity.parentPid);
    assert.equal(get("native-attempt.json").parentPid, worker.pid);
    assert.deepEqual(target, {
        ...launch,
        parentPid: worker.pid,
        started: n.started,
        launchSha256: n.launchSha256,
        worker: target.worker,
    });
    for (const key of [
        "pid",
        "creation",
        "imageSha256",
        "base",
        "imageSize",
        "targetSha256",
        "launchSha256",
    ])
        assert.equal(identity[key], s[key], `identity binding ${key}`);
    for (const key of [
        "pid",
        "creation",
        "base",
        "samplesSha256",
        "rows",
        "samples",
    ])
        assert.equal(s[key], capturePins[key]);
    assert.equal(s.imageSha256, pins.imageSha256);
    assert.equal(s.targetSha256, sha256(bytes("target.json")));
    assert.equal(s.launchSha256, n.launchSha256);
    assert.equal(identity.image, launch.image);
    assert.equal(identity.commandLine, launch.image);
    assert.equal(identity.canonicalImage, identity.expectedCanonicalImage);
    assert.equal(
        utc100ns(identity.started) + 116444736000000000n,
        BigInt(identity.creation),
    );
    assert.ok(
        utc100ns(identity.started) >= utc100ns(n.started) &&
            utc100ns(identity.started) <= utc100ns(n.started) + 20000000n,
    );
    const selected = get("selection-Sample-result.json").selected;
    for (const key of [
        "pid",
        "parentPid",
        "creation",
        "image",
        "imageSha256",
        "commandLine",
        "canonicalImage",
        "expectedCanonicalImage",
    ])
        assert.equal(selected[key], identity[key]);
    assert.equal(utc100ns(selected.started), utc100ns(identity.started));
    assert.equal(selected.commandLineTruncated, false);
    assert.equal(s.complete, false);
    assert.equal(s.cleanup, true);
    assert.ok(Array.isArray(s.errors) && s.errors.length > 0);
    assert.match(s.errors[0].message, /Win32Exception \(5\): SuspendThread/);
    assert.equal(s.errors[0].at, "2026-11-05T07:54:11.7182736Z");
    const samplerExit = get("sampler-exit.json");
    assert.deepEqual(samplerExit, { status: 1, signal: null, error: null });
    const pe = peMetadata(bytes("image.bin"));
    assert.deepEqual(get("pe.json"), pe);
    const checked = validatePartialRows(bytes("samples.jsonl"), s, n, pe);
    assert.ok(utc100ns(s.started) <= utc100ns(checked.rows[0].at));
    assert.ok(utc100ns(checked.rows.at(-1).at) < utc100ns(s.errors[0].at));
    assert.ok(utc100ns(s.finished) >= utc100ns(s.errors[0].at));
    return {
        ...checked,
        sampler: s,
        pe,
        summary: {
            ...partialFlags,
            totalSamples: checked.totalSamples,
            imageSamples: checked.imageSamples,
            outsideImageSamples: checked.outsideImageSamples,
            rows: checked.rows.length,
            observedWindow: checked.observedWindow,
            sampler: s,
            samplerExit,
            nativeOutcome: n,
            nodeOutcome: c,
            observeFailure: get("observe-failure.json"),
        },
    };
}
export function attributePartial(rows, sampler, map, pe) {
    validateMap(map, pe);
    const counts = new Map(),
        offsets = new Map();
    let outsideImageSamples = 0,
        totalSamples = 0;
    for (const row of rows)
        for (const t of row.threads) {
            totalSamples++;
            const rva = BigInt(t.rip) - BigInt(sampler.base);
            if (rva < 0n || rva >= BigInt(sampler.imageSize)) {
                outsideImageSamples++;
                continue;
            }
            const offset = Number(rva),
                label = locate(map, offset);
            assert.ok(
                label,
                `unmapped in-image offset ${offset}; attribution forbidden`,
            );
            counts.set(label.name, (counts.get(label.name) ?? 0) + 1);
            offsets.set(offset, (offsets.get(offset) ?? 0) + 1);
        }
    return {
        ...partialFlags,
        totalSamples,
        imageSamples: totalSamples - outsideImageSamples,
        outsideImageSamples,
        counts: [...counts].sort((a, b) => b[1] - a[1]),
        offsets: [...offsets].sort((a, b) => b[1] - a[1]),
        unmapped: 0,
        limitation:
            "Partial wall-clock instruction snapshots before collection failure; no stacks or exclusive GC CPU-time accounting. Mapping success is not a native/capture pass and does not establish a cause.",
    };
}
function derivePartial(out) {
    const result = {
        ...partialFlags,
        validated: false,
        captureInputsValidated: false,
        mapBindingsChecked: false,
        attributionComplete: false,
        errors: [],
    };
    try {
        const certificate = readJson(out, "derivation-certificate.json");
        assert.equal(certificate.mode, "mapping-only-existing-partial");
        for (const key of [
            "newNativeLaunches",
            "newNodeOracleLaunches",
            "newSamplerLaunches",
        ])
            assert.equal(certificate[key], 0);
        for (const key of [
            "completeCaptureAccepted",
            "historicalFailuresCleared",
            "releaseAcceptance",
        ])
            assert.equal(certificate[key], false);
        assert.deepEqual(certificate.capture, capturePins);
        assert.deepEqual(certificate.metadata, captureMetadataPins);
        assert.equal(certificate.source, pins.source);
        assert.deepEqual(certificate.helper, helperBinding());
        const files = decodeCapture(readFileSync(join(out, "capture.zip")));
        for (const [name, raw] of decodeCapture(
            readFileSync(join(out, "capture-metadata.zip")),
            true,
        )) {
            if (files.has(name)) assert.ok(files.get(name).equals(raw));
            else files.set(name, raw);
        }
        assert.deepEqual(
            certificate.files,
            [...files].map(([name, raw]) => ({
                name,
                size: raw.length,
                sha256: sha256(raw),
            })),
        );
        for (const [name, raw] of files)
            assert.ok(
                readFileSync(join(out, name)).equals(raw),
                `retained bytes changed ${name}`,
            );
        for (const [pin, prefix] of [
            [capturePins, "capture"],
            [captureMetadataPins, "capture-metadata"],
        ]) {
            const { run, artifact } = readJson(out, `${prefix}-api.json`);
            validateCaptureAPI(run, artifact, pin);
        }
        const validated = validateExistingCapture(files);
        Object.assign(result, validated.summary, {
            captureInputsValidated: true,
        });
        for (const mode of ["dependencies", "build"]) {
            const r = readJson(out, `${mode}-result.json`);
            assert.equal(r.source, pins.source);
            assert.equal(r.node, "v26.9.0");
            assert.equal(r.status, 0);
            assert.equal(r.signal, null);
            assert.equal(r.error, null);
            for (const stream of ["stdout", "stderr"])
                assert.equal(
                    r[`${stream}Sha256`],
                    sha256(readFileSync(join(out, `${mode}.${stream}.bin`))),
                );
        }
        const mapping = readJson(out, "map-result.json"),
            mapBytes = readFileSync(join(out, "map.json"));
        assert.equal(mapping.complete, true);
        assert.equal(mapping.source, pins.source);
        assert.equal(mapping.imageSha256, pins.imageSha256);
        assert.equal(mapping.rebuiltSha256, pins.imageSha256);
        assert.deepEqual(mapping.helper, certificate.helper);
        assert.equal(
            mapping.certificateSha256,
            sha256(readFileSync(join(out, "derivation-certificate.json"))),
        );
        assert.equal(mapping.mapSha256, sha256(mapBytes));
        assert.equal(
            sha256(readFileSync(join(out, "rebuilt-for-map.bin"))),
            pins.imageSha256,
        );
        const attribution = attributePartial(
            validated.rows,
            validated.sampler,
            JSON.parse(mapBytes),
            validated.pe,
        );
        result.mapBindingsChecked = true;
        json(out, "partial-attribution.json", {
            ...attribution,
            attributionComplete: true,
            rows: validated.rows.length,
            originalSampler: validated.sampler,
            originalSamplerExit: validated.summary.samplerExit,
            nativeOutcome: validated.summary.nativeOutcome,
            nodeOutcome: validated.summary.nodeOutcome,
            imageSha256: pins.imageSha256,
            samplesSha256: capturePins.samplesSha256,
            mapSha256: mapping.mapSha256,
            certificateSha256: mapping.certificateSha256,
            observedWindow: validated.observedWindow,
        });
        result.validated = true;
        result.attributionComplete = true;
        result.bindings = {
            imageSha256: pins.imageSha256,
            mapSha256: mapping.mapSha256,
            certificateSha256: mapping.certificateSha256,
            capture: capturePins,
            helper: certificate.helper,
        };
    } catch (error) {
        result.errors.push(errorJSON(error));
        // Never leave an earlier-looking success when derivation fails.
        json(out, "partial-attribution.json", {
            ...partialFlags,
            attributionComplete: false,
            errors: result.errors,
        });
        process.exitCode = 1;
    } finally {
        json(out, "partial-verification.json", result);
        json(out, "partial-metadata-index.json", {
            ...partialFlags,
            validated: result.validated,
            attributionComplete: result.attributionComplete,
        });
    }
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function buildForMap(out, source, mode) {
    const pin = spawnSync("git", ["rev-parse", "HEAD"], {
        cwd: source,
        encoding: "utf8",
        windowsHide: true,
        timeout: 10000,
    });
    assert.equal(pin.status, 0);
    assert.equal(pin.stdout.trim(), pins.source);
    const started = new Date().toISOString(),
        start = performance.now();
    // These fixed commands run only after requireHosted, in the pinned source
    // checkout. Capture failures in the artifact rather than only the job log.
    const result = spawnSync(
        process.env.ComSpec ?? "cmd.exe",
        [
            "/d",
            "/s",
            "/c",
            mode === "dependencies" ? "npm ci" : "npm run build",
        ],
        { cwd: source, windowsHide: true, timeout: 90000, maxBuffer: 4194304 },
    );
    writeFileSync(
        join(out, `${mode}.stdout.bin`),
        result.stdout ?? Buffer.alloc(0),
    );
    writeFileSync(
        join(out, `${mode}.stderr.bin`),
        result.stderr ?? Buffer.alloc(0),
    );
    json(out, `${mode}-result.json`, {
        source: pins.source,
        node: process.version,
        started,
        finished: new Date().toISOString(),
        elapsedMs: performance.now() - start,
        status: result.status,
        signal: result.signal,
        error: errorJSON(result.error),
        stdoutSha256: sha256(result.stdout ?? Buffer.alloc(0)),
        stderrSha256: sha256(result.stderr ?? Buffer.alloc(0)),
    });
    assert.equal(
        result.status,
        0,
        `${mode} failed; retained raw build evidence`,
    );
    assert.equal(result.signal, null);
    assert.equal(result.error, undefined);
}
function nativeWorker(out) {
    const config = readJson(out, "launch.json");
    verifyInputs(filesFromDisk(out));
    assert.equal(sha256(readFileSync(config.image)), pins.imageSha256);
    controlWorker(out, "WorkerIdentity", process.pid);
    const worker = readJson(out, "worker-os.json");
    assert.equal(worker.pid, process.pid);
    assert.equal(worker.parentPid, config.parentPid);
    const expectedWorker = {
        parentPid: process.ppid,
        image: process.execPath,
        imageSha256: sha256(readFileSync(process.execPath)),
        started: new Date(Date.now() - process.uptime() * 1000).toISOString(),
        creation: worker.creation,
    };
    assert.ok(
        selectOwnedChild(expectedWorker, [worker]),
        "worker self identity mismatch",
    );
    json(out, "worker-identity.json", {
        ...worker,
        image: realpathSync.native(process.execPath),
    });
    const started = new Date().toISOString(),
        start = performance.now();
    // Exclusive attempt record makes accidental re-entry fail before launch.
    writeFileSync(
        join(out, "native-attempt.json"),
        JSON.stringify({ count: 1, parentPid: process.pid, started }),
        { flag: "wx" },
    );
    json(out, "target.json", {
        ...config,
        parentPid: process.pid,
        started,
        launchSha256: sha256(readFileSync(join(out, "launch.json"))),
        worker: readJson(out, "worker-identity.json"),
    });
    // Retain the same spawnSync raw semantics as the original helper, including
    // its ETIMEDOUT error, null status and SIGTERM on Windows deadline expiry.
    const run = spawnSync(config.image, [], {
        cwd: config.cwd,
        timeout: 180000,
        windowsHide: true,
    });
    const stdout = run.stdout,
        stderr = run.stderr;
    // Missing streams remain missing evidence, never synthesized as empty.
    if (stdout) writeFileSync(join(out, "native.stdout.bin"), stdout);
    if (stderr) writeFileSync(join(out, "native.stderr.bin"), stderr);
    const aborted = existsSync(join(out, "observation-abort.json"));
    json(out, "native-result.json", {
        status: run.status,
        signal: run.signal,
        error: errorJSON(run.error),
        pid: run.pid,
        timeoutMs: 180000,
        started,
        finished: new Date().toISOString(),
        elapsedMs: performance.now() - start,
        aborted,
        complete: !aborted,
        deadlineExpired: !aborted && run.error?.code === "ETIMEDOUT",
        stdoutBytes: stdout?.length ?? null,
        stderrBytes: stderr?.length ?? null,
        stdoutSha256: stdout ? sha256(stdout) : null,
        stderrSha256: stderr ? sha256(stderr) : null,
        launchSha256: sha256(readFileSync(join(out, "launch.json"))),
        imageSha256: pins.imageSha256,
    });
}
async function observe(out) {
    const input = verifyInputs(filesFromDisk(out));
    const directory = mkdtempSync(join(tmpdir(), "nona-modules-"));
    for (const [name, text] of Object.entries(input.files))
        writeFileSync(join(directory, name), text);
    const executable = join(directory, "image.exe");
    writeFileSync(executable, readFileSync(join(out, "image.bin")));
    assert.equal(sha256(readFileSync(executable)), pins.imageSha256);
    const config = {
        image: executable,
        cwd: directory,
        files: input.files,
        entry: input.entry,
        args: [],
        timeoutMs: 180000,
        windowsHide: true,
        maxBuffer: 1048576,
        stdin: "pipe-closed-empty",
        parentPid: process.pid,
        imageSha256: pins.imageSha256,
        source: pins.source,
        at: new Date().toISOString(),
    };
    json(out, "launch.json", config);
    // Compilation of this small PInvoke helper precedes launch. No SDK install.
    const sampler = spawn(
        "pwsh",
        [
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-File",
            fileURLToPath(new URL("./issue646-sampler.ps1", import.meta.url)),
            "-Output",
            out,
        ],
        { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    const samplerBuffers = [[], []];
    let samplerBytes = 0;
    let samplerError = null;
    sampler.stdout.on("data", (b) => {
        samplerBytes += b.length;
        if (samplerBytes <= 1048576) samplerBuffers[0].push(b);
    });
    sampler.stderr.on("data", (b) => {
        samplerBytes += b.length;
        if (samplerBytes <= 1048576) samplerBuffers[1].push(b);
    });
    sampler.on("error", (e) => {
        samplerError = errorJSON(e);
    });
    const samplerDone = new Promise((resolve) =>
        sampler.on("close", (status, signal) =>
            resolve({ status, signal, error: samplerError }),
        ),
    );
    let samplerExit;
    try {
        const readyDeadline = Date.now() + 30000;
        while (!existsSync(join(out, "sampler-ready.json"))) {
            assert.ok(
                Date.now() < readyDeadline &&
                    sampler.exitCode === null &&
                    !samplerError,
                "sampler unavailable before native launch",
            );
            await delay(50);
        }
        const worker = spawn(
            process.execPath,
            [fileURLToPath(import.meta.url), "native-worker", out],
            { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
        );
        let workerError = null;
        const logs = [[], []];
        let logBytes = 0;
        worker.on("error", (e) => {
            workerError = errorJSON(e);
        });
        for (const [i, stream] of [worker.stdout, worker.stderr].entries())
            stream.on("data", (b) => {
                logBytes += b.length;
                if (logBytes <= 1048576) logs[i].push(b);
            });
        const workerDone = new Promise((resolve) =>
            worker.on("close", (status, signal) => resolve({ status, signal })),
        );
        // This outer bound and early collection abort do not alter the inner
        // spawnSync deadline or turn an aborted attempt into a timeout witness.
        let workerTimer;
        const bound = new Promise((resolve) => {
            workerTimer = setTimeout(resolve, 210000);
        });
        let supervised;
        try {
            supervised = await superviseObservation({
                workerDone,
                samplerDone,
                bound,
                readSampler: () => readJson(out, "sampler-result.json"),
                abort: async (reason) => {
                    json(out, "observation-abort.json", {
                        at: new Date().toISOString(),
                        complete: false,
                        aborted: true,
                        deadlineExpired: false,
                        reason,
                    });
                    const identityDeadline = Date.now() + 10000;
                    while (
                        !existsSync(join(out, "worker-identity.json")) &&
                        worker.exitCode === null &&
                        Date.now() < identityDeadline
                    )
                        await delay(25);
                    if (worker.exitCode !== null) return;
                    controlWorker(out, "Cleanup", worker.pid);
                    assert.equal(
                        readJson(out, "worker-cleanup.json").complete,
                        true,
                    );
                    unlinkSync(executable);
                    json(out, "aborted-image-cleanup.json", {
                        image: executable,
                        imageSha256: pins.imageSha256,
                        removed: true,
                        afterVerifiedTreeCleanup: true,
                    });
                },
            });
        } finally {
            clearTimeout(workerTimer);
            json(out, "worker-result.json", {
                ...(supervised?.workerExit ?? {
                    status: worker.exitCode,
                    signal: worker.signalCode,
                }),
                pid: worker.pid,
                error: workerError,
                boundExceeded: !!supervised?.reason?.boundExceeded,
                aborted: existsSync(join(out, "observation-abort.json")),
                complete: !!supervised,
                logBytes,
            });
            for (const [i, name] of [
                "worker.stdout.bin",
                "worker.stderr.bin",
            ].entries())
                writeFileSync(join(out, name), Buffer.concat(logs[i]));
        }
        // Original oracle source replaces the entry only after native completion.
        writeFileSync(join(directory, input.entry), input.options.oracleSource);
        const nodeStarted = new Date().toISOString(),
            nodeStart = performance.now();
        writeFileSync(
            join(out, "node-attempt.json"),
            JSON.stringify({ count: 1, started: nodeStarted }),
            { flag: "wx" },
        );
        const node = spawnSync(
            process.execPath,
            [join(directory, input.entry)],
            { cwd: directory, timeout: 60000 },
        );
        if (node.stdout)
            writeFileSync(join(out, "node.stdout.bin"), node.stdout);
        if (node.stderr)
            writeFileSync(join(out, "node.stderr.bin"), node.stderr);
        json(out, "node-result.json", {
            status: node.status,
            signal: node.signal,
            error: errorJSON(node.error),
            pid: node.pid,
            timeoutMs: 60000,
            started: nodeStarted,
            finished: new Date().toISOString(),
            elapsedMs: performance.now() - nodeStart,
            stdoutSha256: node.stdout ? sha256(node.stdout) : null,
            stderrSha256: node.stderr ? sha256(node.stderr) : null,
            oracleSourceSha256: sha256(Buffer.from(input.options.oracleSource)),
        });
    } finally {
        // Early sampler failure aborts only this owned observation. Its receipt
        // remains incomplete, independently of native outcome and old failures.
        json(out, "stop.json", { at: new Date().toISOString() });
        samplerExit = await Promise.race([
            samplerDone,
            delay(10000).then(() => null),
        ]);
        if (!samplerExit) {
            sampler.kill();
            samplerExit = {
                status: null,
                signal: null,
                error: { message: "sampler failed to clean up within 10s" },
            };
        }
        if (samplerBytes > 1048576)
            samplerExit.error = { message: "sampler output bound exceeded" };
        json(out, "sampler-exit.json", samplerExit);
        writeFileSync(
            join(out, "sampler.stdout.bin"),
            Buffer.concat(samplerBuffers[0]),
        );
        writeFileSync(
            join(out, "sampler.stderr.bin"),
            Buffer.concat(samplerBuffers[1]),
        );
        // Retain temporary launch files for evidence; GitHub-hosted VM disposal
        // removes them. Process/thread cleanup is verified separately.
    }
    const samplerResult = readJson(out, "sampler-result.json");
    assert.equal(
        samplerExit.status,
        0,
        "sampler failed; observation incomplete",
    );
    assert.equal(samplerResult.complete, true);
    assert.equal(samplerResult.cleanup, true);
    assert.deepEqual(samplerResult.errors, []);
    assert.ok(samplerResult.samples > 0 && samplerResult.rows > 0);
    assert.ok(
        !existsSync(join(out, "observation-abort.json")),
        "observation aborted",
    );
}

export function verifyObservation(x) {
    assert.equal(x.imageSha256, pins.imageSha256);
    assert.equal(x.nativeCount, 1);
    assert.equal(x.nodeCount, 1);
    assert.equal(x.native.timeoutMs, 180000);
    assert.equal(x.node.timeoutMs, 60000);
    assert.notEqual(
        x.native.aborted,
        true,
        "aborted observation is incomplete",
    );
    assert.notEqual(x.native.complete, false, "native observation incomplete");
    for (const r of [x.native, x.node]) {
        assert.ok(
            Object.hasOwn(r, "status") &&
                Object.hasOwn(r, "signal") &&
                Object.hasOwn(r, "error"),
            "missing raw outcome fields",
        );
        assert.ok(r.status === null || Number.isInteger(r.status));
        assert.ok(r.signal === null || typeof r.signal === "string");
    }
    const s = x.sampler;
    assert.equal(s.complete, true);
    assert.equal(s.cleanup, true);
    assert.deepEqual(s.errors, []);
    assert.equal(x.samplerExit.status, 0);
    assert.equal(x.samplerExit.signal, null);
    assert.equal(x.samplerExit.error, null);
    assert.equal(s.imageSha256, x.imageSha256);
    assert.equal(s.pid, x.native.pid);
    assert.match(s.creation, /^\d+$/);
    assert.equal(s.imageSize, x.pe.sizeOfImage);
    assert.match(s.base, /^0x[0-9a-f]+$/i);
    assert.ok(x.rows.length > 0 && x.rows.length <= 1800);
    assert.equal(s.rows, x.rows.length);
    let total = 0,
        valid = 0,
        previous = -Infinity,
        previousCpu = -1;
    const threadCreations = new Map();
    for (const row of x.rows) {
        assert.equal(row.pid, s.pid);
        assert.equal(row.creation, s.creation);
        const time = Date.parse(row.at);
        assert.ok(
            Number.isFinite(time) &&
                time >= previous &&
                time >= Date.parse(x.native.started) &&
                time <= Date.parse(x.native.finished),
            "sample timestamp outside native lifetime",
        );
        previous = time;
        assert.ok(
            Number.isFinite(row.cpuMs) &&
                row.cpuMs >= previousCpu &&
                Number.isSafeInteger(row.rss) &&
                row.rss > 0,
            "invalid CPU/RSS",
        );
        previousCpu = row.cpuMs;
        assert.ok(row.threads.length > 0 && row.threads.length <= 32);
        const tids = new Set();
        for (const t of row.threads) {
            assert.ok(Number.isInteger(t.tid) && t.tid > 0 && !tids.has(t.tid));
            tids.add(t.tid);
            assert.match(t.creation, /^\d+$/);
            assert.match(t.rip, /^0x[0-9a-f]+$/i);
            if (threadCreations.has(t.tid))
                assert.equal(
                    t.creation,
                    threadCreations.get(t.tid),
                    "thread ID reused within profile",
                );
            threadCreations.set(t.tid, t.creation);
            const offset = BigInt(t.rip) - BigInt(s.base);
            total++;
            if (
                offset >= 0n &&
                offset < BigInt(s.imageSize) &&
                x.pe.sections.some(
                    (a) =>
                        a.executable &&
                        offset >= BigInt(a.rva) &&
                        offset < BigInt(a.rva + a.size),
                )
            )
                valid++;
        }
    }
    assert.equal(s.samples, total);
    assert.ok(valid > 0, "no valid retained-image instruction samples");
    const nativePassed =
        x.native.status === 0 &&
        x.native.signal === null &&
        x.native.error === null &&
        !x.native.deadlineExpired &&
        !x.native.bufferExceeded &&
        x.nativeAssertionsPassed === true;
    const nodePassed =
        x.node.status === 0 &&
        x.node.signal === null &&
        x.node.error === null &&
        x.nodeAssertionsPassed === true;
    return {
        complete: true,
        totalSamples: total,
        imageSamples: valid,
        outsideImageSamples: total - valid,
        nativePassed,
        nodePassed,
        historicalFailuresCleared: false,
        releaseAcceptance: false,
    };
}
function verify(out) {
    const result = {
        complete: false,
        nativePassed: false,
        nodePassed: false,
        attributionComplete: false,
        historicalFailuresCleared: false,
        releaseAcceptance: false,
        errors: [],
    };
    try {
        // Preserve this result even if provenance, streams, samples or map fail.
        result.abort = existsSync(join(out, "observation-abort.json"))
            ? readJson(out, "observation-abort.json")
            : null;
        const n = existsSync(join(out, "native-result.json"))
            ? readJson(out, "native-result.json")
            : null;
        result.nativeOutcome = n;
        result.nativeExitSucceeded =
            !!n &&
            !result.abort &&
            !n.aborted &&
            n.complete !== false &&
            n.status === 0 &&
            n.signal === null &&
            n.error === null &&
            !n.deadlineExpired &&
            !n.bufferExceeded;
        const c = readJson(out, "node-result.json");
        // Native outcome is recorded independently even if profile/map checks fail.
        result.nodeOutcome = c;
        result.nodeExitSucceeded =
            c.status === 0 && c.signal === null && c.error === null;
        assert.ok(
            n,
            "native outcome missing after incomplete/aborted observation; no streams synthesized",
        );
        const input = verifyInputs(filesFromDisk(out));
        const plan = readJson(out, "plan.json");
        assert.deepEqual(plan.pins, pins);
        assert.equal(readJson(out, "native-attempt.json").count, 1);
        assert.equal(readJson(out, "node-attempt.json").count, 1);
        assert.equal(n.imageSha256, pins.imageSha256);
        const launch = readJson(out, "launch.json");
        assert.deepEqual(launch.files, input.files);
        assert.equal(launch.entry, input.entry);
        assert.deepEqual(launch.args, []);
        assert.equal(launch.timeoutMs, 180000);
        assert.equal(launch.windowsHide, true);
        assert.equal(launch.maxBuffer, 1048576);
        assert.equal(
            sha256(readFileSync(join(out, "retained.zip"))),
            pins.zipSha256,
        );
        const historical = readJson(out, "historical-node-result.json");
        const expectedStdout = Buffer.from(historical.stdout.data, "base64");
        result.nativeAssertionsPassed =
            readFileSync(join(out, "native.stdout.bin")).equals(
                expectedStdout,
            ) && readFileSync(join(out, "native.stderr.bin")).length === 0;
        result.nodeAssertionsPassed =
            readFileSync(join(out, "node.stdout.bin")).equals(expectedStdout) &&
            readFileSync(join(out, "node.stderr.bin")).length === 0;
        result.nativePassed =
            result.nativeExitSucceeded && result.nativeAssertionsPassed;
        result.nodePassed =
            c.status === 0 &&
            c.signal === null &&
            c.error === null &&
            result.nodeAssertionsPassed;
        for (const [prefix, r] of [
            ["native", n],
            ["node", c],
        ])
            for (const stream of ["stdout", "stderr"])
                assert.equal(
                    sha256(readFileSync(join(out, `${prefix}.${stream}.bin`))),
                    r[`${stream}Sha256`],
                );
        assert.equal(
            c.oracleSourceSha256,
            sha256(Buffer.from(input.options.oracleSource)),
        );
        assert.equal(
            n.launchSha256,
            sha256(readFileSync(join(out, "launch.json"))),
        );
        const target = readJson(out, "target.json"),
            s = readJson(out, "sampler-result.json");
        const worker = readJson(out, "worker-result.json");
        assert.equal(worker.status, 0);
        assert.equal(worker.signal, null);
        assert.equal(worker.error, null);
        assert.equal(worker.boundExceeded, false);
        assert.equal(worker.aborted, false);
        assert.ok(worker.logBytes <= 1048576);
        assert.equal(target.parentPid, worker.pid);
        assert.equal(
            s.targetSha256,
            sha256(readFileSync(join(out, "target.json"))),
        );
        assert.equal(s.launchSha256, n.launchSha256);
        const identity = readJson(out, "identity.json");
        for (const key of [
            "pid",
            "creation",
            "imageSha256",
            "base",
            "imageSize",
            "targetSha256",
            "launchSha256",
        ])
            assert.equal(identity[key], s[key], `identity binding: ${key}`);
        assert.equal(identity.parentPid, worker.pid);
        assert.equal(
            realpathSync.native(identity.image).toLowerCase(),
            realpathSync.native(launch.image).toLowerCase(),
        );
        assert.equal(
            identity.canonicalImage.toLowerCase(),
            realpathSync.native(launch.image).toLowerCase(),
        );
        assert.equal(
            identity.expectedCanonicalImage.toLowerCase(),
            realpathSync.native(launch.image).toLowerCase(),
        );
        assertWorkerIdentity(
            identity.worker,
            readJson(out, "worker-identity.json"),
        );
        assert.equal(identity.worker.pid, worker.pid);
        assert.ok(
            Math.abs(Date.parse(identity.started) - Date.parse(n.started)) <=
                2000,
            "creation time outside launch window",
        );
        assert.equal(
            realpathSync
                .native(identity.commandLine.trim().replace(/^"|"$/g, ""))
                .toLowerCase(),
            realpathSync.native(launch.image).toLowerCase(),
            "unexpected actual native command line",
        );
        assert.deepEqual(target, {
            ...launch,
            parentPid: worker.pid,
            started: n.started,
            launchSha256: n.launchSha256,
            worker: readJson(out, "worker-identity.json"),
        });
        const raw = readFileSync(join(out, "samples.jsonl"));
        assert.ok(
            raw.length <= 33554432 && raw.length > 0 && raw.at(-1) === 10,
            "incomplete samples",
        );
        assert.equal(s.samplesSha256, sha256(raw));
        const rows = raw
            .toString("utf8")
            .trimEnd()
            .split("\n")
            .map((line) => JSON.parse(line));
        // Always emit load-base-relative offsets BEFORE attempting function
        // attribution. Rebuild mismatch never discards the useful raw profile.
        json(out, "instruction-offsets.json", {
            imageSha256: pins.imageSha256,
            base: s.base,
            samplesSha256: s.samplesSha256,
            rows: rows.map((row) => ({
                at: row.at,
                pid: row.pid,
                creation: row.creation,
                cpuMs: row.cpuMs,
                rss: row.rss,
                threads: row.threads.map((t) => ({
                    ...t,
                    relativeOffset: (BigInt(t.rip) - BigInt(s.base)).toString(),
                })),
            })),
        });
        Object.assign(
            result,
            verifyObservation({
                imageSha256: pins.imageSha256,
                nativeCount: plan.nativeCount,
                nodeCount: plan.nodeCount,
                native: n,
                node: c,
                sampler: s,
                rows,
                pe: peMetadata(readFileSync(join(out, "image.bin"))),
                samplerExit: readJson(out, "sampler-exit.json"),
                nativeAssertionsPassed: result.nativeAssertionsPassed,
                nodeAssertionsPassed: result.nodeAssertionsPassed,
            }),
        );
        const mapping = readJson(out, "map-result.json");
        for (const mode of ["dependencies", "build"]) {
            const build = readJson(out, `${mode}-result.json`);
            assert.equal(build.source, pins.source);
            assert.equal(build.node, "v26.9.0");
            assert.equal(build.status, 0);
            assert.equal(build.signal, null);
            assert.equal(build.error, null);
            for (const stream of ["stdout", "stderr"])
                assert.equal(
                    sha256(readFileSync(join(out, `${mode}.${stream}.bin`))),
                    build[`${stream}Sha256`],
                );
        }
        assert.equal(
            mapping.complete,
            true,
            "attribution gap: rebuild or map incomplete",
        );
        assert.equal(mapping.source, pins.source);
        assert.equal(mapping.rebuiltSha256, pins.imageSha256);
        const mapBytes = readFileSync(join(out, "map.json"));
        assert.equal(mapping.mapSha256, sha256(mapBytes));
        const map = JSON.parse(mapBytes);
        assert.equal(
            sha256(readFileSync(join(out, "rebuilt-for-map.bin"))),
            pins.imageSha256,
        );
        validateMap(map, peMetadata(readFileSync(join(out, "image.bin"))));
        const counts = new Map(),
            offsets = new Map();
        let unmapped = 0;
        for (const row of rows)
            for (const t of row.threads) {
                const rva = BigInt(t.rip) - BigInt(s.base);
                if (rva < 0n || rva >= BigInt(s.imageSize)) continue;
                const offset = Number(rva);
                offsets.set(offset, (offsets.get(offset) ?? 0) + 1);
                const label = locate(map, offset);
                if (!label) {
                    unmapped++;
                    continue;
                }
                counts.set(label.name, (counts.get(label.name) ?? 0) + 1);
            }
        json(out, "attribution.json", {
            imageSha256: pins.imageSha256,
            mapSha256: mapping.mapSha256,
            samplesSha256: s.samplesSha256,
            counts: [...counts].sort((a, b) => b[1] - a[1]),
            offsets: [...offsets].sort((a, b) => b[1] - a[1]),
            unmapped,
            limitation:
                "Wall-clock instruction snapshots, no stacks or exclusive CPU-time accounting. Profiling perturbs execution; counts alone do not prove a cause.",
        });
        assert.equal(unmapped, 0, "attribution gap: unmapped in-image samples");
        result.attributionComplete = true;
    } catch (error) {
        result.errors.push(errorJSON(error));
    } finally {
        json(out, "verification.json", result);
        json(out, "metadata-index.json", {
            complete: result.complete && result.attributionComplete,
            historicalFailuresCleared: false,
            releaseAcceptance: false,
            files: [
                "verification.json",
                "sampler-result.json",
                "sampler-exit.json",
                "identity.json",
                "candidates.json",
                "worker-identity.json",
                "worker-result.json",
                "worker-cleanup.json",
                "native-result.json",
                "node-result.json",
                "map-result.json",
                "map.json",
                "attribution.json",
                "observation-abort.json",
                "aborted-image-cleanup.json",
                "observe-failure.json",
                "prepare-failure.json",
                "select-child-failure.json",
            ].map((name) => ({ name, present: existsSync(join(out, name)) })),
        });
        if (
            !result.complete ||
            !result.nativePassed ||
            !result.nodePassed ||
            !result.attributionComplete ||
            result.errors.length
        )
            process.exitCode = 1;
    }
}
if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
    requireHosted();
    const [mode, output, source] = process.argv.slice(2),
        out = resolve(output);
    mkdirSync(out, { recursive: true });
    try {
        if (mode === "prepare-existing") await prepareExisting(out);
        else if (mode === "derive-partial") derivePartial(out);
        else if (mode === "prepare") await prepare(out);
        else if (mode === "observe") await observe(out);
        else if (mode === "native-worker") nativeWorker(out);
        else if (mode === "dependencies" || mode === "build")
            buildForMap(out, resolve(source), mode);
        else if (mode === "verify") verify(out);
        else if (mode === "select-child") {
            assert.ok(
                ["Sample", "Cleanup"].includes(source),
                "unknown selection scope",
            );
            const { expected, candidates } = readJson(
                out,
                `selection-${source}-request.json`,
            );
            json(out, `selection-${source}-result.json`, {
                selected: selectOwnedChild(expected, candidates),
            });
        } else throw Error("unknown profile mode");
    } catch (error) {
        json(out, `${mode}-failure.json`, {
            at: new Date().toISOString(),
            error: errorJSON(error),
            releaseAcceptance: false,
        });
        process.exitCode = 1;
    }
}
