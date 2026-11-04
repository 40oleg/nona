// Separate current-candidate diagnostic; historical 57-trial verdicts are immutable.
import { isDeepStrictEqual as equal } from "node:util";

export const sourceCommit = "ab5ea083d793e0a665fde8b0a4b33bc1fa67208e";
export const driverSha256 =
    "31be9600805b228135b665969320e4554c6f95236e6bb85f55f8116b2678f47d";
export const serverSha256 =
    "3bae7410ac2d9afcb9a9e1431919a2aa5b5ca352db578769810a24f0ac718f60";

export function currentAllowed(e, head, platform, arch, version) {
    return (
        e.GITHUB_ACTIONS === "true" &&
        e.GITHUB_REPOSITORY === "40oleg/nona" &&
        e.GITHUB_EVENT_NAME === "workflow_dispatch" &&
        e.HTTP602_MODE === "http602-current" &&
        /^refs\/heads\/issue-602-startup-[a-zA-Z0-9._-]+$/.test(
            e.GITHUB_REF ?? "",
        ) &&
        /^[a-f0-9]{40}$/.test(head ?? "") &&
        head === e.GITHUB_SHA &&
        head === e.HTTP602_EXPECTED_SHA &&
        head === e.GITHUB_WORKFLOW_SHA &&
        e.GITHUB_WORKFLOW_REF ===
            `40oleg/nona/.github/workflows/native-platforms.yml@${e.GITHUB_REF}` &&
        e.RUNNER_ENVIRONMENT === "github-hosted" &&
        e.RUNNER_OS === "Windows" &&
        e.ImageOS === "win25" &&
        [e.GITHUB_RUN_ID, e.GITHUB_RUN_ATTEMPT].every((v) =>
            /^[1-9][0-9]*$/.test(v ?? ""),
        ) &&
        [e.RUNNER_NAME, e.ImageVersion].every(
            (v) => typeof v === "string" && v.length > 0,
        ) &&
        platform === "win32" &&
        arch === "x64" &&
        version === "v26.9.0"
    );
}

export function projectionPlan() {
    return ["queued-timeout", "destroy-queued"].flatMap((state) =>
        [
            ["node", "n/a"],
            ["nona", "off"],
            ["nona", "stress"],
        ].map(([runtime, gc]) => ({
            id: `current-${state}-${runtime === "node" ? "node" : `native-${gc}`}`,
            fixture: "controlled",
            route: "/big",
            listeners: "original",
            concurrency: 1,
            chunkBytes: 65536,
            chunks: 16,
            state,
            runtime,
            gc,
        })),
    );
}

const ensure = (condition, reason) => {
    if (!condition) throw Error(reason);
};
const parse = (text) => {
    ensure(
        typeof text === "string" && text.endsWith("\n"),
        "Missing/truncated receipt",
    );
    return JSON.parse(text);
};
const lines = (text) => {
    ensure(
        typeof text === "string" && text.endsWith("\n"),
        "Missing/truncated stream",
    );
    return text.slice(0, -1).split(/\r?\n/);
};
const positiveQueue = (event) =>
    [event.socketQueued, event.responseQueued].some(
        (v) => Number.isFinite(v) && v > 0,
    );

