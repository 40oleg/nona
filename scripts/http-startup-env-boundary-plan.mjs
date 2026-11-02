// Six fixed-order diagnostic conditions; no compiler, network or child execution.
import { isDeepStrictEqual as equal } from "node:util";
import { startupChildEnv } from "./http-startup-env.mjs";
import { retained } from "./http-startup-plan.mjs";
export const driverPin = "8fdac26b6460227deb8cd87e109d10f4f4b01680";
export const algorithm = "env602-utf16-v1";
export const campaignMs = 1200000;
export const receiptPath = "work/http-startup/env-boundary-provenance.json";
const trusted = {
    DIAG_LISTENERS: "original",
    DIAG_STATE: "keepalive",
    DIAG_CHUNK_BYTES: "65536",
    DIAG_CHUNKS: "16",
};

export function envAllowed(e, head, platform, arch, version) {
    return (
        e.GITHUB_ACTIONS === "true" &&
        e.GITHUB_REPOSITORY === "40oleg/nona" &&
        e.GITHUB_EVENT_NAME === "workflow_dispatch" &&
        e.STARTUP_MODE === "env-602" &&
        /^refs\/heads\/issue-602-startup-[a-zA-Z0-9._-]+$/.test(
            e.GITHUB_REF ?? "",
        ) &&
        /^[a-f0-9]{40}$/.test(head ?? "") &&
        head === e.GITHUB_SHA &&
        head === e.STARTUP_EXPECTED_SHA &&
        head === e.GITHUB_WORKFLOW_SHA &&
        e.GITHUB_WORKFLOW_REF ===
            `40oleg/nona/.github/workflows/native-platforms.yml@${e.GITHUB_REF}` &&
        e.RUNNER_ENVIRONMENT === "github-hosted" &&
        e.RUNNER_OS === "Windows" &&
        [e.GITHUB_RUN_ID, e.GITHUB_RUN_ATTEMPT].every((v) =>
            /^[1-9][0-9]*$/.test(v ?? ""),
        ) &&
        [e.RUNNER_NAME, e.ImageOS, e.ImageVersion].every(
            (v) => typeof v === "string" && v.length > 0,
        ) &&
        platform === "win32" &&
        arch === "x64" &&
        version === "v26.9.0"
    );
}

export function blockMetrics(env) {
    const seen = new Set();
    let units = 1; // Final block NUL; each entry includes '=' and entry NUL.
    for (const [key, value] of Object.entries(env)) {
        const canonical = key.toUpperCase();
        if (
            !/^[\x21-\x7e]+$/.test(key) ||
            key.includes("=") ||
            seen.has(canonical) ||
            typeof value !== "string" ||
            value.includes("\0")
        )
            throw Error("Invalid environment entry/case alias");
        seen.add(canonical);
        units += key.length + 1 + value.length + 1; // JS UTF16 units, including surrogate pairs.
    }
    return { keys: seen.size, units };
}
export const baseEnvironment = (parent) => startupChildEnv(parent, trusted);

export function conditions(parent, target) {
    if (Object.keys(parent).some((k) => /^NONA_ENV602_/i.test(k)))
        throw Error("Padding collision");
    const base = baseEnvironment(parent),
        b = blockMetrics(base);
    if (
        !target ||
        ![target.keys, target.units].every(
            (v) => Number.isSafeInteger(v) && v > 0,
        )
    )
        throw Error("Missing/invalid parent aggregate metrics");
    const count = target.keys - b.keys,
        units = target.units - b.units;
    if (
        count <= 1 ||
        count > 256 ||
        units <= 0 ||
        target.units > 32767 ||
        b.units > 32767
    )
        throw Error("Impossible/capped environment pressure");
    const padded = (id, n) => {
        const env = { ...base };
        const names = Array.from(
            { length: n },
            (_, i) => `NONA_ENV602_${String(i).padStart(3, "0")}`,
        );
        if (
            names.some((k) =>
                Object.keys(base).some((b) => b.toUpperCase() === k),
            )
        )
            throw Error("Padding collision");
        const headroom =
            units - names.reduce((sum, k) => sum + k.length + 2, 0);
        if (headroom < 0) throw Error("Impossible padding headroom");
        names.forEach((k, i) => {
            env[k] = "x".repeat(i === 0 ? headroom : 0);
        });
        const metrics = blockMetrics(env);
        if (metrics.units !== target.units || metrics.keys !== b.keys + n)
            throw Error("Padding metric mismatch");
        return { id, env, metrics };
    };
    return [
        { id: "base", env: base, metrics: b },
        padded("many", count),
        padded("few", 1),
    ];
}

