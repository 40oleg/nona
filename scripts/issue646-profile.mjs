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
} from "node:fs";
import { join, resolve } from "node:path";
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
    assert.equal(process.env.GITHUB_ACTIONS, "true");
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
export function selectZip(b, wanted) {
    assert.equal(sha256(b), pins.zipSha256, "ZIP digest");
    assert.equal(b.length, pins.zipSize);
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
        if (wanted.has(name)) {
            assert.equal(flags & 1, 0, "encrypted ZIP entry");
            assert.ok(method === 0 || method === 8);
            assert.equal(unpacked, wanted.get(name));
            assert.ok(local + 30 <= offset);
            assert.equal(b.readUInt32LE(local), 0x04034b50);
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
                          maxOutputLength: unpacked,
                      });
            assert.equal(bytes.length, unpacked);
            found.set(name, bytes);
        }
        p += 46 + len + extra + comment;
    }
    assert.equal(p, end);
    return found;
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
    });
    // Retain the same spawnSync raw semantics as the original helper, including
    // its ETIMEDOUT error, null status and SIGTERM on Windows deadline expiry.
    const run = spawnSync(config.image, [], {
        cwd: config.cwd,
        timeout: 180000,
        windowsHide: true,
    });
    const stdout = run.stdout ?? Buffer.alloc(0),
        stderr = run.stderr ?? Buffer.alloc(0);
    writeFileSync(join(out, "native.stdout.bin"), stdout);
    writeFileSync(join(out, "native.stderr.bin"), stderr);
    json(out, "native-result.json", {
        status: run.status,
        signal: run.signal,
        error: errorJSON(run.error),
        pid: run.pid,
        timeoutMs: 180000,
        started,
        finished: new Date().toISOString(),
        elapsedMs: performance.now() - start,
        deadlineExpired: run.error?.code === "ETIMEDOUT",
        stdoutBytes: stdout.length,
        stderrBytes: stderr.length,
        stdoutSha256: sha256(stdout),
        stderrSha256: sha256(stderr),
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
        let workerError = null,
            workerBound = false;
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
        // Outer cleanup guard only; never changes the inner native deadline.
        const workerTimer = setTimeout(() => {
            workerBound = true;
            const cleanup = spawnSync(
                "taskkill",
                ["/PID", String(worker.pid), "/T", "/F"],
                { windowsHide: true, timeout: 10000 },
            );
            json(out, "worker-cleanup.json", {
                status: cleanup.status,
                error: errorJSON(cleanup.error),
                stdout: cleanup.stdout?.toString(),
                stderr: cleanup.stderr?.toString(),
            });
        }, 210000);
        const workerExit = await workerDone;
        clearTimeout(workerTimer);
        json(out, "worker-result.json", {
            ...workerExit,
            pid: worker.pid,
            error: workerError,
            boundExceeded: workerBound,
            logBytes,
        });
        for (const [i, name] of [
            "worker.stdout.bin",
            "worker.stderr.bin",
        ].entries())
            writeFileSync(join(out, name), Buffer.concat(logs[i]));
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
        writeFileSync(
            join(out, "node.stdout.bin"),
            node.stdout ?? Buffer.alloc(0),
        );
        writeFileSync(
            join(out, "node.stderr.bin"),
            node.stderr ?? Buffer.alloc(0),
        );
        json(out, "node-result.json", {
            status: node.status,
            signal: node.signal,
            error: errorJSON(node.error),
            pid: node.pid,
            timeoutMs: 60000,
            started: nodeStarted,
            finished: new Date().toISOString(),
            elapsedMs: performance.now() - nodeStart,
            stdoutSha256: sha256(node.stdout ?? Buffer.alloc(0)),
            stderrSha256: sha256(node.stderr ?? Buffer.alloc(0)),
            oracleSourceSha256: sha256(Buffer.from(input.options.oracleSource)),
        });
    } finally {
        // The native deadline is independent of profiler availability/failure.
        // Never terminate the sampler while it may have suspended a live target.
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
}

export function verifyObservation(x) {
    assert.equal(x.imageSha256, pins.imageSha256);
    assert.equal(x.nativeCount, 1);
    assert.equal(x.nodeCount, 1);
    assert.equal(x.native.timeoutMs, 180000);
    assert.equal(x.node.timeoutMs, 60000);
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
        const n = readJson(out, "native-result.json");
        result.nativeOutcome = n;
        result.nativeExitSucceeded =
            n.status === 0 &&
            n.signal === null &&
            n.error === null &&
            !n.deadlineExpired &&
            !n.bufferExceeded;
        const input = verifyInputs(filesFromDisk(out));
        const plan = readJson(out, "plan.json");
        assert.deepEqual(plan.pins, pins);
        const c = readJson(out, "node-result.json");
        // Native outcome is recorded independently even if profile/map checks fail.
        result.nodeOutcome = c;
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
        assert.equal(identity.image.toLowerCase(), launch.image.toLowerCase());
        assert.ok(
            Math.abs(Date.parse(identity.started) - Date.parse(n.started)) <=
                2000,
            "creation time outside launch window",
        );
        assert.equal(
            identity.commandLine.trim().replace(/^"|"$/g, "").toLowerCase(),
            launch.image.toLowerCase(),
            "unexpected actual native command line",
        );
        assert.deepEqual(target, {
            ...launch,
            parentPid: worker.pid,
            started: n.started,
            launchSha256: n.launchSha256,
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
        if (mode === "prepare") await prepare(out);
        else if (mode === "observe") await observe(out);
        else if (mode === "native-worker") nativeWorker(out);
        else if (mode === "dependencies" || mode === "build")
            buildForMap(out, resolve(source), mode);
        else if (mode === "verify") verify(out);
        else throw Error("unknown profile mode");
    } catch (error) {
        json(out, `${mode}-failure.json`, {
            at: new Date().toISOString(),
            error: errorJSON(error),
            releaseAcceptance: false,
        });
        process.exitCode = 1;
    }
}
