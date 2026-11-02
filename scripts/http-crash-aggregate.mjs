// Small proof packages and pure raw aggregation. Never imports a compiler,
// executes a workload or substitutes the aggregate host for Windows records.
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import {
    mkdirSync,
    readFileSync,
    readdirSync,
    lstatSync,
    writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { trialMatrix, shardPlan } from "./http-crash-plan.mjs";
import { diagnosticShardAcceptance } from "./http-crash-acceptance.mjs";
import {
    dependencyStatus,
    mainPin,
    launchAllowed,
} from "./http-crash-provenance.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => JSON.stringify(value, null, 2) + "\n";
const parse = (bytes) => {
    if (typeof bytes !== "string" || !bytes.endsWith("\n"))
        throw Error("Missing/truncated proof JSON");
    return JSON.parse(bytes);
};
const proofName = (run, attempt, index) =>
    `http-crash-proof-${run}-${attempt}-${shardPlan(index).id}`;
const safeName = (name) =>
    /^(?:matrix\.json|acceptance\.json|provenance\.json|runner\.json|(?:reference|controlled)\.mjs|trial-[1-9][0-9]*\/(?:trial\.json|termination\.json|client\.jsonl|stdout\.log|stderr\.log)|(?:reference|controlled)-(?:off|stress)\/build\/(?:termination\.json|stdout\.log|stderr\.log|image\.json))$/.test(
        name,
    );

export function proofManifest(files, provenance) {
    return {
        schemaVersion: 1,
        checkout: provenance?.checkout ?? null,
        workflow: provenance?.workflow ?? null,
        shard: provenance?.shard ?? null,
        files: Object.fromEntries(
            Object.entries(files)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([name, bytes]) => [
                    name,
                    { bytes: Buffer.byteLength(bytes), sha256: hash(bytes) },
                ]),
        ),
    };
}

