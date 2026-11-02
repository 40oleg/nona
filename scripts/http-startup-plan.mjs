// Safe to import in pure local tests: no compiler, image, debugger or network.
import { readFileSync } from "node:fs";
import { serverSource } from "./http-crash-fixture.mjs";
import { supervise } from "./http-crash.mjs";
import { startupChildEnv } from "./http-startup-env.mjs";

export const retained = {
    run: "41337528064",
    job: "124940395131",
    artifact: "13099115124",
    head: "3f199321d8fd543257d04f7680609ca1b459fa9e",
    tree: "054e3768db264be6728a0bc530d5ba0a4078349f",
    zipHash: "2e60c99f112f3140b9da9ae91e48add5b948b178f0fb82be88a9eeadc423327e",
    imageHash:
        "23bfce34206002318c362f7c285eef3dc3547901113b8146fd9e8f7153a770d7",
    sourceHash:
        "bd8e4abac8b6cde1af33a8dd717882ab34a0e894243fd8bb2e75c04b4d380eda",
};
export const campaignMs = 20 * 60 * 1000;

export function startupAllowed(env, head, platform, arch, version) {
    return (
        env.GITHUB_ACTIONS === "true" &&
        env.GITHUB_REPOSITORY === "40oleg/nona" &&
        env.GITHUB_EVENT_NAME === "workflow_dispatch" &&
        env.STARTUP_MODE === "startup-602" &&
        /^refs\/heads\/issue-602-startup-[a-zA-Z0-9._-]+$/.test(
            env.GITHUB_REF ?? "",
        ) &&
        /^[a-f0-9]{40}$/.test(head ?? "") &&
        head === env.GITHUB_SHA &&
        head === env.STARTUP_EXPECTED_SHA &&
        head === env.GITHUB_WORKFLOW_SHA &&
        env.GITHUB_WORKFLOW_REF ===
            `40oleg/nona/.github/workflows/native-platforms.yml@${env.GITHUB_REF}` &&
        env.RUNNER_ENVIRONMENT === "github-hosted" &&
        env.RUNNER_OS === "Windows" &&
        platform === "win32" &&
        arch === "x64" &&
        version === "v26.9.0"
    );
}

export function safeArtifactPath(path) {
    return (
        typeof path === "string" &&
        path.length > 0 &&
        path.length < 240 &&
        path
            .split("/")
            .every(
                (part) =>
                    /^[a-zA-Z0-9_.-]+$/.test(part) &&
                    part !== "." &&
                    part !== ".." &&
                    !/[. ]$/.test(part) &&
                    !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part),
            )
    );
}

export function validateZipInventory(entries) {
    if (!Array.isArray(entries) || !entries.length || entries.length > 2000)
        throw Error("ZIP entry count");
    const names = new Set();
    let total = 0;
    for (const entry of entries) {
        const path = entry.path?.replace(/\/$/, "");
        if (
            !safeArtifactPath(path) ||
            names.has(path.toLowerCase()) ||
            !Number.isSafeInteger(entry.bytes) ||
            entry.bytes < 0 ||
            entry.bytes > 64 * 1024 * 1024 ||
            ((entry.attributes >>> 16) & 0xf000) === 0xa000 ||
            (entry.attributes & 0x400) !== 0
        )
            throw Error("Unsafe/duplicate/linked/oversized ZIP entry");
        names.add(path.toLowerCase());
        total += entry.bytes;
    }
    if (total > 256 * 1024 * 1024) throw Error("ZIP expansion limit");
    for (const path of names) {
        const parts = path.split("/");
        while (parts.length > 1) {
            parts.pop();
            const parent = parts.join("/");
            if (
                entries.some(
                    (e) =>
                        !e.path.endsWith("/") &&
                        e.path.toLowerCase() === parent,
                )
            )
                throw Error("ZIP file/directory alias");
        }
    }
    return entries;
}

export function startupPlan() {
    return [
        "retained-reference",
        "console",
        "stdout",
        "http-import",
        "http-listen",
        "instrumented-reference",
        "helper-reference",
    ].map((id) => ({
        id,
        gc: "stress",
        attempts: 1,
        concurrency: 1,
        startupMs: 60000,
        hardMs: 90000,
        compilerMs: 120000,
        pipeline:
            id === "retained-reference"
                ? "retained public compile artifact (not regenerated)"
                : id === "helper-reference"
                  ? "compileModuleToIR/generate(default fullRuntimeLink)/linkPe"
                  : "compile(module:true)/collectSourceUsage/requestLink/generate/linkPe",
        ...(id === "retained-reference"
            ? { imageHash: retained.imageHash }
            : {}),
        optional: id === "helper-reference",
        observerPerturbation:
            id === "retained-reference"
                ? "External CPU/working-set and noninvasive CDB inspection can perturb scheduling; no source changes"
                : "Different source demand, allocations, roots and link selection; marker outcome alone cannot establish a cause",
    }));
}

