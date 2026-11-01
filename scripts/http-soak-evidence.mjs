import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import os from "node:os";

export function readConfig(env, smoke) {
    function number(name, fallback, positive = false, integer = false) {
        const raw = env[name];
        const value = raw === undefined || raw === "" ? fallback : Number(raw);
        if (
            !Number.isFinite(value) ||
            value < 0 ||
            (positive && value === 0) ||
            (integer && !Number.isInteger(value))
        )
            throw new RangeError(
                `${name} must be ${positive ? "positive" : "non-negative"}${integer ? " and integral" : ""}, got ${raw}`,
            );
        return value;
    }
    const config = {
        smoke,
        minutes: number("NONA_SOAK_MINUTES", smoke ? 5 : 180, true),
        warmupMinutes: number("NONA_SOAK_WARMUP_MINUTES", smoke ? 1 : 10),
        sampleSeconds: number(
            "NONA_SOAK_SAMPLE_SECONDS",
            smoke ? 10 : 60,
            true,
        ),
        connections: number("NONA_SOAK_CONNECTIONS", 32, true, true),
        pauseMs: number("NONA_SOAK_PAUSE_MS", 0),
        windowMinutes: 0,
        requestTimeoutMs: 30000,
        settleSeconds: 8,
        baselineSettleSeconds: 1,
        startupTimeoutMs: 30000,
        slowAbortBytes: 32768,
        nearCrashMs: 2000,
        limits: {
            rssGrowth: 0.1,
            p99Growth: 0.2,
            socketSlack: 2,
            fdSlack: 4,
            resourceSlack: 2,
        },
    };
    if (config.minutes <= config.warmupMinutes)
        throw new RangeError(
            "NONA_SOAK_MINUTES must be larger than the warm-up",
        );
    config.windowMinutes = Math.min(
        30,
        (config.minutes - config.warmupMinutes) / 4,
    );
    return config;
}

export function hashFile(path) {
    try {
        return createHash("sha256").update(readFileSync(path)).digest("hex");
    } catch {
        return null;
    }
}

export function serverIdentity({
    serverPath,
    sourcePath,
    built,
    commit,
    sourceCommit = null,
    target,
    compilerPath,
}) {
    const kind = /\.[cm]?js$/i.test(serverPath) ? "node" : "native";
    return {
        kind,
        path: resolve(serverPath),
        target: kind === "native" && built ? target : null,
        sourcePath:
            kind === "node" ? resolve(serverPath) : built ? sourcePath : null,
        sourceSha256:
            kind === "node"
                ? hashFile(serverPath)
                : built
                  ? hashFile(sourcePath)
                  : null,
        imageSha256: kind === "native" ? hashFile(serverPath) : null,
        compilerEntryPath: built ? (compilerPath ?? null) : null,
        compilerEntrySha256:
            built && compilerPath ? hashFile(compilerPath) : null,
        measuredSourceCommit: built ? commit : sourceCommit,
        sourceCommitBasis: built
            ? "built from checkout"
            : kind === "node" &&
                sourcePath &&
                resolve(serverPath) === resolve(sourcePath)
              ? "checkout source (hash recorded)"
              : sourceCommit
                ? "caller supplied (unverified)"
                : "unknown external input",
        runtime:
            kind === "node"
                ? {
                      path: process.execPath,
                      version: process.version,
                      sha256: hashFile(process.execPath),
                  }
                : { kind: "Nona AOT" },
    };
}

export function machineIdentity() {
    return {
        platform: process.platform,
        release: os.release(),
        arch: process.arch,
        cpu: os.cpus()[0]?.model ?? null,
        cpus: os.cpus().length,
        memory: os.totalmem(),
        hostname: os.hostname(),
        node: process.version,
        versions: process.versions,
    };
}

// A passing short/control run is useful infrastructure evidence, never native acceptance.
export function acceptancePass({
    config,
    checkoutDirty,
    server,
    mix,
    routeCounts,
    summary,
}) {
    const required = [
        "text",
        "json",
        "big",
        "echo",
        "close",
        "slow",
        "missing",
        "throw",
    ];
    return (
        summary.pass &&
        checkoutDirty === false &&
        server.kind === "native" &&
        /^[0-9a-f]{40}$/i.test(server.measuredSourceCommit ?? "") &&
        /^[0-9a-f]{64}$/i.test(server.imageSha256 ?? "") &&
        server.sourceCommitBasis === "built from checkout" &&
        !config.smoke &&
        config.minutes >= 180 &&
        config.warmupMinutes === 10 &&
        config.windowMinutes === 30 &&
        config.sampleSeconds <= 60 &&
        required.every((route) => mix[route] > 0 && routeCounts[route] > 0)
    );
}

export function waitForReady(child, port, timeoutMs = 30000) {
    return new Promise((ready, reject) => {
        let pending = "";
        const cleanup = () => {
            clearTimeout(timer);
            child.stdout.off("data", data);
            child.off("exit", exit);
            child.off("error", error);
        };
        const finish = (failure) => {
            cleanup();
            failure ? reject(failure) : ready();
        };
        const data = (chunk) => {
            pending += chunk;
            const lines = pending.split(/\r?\n/);
            pending = lines.pop();
            if (lines.some((line) => line === `ready ${port}`)) finish();
        };
        const exit = (code, signal) =>
            finish(
                Object.assign(
                    new Error(
                        `the server exited at startup (code ${code}, signal ${signal})`,
                    ),
                    { code, signal },
                ),
            );
        const error = (failure) => finish(failure);
        const timer = setTimeout(
            () => finish(new Error("the server did not print its ready line")),
            timeoutMs,
        );
        child.stdout.on("data", data);
        child.once("exit", exit);
        child.once("error", error);
    });
}

export function writeFailureReceipt(outDir, context, error) {
    const failure = {
        name: error.name,
        message: error.message,
        code: error.code ?? null,
        signal: error.signal ?? null,
        stack: error.stack ?? null,
    };
    const report = {
        ...context,
        test: "http-soak",
        failure,
        summary: { ...context.summary, pass: false, acceptancePass: false },
    };
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
        join(outDir, "http-soak.json"),
        JSON.stringify(report, null, 2),
    );
    writeFileSync(
        join(outDir, "http-soak.md"),
        `# HTTP soak test: FAIL\n\nNative three-hour acceptance: NOT SATISFIED.\n\nPhase: ${context.phase}\n\n${failure.name}: ${failure.message}\n\nCode: ${failure.code}; signal: ${failure.signal}\n\nServer: ${JSON.stringify(context.server)}\n\n${(context.serverLog ?? []).join("\n")}\n\nPartial samples and provenance are retained in http-soak.json.\n`,
    );
}
