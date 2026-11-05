import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function readWorkerOutcome(directory) {
    const read = (name) =>
        JSON.parse(readFileSync(join(directory, name), "utf8"));
    const launcher = read("launcher.json");
    const report = existsSync(join(directory, "worker-result.json"))
        ? read("worker-result.json")
        : { error: { message: "Missing worker result" } };
    // A report is written before worker shutdown. It cannot override a failed
    // launch, a nonzero exit or termination after the report was written.
    return { ...report, launcher };
}

export function launcherFailed(launcher) {
    return Boolean(
        !launcher || launcher.status !== 0 || launcher.signal || launcher.error,
    );
}

export function outcomeFailed(outcome) {
    const native = outcome.result?.native ?? outcome.result;
    const oracle = outcome.result?.oracleRun ?? outcome.oracle;
    return Boolean(
        launcherFailed(outcome.launcher) ||
        outcome.error ||
        outcome.assertions?.some((item) => !item.passed) ||
        !native ||
        native.status !== 0 ||
        native.signal ||
        native.error ||
        !oracle ||
        oracle.status !== 0 ||
        oracle.signal ||
        oracle.error ||
        native.stdout !== oracle.stdout,
    );
}

export function replayResult(result) {
    // JSON evidence represents absent Error fields as null. Restore the helper's
    // undefined error for the unchanged assertions; retain the raw report as-is.
    result = structuredClone(result);
    for (const run of [result, result?.native, result?.oracleRun])
        if (run?.error === null) delete run.error;
    return result;
}

export function replayAssertions(entry, replacements = []) {
    const saved = [];
    try {
        // Other calls in a multi-program group keep their original results.
        // Substitute only this unchanged comparison, then replay the entire
        // pinned callback, including expected output and stderr assertions.
        for (const { call, oracleCall, outcome } of replacements) {
            for (const [target, result] of [
                [call, outcome.result],
                [oracleCall, outcome.oracle],
            ]) {
                if (!target) continue;
                saved.push({
                    target,
                    result: target.result,
                    thrown: target.thrown,
                });
                target.result = replayResult(result);
                target.thrown = outcome.error;
            }
        }
        entry.replay();
        return { name: entry.name, passed: true };
    } catch (error) {
        return { name: entry.name, passed: false, error };
    } finally {
        for (const { target, result, thrown } of saved)
            Object.assign(target, { result, thrown });
    }
}
