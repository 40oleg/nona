import { spawnSync } from "node:child_process";
import {
    executionEvidence,
    executionFailure,
    retainExecution,
} from "./execution.js";
export function runOracle(
    source: string,
    options: { timezone?: string; flags?: readonly string[] } = {},
): {
    stdout: string;
    stderr: string;
    status: number | null;
    signal: NodeJS.Signals | null;
    error?: Error;
} {
    // Evaluate the source as its own Script so the console adapter cannot end its
    // directive prologue. Script var/this semantics also remain global.
    const script =
        'console.log=((write,stringify)=>(...args)=>{write(args.map(stringify).join(" ")+"\\n");})(process.stdout.write.bind(process.stdout),String);\nrequire("node:vm").runInThisContext(' +
        JSON.stringify(source) +
        ");";
    // Node.js starts in well under a second, but on a loaded CI runner a
    // spawn can wait several seconds for the CPU, so the limit is generous.
    const evidence = executionEvidence("script-oracle", {
        source,
        script,
        options,
        timeoutMs: 60_000,
    });
    const started = performance.now();
    const run = spawnSync(
        process.execPath,
        [...(options.flags ?? []), "-e", script],
        {
            timeout: 60_000,
            windowsHide: true,
            ...(options.timezone === undefined
                ? {}
                : { env: { ...process.env, TZ: options.timezone } }),
        },
    );
    retainExecution(evidence, run, started);
    if (run.error)
        throw new Error(`Node.js oracle failed: ${executionFailure(run)}`, {
            cause: run.error,
        });
    if (run.status !== 0) throw new Error(executionFailure(run));
    return {
        stdout: run.stdout.toString(),
        stderr: run.stderr.toString(),
        status: run.status,
        signal: run.signal,
        error: run.error,
    };
}
