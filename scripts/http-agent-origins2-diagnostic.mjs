// Hosted entry only. Importing for pure guard tests cannot compile or run a child.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { release, version } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeSources, compareArm } from "./http-agent-origins2-sources.mjs";
import { supervise } from "./http-agent-origins2-supervisor.mjs";

export const SOURCE_PIN = "a632e7fdcbedc5838176978e9eb2f03ed5ee1eeb";
export const DIAGNOSTIC_REF =
    "refs/heads/codex/diagnostic-616-origins2-20261104";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "work/origins2-hosted616");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const blob = (path) => {
    const bytes = readFileSync(path);
    return { path, bytes: bytes.length, sha256: sha(bytes) };
};
const json = (path, value) =>
    writeFileSync(path, JSON.stringify(value, null, 2) + "\n");

export function hostedGuard(env, platform, arch, version, head) {
    assert.equal(env.GITHUB_ACTIONS, "true", "Hosted execution only");
    assert.equal(
        env.RUNNER_ENVIRONMENT,
        "github-hosted",
        "Self-hosted execution refused",
    );
    assert.equal(env.GITHUB_EVENT_NAME, "workflow_dispatch");
    assert.equal(env.GITHUB_REPOSITORY, "40oleg/nona");
    assert.equal(env.GITHUB_REF, DIAGNOSTIC_REF);
    assert.equal(env.DIAGNOSTIC_MODE, "origins2");
    assert.match(env.DIAGNOSTIC_COMMIT ?? "", /^[a-f0-9]{40}$/);
    assert.equal(env.DIAGNOSTIC_COMMIT, head);
    assert.equal(env.GITHUB_SHA, head);
    assert.equal(env.RUNNER_OS, "Windows");
    assert.equal(env.RUNNER_ARCH, "X64");
    assert.equal(platform, "win32");
    assert.equal(arch, "x64");
    assert.equal(version, "v26.9.0");
    assert.equal(env.NONA_GC_STRESS, "on");
    for (const [key, value] of Object.entries(env)) {
        if (key.startsWith("NONA_") && key !== "NONA_GC_STRESS")
            assert.ok(
                key === "NONA_TEST_CONCURRENCY" && value === "1",
                "Unexpected compiler override: " + key,
            );
        if (["NODE_OPTIONS", "NODE_PATH"].includes(key))
            assert.ok(!value, "Unexpected Node load override: " + key);
    }
}

export function verifyPinnedEntries(entries) {
    assert.ok(entries.length > 100, "Incomplete source inventory");
    for (const entry of entries) {
        assert.match(entry.gitBlob, /^[a-f0-9]{40}$/);
        assert.equal(
            entry.actualBlob,
            entry.gitBlob,
            "Pinned source changed: " + entry.path,
        );
        assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    }
    return true;
}

