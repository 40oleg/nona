import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { compile, nodeModuleHost } from "../src/compiler.js";
import {
    hostFileSystem,
    NodeModuleHost,
    type NodeFs,
} from "../src/frontend/commonjs.js";

test("physical read observers see successful native paths and propagate failures", () => {
    const reads: string[] = [];
    const fs: NodeFs = {
        readFileSync(path) {
            if (path.endsWith("missing")) throw new Error("ENOENT");
            return "";
        },
        statSync: () => undefined,
        realpathSync: (path) => path,
    };
    const host = hostFileSystem(fs, (path) => reads.push(path));
    assert.equal(host.read("/C:/input.js"), "");
    assert.equal(host.read("/C:/missing"), undefined);
    assert.deepEqual(reads, ["C:/input.js"]);
    const failure = new Error("observer failed");
    assert.throws(
        () =>
            hostFileSystem(fs, () => {
                throw failure;
            }).read("/input.js"),
        (error) => error === failure,
    );
});

test("compile observes default Node host reads with and without conditions", () => {
    const work = resolve("work");
    mkdirSync(work, { recursive: true });
    const directory = mkdtempSync(join(work, "nona-inputs-"));
    try {
        const pkg = join(directory, "node_modules", "input-package");
        mkdirSync(pkg, { recursive: true });
        writeFileSync(
            join(pkg, "package.json"),
            JSON.stringify({
                exports: { tracked: "./chosen.mjs", default: "./default.mjs" },
            }),
        );
        writeFileSync(join(pkg, "chosen.mjs"), "export default 1;");
        writeFileSync(join(pkg, "default.mjs"), "export default 2;");
        const entry = join(directory, "entry.mjs");
        const source = 'import value from "input-package"; console.log(value);';
        // The default Node host must still use the supplied entry override.
        writeFileSync(entry, "invalid disk entry");
        for (const conditions of [undefined, ["tracked"]]) {
            const reads = new Set<string>();
            const onReadFile = (path: string) => {
                reads.add(resolve(path));
            };
            assert.ok(
                nodeModuleHost(
                    "linux-x64",
                    { fileName: entry, source },
                    conditions,
                    onReadFile,
                ) instanceof NodeModuleHost,
            );
            const result = compile(source, {
                target: "linux-x64",
                fileName: entry,
                module: true,
                conditions,
                onReadFile,
            });
            assert.equal(
                result.ok,
                true,
                result.ok ? "" : JSON.stringify(result.diagnostics),
            );
            assert.ok(reads.has(join(pkg, "package.json")));
            assert.ok(
                reads.has(join(pkg, conditions ? "chosen.mjs" : "default.mjs")),
            );
            assert.ok(
                !reads.has(
                    join(pkg, conditions ? "default.mjs" : "chosen.mjs"),
                ),
                "unselected conditional exports are not read",
            );
            assert.ok(!reads.has(entry), "entry overrides are not disk reads");
            assert.ok(
                [...reads].every(
                    (path) => !path.includes("?") && !path.includes("node:"),
                ),
            );
        }

        const cjsEntry = join(directory, "entry.cjs");
        const data = join(directory, "data.json");
        const cjs = 'console.log(require("./data.json").answer);';
        writeFileSync(data, '{"answer":42}');
        const reads: string[] = [];
        const cjsResult = compile(cjs, {
            target: "linux-x64",
            fileName: cjsEntry,
            onReadFile: (path) => reads.push(resolve(path)),
        });
        assert.equal(
            cjsResult.ok,
            true,
            cjsResult.ok ? "" : JSON.stringify(cjsResult.diagnostics),
        );
        assert.ok(
            reads.includes(data),
            "CommonJS detection keeps NodeModuleHost",
        );
    } finally {
        assert.equal(dirname(directory), work);
        rmSync(directory, { recursive: true, force: true });
    }
});

test("compile preserves custom virtual hosts without observing synthetic IDs", () => {
    const reads: string[] = [];
    const result = compile('import value from "virtual"; console.log(value);', {
        target: "linux-x64",
        fileName: "virtual-entry.mjs",
        module: true,
        moduleHost: {
            resolve: (specifier) => specifier,
            read: (path) =>
                path === "virtual" ? "export default 42;" : undefined,
        },
        onReadFile: (path) => reads.push(path),
    });
    assert.equal(
        result.ok,
        true,
        result.ok ? "" : JSON.stringify(result.diagnostics),
    );
    assert.deepEqual(reads, []);
});