// Read actual unmodified runTrial output. No error exception based on GC mode.
export function projectionAcceptance(spec, row, raw) {
    let queueObserved = false;
    try {
        const planned = projectionPlan().find((p) => p.id === spec.id);
        ensure(equal(spec, planned), "Not a fixed current projection");
        for (const [key, value] of Object.entries(spec))
            ensure(equal(row[key], value), `Wrong projected ${key}`);
        const t = row.termination;
        ensure(
            equal(parse(raw.trial), row) && equal(parse(raw.termination), t),
            "Raw/report disagreement",
        );
        ensure(
            row.status === "finished" &&
                !row.driverError &&
                row.timeoutWindowCovered === true,
            "Incomplete observation",
        );
        ensure(
            row.pid === t?.pid &&
                Number.isInteger(row.pid) &&
                row.pid > 0 &&
                t.code === null &&
                t.hex === null &&
                t.signal === "SIGKILL" &&
                t.reason === "observation-complete" &&
                t.error === null &&
                equal(t.dropped, { stdout: 0, stderr: 0 }) &&
                t.elapsedMs >= row.limits?.observationMs &&
                t.elapsedMs < row.limits.hardMs &&
                row.limits.startupMs === 60000 &&
                row.limits.hardMs === 90000 &&
                row.limits.observationMs >= 8500 &&
                row.limits.observationMs <= 15000 &&
                row.limits.rounds === 1 &&
                raw.stderr === "",
            "Fault, timeout, truncation or incomplete cleanup",
        );
        const w = row.workload;
        const destroying = spec.state === "destroy-queued";
        ensure(
            equal(w, {
                requests: 1,
                completed: 0,
                wrongOutput: 0,
                errors: destroying ? 1 : 0,
                hangs: 0,
            }),
            "Wrong body/accounting/error cardinality",
        );
        ensure(
            row.verdict === (destroying ? "client-error" : "observed-no-fault"),
            "Unexpected raw verdict",
        );
        const output = lines(raw.stdout);
        const events = output
            .filter((s) => s.startsWith("diagnostic "))
            .map((s) => JSON.parse(s.slice(11)));
        ensure(
            output.filter((s) => s === `ready ${row.port}`).length === 1 &&
                output.length === events.length + 1 &&
                events.filter((e) => e.event === "settings").length === 1 &&
                equal(
                    events.find((e) => e.event === "settings"),
                    row.settings,
                ),
            "Incomplete server preamble",
        );
        const settings = row.settings;
        ensure(
            [
                "keepAliveTimeout",
                "keepAliveTimeoutBuffer",
                "timeout",
                "requestTimeout",
                "headersTimeout",
            ].every(
                (k) =>
                    typeof settings[k] === "string" &&
                    /^\d+$/.test(settings[k]),
            ) &&
                Number(settings.keepAliveTimeout) > 0 &&
                settings.timeout === "0" &&
                row.limits.observationMs >=
                    Number(settings.keepAliveTimeout) +
                        Number(settings.keepAliveTimeoutBuffer) +
                        1500,
            "Settings/timeout coverage disagreement",
        );
        const states = events.filter((e) => e.event !== "settings");
        ensure(
            states.length >= 5 &&
                states.length < 2048 &&
                states.every(
                    (e, i) =>
                        e.socket === 1 &&
                        e.sequence === i + 1 &&
                        Number.isFinite(e.ms) &&
                        e.ms >= 0 &&
                        (i === 0 || e.ms >= states[i - 1].ms),
                ),
            "Invalid/truncated socket trace",
        );
        ensure(
            equal(
                states.slice(0, 4).map((e) => e.event),
                [
                    "connection",
                    "request",
                    "queued",
                    destroying ? "destroy" : "end",
                ],
            ),
            "Missing controlled transition",
        );
        queueObserved = positiveQueue(states[2]);
        ensure(
            queueObserved &&
                states[2].destroyed === false &&
                states[2].ended === false,
            "No actual queued output",
        );
        const closes = states.filter((e) => e.event === "socket-close");
        ensure(
            closes.length === 1 &&
                closes[0].destroyed === true &&
                closes[0].ms < row.limits.observationMs,
            "Missing/mismatched/late server closure",
        );
        const close = closes[0];
        ensure(
            destroying
                ? positiveQueue(states[3]) &&
                      states[3].destroyed === false &&
                      states[3].ended === false
                : states[3].ended === true &&
                      states[3].timeout === 1000 &&
                      close.ms >= states[3].ms + states[3].timeout &&
                      ["socket.timeout", "socket._timeout"].includes(
                          states[3].timeoutSource,
                      ) &&
                      positiveQueue(close),
            "Pending output at close not established",
        );
        const serverErrors = states
            .slice(4)
            .filter((e) => e.event !== "socket-close");
        ensure(
            serverErrors.length ===
                (destroying && spec.runtime === "node" ? 1 : 0) &&
                serverErrors.every(
                    (e) =>
                        e.event === "request-error" &&
                        e.destroyed === true &&
                        e.error?.code === "ECONNRESET" &&
                        e.error.message === "aborted",
                ),
            "Unexplained server error",
        );
        const client = lines(raw.client).map(JSON.parse);
        ensure(
            client.every(
                (e, i) =>
                    Number.isFinite(e.ms) &&
                    e.ms >= 0 &&
                    (i === 0 || e.ms >= client[i - 1].ms),
            ),
            "Invalid client timeline",
        );
        ensure(
            client[0]?.event === "spawn" &&
                client[0].pid === row.pid &&
                client.at(-1)?.event === "termination",
            "Missing client lifecycle",
        );
        const { event, ms, ...ended } = client.at(-1);
        ensure(equal(ended, t), "Client termination disagreement");
        const lifecycle = client.slice(1, -1);
        // queued-timeout assigns its client socket before connect's paused-peer callback.
        const expected = destroying
            ? ["request", "client-socket", "request-error", "client-close"]
            : ["client-socket", "paused-peer", "client-close"];
        ensure(
            equal(
                lifecycle.map((e) => e.event),
                expected,
            ) && lifecycle.every((e) => e.client === 0),
            "Wrong client coverage/order",
        );
        const assigned = lifecycle.find((e) => e.event === "client-socket");
        const closed = lifecycle.at(-1);
        ensure(
            assigned.socket === closed.socket &&
                Number.isInteger(closed.socket) &&
                closed.socket > 0 &&
                closed.hadError === false &&
                closed.ms < row.limits.observationMs &&
                closed.ms < ms,
            "Missing matching client close before forced cleanup",
        );
        if (destroying) {
            const error = lifecycle[2];
            ensure(
                lifecycle[0].round === 0 &&
                    error.round === 0 &&
                    error.name === "Error" &&
                    error.code === "ECONNRESET" &&
                    error.message === "socket hang up",
                "Unexplained deliberate-reset error",
            );
        }
        return {
            accepted: true,
            status: "observed",
            queueObserved,
            unsentCloseObserved: true,
            interpretation:
                "Controlled current projection only; no historical causal repair or product acceptance",
        };
    } catch (error) {
        return {
            accepted: false,
            status: "failed",
            queueObserved,
            unsentCloseObserved: false,
            reason: error.message,
        };
    }
}