// These read-only Git queries are reached only after the hosted guard, never by
// the local pure tests. Parent owns all local Git and publication.
function git(args, input) {
    const result = spawnSync("git", args, {
        cwd: root,
        input,
        windowsHide: true,
        encoding: "utf8",
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}
function verifyOriginals() {
    const paths = [
        "src",
        "tests/helpers",
        "tests/http-agent.test.ts",
        "tests/http-agent-fixtures.test.ts",
        "tests/http-agent-source.test.ts",
        "tests/http-agent-retained-control.test.ts",
        "package.json",
        "package-lock.json",
        ".gitattributes",
        "tsconfig.json",
        "scripts/build.mjs",
        "scripts/lib-sources.mjs",
    ];
    const entries = git(["ls-tree", "-r", SOURCE_PIN, "--", ...paths])
        .split("\n")
        .map((line) => {
            const match = /^\d+ blob ([a-f0-9]{40})\t(.+)$/.exec(line);
            assert.ok(match, "Malformed pinned tree entry");
            return { path: match[2], gitBlob: match[1] };
        });
    const hashes = git(
        ["hash-object", "--stdin-paths"],
        entries.map((e) => e.path).join("\n") + "\n",
    ).split("\n");
    assert.equal(hashes.length, entries.length);
    entries.forEach((entry, i) =>
        Object.assign(entry, {
            actualBlob: hashes[i],
            ...blob(join(root, entry.path)),
            path: entry.path,
        }),
    );
    verifyPinnedEntries(entries);
    return {
        sourcePin: SOURCE_PIN,
        sourceTree: git(["rev-parse", SOURCE_PIN + "^{tree}"]),
        files: entries,
        sha256: sha(JSON.stringify(entries)),
    };
}
function inventory(directory) {
    const files = [];
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
        (a, b) => a.name.localeCompare(b.name),
    )) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) files.push(...inventory(path));
        else files.push(blob(path));
    }
    return files;
}
const selectedKeys = [
    "GITHUB_ACTIONS",
    "GITHUB_REPOSITORY",
    "GITHUB_EVENT_NAME",
    "GITHUB_REF",
    "GITHUB_SHA",
    "GITHUB_WORKFLOW_REF",
    "GITHUB_RUN_ID",
    "GITHUB_RUN_ATTEMPT",
    "RUNNER_ENVIRONMENT",
    "RUNNER_OS",
    "RUNNER_ARCH",
    "ImageOS",
    "ImageVersion",
    "DIAGNOSTIC_COMMIT",
    "DIAGNOSTIC_MODE",
    "NONA_GC_STRESS",
    "NONA_TEST_CONCURRENCY",
];
function childEnvironment(env) {
    const keys = new Set([
        ...selectedKeys,
        "PATH",
        "SYSTEMROOT",
        "WINDIR",
        "COMSPEC",
        "TEMP",
        "TMP",
        "USERPROFILE",
        "HOMEDRIVE",
        "HOMEPATH",
        "PROGRAMFILES",
        "PROGRAMFILES(X86)",
        "COMMONPROGRAMFILES",
        "LOCALAPPDATA",
        "APPDATA",
        "PATHEXT",
        "SYSTEMDRIVE",
        "NUMBER_OF_PROCESSORS",
        "PROCESSOR_ARCHITECTURE",
        "OS",
    ]);
    return Object.fromEntries(
        Object.entries(env).filter(
            ([key]) => keys.has(key) || keys.has(key.toUpperCase()),
        ),
    );
}
async function loadSources() {
    const { agentCases } =
        await import("../dist/tests/helpers/http-agent-cases.js");
    const { agentProgram } =
        await import("../dist/tests/helpers/http-agent-policy.js");
    return makeSources(
        agentCases.find((c) => c.id === "origins/2"),
        agentProgram,
    );
}
function checkedIdentity() {
    // Environment refusal precedes any Git query, write, or compiler import.
    hostedGuard(
        process.env,
        process.platform,
        process.arch,
        process.version,
        process.env.GITHUB_SHA,
    );
    const head = git(["rev-parse", "HEAD"]);
    hostedGuard(
        process.env,
        process.platform,
        process.arch,
        process.version,
        head,
    );
    return {
        head,
        tree: git(["rev-parse", "HEAD^{tree}"]),
        sourcePin: SOURCE_PIN,
        node: process.version,
        nodeImage: blob(process.execPath),
        platform: process.platform,
        arch: process.arch,
        osRelease: release(),
        osVersion: version(),
        selection: Object.fromEntries(
            selectedKeys
                .filter((k) => process.env[k] !== undefined)
                .map((k) => [k, process.env[k]]),
        ),
        argv: process.argv,
        cwd: process.cwd(),
    };
}

