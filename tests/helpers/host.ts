import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { removeTemporaryDirectory } from "./cleanup.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runNative } from "./native.js";
import { compileToIR } from "../../src/compiler.js";
import { generate } from "../../src/backend/x64/codegen.js";
import { linkHost } from "./program.js";
import { requireHostTarget, getTarget } from "../../src/target.js";
import { linkLinux } from "../../src/backend/linux/index.js";
import type { RuntimeLink } from "../../src/link.js";
import {
    executionEvidence,
    executionFailure,
    retainExecution,
} from "./execution.js";
export { executionFailure } from "./execution.js";

export interface HostRun {
    status: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    error?: Error;
}
// A run under gcStress collects on every allocation; initialising the stdio
// streams alone takes most of a minute on a busy CI runner, so allow longer.
const GC_STRESS_TIMEOUT_MS = 180_000;
const TIMEOUT_MS = 60_000;

/** Compile with the runtime prelude for the host's native target and run it. */
export function runOnHost(
    source: string,
    options: {
        gcStress?: boolean;
        realms?: number;
        link?: RuntimeLink;
        timeoutMs?: number;
    } = {
        gcStress: true,
    },
): HostRun {
    const timeout =
        options.timeoutMs ??
        (options.gcStress ? GC_STRESS_TIMEOUT_MS : TIMEOUT_MS);
    const evidence = executionEvidence("host", {
        source,
        options,
        target: requireHostTarget(),
        compilerMode: "compileToIR/generate",
        link: options.link ?? "fullRuntimeLink",
        timeoutMs: timeout,
    });
    const timings: Record<string, number> = {};
    let started = performance.now();
    const ir = compileToIR(source);
    timings.compileMs = performance.now() - started;
    started = performance.now();
    const program = generate(ir, {
        gcStress: options.gcStress,
        ...(options.realms ? { realms: options.realms } : {}),
        ...(options.link ? { link: options.link } : {}),
    });
    timings.generateMs = performance.now() - started;
    started = performance.now();
    const image =
        process.platform !== "linux"
            ? linkHost(program)
            : linkLinux(program, getTarget(requireHostTarget())!.arch);
    timings.linkMs = performance.now() - started;
    evidence?.json("timings.json", timings);
    evidence?.bytes("image.bin", image);
    if (process.platform !== "linux") {
        started = performance.now();
        const result = runNative(image, timeout);
        retainExecution(evidence, result, started);
        return {
            status: result.status,
            signal: result.signal,
            stdout: result.stdout.toString(),
            stderr: result.stderr.toString(),
            error: result.error,
        };
    }
    const directory = mkdtempSync(join(tmpdir(), "nona-host-"));
    try {
        const executable = join(directory, "image");
        writeFileSync(executable, image);
        chmodSync(executable, 0o755);
        started = performance.now();
        const result = spawnSync(executable, [], {
            timeout,
        });
        retainExecution(evidence, result, started);
        return {
            status: result.status,
            signal: result.signal,
            stdout: result.stdout?.toString() ?? "",
            stderr: result.stderr?.toString() ?? "",
            error: result.error,
        };
    } finally {
        removeTemporaryDirectory(directory);
    }
}

import { compileModuleToIR } from "../../src/compiler.js";
/** Write a module graph to a temp directory, compile the entry as a module and run it; also run Node on it. */
export function runModulesOnHost(
    files: Record<string, string>,
    entry: string,
    options: {
        gcStress?: boolean;
        oracleSource?: string;
        timeoutMs?: number;
    } = { gcStress: true },
): {
    native: HostRun;
    oracle: string;
    oracleStatus: number | null;
    oracleStderr: string;
    oracleRun: HostRun;
} {
    const directory = mkdtempSync(join(tmpdir(), "nona-modules-"));
    const timeout =
        options.timeoutMs ??
        (options.gcStress ? GC_STRESS_TIMEOUT_MS : TIMEOUT_MS);
    const evidence = executionEvidence("modules", {
        files,
        entry,
        options,
        target: requireHostTarget(),
        compilerMode: "compileModuleToIR/generate",
        link: "fullRuntimeLink",
        timeoutMs: timeout,
    });
    try {
        for (const [name, text] of Object.entries(files))
            writeFileSync(join(directory, name), text);
        const timings: Record<string, number> = {};
        let started = performance.now();
        const ir = compileModuleToIR(files[entry]!, join(directory, entry));
        timings.compileMs = performance.now() - started;
        started = performance.now();
        const program = generate(ir, { gcStress: options.gcStress });
        timings.generateMs = performance.now() - started;
        const executable = join(
            directory,
            process.platform === "linux" ? "image" : "image.exe",
        );
        // Both programs run in the temporary directory, so relative paths stay inside it.
        started = performance.now();
        const image = linkHost(program);
        timings.linkMs = performance.now() - started;
        evidence?.bytes("image.bin", image);
        evidence?.json("timings.json", timings);
        writeFileSync(executable, image);
        chmodSync(executable, 0o755);
        started = performance.now();
        const result = spawnSync(executable, [], {
            cwd: directory,
            timeout,
            windowsHide: true,
        });
        retainExecution(evidence, result, started);
        const native: HostRun = {
            status: result.status,
            signal: result.signal,
            stdout: result.stdout?.toString() ?? "",
            stderr: result.stderr?.toString() ?? "",
            error: result.error,
        };
        if (options.oracleSource !== undefined)
            writeFileSync(join(directory, entry), options.oracleSource);
        // The oracle may talk to servers that share a loaded CI runner (the
        // TLS chain cases took over 10 s there), so it gets the native budget.
        // A killed oracle would return truncated output: fail instead.
        const oracleEvidence = executionEvidence("module-oracle", {
            files,
            entry,
            options,
            timeoutMs: TIMEOUT_MS,
        });
        started = performance.now();
        const oracle = spawnSync(process.execPath, [join(directory, entry)], {
            cwd: directory,
            timeout: TIMEOUT_MS,
        });
        retainExecution(oracleEvidence, oracle, started);
        const oracleRun: HostRun = {
            status: oracle.status,
            signal: oracle.signal,
            stdout: oracle.stdout?.toString() ?? "",
            stderr: oracle.stderr?.toString() ?? "",
            error: oracle.error,
        };
        if (oracle.error)
            throw new Error(
                `Node.js oracle failed: ${executionFailure(oracleRun)}`,
                { cause: oracle.error },
            );
        return {
            native,
            oracle: oracleRun.stdout,
            oracleStatus: oracle.status,
            oracleStderr: oracleRun.stderr,
            oracleRun,
        };
    } finally {
        removeTemporaryDirectory(directory);
    }
}
