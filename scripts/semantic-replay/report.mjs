// Pure evidence utilities. Importing this file never loads or runs the compiler.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, renameSync } from "node:fs";
import { dirname, resolve, relative, isAbsolute, posix } from "node:path";
import { performance } from "node:perf_hooks";
import assert from "node:assert/strict";

export const sha256 = (bytes) =>
    createHash("sha256").update(bytes).digest("hex");
export function compileEvidence(result, elapsedMs) {
    return {
        ok: result.ok,
        elapsedMs,
        diagnostics: result.ok ? [] : result.diagnostics,
        imports: result.ok ? result.imports : null,
        linked: result.ok ? result.linked : null,
        image: result.ok
            ? { sha256: sha256(result.image), length: result.image.length }
            : null,
    };
}
export function errorDetails(error) {
    if (!error) return null;
    return Object.fromEntries(
        Object.getOwnPropertyNames(error).map((key) => [key, error[key]]),
    );
}
export function saveReport(path, report) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path + ".tmp", JSON.stringify(report, null, 2) + "\n");
    renameSync(path + ".tmp", path);
}
export function recordProcess(command, args, cwd, timeoutMs) {
    const started = performance.now();
    // Keep raw bytes too: UTF-8 decoding must not conceal a mismatch.
    const run = spawnSync(command, args, {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
    });
    return {
        command,
        args,
        cwd,
        timeoutMs,
        elapsedMs: performance.now() - started,
        stdout: run.stdout?.toString("utf8") ?? "",
        stderr: run.stderr?.toString("utf8") ?? "",
        stdoutBase64: run.stdout?.toString("base64") ?? "",
        stderrBase64: run.stderr?.toString("base64") ?? "",
        status: run.status,
        signal: run.signal,
        error: errorDetails(run.error),
    };
}
export function compareOutcomes(actual, expected, normalizeCRLF = false) {
    const differences = [];
    if (!actual || !expected) return ["missing outcome"];
    for (const [name, value] of [
        ["actual", actual],
        ["expected", expected],
    ]) {
        if (value.error)
            differences.push(
                `${name}: process error ${JSON.stringify(value.error)}`,
            );
        if (value.signal) differences.push(`${name}: signal ${value.signal}`);
        if (value.status === null || value.status === undefined)
            differences.push(`${name}: no exit status`);
    }
    for (const field of ["stdout", "stderr", "status"]) {
        const normalize = (v) =>
            normalizeCRLF && typeof v === "string"
                ? v.replaceAll("\r\n", "\n")
                : v;
        if (normalize(actual[field]) !== normalize(expected[field]))
            differences.push(
                `${field}: ${JSON.stringify(actual[field])} != ${JSON.stringify(expected[field])}`,
            );
    }
    for (const field of ["stdout", "stderr"]) {
        const bytes = (outcome) => {
            const raw = outcome[field + "Base64"];
            const buffer =
                raw === undefined
                    ? Buffer.from(outcome[field] ?? "", "utf8")
                    : Buffer.from(raw, "base64");
            // Remove only the CR byte of a CRLF pair, without decoding:
            // distinct invalid UTF-8 bytes must stay distinct.
            return normalizeCRLF
                ? buffer.filter(
                      (byte, i) => byte !== 13 || buffer[i + 1] !== 10,
                  )
                : buffer;
        };
        if (Buffer.compare(bytes(actual), bytes(expected)) !== 0)
            differences.push(`${field}: raw bytes differ`);
    }
    return differences;
}
export function effectiveOptions(fixture, mode, target) {
    if (!["script", "module"].includes(fixture.goal))
        throw new Error("unknown goal");
    if (!["linux-x64", "win32-x64"].includes(target))
        throw new Error("unsupported replay target");
    const options = {
        fileName: fixture.entry,
        target,
        module: fixture.goal === "module",
        reportLink: true,
        gcStress: false,
    };
    if (mode === "full") options.fullRuntime = true;
    else if (mode === "explicit") {
        if (!fixture.link?.length)
            throw new Error("explicit replay requires link parts");
        options.link = [...fixture.link];
    } else if (mode !== "default") throw new Error("unknown replay mode");
    return options;
}
export function writeGraph(directory, fixture) {
    for (const [name, source] of Object.entries(fixture.files)) {
        const path = resolve(directory, name);
        const rel = relative(resolve(directory), path);
        if (
            isAbsolute(name) ||
            isAbsolute(rel) ||
            rel.startsWith("..") ||
            name.includes("\\")
        )
            throw new Error(`unsafe graph path ${name}`);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, source);
    }
}
export function recordOracle(directory, fixture, timeoutMs) {
    // Classic scripts have global var bindings; no CommonJS/function wrapper.
    const args =
        fixture.goal === "module"
            ? [resolve(directory, fixture.entry)]
            : [
                  "--input-type=commonjs",
                  "--eval",
                  'require("node:vm").runInThisContext(require("node:fs").readFileSync(process.argv[1],"utf8"),{filename:process.argv[1]})',
                  resolve(directory, fixture.entry),
              ];
    return recordProcess(process.execPath, args, directory, timeoutMs);
}
export function moduleGraphHost(fixture, canonicalEntry) {
    assert.ok(canonicalEntry.endsWith(fixture.entry));
    const root = canonicalEntry.slice(0, -fixture.entry.length);
    const files = new Map(
        Object.entries(fixture.files).map(([name, source]) => [
            root + name,
            source,
        ]),
    );
    const description = {
        ...fixture.resolution,
        root,
        files: [...files.keys()],
        requests: [],
        reads: [],
    };
    const host = {
        resolve(specifier, referrer) {
            const path =
                specifier.startsWith("./") || specifier.startsWith("../")
                    ? posix.normalize(
                          posix.join(posix.dirname(referrer), specifier),
                      )
                    : undefined;
            const result = path && files.has(path) ? path : undefined;
            description.requests.push({
                specifier,
                referrer,
                result: result ?? null,
            });
            return result;
        },
        read(path) {
            description.reads.push(path);
            return files.get(path);
        },
    };
    return { host, description };
}
export function assessMode(record) {
    const operational = [];
    if (!record.compile?.ok || record.error || !record.native || !record.oracle)
        operational.push("compilation or execution incomplete");
    for (const name of ["native", "oracle"]) {
        const r = record[name];
        if (r?.error || r?.signal || r?.status == null)
            operational.push(`${name}: operational failure`);
    }
    const differences = compareOutcomes(
        record.native,
        record.oracle,
        record.normalizeCRLF,
    );
    return {
        operational,
        differences,
        exitCode: operational.length ? 2 : differences.length ? 1 : 0,
    };
}
export function measuredBudget(reports) {
    assert.equal(
        reports.length,
        2,
        "need exactly Windows and Linux measurements",
    );
    assert.deepEqual(reports.map((r) => r.platform).sort(), ["linux", "win32"]);
    for (const r of reports) {
        assert.equal(r.lane, "pr");
        assert.equal(r.complete, true);
        assert.deepEqual(r.failures, []);
        assert.ok(Number.isFinite(r.elapsedMs) && r.elapsedMs > 0);
        assert.equal(r.inventory.cases, 163);
        assert.equal(r.inventory.nativeRuns, 376);
        assert.equal(
            r.sourceSha,
            reports[0].sourceSha,
            "measure the same source on both platforms",
        );
    }
    const measuredMaximumMs = Math.max(...reports.map((r) => r.elapsedMs));
    return {
        schema: 1,
        sourceSha: reports[0].sourceSha,
        measuredMaximumMs,
        budgetMs: Math.ceil((measuredMaximumMs * 1.5) / 60000) * 60000,
        policy: "maximum complete hosted replay wall time plus 50%, rounded up to a minute; excludes setup/install/build; remeasure after inventory or compiler changes",
        measurements: reports,
    };
}