async function buildArm(id, identity) {
    assert.ok(id === "A" || id === "B", "Unknown build arm");
    const originals = verifyOriginals();
    const arm = (await loadSources()).find((a) => a.id === id);
    const directory = join(output, id);
    const entry = join(directory, "native/main.mjs");
    const source = readFileSync(entry, "utf8");
    assert.equal(source, arm.source, "Build source override");
    assert.equal(process.env.NONA_GC_STRESS, "on");
    const compilerFiles = [
        ...inventory(join(root, "dist/src")),
        ...inventory(join(root, "dist/tests/helpers")),
    ];
    const compiler = {
        sha256: sha(JSON.stringify(compilerFiles)),
        files: compilerFiles,
    };
    json(join(directory, "compiler.json"), compiler);
    json(join(directory, "originals.json"), originals);
    // Fresh process for each source, selection set before any compiler load.
    const moduleLoadSelection = process.env.NONA_GC_STRESS;
    const { compileModuleToIR } = await import("../dist/src/compiler.js");
    const { generate } = await import("../dist/src/backend/x64/codegen.js");
    const { linkHost } = await import("../dist/tests/helpers/program.js");
    const ir = compileModuleToIR(source, entry);
    assert.equal(ir.runtimePrelude, true);
    const program = generate(ir, { gcStress: true });
    const imagePath = join(directory, "native/image.exe");
    writeFileSync(imagePath, linkHost(program));
    json(join(directory, "build.json"), {
        identity,
        source: blob(entry),
        image: blob(imagePath),
        compilerSha256: compiler.sha256,
        generatedSources: [
            "src/version.ts",
            "src/lib/sources.generated.ts",
        ].map((p) => blob(join(root, p))),
        requestedGC: true,
        moduleLoadSelection,
        effectiveGC: moduleLoadSelection !== "off",
        options: { gcStress: true },
        effectiveSelectionEvidence:
            "Derived from pinned codegen module-load guard, fresh process environment, and generate options; not runtime telemetry",
        moduleOptions: {
            host: "default nodeModuleHost",
            scriptPrelude: "",
            target: "win32-x64",
            lowering: { inline: true },
        },
        pipeline:
            "compileModuleToIR(source, entry) -> generate(ir, {gcStress:true}) -> linkHost(program)",
        runtimeLink:
            "default full runtime; no public compile/profile/link substitution",
        imageRetained: true,
    });
}

