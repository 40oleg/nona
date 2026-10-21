import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const inventoryPath = resolve(root, "docs/completeness-matrix.json");
export const statuses = [
    "implemented-verified",
    "implemented-unverified",
    "partial",
    "missing",
    "intentionally-unsupported",
    "unknown",
];
export const targetIds = [
    "win32-x64",
    "linux-x64",
    "linux-arm64",
    "win32-arm64",
    "darwin-x64",
    "darwin-arm64",
    "freebsd-x64",
    "openbsd-x64",
];
// Coverage requirements come from #394, not from whichever rows happen to exist.
export const families = {
    language: [
        "syntax",
        "dynamic-code",
        "async-generators",
        "modules",
        "regexp",
        "binary-shared-memory",
    ],
    compiler: ["pipeline"],
    runtime: [
        "primitives",
        "objects-collections",
        "gc-memory",
        "scheduler-promises",
    ],
    apis: [
        "process",
        "filesystem",
        "paths-urls",
        "encoding-buffer",
        "console-os",
        "timers-events-context",
        "streams",
        "network",
        "crypto",
        "subprocess-concurrency",
        "compression-intl",
        "support-modules",
        "native-integration",
    ],
    packaging: ["cli-build", "module-resolution", "self-hosting"],
    platforms: ["native-targets"],
    dx: ["compiler-api", "diagnostics-tooling"],
    assurance: ["conformance"],
    ecosystem: ["workloads"],
};
const releaseRelationships = [
    "sources-unchanged-since-release",
    "sources-changed-since-release",
    "includes-unreleased-sources",
];
const evidenceKinds = [
    "implementation",
    "test",
    "documentation",
    "workflow",
    "tooling-or-metadata",
];
const stageStates = ["not-run", "passed", "failed", "not-applicable"];
const nonempty = (value) => typeof value === "string" && value.trim() !== "";
const object = (value) => value !== null && typeof value === "object";
const shaPattern = /^[0-9a-f]{40}$/;
const idPattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

export function readInventory(path = inventoryPath) {
    return JSON.parse(readFileSync(path, "utf8"));
}