export function aggregateAcceptance(packages, expected, jobResult) {
    const errors = [],
        shardErrors = [],
        records = [],
        runnerRecords = [],
        ids = [],
        counts = {};
    const artifactIds = new Set(),
        shardIds = new Set();
    if (jobResult !== "success") errors.push(`Matrix jobs: ${jobResult}`);
    if (packages.length !== 10)
        errors.push("Exactly ten proof artifacts required");
    for (const packet of packages) {
        try {
            const { index, files, manifest, artifact } = packet;
            const { trials, ...identity } = shardPlan(index);
            if (shardIds.has(identity.id)) throw Error("Duplicate shard");
            shardIds.add(identity.id);
            if (
                !Number.isSafeInteger(artifact?.id) ||
                artifact.id < 1 ||
                artifactIds.has(artifact.id) ||
                artifact.name !==
                    proofName(
                        expected.workflow.runId,
                        expected.workflow.runAttempt,
                        index,
                    ) ||
                artifact.expired !== false ||
                !(artifact.size_in_bytes > 0) ||
                String(artifact.workflow_run?.id) !== expected.workflow.runId
            )
                throw Error("Foreign/stale/duplicate artifact identity");
            artifactIds.add(artifact.id);
            const p = parse(files["provenance.json"]),
                matrix = parse(files["matrix.json"]);
            records.push(p);
            if (
                !equal(manifest, proofManifest(files, p)) ||
                Object.keys(files).some((name) => !safeName(name))
            )
                throw Error("Proof manifest bytes/hash/path mismatch");
            if (
                !equal(p.checkout, expected.checkout) ||
                !equal(p.event, expected.event) ||
                !equal(p.workflow, expected.workflow) ||
                !equal(p.dependency, expected.dependency) ||
                !equal(p.main, expected.main) ||
                !equal(p.shard, identity)
            )
                throw Error(
                    "Mixed campaign/source/tree/workflow/ancestry/shard provenance",
                );
            // Parsed files, not caller-provided matrix/provenance or cached flags.
            const result = diagnosticShardAcceptance(matrix, files, p, index);
            runnerRecords.push({
                shard: identity,
                runner: parse(files["runner.json"]),
            });
            for (const row of matrix.results ?? []) {
                ids.push(row.id);
                counts[row.verdict] = (counts[row.verdict] ?? 0) + 1;
            }
            if (!result.shardAccepted)
                throw Error(`Raw shard rejected: ${JSON.stringify(result)}`);
            if (!equal(parse(files["acceptance.json"]), result))
                throw Error(
                    "Missing/corrupt shard receipt disagrees with raw re-evaluation",
                );
            // Every raw directory must belong to this shard; retain but reject
            // trial58/extra build evidence rather than silently ignoring it.
            const wanted = new Set(trials.map((row) => row.id));
            const builds = new Set(
                trials
                    .filter((row) => row.runtime === "nona")
                    .map((row) => `${row.fixture}-${row.gc}`),
            );
            if (
                Object.keys(files).some(
                    (name) =>
                        (name.startsWith("trial-") &&
                            !wanted.has(name.split("/")[0])) ||
                        (name.includes("/build/") &&
                            !builds.has(name.split("/")[0])),
                )
            )
                throw Error("Unexpected trial/build raw evidence");
        } catch (error) {
            shardErrors.push({
                index: packet?.index ?? null,
                error: String(error.message ?? error),
            });
        }
    }
    const canonical = trialMatrix().map((row) => row.id),
        seen = new Set(ids);
    const missing = canonical.filter((id) => !seen.has(id));
    const duplicate = [...seen].filter(
        (id) => ids.filter((value) => value === id).length !== 1,
    );
    const unexpected = [...seen].filter((id) => !canonical.includes(id));
    const accepted =
        errors.length === 0 &&
        shardErrors.length === 0 &&
        shardIds.size === 10 &&
        ids.length === 57 &&
        missing.length === 0 &&
        duplicate.length === 0 &&
        unexpected.length === 0;
    return {
        scope: "full57",
        accepted,
        fullAccepted: accepted,
        productFix: false,
        expectedShards: 10,
        receivedShards: packages.length,
        expectedTrials: 57,
        completedUnique: seen.size,
        missing,
        duplicate,
        unexpected,
        errors,
        shardErrors,
        counts,
        provenance: records,
        runnerRecords,
    };
}

function readFiles(directory, proofOnly = false, retainBytes = false) {
    const files = {};
    function visit(path, prefix = "") {
        for (const entry of readdirSync(path, { withFileTypes: true })) {
            const name = prefix + entry.name,
                full = join(path, entry.name);
            if (lstatSync(full).isSymbolicLink())
                throw Error("Proof symlinks forbidden");
            if (entry.isDirectory()) {
                if (
                    !proofOnly ||
                    /^(?:trial-[1-9][0-9]*|(?:reference|controlled)-(?:off|stress)(?:\/build)?)$/.test(
                        name,
                    )
                )
                    visit(full, name + "/");
            } else if (
                (!proofOnly || safeName(name)) &&
                name !== "manifest.json"
            ) {
                const bytes = readFileSync(full),
                    text = bytes.toString("utf8");
                if (!retainBytes && !bytes.equals(Buffer.from(text)))
                    throw Error(`Non-UTF8 proof: ${name}`);
                files[name] = retainBytes ? bytes : text;
            }
        }
    }
    visit(directory);
    return files;
}

// Packaging runs always, including partial/failing jobs. Missing evidence is
// preserved as missing and rejected by aggregation, never filled with defaults.
function pack(source, output) {
    const files = readFiles(source, true, true);
    let p = null;
    try {
        p = parse(files["provenance.json"]?.toString("utf8"));
    } catch {
        /* Preserve rejected/missing provenance and all available raw bytes. */
    }
    mkdirSync(output, { recursive: false });
    for (const [name, bytes] of Object.entries(files)) {
        const target = join(output, name);
        mkdirSync(resolve(target, ".."), { recursive: true });
        writeFileSync(target, bytes, { flag: "wx" });
    }
    writeFileSync(
        join(output, "manifest.json"),
        json(proofManifest(files, p)),
        { flag: "wx" },
    );
}

