// Pure, fail-closed scenario acceptance. Never changes classifyTermination.
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { trialMatrix } from "./http-crash-plan.mjs";
import { referenceBlob } from "./http-crash-fixture.mjs";

const sha = (text) => createHash("sha256").update(text).digest("hex");
const equal = isDeepStrictEqual;
const scenarioKeys = [
    "fixture",
    "listeners",
    "concurrency",
    "state",
    "route",
    "chunkBytes",
    "chunks",
    "sourceHash",
    "sha",
    "workflowRun",
    "nodeVersion",
];
const parse = (text) => {
    if (typeof text !== "string" || !text.endsWith("\n"))
        throw Error("Missing/truncated evidence");
    return JSON.parse(text);
};
const lines = (text) => {
    if (typeof text !== "string" || !text.endsWith("\n"))
        throw Error("Missing/truncated log");
    return text.slice(0, -1).split("\n");
};

export function acceptanceFiles(directory, matrix) {
    const files = {};
    const names = [
        "reference.mjs",
        "controlled.mjs",
        "controlled-off/build/termination.json",
    ];
    for (const row of matrix.results) {
        if (!/^trial-[0-9]+$/.test(row.id)) continue;
        for (const name of [
            "trial.json",
            "termination.json",
            "stdout.log",
            "stderr.log",
            "client.jsonl",
        ])
            names.push(`${row.id}/${name}`);
    }
    for (const name of names) {
        try {
            files[name] = readFileSync(join(directory, name), "utf8");
        } catch {
            /* incomplete */
        }
    }
    return files;
}

function ordinary(row, files, provenance) {
    const raw = parse(files[`${row.id}/trial.json`]);
    const termination = parse(files[`${row.id}/termination.json`]);
    const t = row.termination;
    if (
        !equal(raw, row) ||
        !equal(termination, t) ||
        provenance?.verified !== true ||
        provenance.errors?.length !== 0 ||
        provenance.repository !== "40oleg/nona" ||
        provenance.checkout?.head !== row.sha ||
        provenance.checkout.expectedHead !== row.sha ||
        provenance.workflow?.runId !== row.workflowRun ||
        provenance.runner?.environment !== "github-hosted" ||
        provenance.dependency?.commit !==
            "47193961f3bf9b69c0177d5522de3db1069447df" ||
        provenance.dependency.isAncestor !== true ||
        row.status !== "finished" ||
        row.driverError ||
        !row.settings ||
        row.timeoutWindowCovered !== true ||
        row.pid !== t?.pid ||
        t.code !== null ||
        t.signal !== "SIGKILL" ||
        t.reason !== "observation-complete" ||
        t.error !== null ||
        t.hex !== null ||
        t.dropped?.stdout !== 0 ||
        t.dropped?.stderr !== 0 ||
        !(
            t.elapsedMs >= row.limits?.observationMs &&
            t.elapsedMs < row.limits.hardMs
        ) ||
        files[`${row.id}/stderr.log`] !== "" ||
        !/^[a-f0-9]{64}$/.test(row.imageHash ?? "") ||
        !/^[a-f0-9]{64}$/.test(row.sourceHash ?? "") ||
        sha(files[`${row.fixture}.mjs`] ?? "") !== row.sourceHash
    )
        throw Error("Incomplete or inconsistent ordinary observation");
    const client = lines(files[`${row.id}/client.jsonl`]).map(JSON.parse);
    if (
        !client.length ||
        client[0].event !== "spawn" ||
        client[0].pid !== row.pid ||
        client.at(-1).event !== "termination" ||
        client.some(
            (e, i) =>
                !Number.isFinite(e.ms) ||
                e.ms < 0 ||
                (i > 0 && e.ms < client[i - 1].ms),
        )
    )
        throw Error("Incomplete client stream");
    const { ms, event, ...ended } = client.at(-1);
    if (!equal(ended, t)) throw Error("Client termination disagrees");
    return client;
}

