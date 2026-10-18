import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Keep this structural test independent of the compiler/native target harness.
type Inventory = Record<string, any>;
interface Validator {
    readInventory(): Inventory;
    validateInventory(
        matrix: Inventory,
        options?: { checkGit: boolean },
    ): string[];
}
const validator = async () =>
    (await import(
        pathToFileURL(resolve("scripts/check-completeness-inventory.mjs")).href
    )) as Validator;

test("completeness inventory parses and resolves repository evidence references", async () => {
    const { readInventory, validateInventory } = await validator();
    assert.deepEqual(validateInventory(readInventory()), []);
});

test("module inventory covers explicit provider registrations and path flavors", async () => {
    const { readInventory } = await validator();
    const matrix = readInventory();
    const names = new Set<string>(
        matrix.entryPoints.flatMap((e: Inventory) => [
            e.specifier,
            ...e.aliases,
        ]),
    );
    for (const path of [
        "src/frontend/builtin-modules.ts",
        "src/frontend/node-compat-modules.ts",
    ]) {
        const source = readFileSync(resolve(path), "utf8");
        for (const match of source.matchAll(
            /"((?:node|nona):[a-z_]+(?:\/[a-z_-]+)?)"/g,
        )) {
            const name = match[1]!;
            assert.ok(names.has(name), `missing registered module ${name}`);
            if (name.startsWith("node:"))
                assert.ok(
                    names.has(name.slice(5)),
                    `missing bare alias ${name}`,
                );
        }
    }
    for (const flavor of ["posix", "win32"])
        assert.ok(
            names.has(`node:path/${flavor}`) && names.has(`path/${flavor}`),
        );
});

test("inventory rejects lost coverage, duplicate IDs, unsupported statuses and dangling references", async () => {
    const { readInventory, validateInventory } = await validator();
    const matrix = readInventory();
    matrix.capabilities[1].id = matrix.capabilities[0].id;
    matrix.capabilities[0].status = "probably-works";
    matrix.capabilities[0].evidence.sources.push("src/nonexistent.ts");
    matrix.capabilities = matrix.capabilities.filter(
        (r: Inventory) => r.family !== "crypto",
    );
    matrix.targets = matrix.targets.filter(
        (t: Inventory) => t.id !== "linux-arm64",
    );
    const problems = validateInventory(matrix, { checkGit: false }).join("\n");
    for (const expected of [
        "duplicate capability ID",
        "invalid status",
        "unknown reference",
        "missing coverage: apis/crypto",
        "missing target: linux-arm64",
    ])
        assert.ok(problems.includes(expected), expected);
});

test("a test filename cannot promote a capability to verified", async () => {
    const { readInventory, validateInventory } = await validator();
    const matrix = readInventory();
    matrix.capabilities[0].status = "implemented-verified";
    const problems = validateInventory(matrix, { checkGit: false }).join("\n");
    assert.match(problems, /verified requires passing build and run/);
    assert.match(problems, /verified lacks run evidence for linux-arm64/);
});

test("inventory rejects unpinned evidence, missing limitations and private/public confusion", async () => {
    const { readInventory, validateInventory } = await validator();
    const matrix = readInventory();
    const ref = matrix.evidence[Object.keys(matrix.evidence)[0]!];
    ref.url = ref.url.replace(matrix.audit.baselineCommit, "main");
    matrix.capabilities[0].limitations = "";
    matrix.capabilities[0].execution.run = "passed";
    matrix.entryPoints.find(
        (e: Inventory) => e.visibility === "internal",
    ).capabilities = [matrix.capabilities[0].id];
    const problems = validateInventory(matrix, { checkGit: false }).join("\n");
    for (const expected of [
        "URL must pin commit",
        "limitations required",
        "outcome lacks execution evidence",
        "private module exposed as public capability",
    ])
        assert.ok(problems.includes(expected), expected);
});

test("release provenance follows recorded blobs, not package version", async () => {
    const { readInventory, validateInventory } = await validator();
    const matrix = readInventory();
    const row = matrix.capabilities.find(
        (r: Inventory) => r.id === "language.float16",
    );
    row.release.relationship = "sources-unchanged-since-release";
    assert.ok(
        validateInventory(matrix).some((p) =>
            p.includes(
                "language.float16: release relationship disagrees with recorded blobs",
            ),
        ),
    );
});