async function campaign(identity) {
    // Never overwrite a previous attempt, including partial failed attempts.
    for (const name of ["report.json", "source-plan.json", "A", "B"])
        assert.ok(
            !existsSync(join(output, name)),
            "Evidence already exists; no reruns/overwrites",
        );
    mkdirSync(output, { recursive: true });
    const report = {
        schema: 1,
        startedAt: new Date().toISOString(),
        identity,
        productAcceptance: false,
        diagnosticCollection: false,
        complete: false,
        arms: [],
        budget: {
            nativeArms: 2,
            attemptsPerArm: 1,
            nativeBoundMs: 180000,
            nodeOracles: 2,
            oracleBoundMs: 60000,
            cleanupWatchdogMs: 6000,
            sequential: true,
        },
        interventions: [
            "B adds callback observations, elapsed wall clock and stderr writes; perturbed observer",
            "Async recovered supervision with pipes/chunk arrival timestamps replaces historical spawnSync; kill/pipe cleanup allowance 2000ms after unchanged deadline",
            "Sanitized child environment; only nonsecret selection is logged",
            "Fresh compiler process with GC selected on before module load; hosted Node 26.9.0/image/load may differ from historical failure",
        ],
        historicalFailure: {
            sourcePin: SOURCE_PIN,
            platform: "Windows",
            witness: "origins/2",
            error: "ETIMEDOUT",
            nativeBoundMs: 180000,
            stdout: "queued 2 2\nwoken 2 /hold0,/other1,/other2\n",
            rootCause: "UNKNOWN",
            run: "41828988555",
            job: "126576173652",
            originalImage: "not retained by historical helper",
        },
    };
    const save = () => json(join(output, "report.json"), report);
    save();
    try {
        json(join(output, "originals.json"), verifyOriginals());
        const sources = await loadSources();
        json(join(output, "source-plan.json"), sources);
        const env = childEnvironment(process.env);
        json(join(output, "environment-selection.json"), {
            passedKeys: Object.keys(env).sort(),
            selected: identity.selection,
            omitted:
                "All unselected environment values, credentials and secrets",
        });
        // Materialize both arms first: preserve both sources even if a builder fails.
        for (const arm of sources) {
            for (const [kind, source] of [
                ["native", arm.source],
                ["oracle", arm.oracleSource],
            ]) {
                const directory = join(output, arm.id, kind);
                mkdirSync(directory, { recursive: true });
                writeFileSync(join(directory, "main.mjs"), source);
            }
        }
        for (const arm of sources) {
            const directory = join(output, arm.id);
            const entry = {
                id: arm.id,
                observer: arm.id === "B",
                source: blob(join(directory, "native/main.mjs")),
                oracleSource: blob(join(directory, "oracle/main.mjs")),
                productAcceptance: false,
            };
            report.arms.push(entry);
            save();
            try {
                entry.builder = await supervise(
                    process.execPath,
                    [fileURLToPath(import.meta.url), "--build", arm.id],
                    directory,
                    "builder",
                    180000,
                    env,
                );
            } catch (error) {
                entry.builderError = {
                    message: error.message,
                    stack: error.stack,
                };
            }
            // Compilation failure never suppresses the other arm or this Node oracle.
            const buildPath = join(directory, "build.json");
            const image = join(directory, "native/image.exe");
            try {
                if (
                    entry.builder?.status === 0 &&
                    entry.builder.error === null &&
                    entry.builder.signal === null &&
                    entry.builder.exitSeen &&
                    entry.builder.closeSeen &&
                    !entry.builder.forcedPipeCleanup &&
                    !entry.builder.deadlineExceeded &&
                    existsSync(buildPath) &&
                    existsSync(image)
                ) {
                    entry.build = JSON.parse(readFileSync(buildPath, "utf8"));
                    entry.native = await supervise(
                        image,
                        [],
                        join(directory, "native"),
                        "native",
                        arm.nativeBoundMs,
                        env,
                    );
                    entry.native.image = blob(image);
                } else
                    entry.nativeUnavailable =
                        "Builder failed; see raw receipt. No product result inferred.";
            } catch (error) {
                entry.nativeError = {
                    message: error.message,
                    stack: error.stack,
                };
            }
            try {
                entry.oracle = await supervise(
                    process.execPath,
                    [join(directory, "oracle/main.mjs")],
                    join(directory, "oracle"),
                    "oracle",
                    arm.oracleBoundMs,
                    env,
                );
                entry.oracle.image = blob(process.execPath);
            } catch (error) {
                entry.oracleError = {
                    message: error.message,
                    stack: error.stack,
                };
            }
            try {
                entry.comparison = compareArm(
                    arm.id,
                    entry.native,
                    entry.native
                        ? readFileSync(entry.native.stdout.path, "utf8")
                        : "",
                    entry.native
                        ? readFileSync(entry.native.stderr.path, "utf8")
                        : "",
                    entry.oracle,
                    entry.oracle
                        ? readFileSync(entry.oracle.stdout.path, "utf8")
                        : "",
                    entry.oracle
                        ? readFileSync(entry.oracle.stderr.path, "utf8")
                        : "",
                );
            } catch (error) {
                entry.comparison = {
                    semanticMatch: false,
                    diagnosticCollection: false,
                    productAcceptance: false,
                    errors: [error.message],
                };
            }
            save();
        }
        report.complete = report.arms.length === 2;
        report.diagnosticCollection =
            report.complete &&
            report.arms.every((a) => a.native && a.oracle && a.builder);
    } catch (error) {
        report.error = { message: error.message, stack: error.stack };
    } finally {
        report.finishedAt = new Date().toISOString();
        save();
    }
    // A failed A remains a failed A even if B completes.
    if (
        !report.diagnosticCollection ||
        !report.arms.every((a) => a.comparison?.semanticMatch)
    )
        process.exitCode = 1;
}

if (
    process.argv[1] &&
    pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
    const identity = checkedIdentity();
    if (process.argv.length === 4 && process.argv[2] === "--build")
        await buildArm(process.argv[3], identity);
    else {
        assert.equal(process.argv.length, 2, "Source/CLI overrides refused");
        await campaign(identity);
    }
}