function destroyEvidence(row, files, provenance) {
    const client = ordinary(row, files, provenance);
    const n = row.concurrency;
    if (
        row.verdict !== "client-error" ||
        row.fixture !== "controlled" ||
        !["original", "none"].includes(row.listeners) ||
        row.state !== "destroy-queued" ||
        row.route !== "/big" ||
        ![1, 4, 32].includes(n) ||
        row.limits.rounds !== 1 ||
        !equal(row.workload, {
            requests: n,
            completed: 0,
            wrongOutput: 0,
            errors: n,
            hangs: 0,
        })
    )
        throw Error("Not the evidenced deliberate-destroy scenario");
    if (row.runtime === "nona") {
        if (row.gc !== "off") throw Error("No stressed matching evidence yet");
        const build = parse(files["controlled-off/build/termination.json"]);
        if (
            build.code !== 0 ||
            build.signal !== null ||
            build.error !== null ||
            build.reason !== null ||
            build.dropped?.stdout !== 0 ||
            build.dropped?.stderr !== 0
        )
            throw Error("Missing successful compiler receipt");
    } else if (row.runtime !== "node" || row.gc !== "n/a")
        throw Error("Not a Node control");
    if (
        client.length !== 2 + n * 4 ||
        client[0].event !== "spawn" ||
        client[0].pid !== row.pid ||
        client.at(-1).event !== "termination"
    )
        throw Error("Incomplete client lifecycle");
    const { ms, event, ...clientTermination } = client.at(-1);
    if (!equal(clientTermination, row.termination))
        throw Error("Termination disagreement");
    const clientSockets = new Set();
    for (let i = 0; i < n; i++) {
        const events = client.slice(1, -1).filter((e) => e.client === i);
        if (
            events.length !== 4 ||
            events.filter((e) => e.event === "request" && e.round === 0)
                .length !== 1 ||
            events.filter((e) => e.event === "client-socket").length !== 1 ||
            events.filter(
                (e) => e.event === "client-close" && e.hadError === false,
            ).length !== 1 ||
            events.filter(
                (e) =>
                    e.event === "request-error" &&
                    e.round === 0 &&
                    e.name === "Error" &&
                    e.code === "ECONNRESET" &&
                    e.message === "socket hang up",
            ).length !== 1
        )
            throw Error("Unexpected error kind/cardinality or missing close");
        const assigned = events.find((e) => e.event === "client-socket").socket;
        const closed = events.find((e) => e.event === "client-close").socket;
        if (
            !Number.isInteger(assigned) ||
            assigned < 1 ||
            assigned !== closed ||
            clientSockets.has(assigned) ||
            !equal(
                events.map((e) => e.event),
                ["request", "client-socket", "request-error", "client-close"],
            )
        )
            throw Error("Client socket identity/order mismatch");
        clientSockets.add(assigned);
    }
    const stdout = lines(files[`${row.id}/stdout.log`]);
    const ready = stdout.filter((s) => s === `ready ${row.port}`);
    const events = stdout
        .filter((s) => s.startsWith("diagnostic "))
        .map((s) => JSON.parse(s.slice(11)));
    if (
        ready.length !== 1 ||
        events.filter((e) => e.event === "settings").length !== 1 ||
        stdout.length !== events.length + 1 ||
        !equal(
            events.find((e) => e.event === "settings"),
            row.settings,
        )
    )
        throw Error("Bad server preamble");
    const states = events.filter((e) => e.event !== "settings");
    if (
        states.length >= 2048 ||
        states.some((e, i) => e.sequence !== i + 1 || !Number.isFinite(e.ms))
    )
        throw Error("Dropped/truncated state evidence");
    const sockets = new Set(states.map((e) => e.socket));
    if (sockets.size !== n) throw Error("Connection cardinality mismatch");
    for (const socket of sockets) {
        const trace = states.filter((e) => e.socket === socket);
        if (
            !Number.isInteger(socket) ||
            socket < 1 ||
            !equal(
                trace.slice(0, 4).map((e) => e.event),
                ["connection", "request", "queued", "destroy"],
            ) ||
            trace
                .slice(2, 4)
                .some(
                    (e) =>
                        e.ended !== false ||
                        e.destroyed !== false ||
                        !(e.responseQueued > 0 || e.socketQueued > 0),
                ) ||
            trace.filter((e) => e.event === "socket-close").length !==
                (row.listeners === "original" ? 1 : 0) ||
            trace.filter((e) => e.event === "request-error").length !==
                (row.runtime === "node" && row.listeners === "original"
                    ? 1
                    : 0) ||
            trace
                .slice(4)
                .some(
                    (e) =>
                        !(e.event === "socket-close" && e.destroyed === true) &&
                        !(
                            e.event === "request-error" &&
                            e.destroyed === true &&
                            e.error?.code === "ECONNRESET" &&
                            e.error?.message === "aborted"
                        ),
                )
        )
            throw Error("Missing explicit queued-before-end destruction trace");
    }
    return true;
}