export function envPlan() {
    return ["base", "many", "few"].flatMap((condition) =>
        ["node", "nona"].map((runtime) => ({
            id: `${condition}-${runtime}`,
            condition,
            runtime,
            gc: runtime === "nona" ? "stress" : "n/a",
            fixture: "reference",
            listeners: "original",
            state: "keepalive",
            concurrency: 32,
            chunkBytes: 65536,
            chunks: 16,
        })),
    );
}

// Strong raw oracle supplements runTrial's coarse verdict. No hypothesis-match acceptance.
export function trialEvidence(spec, row, raw, command, args) {
    const errors = [];
    const timing = {
        readyUpperBoundMs: null,
        firstRequestMs: null,
        lastResponseMs: null,
        terminationMs: null,
    };
    const check = (ok, why) => {
        if (!ok) errors.push(why);
    };
    try {
        for (const [key, value] of Object.entries(spec))
            check(equal(row[key], value), `Changed trial ${key}`);
        check(
            equal(JSON.parse(raw.trial), row),
            "Missing/inconsistent raw trial",
        );
        const t = row.termination;
        check(
            equal(JSON.parse(raw.termination), t),
            "Missing/inconsistent termination",
        );
        check(
            row.status === "finished" &&
                row.verdict === "observed-no-fault" &&
                !row.driverError &&
                t.code === null &&
                t.signal === "SIGKILL" &&
                t.reason === "observation-complete" &&
                t.error === null &&
                t.hex === null &&
                t.dropped?.stdout === 0 &&
                t.dropped?.stderr === 0 &&
                raw.stderr === "" &&
                Number.isSafeInteger(row.pid) &&
                row.pid > 0 &&
                t.pid === row.pid &&
                Number.isInteger(row.port) &&
                row.port > 0 &&
                row.port <= 65535,
            "Fault/timeout/stderr/dropped output or process identity",
        );
        check(
            equal(row.limits, {
                startupMs: 60000,
                hardMs: 90000,
                observationMs: 22000,
                rounds: 4,
            }) &&
                Number.isFinite(row.elapsedMs) &&
                row.elapsedMs >= 22000 &&
                row.elapsedMs < 90000 &&
                Number.isFinite(t.elapsedMs) &&
                t.elapsedMs >= 22000 &&
                t.elapsedMs < 90000 &&
                Math.abs(row.elapsedMs - t.elapsedMs) < 1000 &&
                Number.isFinite(Date.parse(row.startedAt)) &&
                row.timeoutWindowCovered === true,
            "Missing/changed timing or observation",
        );
        check(
            row.sourceHash === retained.sourceHash &&
                row.imageHash === raw.expectedImageHash,
            "Source/image identity",
        );
        check(
            raw.expectedDriver &&
                /^[a-f0-9]{40}$/.test(raw.expectedDriver.sha) &&
                /^[a-f0-9]{40}$/.test(raw.expectedDriver.tree) &&
                Object.entries(raw.expectedDriver).every(([k, v]) =>
                    equal(row[k], v),
                ),
            "Driver/producer identity",
        );
        check(
            equal(row.workload, {
                requests: 128,
                completed: 128,
                wrongOutput: 0,
                errors: 0,
                hangs: 0,
            }),
            "Incomplete workload",
        );
        const lines = (text) => {
            if (typeof text !== "string" || !text.endsWith("\n"))
                throw Error("Missing/truncated raw stream");
            return text.slice(0, -1).split("\n");
        };
        const stdout = lines(raw.stdout),
            events = lines(raw.client).map(JSON.parse);
        check(
            stdout.length === 2 &&
                stdout.filter((s) => s === `ready ${row.port}`).length === 1 &&
                stdout.filter((s) => s.startsWith("diagnostic ")).length ===
                    1 &&
                equal(
                    JSON.parse(
                        stdout
                            .find((s) => s.startsWith("diagnostic "))
                            .slice(11),
                    ),
                    row.settings,
                ),
            "Settings/ready evidence",
        );
        const settings = row.settings;
        check(
            settings?.event === "settings" &&
                [
                    "keepAliveTimeout",
                    "timeout",
                    "requestTimeout",
                    "headersTimeout",
                ].every(
                    (k) =>
                        typeof settings[k] === "string" &&
                        /^\d+$/.test(settings[k]),
                ) &&
                typeof settings.keepAliveTimeoutBuffer === "string" &&
                /^(undefined|\d+)$/.test(settings.keepAliveTimeoutBuffer),
            "Missing/malformed settings",
        );
        const window =
            Number(settings.keepAliveTimeout) +
            (settings.keepAliveTimeoutBuffer === "undefined"
                ? 0
                : Number(settings.keepAliveTimeoutBuffer)) +
            1500;
        check(
            Number.isFinite(window) && window <= 22000,
            "Observation shorter than settings",
        );
        const first = events[0],
            last = events.at(-1);
        check(
            first.event === "spawn" &&
                first.pid === row.pid &&
                first.command === command &&
                equal(first.args, args),
            "Spawn identity",
        );
        const { ms, event, ...ended } = last;
        check(
            event === "termination" &&
                equal(ended, t) &&
                Math.abs(ms - t.elapsedMs) < 1000,
            "Termination lifecycle",
        );
        check(
            events.every(
                (e, i) =>
                    Number.isFinite(e.ms) &&
                    e.ms >= 0 &&
                    (i === 0 || e.ms >= events[i - 1].ms),
            ) && !events.some((e) => /error|timeout/.test(e.event)),
            "Client timing/error",
        );
        const requests = events.filter((e) => e.event === "request"),
            responses = events.filter((e) => e.event === "response");
        Object.assign(timing, {
            readyUpperBoundMs: requests[0]?.ms ?? null,
            firstRequestMs: requests[0]?.ms ?? null,
            lastResponseMs: responses.at(-1)?.ms ?? null,
            terminationMs: last.ms,
        });
        check(
            requests.length === 128 &&
                responses.length === 128 &&
                requests[0]?.ms < 60000 &&
                last.ms - requests[0]?.ms >= 22000 &&
                last.ms < 90000,
            "Full ready/startup/observation window",
        );
        const sockets = events.filter((e) => e.event === "client-socket"),
            closes = events.filter((e) => e.event === "client-close");
        check(
            sockets.length === 32 &&
                closes.length === 32 &&
                new Set(sockets.map((e) => e.socket)).size === 32,
            "Socket lifecycle count",
        );
        check(
            events.length === 2 + 128 * 2 + 32 * 2,
            "Unexpected/missing lifecycle entries",
        );
        for (let client = 0; client < 32; client++) {
            const lifecycle = events.filter((e) => e.client === client);
            check(
                equal(
                    lifecycle.map((e) => e.event),
                    [
                        "request",
                        "client-socket",
                        "response",
                        "request",
                        "response",
                        "request",
                        "response",
                        "request",
                        "response",
                        "client-close",
                    ],
                ),
                "Client lifecycle order",
            );
            const opened = sockets.filter((e) => e.client === client),
                closed = closes.filter((e) => e.client === client);
            check(
                opened.length === 1 &&
                    closed.length === 1 &&
                    opened[0].socket === closed[0].socket &&
                    closed[0].hadError === false,
                "Client socket identity/close",
            );
            for (let round = 0; round < 4; round++) {
                const req = requests.filter(
                        (e) => e.client === client && e.round === round,
                    ),
                    res = responses.filter(
                        (e) => e.client === client && e.round === round,
                    );
                check(
                    req.length === 1 &&
                        res.length === 1 &&
                        res[0].ms >= req[0].ms &&
                        res[0].valid === true &&
                        res[0].status === 200 &&
                        res[0].bytes === 1048576 &&
                        res[0].headers?.["transfer-encoding"] === "chunked" &&
                        res[0].reused === round > 0,
                    "Wrong/missing response",
                );
            }
        }
    } catch (error) {
        errors.push(error.message);
    }
    return { passed: errors.length === 0, errors, timing };
}

export function completedEvidence(results) {
    const planned = envPlan();
    return (
        results.length === 6 &&
        results.every(
            (r, i) =>
                r.id === planned[i].id &&
                r.condition === planned[i].condition &&
                r.rawVerdict === "observed-no-fault" &&
                Object.entries(planned[i]).every(([key, value]) =>
                    equal(r.trial?.[key], value),
                ) &&
                r.status === "finished" &&
                r.evidence?.passed === true,
        )
    );
}