export function referenceSettings() {
    const original = readFileSync(
        "tests/fixtures/http-crash/soak-server.mjs",
        "utf8",
    );
    return serverSource(true).slice(original.length);
}

export function probeSource(id, referenceSource = serverSource(true)) {
    if (id === "helper-reference") return referenceSource;
    if (id === "console") return 'console.log("checkpoint console");\n';
    if (id === "stdout")
        return 'console.log("checkpoint before-stdout");\nconst output = process.stdout;\nconsole.log("checkpoint after-stdout-access");\noutput.write("checkpoint stdout-write\\n");\nconsole.log("checkpoint after-stdout-write");\n';
    if (id === "http-import")
        return 'import http from "node:http";\nconsole.log("checkpoint after-import");\n';
    if (id === "http-listen")
        return 'import http from "node:http";\nconsole.log("checkpoint after-import");\nconst server = http.createServer((req,res)=>res.end());\nconsole.log("checkpoint after-create");\nserver.listen(0,"127.0.0.1",()=>console.log("checkpoint after-listen"));\n';
    if (id !== "instrumented-reference") throw Error("Unknown probe");
    // Static dependencies evaluate before ALL entry statements, including any
    // marker textually placed above the import. There is no before-import marker.
    return referenceSource
        .replace(
            'import http from "node:http";',
            'import http from "node:http";\nconsole.log("checkpoint after-import");',
        )
        .replace(
            "// A medium JSON",
            'console.log("checkpoint after-process");\n// A medium JSON',
        )
        .replace(
            "const json = JSON.stringify(doc);",
            'const json = JSON.stringify(doc);\nconsole.log("checkpoint after-json");',
        )
        .replace(
            'const bigChunk = "b".repeat(65536);',
            'const bigChunk = "b".repeat(65536);\nconsole.log("checkpoint after-big-string");',
        )
        .replace(
            'server.on("connection",',
            'console.log("checkpoint after-create");\nserver.on("connection",',
        )
        .replace(
            '    console.log("ready " + port);',
            '    console.log("checkpoint after-listen");\n    console.log("ready " + port);',
        );
}

export function snapshotCommand(pid, start, now) {
    const timeoutMs = Math.min(5000, start + 58000 - now);
    if (timeoutMs <= 0) return null;
    return {
        timeoutMs,
        args: [
            "-pvr",
            "-p",
            String(pid),
            "-y",
            "",
            "-c",
            ".echo STARTUP_SNAPSHOT_BEGIN; lm; ~* r; ~* kv; .echo STARTUP_SNAPSHOT_END; qd",
        ],
    };
}

// Only fixed-width Windows addresses are accepted; retain their original spelling.
const address = "(?:[0-9a-f]{8}\x60[0-9a-f]{8}|[0-9a-f]{16}|[0-9a-f]{8})";
const addressValue = (text) => BigInt("0x" + text.replaceAll("`", ""));
const cleanCapture = (t) =>
    t?.code === 0 &&
    !t.reason &&
    !t.error &&
    t.dropped?.stdout === 0 &&
    t.dropped?.stderr === 0;