export function diagnosticAcceptance(matrix, files, provenance) {
    const canonical = trialMatrix();
    const results = Array.isArray(matrix?.results) ? matrix.results : [];
    const matchesPlan = (row, plan) =>
        row &&
        plan &&
        Object.entries(plan).every(([key, value]) => equal(value, row[key]));
    const rows = results.map((row) => {
        let acceptance = "incomplete";
        try {
            const plan = canonical.find((p) => p.id === row?.id);
            if (!matchesPlan(row, plan))
                throw Error("Trial differs from its plan");
            if (row.verdict === "client-error") {
                destroyEvidence(row, files, provenance);
                const matches = results.filter(
                    (other) =>
                        matchesPlan(
                            other,
                            canonical.find((p) => p.id === other?.id),
                        ) &&
                        other.runtime !== row.runtime &&
                        scenarioKeys.every((key) =>
                            equal(row[key], other[key]),
                        ) &&
                        ((other.runtime === "node" && other.gc === "n/a") ||
                            (other.runtime === "nona" && other.gc === "off")),
                );
                if (matches.length !== 1)
                    throw Error("No unique matching control");
                destroyEvidence(matches[0], files, provenance);
                acceptance = "intended-destroy";
            } else if (row.verdict === "observed-no-fault") {
                const events = ordinary(row, files, provenance);
                if (
                    row.workload.errors ||
                    row.workload.hangs ||
                    row.workload.wrongOutput
                )
                    throw Error("Counts disagree with clean verdict");
                const n = row.concurrency;
                if (row.state === "queued-timeout") {
                    if (
                        row.workload.requests !== n ||
                        events.filter((e) => e.event === "paused-peer")
                            .length !== n
                    )
                        throw Error("Missing paused peer evidence");
                } else {
                    const expected = n * row.limits.rounds;
                    const responses = events.filter(
                        (e) => e.event === "response",
                    );
                    if (
                        row.workload.requests !== expected ||
                        row.workload.completed !== expected ||
                        responses.length !== expected ||
                        responses.some(
                            (e) =>
                                e.valid !== true ||
                                e.status !== 200 ||
                                e.bytes !== row.chunkBytes * row.chunks,
                        )
                    )
                        throw Error("Missing/wrong response evidence");
                }
                if (events.some((e) => /error|timeout/.test(e.event)))
                    throw Error("Unexpected client error/timeout");
                // The reference has only settings+ready. Controlled traces must
                // be complete, sequential and below their retention cap.
                const stdout = lines(files[`${row.id}/stdout.log`]);
                const diagnostics = stdout
                    .filter((s) => s.startsWith("diagnostic "))
                    .map((s) => JSON.parse(s.slice(11)));
                const states = diagnostics.filter(
                    (e) => e.event !== "settings",
                );
                if (
                    stdout.filter((s) => s === `ready ${row.port}`).length !==
                        1 ||
                    stdout.length !== diagnostics.length + 1 ||
                    states.length >= 2048 ||
                    states.some((e, i) => e.sequence !== i + 1) ||
                    !equal(
                        diagnostics.find((e) => e.event === "settings"),
                        row.settings,
                    )
                )
                    throw Error("Incomplete server evidence");
                acceptance = "observed-no-fault";
            } else acceptance = "failing";
        } catch {
            /* Missing/corrupt raw evidence cannot earn acceptance. */
        }
        return { id: row?.id, rawVerdict: row?.verdict, acceptance };
    });
    const metadata = matrix?.metadata;
    const validMetadata =
        provenance?.verified === true &&
        provenance.errors?.length === 0 &&
        provenance.repository === "40oleg/nona" &&
        /^[a-f0-9]{40}$/.test(metadata?.sha ?? "") &&
        metadata.sha === provenance.checkout?.head &&
        metadata.sha === provenance.checkout?.expectedHead &&
        metadata.workflowRun === provenance.workflow?.runId &&
        /^[0-9]+$/.test(metadata.workflowRun ?? "") &&
        /^v26\.\d+\.\d+$/.test(metadata.nodeVersion ?? "") &&
        metadata.os === "win32" &&
        metadata.arch === "x64" &&
        metadata.runnerEnvironment === "github-hosted" &&
        metadata.runnerEnvironment === provenance.runner?.environment &&
        metadata.runnerName === provenance.runner?.name &&
        metadata.referenceBlob === referenceBlob &&
        ["runnerName", "runnerImage", "runnerImageVersion", "symbols"].every(
            (key) =>
                typeof metadata[key] === "string" && metadata[key].length > 0,
        ) &&
        results.every(
            (row) =>
                row &&
                Object.entries(metadata).every(([key, value]) =>
                    equal(row[key], value),
                ),
        );
    return {
        accepted:
            validMetadata &&
            matrix.interrupted === false &&
            matrix.completed === canonical.length &&
            equal(matrix.planned, canonical) &&
            results.length === canonical.length &&
            canonical.every((plan, index) =>
                matchesPlan(results[index], plan),
            ) &&
            equal(
                matrix.counts,
                results.reduce((out, row) => {
                    out[row.verdict] = (out[row.verdict] ?? 0) + 1;
                    return out;
                }, {}),
            ) &&
            rows.every((row) =>
                ["observed-no-fault", "intended-destroy"].includes(
                    row.acceptance,
                ),
            ),
        productFix: false,
        rows,
    };
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
    const directory = resolve(process.argv[2] ?? "work/http-crash");
    const matrix = JSON.parse(
        readFileSync(join(directory, "matrix.json"), "utf8"),
    );
    const provenance = JSON.parse(
        readFileSync(join(directory, "provenance.json"), "utf8"),
    );
    const result = diagnosticAcceptance(
        matrix,
        acceptanceFiles(directory, matrix),
        provenance,
    );
    writeFileSync(
        join(directory, "acceptance.json"),
        JSON.stringify(result, null, 2) + "\n",
    );
    if (!result.accepted) process.exitCode = 1;
}
