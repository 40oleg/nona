import { test } from "node:test";
import assert from "node:assert/strict";
import { compile } from "../src/compiler.js";
import { collectSourceUsage, lex } from "../src/frontend/lexer.js";
import { fsModuleSource } from "../src/frontend/fs-module.js";
import { pathCoreSourceForTarget } from "../src/frontend/path-module.js";
import { supportedNativeTargets, type Target } from "../src/target.js";

// node:fs uses resolve, join and dirname of nona:internal/path-core, not
// node:path, so a filesystem program does not link globbing, the RegExp
// engine, its Unicode property tables, the normalization tables or Annex B
// (#439).
const excluded = [
    "regexp",
    "unicodeProperties",
    "unicodeSets",
    "unicodeNormalization",
    "annexB",
    "process",
];

function linkedBy(source: string): string[] {
    const { usage } = collectSourceUsage(() => lex(source, { module: true }));
    return [
        ...(
            [
                "regexp",
                "unicodeProperties",
                "unicodeSets",
                "unicodeNormalization",
            ] as const
        ).filter((part) => usage[part]),
        ...Object.entries(usage.preludes)
            .filter(([, linked]) => linked)
            .map(([name]) => name),
    ];
}

test("the path core and the fs sources name no optional runtime part they do not need", () => {
    for (const target of supportedNativeTargets) {
        for (const [name, source] of [
            ["nona:internal/path-core", pathCoreSourceForTarget(target)],
            ["node:fs", fsModuleSource(target)],
        ] as const) {
            const linked = linkedBy(source);
            for (const part of excluded)
                assert.ok(
                    !linked.includes(part),
                    `${target} ${name} links ${part}`,
                );
        }
    }
});

function linkedParts(source: string, target: Target): string[] {
    const result = compile(source, {
        fileName: "/app.mjs",
        module: true,
        target,
        reportLink: true,
    });
    assert.ok(result.ok, result.ok ? "" : JSON.stringify(result.diagnostics));
    return (result.linked ?? []).map((part) => part.part);
}

const fsProbes = [
    'import { existsSync } from "node:fs"; console.log(existsSync("."));',
    'import { readFileSync, writeFileSync } from "node:fs"; writeFileSync("p.txt", "x"); console.log(readFileSync("p.txt", "utf8"));',
    'import fs from "node:fs"; console.log(fs.realpathSync("."), fs.readdirSync(".", { withFileTypes: true }).length); fs.rmSync("d", { recursive: true, force: true });',
];

for (const target of ["win32-x64", "linux-x64"] as const)
    test(`${target}: minimal fs programs link no path globbing, RegExp, Unicode tables or Annex B`, () => {
        for (const probe of fsProbes) {
            const linked = linkedParts(probe, target);
            for (const part of excluded)
                assert.ok(!linked.includes(part), `${probe} links ${part}`);
        }
        // Public path globbing still selects what its implementation needs.
        const glob = linkedParts(
            'import path from "node:path"; console.log(path.matchesGlob("a/b", "a/*"));',
            target,
        );
        for (const part of ["regexp", "unicodeProperties"])
            assert.ok(glob.includes(part), `matchesGlob does not link ${part}`);
        // So does a program that imports node:path next to node:fs.
        const both = linkedParts(
            'import { existsSync } from "node:fs"; import { normalize } from "node:path"; console.log(existsSync(normalize("./a/..")));',
            target,
        );
        for (const part of ["regexp", "unicodeNormalization"])
            assert.ok(both.includes(part), `fs + path does not link ${part}`);
    });
