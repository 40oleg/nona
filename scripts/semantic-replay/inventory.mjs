import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "./report.mjs";
export const root = fileURLToPath(new URL("../../", import.meta.url));
const json = (file) =>
    JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
const inventory = json("./fixtures/cases.json");
export const retained = json("./fixtures/retained.json");
export const selectorContracts = inventory.selectorContracts;
export const sampleIds = [
    11, 175, 176, 340, 341, 505, 506, 670, 671, 835, 836, 1000,
];
export function validateDefaultContract(fixture) {
    if (!fixture.defaultContract && !fixture.defaultPartAbsent) return false;
    assert.equal(
        fixture.id,
        "documented-computed-name",
        "no other default-mode exception is authorized",
    );
    assert.equal(fixture.goal, "script");
    assert.equal(
        fixture.files[fixture.entry],
        'const key = "Pro" + "xy"; console.log(typeof globalThis[key]);',
    );
    assert.deepEqual(fixture.defaultContract, {
        stdout: "undefined\n",
        stderr: "",
        status: 0,
    });
    assert.deepEqual(fixture.expected, {
        stdout: "function\n",
        stderr: "",
        status: 0,
    });
    assert.equal(fixture.defaultPartAbsent, "proxy");
    assert.deepEqual(fixture.link, ["proxy"]);
    assert.deepEqual(fixture.modes, ["default", "full", "explicit"]);
    return true;
}
export function verifyCoverage() {
    for (const c of inventory.coverage)
        assert.equal(
            sha256(
                readFileSync(resolve(root, c.file), "utf8").replaceAll(
                    "\r\n",
                    "\n",
                ),
            ),
            c.sha256,
            `${c.file}: review replay inventory after changing dependency families`,
        );
}
export function loadInventory(lane = "pr") {
    assert.ok(["pr", "candidate"].includes(lane), "unknown inventory lane");
    const manifestText = readFileSync(
        resolve(root, "programs/manifest.json"),
        "utf8",
    );
    const manifest = JSON.parse(manifestText);
    const manifestSha256 = sha256(manifestText);
    assert.deepEqual(
        manifest.map((c) => c.id),
        Array.from({ length: 1000 }, (_, i) => i + 1),
    );
    const corpus = manifest
        .filter((c) => lane === "candidate" || sampleIds.includes(c.id))
        .map((c) => {
            assert.match(c.file, /^(?:[a-z]+\/)?\d{3,4}-[a-z0-9-]+\.js$/);
            const source = readFileSync(
                resolve(root, "programs", c.file),
                "utf8",
            );
            assert.equal(sha256(source), c.sha256, `${c.file}: stale manifest`);
            return {
                id: `corpus-${c.id}`,
                corpusId: c.id,
                family: "corpus",
                goal: "script",
                entry: "main.js",
                files: { "main.js": source },
                modes: ["default", "full"],
                expected: { stdout: c.stdout, stderr: "", status: 0 },
                provenance: {
                    file: `programs/${c.file}`,
                    manifestSha256,
                    sourceSha256: c.sha256,
                    purpose: c.purpose,
                    features: c.features,
                },
            };
        });
    const cases = structuredClone([...inventory.cases, ...corpus]);
    assert.equal(
        new Set(cases.map((c) => c.id)).size,
        cases.length,
        "duplicate case IDs",
    );
    for (const c of cases) {
        validateDefaultContract(c);
        assert.match(c.id, /^[a-z0-9-]+$/);
        assert.ok(Object.hasOwn(c.files, c.entry));
        assert.ok(["script", "module"].includes(c.goal));
        assert.equal(new Set(c.modes).size, c.modes.length);
        for (const mode of c.modes)
            assert.ok(["default", "full", "explicit"].includes(mode));
        if (c.provenance?.sourceSha256)
            assert.equal(
                sha256(c.files[c.entry]),
                c.provenance.sourceSha256,
                c.id,
            );
        c.resolution ??= {
            kind: "relative-files",
            extensions: "exact",
            builtins: false,
        };
        c.inputSha256 = sha256(
            JSON.stringify({
                goal: c.goal,
                entry: c.entry,
                files: c.files,
                resolution: c.resolution,
            }),
        );
    }
    for (const contract of selectorContracts)
        assert.ok(
            cases.some((c) => c.id === contract.semanticId),
            contract.id,
        );
    return cases;
}
export function summarizeInventory(cases) {
    const groups = Map.groupBy(cases, (c) => c.inputSha256);
    return {
        cases: cases.length,
        uniqueInputs: groups.size,
        uniqueInputModeGoals: new Set(
            cases.flatMap((c) =>
                c.modes.map((mode) => `${c.inputSha256}:${c.goal}:${mode}`),
            ),
        ).size,
        nativeRuns: cases.reduce((n, c) => n + c.modes.length, 0),
        oracleRuns: cases.length,
        goals: Object.fromEntries(
            Object.entries(Object.groupBy(cases, (c) => c.goal)).map(
                ([goal, items]) => [goal, items.length],
            ),
        ),
        modes: Object.fromEntries(
            ["default", "full", "explicit"].map((mode) => [
                mode,
                cases.filter((c) => c.modes.includes(mode)).length,
            ]),
        ),
        families: Object.fromEntries(
            Object.entries(Object.groupBy(cases, (c) => c.family)).map(
                ([family, items]) => [family, items.length],
            ),
        ),
        aliases: [...groups.values()]
            .filter((items) => items.length > 1)
            .map((items) => items.map((c) => c.id)),
        selectorContracts: selectorContracts.length,
        inventory: cases.map((c) => ({
            id: c.id,
            inputSha256: c.inputSha256,
            goal: c.goal,
            modes: c.modes,
            family: c.family,
        })),
    };
}
