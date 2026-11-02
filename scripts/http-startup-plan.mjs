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

export function snapshotEvidence(raw, termination) {
    const rawPCs = [...raw.matchAll(/rip=([0-9a-f`]+)/gi)].map((m) => m[1]);
    const moduleBases = [
        ...raw.matchAll(/^([0-9a-f`]{8,})\s+([0-9a-f`]{8,})\s+(\S+)/gim),
    ].map((m) => ({ start: m[1], end: m[2], module: m[3] }));
    const rawStackFrames = raw
        .split(/\r?\n/)
        .filter((line) =>
            /^\s*[0-9a-f]{1,3}\s+[0-9a-f`]{8,}\s+[0-9a-f`]{8,}\s+/i.test(line),
        );
    return {
        status:
            termination.code === 0 &&
            !termination.reason &&
            !termination.error &&
            termination.dropped?.stdout === 0 &&
            termination.dropped?.stderr === 0 &&
            /STARTUP_SNAPSHOT_BEGIN/.test(raw) &&
            /STARTUP_SNAPSHOT_END/.test(raw) &&
            rawPCs.some((pc) => BigInt("0x" + pc.replaceAll("`", "")) > 0n) &&
            moduleBases.length &&
            rawStackFrames.length
                ? "raw-context-and-stack-present-unvalidated"
                : "incomplete",
        rawPCs,
        moduleBases,
        rawStackFrames,
        relativePCs: rawPCs.map((pc) => {
            const value = BigInt("0x" + pc.replaceAll("`", ""));
            const module = moduleBases.find(
                (m) =>
                    value >= BigInt("0x" + m.start.replaceAll("`", "")) &&
                    value < BigInt("0x" + m.end.replaceAll("`", "")),
            );
            return {
                pc,
                module: module?.module ?? null,
                offset: module
                    ? "0x" +
                      (
                          value -
                          BigInt("0x" + module.start.replaceAll("`", ""))
                      ).toString(16)
                    : null,
            };
        }),
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