function campaignExpected(env, event) {
    if (!launchAllowed(env, event)) throw Error("Unauthorized aggregate event");
    if (
        process.version !== "v26.9.0" ||
        env.RUNNER_ENVIRONMENT !== "github-hosted"
    )
        throw Error("Hosted Node 26.9.0 aggregate required");
    const git = (...args) =>
        execFileSync("git", args, { encoding: "utf8" }).trim();
    const head = git("rev-parse", "HEAD"),
        tree = git("rev-parse", "HEAD^{tree}");
    const expectedHead =
        env.GITHUB_EVENT_NAME === "pull_request"
            ? event.pull_request.head.sha
            : env.GITHUB_SHA;
    const dependency = dependencyStatus(head),
        main = dependencyStatus(head, undefined, mainPin);
    if (head !== expectedHead || !dependency.isAncestor || !main.isAncestor)
        throw Error("Aggregate checkout/ancestry mismatch");
    return {
        checkout: { head, tree, expectedHead },
        dependency,
        main,
        event: {
            name: env.GITHUB_EVENT_NAME,
            action: event.action ?? null,
            sha: env.GITHUB_SHA,
            ref: env.GITHUB_REF,
            pr: event.number ?? null,
            draft: event.pull_request?.draft ?? null,
        },
        workflow: {
            sha: env.GITHUB_WORKFLOW_SHA,
            ref: env.GITHUB_WORKFLOW_REF,
            runId: env.GITHUB_RUN_ID,
            runAttempt: env.GITHUB_RUN_ATTEMPT,
        },
    };
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
    const [mode, directory, output] = process.argv.slice(2);
    if (mode === "pack" && directory && output)
        pack(resolve(directory), resolve(output));
    else if (mode === "evaluate" && directory && output) {
        let report;
        try {
            const env = process.env;
            const expected = campaignExpected(
                env,
                JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8")),
            );
            const inventory = JSON.parse(
                readFileSync(join(directory, "artifacts.json"), "utf8"),
            );
            const prefix = `http-crash-proof-${expected.workflow.runId}-${expected.workflow.runAttempt}-`;
            const artifacts = inventory.filter((a) =>
                a.name.startsWith(prefix),
            );
            const root = join(directory, "proofs"),
                packages = [],
                loadErrors = [];
            const directories = readdirSync(root).sort();
            if (!equal(directories, artifacts.map((a) => a.name).sort()))
                throw Error("Artifact inventory/directory mismatch");
            for (const artifact of artifacts) {
                try {
                    const match = artifact.name.match(/-shard-(0[1-9]|10)$/);
                    if (!match) throw Error("Invalid proof artifact name");
                    const path = join(root, artifact.name);
                    if (
                        lstatSync(path).isSymbolicLink() ||
                        !lstatSync(path).isDirectory()
                    )
                        throw Error("Non-isolated proof directory");
                    packages.push({
                        index: Number(match[1]),
                        artifact,
                        files: readFiles(path),
                        manifest: JSON.parse(
                            readFileSync(join(path, "manifest.json"), "utf8"),
                        ),
                    });
                } catch (error) {
                    loadErrors.push({
                        artifact: artifact.name,
                        error: String(error),
                    });
                }
            }
            report = aggregateAcceptance(
                packages,
                expected,
                env.HTTP_CRASH_MATRIX_RESULT,
            );
            if (loadErrors.length) {
                report.errors.push(...loadErrors);
                report.accepted = report.fullAccepted = false;
            }
        } catch (error) {
            report = aggregateAcceptance(
                [],
                null,
                process.env.HTTP_CRASH_MATRIX_RESULT,
            );
            report.errors.push(String(error));
        }
        mkdirSync(resolve(output, ".."), { recursive: true });
        writeFileSync(output, json(report));
        if (!report.accepted) process.exitCode = 1;
    } else
        throw Error(
            "Expected pack source output | evaluate proof-root report.json",
        );
}