/** Validate data and pinned file references, never compile or execute probes. */
export function validateInventory(matrix, { checkGit = false } = {}) {
    const problems = [];
    const require = (condition, message) => {
        if (!condition) problems.push(message);
    };
    const array = (value, name, allowEmpty = false) => {
        require(Array.isArray(value), `${name}: expected array`);
        if (!Array.isArray(value)) return [];
        require(allowEmpty || value.length > 0, `${name}: empty`);
        require(new Set(value).size === value.length, `${name}: duplicate`);
        return value;
    };
    if (!object(matrix)) return ["inventory: expected object"];
    require(matrix.schemaVersion === 1, "unsupported schemaVersion");
    require(nonempty(
        matrix.schemaDocumentation,
    ), "schemaDocumentation required");
    const audit = matrix.audit ?? {};
    const commit = audit.baselineCommit;
    require(shaPattern.test(
        commit ?? "",
    ), "audit.baselineCommit: full SHA required");
    require(audit.issue === 394, "audit.issue must be 394");
    require(/^\d{4}-\d{2}-\d{2}$/.test(
        audit.reportDate ?? "",
    ), "audit.reportDate required");
    require(object(audit.environment), "audit.environment required");
    require(nonempty(audit.executionPolicy), "audit.executionPolicy required");
    const release = audit.publishedRelease ?? {};
    require(shaPattern.test(
        release.commit ?? "",
    ), "publishedRelease.commit: full SHA required");
    require(nonempty(release.tag) &&
        nonempty(release.url), "publishedRelease provenance required");

    const domains = array(matrix.domains, "domains");
    for (const domain of Object.keys(families))
        require(domains.includes(domain), `missing domain: ${domain}`);
    for (const domain of domains)
        require(Object.hasOwn(families, domain), `unknown domain: ${domain}`);

    const registry = matrix.evidence ?? {};
    require(object(registry) &&
        Object.keys(registry).length > 0, "evidence registry required");
    let baselineBlobs, releaseBlobs;
    if (
        checkGit &&
        shaPattern.test(commit ?? "") &&
        shaPattern.test(release.commit ?? "")
    ) {
        const tree = (sha) =>
            new Map(
                execFileSync("git", ["ls-tree", "-r", sha], {
                    cwd: root,
                    encoding: "utf8",
                    maxBuffer: 8 * 1024 * 1024,
                })
                    .trim()
                    .split("\n")
                    .map((line) => {
                        const [meta, path] = line.split("\t");
                        return [path, meta.split(" ")[2]];
                    }),
            );
        try {
            baselineBlobs = tree(commit);
            releaseBlobs = tree(release.commit);
        } catch {
            problems.push(
                "git: baseline/release objects unavailable; cannot validate pinned references",
            );
        }
    }
    for (const [key, ref] of Object.entries(registry)) {
        if (!object(ref)) {
            problems.push(`evidence ${key}: expected object`);
            continue;
        }
        require(ref.path === key &&
            !key.includes("\\") &&
            !key.split("/").includes("..") &&
            !key.startsWith("/"), `evidence ${key}: invalid repository path`);
        require(ref.commit === commit, `evidence ${key}: wrong commit`);
        require(shaPattern.test(
            ref.blob ?? "",
        ), `evidence ${key}: baseline blob required`);
        require(ref.releaseBlob === null ||
            shaPattern.test(
                ref.releaseBlob ?? "",
            ), `evidence ${key}: release blob or null required`);
        require(ref.url ===
            `https://github.com/40oleg/nona/blob/${commit}/${key}`, `evidence ${key}: URL must pin commit and path`);
        require(evidenceKinds.includes(
            ref.kind,
        ), `evidence ${key}: invalid kind`);
        require(["not-run", "not-applicable", "executed"].includes(
            ref.execution,
        ), `evidence ${key}: invalid execution`);
        require(existsSync(
            resolve(root, key),
        ), `evidence ${key}: repository path missing`);
        if (baselineBlobs)
            require(baselineBlobs.get(key) ===
                ref.blob, `evidence ${key}: blob/path disagrees with baseline git tree`);
        if (releaseBlobs)
            require((releaseBlobs.get(key) ?? null) ===
                ref.releaseBlob, `evidence ${key}: release blob disagrees with git tree`);
    }
    const references = (value, label, allowEmpty = false) => {
        const paths = array(value, label, allowEmpty);
        for (const path of paths)
            require(Object.hasOwn(
                registry,
                path,
            ), `${label}: unknown reference ${path}`);
        return paths;
    };
    const targets = array(matrix.targets, "targets");
    const presentTargets = targets.map((t) => t.id);
    require(new Set(presentTargets).size ===
        presentTargets.length, "targets: duplicate ID");
    for (const id of targetIds)
        require(presentTargets.includes(id), `missing target: ${id}`);
    for (const target of targets) {
        require(targetIds.includes(target.id), `unknown target: ${target.id}`);
        require(["pe", "elf", "macho"].includes(
            target.format,
        ), `target ${target.id}: format required`);
        require(stageStates.includes(target.localBuild) &&
            stageStates.includes(
                target.localRun,
            ), `target ${target.id}: execution states required`);
        require(["ci-native", "ci-vm"].includes(
            target.configuredExecution,
        ), `target ${target.id}: CI execution mode required`);
        require(nonempty(target.ciResultAtBaseline) &&
            nonempty(target.emulation) &&
            nonempty(
                target.limitations,
            ), `target ${target.id}: coverage limitations required`);
        references(target.evidence, `target ${target.id} evidence`);
    }
    const rows = array(matrix.capabilities, "capabilities");
    const ids = new Set();
    for (const row of rows) {
        const id = row.id;
        require(idPattern.test(id ?? ""), `invalid capability ID: ${id}`);
        require(!ids.has(id), `duplicate capability ID: ${id}`);
        ids.add(id);
        require(families[row.domain]?.includes(
            row.family,
        ), `${id}: unknown domain/family`);
        require(statuses.includes(row.status), `${id}: invalid status`);
        require(["public", "internal"].includes(
            row.visibility,
        ), `${id}: visibility required`);
        for (const field of ["scope", "limitations", "evidenceNeeded"])
            require(nonempty(row[field]), `${id}: ${field} required`);
        array(row.surfaces, `${id} surfaces`);
        const affected = array(row.affectedTargets, `${id} affectedTargets`);
        for (const target of affected)
            require(targetIds.includes(
                target,
            ), `${id}: unknown target ${target}`);
        const evidence = row.evidence ?? {};
        const sources = references(evidence.sources, `${id} sources`);
        const tests = references(evidence.tests, `${id} tests`, true);
        references(evidence.documentation, `${id} documentation`);
        for (const path of tests)
            require(registry[path]?.kind ===
                "test", `${id}: test reference is not a test: ${path}`);
        for (const link of array(evidence.links, `${id} links`, true))
            require(typeof link === "string" &&
                /^https:\/\//.test(link), `${id}: invalid external link`);
        require(row.release?.tag ===
            release.tag, `${id}: release tag differs from audit`);
        require(releaseRelationships.includes(
            row.release?.relationship,
        ), `${id}: release relationship required`);
        if (sources.length && sources.every((p) => object(registry[p]))) {
            const expected = sources.every(
                (p) => registry[p].blob === registry[p].releaseBlob,
            )
                ? "sources-unchanged-since-release"
                : sources.some((p) => registry[p].releaseBlob === null)
                  ? "includes-unreleased-sources"
                  : "sources-changed-since-release";
            require(row.release?.relationship ===
                expected, `${id}: release relationship disagrees with recorded blobs`);
        }
        const execution = row.execution ?? {};
        require(stageStates.includes(execution.build) &&
            stageStates.includes(
                execution.run,
            ), `${id}: build/run states required`);
        const results = array(
            execution.results,
            `${id} execution results`,
            true,
        );
        for (const result of results) {
            require(object(result) &&
                nonempty(result.command) &&
                nonempty(result.environment) &&
                nonempty(result.observed) &&
                nonempty(
                    result.artifact,
                ), `${id}: execution record needs command/environment/observed/artifact`);
            require(result.commit === commit &&
                targetIds.includes(
                    result.target,
                ), `${id}: execution commit/target mismatch`);
            require(["build", "run"].includes(result.stage) &&
                ["passed", "failed"].includes(
                    result.outcome,
                ), `${id}: invalid execution stage/outcome`);
        }
        for (const stage of ["build", "run"])
            if (["passed", "failed"].includes(execution[stage]))
                require(results.some(
                    (r) => r.stage === stage && r.outcome === execution[stage],
                ), `${id}: ${stage} outcome lacks execution evidence`);
        if (row.status === "implemented-verified") {
            require(execution.build === "passed" &&
                execution.run ===
                    "passed", `${id}: verified requires passing build and run`);
            for (const target of affected)
                require(results.some(
                    (r) =>
                        r.target === target &&
                        r.stage === "run" &&
                        r.outcome === "passed",
                ), `${id}: verified lacks run evidence for ${target}`);
        }
    }
    for (const [domain, names] of Object.entries(families))
        for (const family of names)
            require(rows.some(
                (r) => r.domain === domain && r.family === family,
            ), `missing coverage: ${domain}/${family}`);
    for (const target of targetIds)
        require(rows.some(
            (r) =>
                r.domain === "platforms" &&
                r.id === `platform.${target}` &&
                r.affectedTargets?.length === 1 &&
                r.affectedTargets[0] === target,
        ), `missing platform capability: ${target}`);
    const entryPoints = array(matrix.entryPoints, "entryPoints");
    const moduleIds = new Set(),
        specifiers = new Set();
    for (const entry of entryPoints) {
        require(idPattern.test(entry.id ?? "") &&
            !moduleIds.has(
                entry.id,
            ), `invalid/duplicate entry point ID: ${entry.id}`);
        moduleIds.add(entry.id);
        require(["public", "internal"].includes(
            entry.visibility,
        ), `${entry.id}: visibility required`);
        require(nonempty(
            entry.note,
        ), `${entry.id}: availability note required`);
        for (const name of [
            entry.specifier,
            ...array(entry.aliases, `${entry.id} aliases`, true),
        ]) {
            require(nonempty(name) &&
                !specifiers.has(
                    name,
                ), `invalid/duplicate module specifier: ${name}`);
            specifiers.add(name);
        }
        for (const id of array(
            entry.capabilities,
            `${entry.id} capabilities`,
        )) {
            require(ids.has(id), `${entry.id}: unknown capability ${id}`);
            if (entry.visibility === "internal")
                require(rows.find((r) => r.id === id)?.visibility ===
                    "internal", `${entry.id}: private module exposed as public capability`);
        }
        references(entry.evidence, `${entry.id} evidence`);
    }
    // These boundaries must stay represented even if the broad family survives.
    for (const name of [
        "node:worker_threads",
        "node:http2",
        "node:child_process",
        "node:fs/promises",
        "nona:ffi",
        "nona:internal/tls-crypto",
    ])
        require(specifiers.has(name), `missing entry point: ${name}`);
    return problems;
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
    try {
        const args = process.argv.slice(2);
        const matrix = readInventory(
            args.find((arg) => arg !== "--git") ?? inventoryPath,
        );
        const problems = validateInventory(matrix, {
            checkGit: args.includes("--git"),
        });
        if (problems.length) {
            console.error(problems.join("\n"));
            process.exitCode = 1;
        } else {
            console.log(
                `Completeness inventory v${matrix.schemaVersion}: ${matrix.capabilities.length} capabilities, ${matrix.entryPoints.length} module entry points, ${matrix.targets.length} targets; valid. Runtime probes were not executed.`,
            );
        }
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