export function snapshotEvidence(raw, termination, stderr = "") {
    const rawPCs = [],
        moduleBases = [],
        rawStackFrames = [],
        rawThreads = [];
    let valid =
        typeof raw === "string" && raw.length <= 1024 * 1024 && stderr === "";
    const lines = valid ? raw.split(/\r?\n/) : [];
    valid &&=
        lines.length <= 10000 && lines.every((line) => line.length <= 4096);
    const begin = lines.indexOf("STARTUP_SNAPSHOT_BEGIN");
    const end = lines.indexOf("STARTUP_SNAPSHOT_END");
    valid &&=
        begin >= 0 &&
        end > begin &&
        lines.lastIndexOf("STARTUP_SNAPSHOT_BEGIN") === begin &&
        lines.lastIndexOf("STARTUP_SNAPSHOT_END") === end;
    const moduleRow = new RegExp(
        "^(" +
            address +
            ")\\s+(" +
            address +
            ")\\s+([a-z_][a-z0-9_.-]*)(?:[ \\t]+(?:T[ \\t]+)?\\([^()\\r\\n]*\\)(?:[ \\t]+(\\S.*?))?)?[ \\t]*$",
        "i",
    );
    // lm may append an unquoted image path after the symbol annotation.
    // Require a drive-rooted Windows image path; spaces inside names are valid.
    const imagePath =
        /^[a-z]:\\(?:[^<>:"/\\|?*\x00-\x1f]+\\)*[^<>:"/\\|?*\x00-\x1f]+\.(?:dll|exe|sys)$/i;
    const frameRow = new RegExp(
        "^\\s*(?:[0-9a-f]{1,3}\\s+)?(" +
            address +
            ")\\s+(" +
            address +
            ")\\s+(.+)$",
        "i",
    );
    const pcToken = /\brip=([^\s]+)/gi;
    const pcAddress = new RegExp("^" + address + "$", "i");
    let modules = false,
        stack = false;
    let framesInStack = 0,
        threadHasFrames = false;
    if (valid)
        for (const line of lines.slice(begin + 1, end)) {
            if (/^\s*start\s+end\s+module name\s*$/i.test(line)) {
                modules = true;
                stack = false;
                continue;
            }
            if (modules) {
                const row = moduleRow.exec(line);
                if (row) {
                    const [start, end, module, path] = row.slice(1);
                    const lo = addressValue(start),
                        hi = addressValue(end);
                    if (
                        (path &&
                            (!imagePath.test(path) ||
                                path
                                    .slice(3)
                                    .split("\\")
                                    .some(
                                        (part) =>
                                            part.trim() !== part ||
                                            /[. ]$/.test(part),
                                    ))) ||
                        lo === 0n ||
                        hi <= lo ||
                        moduleBases.some(
                            (m) =>
                                lo < addressValue(m.end) &&
                                hi > addressValue(m.start),
                        )
                    )
                        valid = false;
                    else moduleBases.push({ start, end, module });
                    if (moduleBases.length > 256) {
                        valid = false;
                        break;
                    }
                    continue;
                }
                // Only a separator, register output or command prompt can end
                // this lm table. Unknown/malformed rows cannot disappear silently.
                if (
                    line.trim() &&
                    !/^\s*(?:[a-z][a-z0-9]*=|[0-9]+:[0-9]+>)/i.test(line)
                )
                    valid = false;
                modules = false;
            }
            for (const match of line.matchAll(pcToken)) {
                if (!pcAddress.test(match[1]) || addressValue(match[1]) === 0n)
                    valid = false;
                else rawPCs.push(match[1]);
            }
            if (
                /^\s*\.?\s*\d+\s+Id:\s+[0-9a-f]+\.[0-9a-f]+\s+Suspend:/i.test(
                    line,
                )
            ) {
                if (stack && !framesInStack) valid = false;
                if (rawThreads.length && !threadHasFrames) valid = false;
                rawThreads.push(line);
                threadHasFrames = false;
                stack = false;
            } else if (/^\s*Child-SP\s+RetAddr\b/i.test(line)) {
                if (stack && !framesInStack) valid = false;
                stack = true;
                framesInStack = 0;
            } else if (stack) {
                const frame = frameRow.exec(line);
                if (frame) {
                    if (addressValue(frame[1]) === 0n) valid = false;
                    rawStackFrames.push(line);
                    framesInStack++;
                    threadHasFrames = true;
                } else if (line.trim()) {
                    valid = false;
                    stack = false;
                } else {
                    if (!framesInStack) valid = false;
                    stack = false;
                }
            }
            if (
                rawPCs.length > 256 ||
                rawThreads.length > 256 ||
                rawStackFrames.length > 4096
            ) {
                valid = false;
                break;
            }
        }
    if (stack && !framesInStack) valid = false;
    if (rawThreads.length && !threadHasFrames) valid = false;
    if (rawThreads.length && rawThreads.length !== rawPCs.length) valid = false;
    // Missing symbols/timestamp warnings are expected with -y ''. Read/context
    // failures are not. Keep raw logs, including these errors, beside the receipt.
    valid &&=
        !/(?:\berror\b|\bfailed\b|\bunable to (?:read|get|access|query)|\bcannot\b|\bcould not\b|\bcouldn't\b)/i.test(
            raw,
        );
    const relativePCs = rawPCs.map((pc) => {
        const value = addressValue(pc);
        const module = moduleBases.find(
            (m) =>
                value >= addressValue(m.start) && value < addressValue(m.end),
        );
        return {
            pc,
            module: module?.module ?? null,
            offset: module
                ? "0x" + (value - addressValue(module.start)).toString(16)
                : null,
        };
    });
    return {
        status:
            valid &&
            cleanCapture(termination) &&
            rawPCs.length > 0 &&
            moduleBases.length > 0 &&
            rawStackFrames.length > 0 &&
            relativePCs.every((p) => p.module !== null)
                ? "raw-context-and-stack-present-unvalidated"
                : "incomplete",
        rawPCs,
        moduleBases,
        rawStackFrames,
        rawThreads,
        relativePCs,
    };
}

export const inspectionSchedule = {
    samples: [5000, 15000, 20000, 30000, 40000, 50000],
    snapshots: [20000, 40000],
};

// Evidence availability only, never program acceptance. A first request is an
// upper bound on readiness in runTrial's trace clock, not an exact ready time.
// endedAt bounds that clock's origin relative to the inspector's startedAt clock.
export function inspectionCoverage({
    inspection,
    trial,
    client,
    stdout,
    stderr,
    endedAt,
    expectedSha,
} = {}) {
    const errors = [];
    let boundary = null;
    const start = Date.parse(trial?.startedAt),
        finish = Date.parse(endedAt);
    const terminal = trial?.termination;
    let events = [];
    try {
        if (
            typeof client !== "string" ||
            client.length > 1024 * 1024 ||
            !client.endsWith("\n")
        )
            throw Error("incomplete trace");
        const lines = client.trimEnd().split("\n");
        if (lines.length > 1000) throw Error("oversized trace");
        events = lines.map((line) => JSON.parse(line));
        if (
            events.some(
                (e, i) =>
                    !Number.isFinite(e.ms) ||
                    e.ms < 0 ||
                    (i && e.ms < events[i - 1].ms),
            )
        )
            throw Error("trace ordering");
    } catch (error) {
        errors.push(String(error));
        events = [];
    }
    const spawn = events[0],
        last = events.at(-1);
    if (
        !trial ||
        trial.id !== "trial-retained-reference" ||
        trial.fixture !== "reference" ||
        trial.runtime !== "nona" ||
        trial.gc !== "stress" ||
        trial.concurrency !== 1 ||
        trial.state !== "keepalive" ||
        trial.imageHash !== retained.imageHash ||
        trial.sourceHash !== retained.sourceHash ||
        !/^[a-f0-9]{40}$/.test(expectedSha ?? "") ||
        trial.sha !== expectedSha ||
        !Number.isSafeInteger(trial.pid) ||
        trial.pid <= 0 ||
        !Number.isSafeInteger(trial.port) ||
        trial.port < 1 ||
        trial.port > 65535 ||
        trial.status !== "finished" ||
        !Number.isFinite(start) ||
        !Number.isFinite(finish) ||
        trial.limits?.startupMs !== 60000 ||
        trial.limits?.hardMs !== 90000 ||
        trial.limits?.observationMs !== 22000 ||
        !Number.isFinite(trial.elapsedMs) ||
        !terminal ||
        terminal.pid !== trial.pid ||
        terminal.error ||
        terminal.dropped?.stdout !== 0 ||
        terminal.dropped?.stderr !== 0 ||
        spawn?.event !== "spawn" ||
        spawn.pid !== trial.pid ||
        last?.event !== "termination" ||
        last.ms !== trial.elapsedMs ||
        ["pid", "code", "signal", "reason", "error", "elapsedMs"].some(
            (k) => last?.[k] !== terminal?.[k],
        ) ||
        last?.dropped?.stdout !== 0 ||
        last?.dropped?.stderr !== 0 ||
        !Number.isFinite(terminal.elapsedMs) ||
        terminal.elapsedMs > trial.elapsedMs ||
        stderr !== "" ||
        typeof stdout !== "string" ||
        stdout.length > 1024 * 1024
    )
        errors.push(
            "Incomplete/mismatched trial identity or terminal evidence",
        );
    if (
        !inspection ||
        inspection.status !== "finished" ||
        inspection.error ||
        inspection.pid !== trial?.pid ||
        !Array.isArray(inspection.samples) ||
        !Array.isArray(inspection.snapshots)
    )
        errors.push("Incomplete/missing inspection manifest");
    const ready =
        typeof stdout === "string" &&
        stdout.split(/\r?\n/).filter((l) => l === "ready " + trial?.port)
            .length === 1;
    const firstRequest = events.find((e) => e?.event === "request");
    const clockOffsetUpperMs = finish - start - (last?.ms ?? NaN);
    if (!Number.isFinite(clockOffsetUpperMs) || clockOffsetUpperMs < 0)
        errors.push("Unknown trace/start clock alignment");
    if (
        ready &&
        firstRequest?.client === 0 &&
        firstRequest.round === 0 &&
        firstRequest.ms >= (spawn?.ms ?? Infinity) &&
        firstRequest.ms < 60000 &&
        trial?.verdict === "observed-no-fault" &&
        terminal?.reason === "observation-complete" &&
        terminal.code === null &&
        terminal.signal === "SIGKILL" &&
        trial.settings &&
        terminal.elapsedMs >= firstRequest.ms + 22000 &&
        trial.workload?.requests > 0
    ) {
        boundary = {
            kind: "readiness-upper-bound",
            traceMs: firstRequest.ms,
            clockOffsetUpperMs,
            elapsedMs: firstRequest.ms + clockOffsetUpperMs,
        };
    } else if (
        !ready &&
        !firstRequest &&
        trial?.verdict === "startup-timeout" &&
        terminal?.reason === "deadline" &&
        terminal.elapsedMs >= 60000 &&
        trial.workload?.requests === 0
    ) {
        boundary = { kind: "startup-deadline", elapsedMs: 60000 };
    } else
        errors.push("Unknown readiness/starting boundary or cancelled trial");
    function coverage(kind) {
        const captures = Array.isArray(inspection?.[kind])
            ? inspection[kind]
            : [];
        if (
            captures.length > inspectionSchedule[kind].length ||
            captures.some(
                (c) => !c || !inspectionSchedule[kind].includes(c.targetMs),
            )
        )
            errors.push("Unexpected " + kind + " captures");
        return inspectionSchedule[kind].map((targetMs) => {
            const actual = captures.filter((c) => c?.targetMs === targetMs);
            const due = boundary
                ? targetMs < Math.min(boundary.elapsedMs, 58000)
                : null;
            const valid =
                actual.length === 1 &&
                cleanCapture(actual[0].termination) &&
                (kind === "samples"
                    ? actual[0].status === "sampled" &&
                      actual[0].actualElapsedMs >= targetMs &&
                      actual[0].actualElapsedMs < 60000 &&
                      actual[0].data?.pid === trial?.pid &&
                      Number.isFinite(actual[0].data.cpuMs) &&
                      actual[0].data.cpuMs >= 0 &&
                      actual[0].data.workingSetBytes > 0 &&
                      Date.parse(actual[0].data.utc) >= start + targetMs &&
                      Date.parse(actual[0].data.utc) <=
                          start + actual[0].actualElapsedMs
                    : actual[0].status ===
                          "raw-context-and-stack-present-unvalidated" &&
                      actual[0].startElapsedMs >= targetMs &&
                      actual[0].startElapsedMs < 58000 &&
                      actual[0].endElapsedMs >= actual[0].startElapsedMs &&
                      actual[0].endElapsedMs <=
                          actual[0].startElapsedMs + actual[0].timeoutMs &&
                      actual[0].timeoutMs > 0 &&
                      actual[0].timeoutMs <= 5000 &&
                      Date.parse(actual[0].startedAt) ===
                          start + actual[0].startElapsedMs &&
                      Date.parse(actual[0].endedAt) ===
                          start + actual[0].endElapsedMs &&
                      Date.parse(actual[0].endedAt) <= finish &&
                      actual[0].args?.[0] === "-pvr" &&
                      actual[0].args?.[1] === "-p" &&
                      actual[0].args?.[2] === String(trial?.pid) &&
                      actual[0].rawStackFrames?.length > 0);
            const status =
                due === null
                    ? "unknown"
                    : actual.length
                      ? valid
                          ? "captured"
                          : "incomplete"
                      : due
                        ? "missing-due"
                        : "not-due";
            if (
                status === "unknown" ||
                status === "incomplete" ||
                status === "missing-due"
            )
                errors.push(kind + " " + targetMs + ": " + status);
            return { targetMs, due, status, actual };
        });
    }
    const samples = coverage("samples"),
        snapshots = coverage("snapshots");
    return {
        complete: errors.length === 0,
        boundary,
        samples,
        snapshots,
        errors,
    };
}

// Used by the hosted inspector and exercised ONLY with a tiny Node fake child
// locally. supervise owns the direct child and writes partial streams on arrival.
export async function captureText(command, args, options) {
    const process = supervise(command, args, {
        ...options,
        env: startupChildEnv(options.env),
    });
    options.onStart?.(process.child.pid);
    return process.done;
}
