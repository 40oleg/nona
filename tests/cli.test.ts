import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import {
    mkdtempSync,
    readFileSync,
    writeFileSync,
    linkSync,
    rmSync,
    existsSync,
    symlinkSync,
    mkdirSync,
    readdirSync,
    statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname, basename, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { defaultManifest } from "../src/backend/pe/resources.js";
const cliEnvironment = {
    ...process.env,
    NONA_CACHE_DIR: resolve("work", "cli-cache"),
};
const cli = (args: string[]) =>
    spawnSync(process.execPath, ["dist/cli.js", ...args], {
        encoding: "utf8",
        windowsHide: true,
        env: cliEnvironment,
    });
function fixture(body: (dir: string) => void) {
    const root = resolve("work");
    mkdirSync(root, { recursive: true });
    const dir = mkdtempSync(join(root, "nona-cli-"));
    try {
        body(dir);
    } finally {
        assert.equal(dirname(resolve(dir)), root);
        assert.ok(basename(dir).startsWith("nona-cli-"));
        rmSync(dir, { recursive: true, force: true });
    }
}
function inputHashes(paths: readonly string[]) {
    return paths.map((path) => [
        path,
        createHash("sha256").update(readFileSync(path)).digest("hex"),
    ]);
}
function assertNoTemporaryOutput(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        assert.doesNotMatch(entry.name, /^\.nona-.*\.tmp$/, path);
        if (entry.isDirectory()) assertNoTemporaryOutput(path);
    }
}
function assertProtected(
    dir: string,
    inputs: readonly string[],
    protectedPath: string,
    run: () => ReturnType<typeof cli>,
): void {
    const before = inputHashes(inputs);
    try {
        const result = run();
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr, /compilation input/);
        assert.ok(result.stderr.includes(protectedPath), result.stderr);
    } finally {
        assert.deepEqual(inputHashes(inputs), before);
        assertNoTemporaryOutput(dir);
    }
}
test("CLI protects the entry before compilation reports a syntax error", () =>
    fixture((dir) => {
        const input = join(dir, "invalid.mjs");
        writeFileSync(input, ")");
        assertProtected(dir, [input], input, () =>
            cli(["build", input, "-o", input, "--target", "linux-x64"]),
        );
    }));

test("CLI protects a transitive module", () =>
    fixture((dir) => {
        const input = join(dir, "main.js"),
            middle = join(dir, "middle.js"),
            dependency = join(dir, "dependency.js");
        writeFileSync(
            input,
            'import { value } from "./middle.js"; console.log(value);',
        );
        writeFileSync(middle, 'export { value } from "./dependency.js";');
        writeFileSync(dependency, "export const value = 42;");
        assertProtected(dir, [input, middle, dependency], dependency, () =>
            cli(["build", input, "-o", dependency, "--target", "linux-x64"]),
        );
    }));

test("CLI protects files consumed only by require.resolve and top-level-await analysis", () =>
    fixture((dir) => {
        const input = join(dir, "main.mjs"),
            formatOnly = join(dir, "format-only.mjs"),
            asyncModule = join(dir, "async.mjs"),
            asyncLeaf = join(dir, "async-leaf.mjs");
        writeFileSync(
            input,
            [
                'import { createRequire } from "node:module";',
                "const require = createRequire(import.meta.url);",
                'require.resolve("./format-only.mjs");',
                'try { require("./async.mjs"); } catch {}',
            ].join("\n"),
        );
        writeFileSync(formatOnly, "export const value = 1;");
        writeFileSync(asyncModule, 'export { value } from "./async-leaf.mjs";');
        writeFileSync(
            asyncLeaf,
            "await Promise.resolve(); export const value = 2;",
        );
        const inputs = [input, formatOnly, asyncModule, asyncLeaf];
        for (const output of [formatOnly, asyncModule, asyncLeaf])
            assertProtected(dir, inputs, output, () =>
                cli(["build", input, "-o", output, "--target", "linux-x64"]),
            );
    }));

/** A complete one-image, 1-pixel, 32-bpp BMP icon, like resources.test.ts. */
function protectionIcon(): Uint8Array {
    const bytes = Buffer.alloc(70);
    bytes.writeUInt16LE(1, 2);
    bytes.writeUInt16LE(1, 4);
    bytes[6] = bytes[7] = 1;
    bytes.writeUInt16LE(1, 10);
    bytes.writeUInt16LE(32, 12);
    bytes.writeUInt32LE(48, 14);
    bytes.writeUInt32LE(22, 18);
    bytes.writeUInt32LE(40, 22);
    bytes.writeInt32LE(1, 26);
    bytes.writeInt32LE(2, 30);
    bytes.writeUInt16LE(1, 34);
    bytes.writeUInt16LE(32, 36);
    bytes.fill(255, 62, 66);
    return bytes;
}

function protectionProject(dir: string, resources = false) {
    const files: Record<string, string | Uint8Array> = {
        "package.json": JSON.stringify({
            name: "protection-fixture",
            bin: "main.mjs",
        }),
        "main.mjs": [
            'import { value } from "./middle.mjs";',
            'import common from "./middle.cjs";',
            'import data from "./data.json";',
            'import dependency from "fixture-dependency";',
            'import { basename } from "node:path";',
            'console.log(value, common, data.value, dependency, basename("/a/b"));',
        ].join("\n"),
        "middle.mjs": 'export { value } from "./leaf.mjs";',
        "leaf.mjs": "export const value = 1;",
        "middle.cjs":
            'module.exports = require("./leaf.cjs") + require("./fallback");',
        "leaf.cjs": "module.exports = 2;",
        "fallback/package.json": "null",
        "fallback/index.js": "module.exports = 0;",
        "data.json": '{"value":3}',
        "node_modules/fixture-dependency/package.json": JSON.stringify({
            name: "fixture-dependency",
            type: "module",
            exports: "./index.js",
        }),
        "node_modules/fixture-dependency/index.js": "export default 4;",
        ...(resources
            ? {
                  "app.ico": protectionIcon(),
                  "app.manifest": defaultManifest,
                  "version.json":
                      '{"FileVersion":"1.2.3.4","ProductName":"CLI protection"}',
              }
            : {}),
    };
    const inputs = Object.entries(files).map(([name, contents]) => {
        const path = join(dir, name);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, contents);
        return path;
    });
    const input = join(dir, "main.mjs");
    const options = resources
        ? [
              "--target",
              "win32-x64",
              "--icon",
              join(dir, "app.ico"),
              "--manifest",
              join(dir, "app.manifest"),
              "--version-info",
              join(dir, "version.json"),
          ]
        : ["--target", "linux-x64"];
    return { input, inputs, options };
}
const protectedInputs = [
    ["entry source", "main.mjs"],
    ["transitive ES module", "leaf.mjs"],
    ["transitive CommonJS module", "leaf.cjs"],
    ["JSON module", "data.json"],
    ["package-directory package.json", "package.json"],
    ["dependency package.json", "node_modules/fixture-dependency/package.json"],
    ["successfully read but ignored package.json", "fallback/package.json"],
    ["icon", "app.ico"],
    ["manifest", "app.manifest"],
    ["version information", "version.json"],
] as const;

for (const [description, name] of protectedInputs) {
    const resources = ["app.ico", "app.manifest", "version.json"].includes(
        name,
    );
    test(`CLI protects ${description} through exact and normalized paths`, () =>
        fixture((dir) => {
            const project = protectionProject(dir, resources),
                protectedPath = join(dir, name),
                input = name === "package.json" ? dir : project.input;
            const normalizationDirectory = join(
                dirname(protectedPath),
                "normalize",
            );
            mkdirSync(normalizationDirectory);
            for (const output of [
                protectedPath,
                `${normalizationDirectory}${sep}..${sep}${basename(protectedPath)}`,
            ])
                assertProtected(dir, project.inputs, protectedPath, () =>
                    cli(["build", input, "-o", output, ...project.options]),
                );
        }));

    test(`CLI protects ${description} through filesystem case aliases`, (t) =>
        fixture((dir) => {
            const project = protectionProject(dir, resources),
                protectedPath = join(dir, name),
                output = join(
                    dirname(protectedPath),
                    basename(protectedPath).toUpperCase(),
                );
            if (!existsSync(output)) {
                t.skip("Fixture filesystem distinguishes filename case");
                return;
            }
            const original = statSync(protectedPath, { bigint: true }),
                alias = statSync(output, { bigint: true });
            assert.equal(original.dev, alias.dev);
            assert.equal(original.ino, alias.ino);
            assertProtected(dir, project.inputs, protectedPath, () =>
                cli([
                    "build",
                    name === "package.json" ? dir : project.input,
                    "-o",
                    output,
                    ...project.options,
                ]),
            );
        }));

    for (const kind of ["hardlink", "symlink"] as const)
        test(`CLI protects ${description} through a ${kind}`, (t) =>
            fixture((dir) => {
                const project = protectionProject(dir, resources),
                    protectedPath = join(dir, name),
                    output = join(dir, `${kind}-output`);
                if (!createAlias(t, kind, protectedPath, output)) return;
                assertProtected(dir, project.inputs, protectedPath, () =>
                    cli([
                        "build",
                        name === "package.json" ? dir : project.input,
                        "-o",
                        output,
                        ...project.options,
                    ]),
                );
                assert.equal(
                    readFileSync(output).toString("hex"),
                    readFileSync(protectedPath).toString("hex"),
                );
            }));
}

function createAlias(
    t: TestContext,
    kind: "hardlink" | "symlink",
    input: string,
    output: string,
): boolean {
    try {
        if (kind === "hardlink") linkSync(input, output);
        else symlinkSync(input, output, "file");
        return true;
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (
            [
                "EPERM",
                "EACCES",
                "ENOTSUP",
                "EOPNOTSUPP",
                "ENOSYS",
                "EXDEV",
            ].includes(code ?? "")
        ) {
            t.skip(`${kind} unavailable on fixture filesystem: ${code}`);
            return false;
        }
        throw error;
    }
}

test("CLI protects inputs while replacing unrelated output and using builtins", () =>
    fixture((dir) => {
        const project = protectionProject(dir),
            output = join(dir, "program"),
            before = inputHashes(project.inputs);
        writeFileSync(output, "previous executable");
        const result = cli([
            "build",
            project.input,
            "-o",
            output,
            ...project.options,
        ]);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(
            readFileSync(output).subarray(0, 4).toString("hex"),
            "7f454c46",
        );
        assert.deepEqual(inputHashes(project.inputs), before);
        assertNoTemporaryOutput(dir);
    }));

test("CLI protects case-sensitive inputs while allowing a distinct-case output", (t) =>
    fixture((dir) => {
        const input = join(dir, "case.js"),
            output = join(dir, "CASE.JS");
        writeFileSync(input, "console.log(1);");
        if (existsSync(output)) {
            t.skip("Fixture filesystem aliases filename case");
            return;
        }
        const before = inputHashes([input]),
            result = cli([
                "build",
                input,
                "-o",
                output,
                "--target",
                "linux-x64",
            ]);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(
            readFileSync(output).subarray(0, 4).toString("hex"),
            "7f454c46",
        );
        assert.deepEqual(inputHashes([input]), before);
        assertNoTemporaryOutput(dir);
    }));

for (const outputName of ["missing.js", "package.json"])
    test(`CLI protects only successful reads, allowing missing ${outputName} probes as output`, () =>
        fixture((dir) => {
            const input = join(
                    dir,
                    outputName === "missing.js" ? "main.cjs" : "main.js",
                ),
                output = join(dir, outputName);
            writeFileSync(
                input,
                outputName === "missing.js"
                    ? 'try { require("./missing.js"); } catch (error) { console.log("optional"); }'
                    : "console.log(1);",
            );
            const before = inputHashes([input]);
            const result = cli([
                "build",
                input,
                "-o",
                output,
                "--target",
                "linux-x64",
            ]);
            assert.equal(result.status, 0, result.stderr);
            assert.equal(
                readFileSync(output).subarray(0, 4).toString("hex"),
                "7f454c46",
            );
            assert.deepEqual(inputHashes([input]), before);
            assertNoTemporaryOutput(dir);
        }));

test("CLI protects the selected --conditions input and permits an unread branch as output", () =>
    fixture((dir) => {
        const input = join(dir, "main.mjs"),
            metadata = join(dir, "node_modules", "conditional", "package.json"),
            selected = join(dirname(metadata), "selected.mjs"),
            unselected = join(dirname(metadata), "default.mjs");
        mkdirSync(dirname(metadata), { recursive: true });
        writeFileSync(
            input,
            'import value from "conditional"; console.log(value);',
        );
        writeFileSync(
            metadata,
            JSON.stringify({
                exports: { custom: "./selected.mjs", default: "./default.mjs" },
            }),
        );
        writeFileSync(selected, "export default 1;");
        writeFileSync(unselected, "export default 2;");
        const inputs = [input, metadata, selected, unselected],
            options = ["--target", "linux-x64", "--conditions", "custom"];
        assertProtected(dir, inputs, selected, () =>
            cli(["build", input, "-o", selected, ...options]),
        );
        const before = inputHashes([input, metadata, selected]),
            result = cli(["build", input, "-o", unselected, ...options]);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(
            readFileSync(unselected).subarray(0, 4).toString("hex"),
            "7f454c46",
        );
        assert.deepEqual(inputHashes([input, metadata, selected]), before);
        assertNoTemporaryOutput(dir);
    }));

test("CLI protects reads independently for each main invocation in one process", () =>
    fixture((dir) => {
        const first = join(dir, "first.mjs"),
            second = join(dir, "second.mjs"),
            shared = join(dir, "previous-input.mjs"),
            firstOutput = join(dir, "first-output");
        writeFileSync(
            first,
            'import value from "./previous-input.mjs"; console.log(value);',
        );
        writeFileSync(shared, "export default 1;");
        writeFileSync(second, "console.log(2);");
        const before = inputHashes([first, second]),
            runner = join(dir, "invocations.mjs");
        writeFileSync(
            runner,
            [
                'import assert from "node:assert/strict";',
                'process.argv = [process.execPath, "nona", "--version"];',
                `const { main } = await import(${JSON.stringify(pathToFileURL(resolve("dist/src/cli.js")).href)});`,
                `assert.equal(main(${JSON.stringify(["build", first, "-o", firstOutput, "--target", "linux-x64"])}), 0);`,
                `assert.equal(main(${JSON.stringify(["build", second, "-o", shared, "--target", "linux-x64"])}), 0);`,
            ].join("\n"),
        );
        const result = spawnSync(process.execPath, [runner], {
            encoding: "utf8",
            windowsHide: true,
            env: cliEnvironment,
        });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(
            readFileSync(shared).subarray(0, 4).toString("hex"),
            "7f454c46",
        );
        assert.deepEqual(inputHashes([first, second]), before);
        assertNoTemporaryOutput(dir);
    }));

test("CLI protects every read before attempting to write a temporary image", () =>
    fixture((dir) => {
        const project = protectionProject(dir),
            dependency = join(dir, "leaf.mjs"),
            marker = join(dir, "temporary-write-attempted"),
            preload = join(dir, "record-temporary-write.cjs");
        writeFileSync(
            preload,
            [
                'const fs = require("node:fs");',
                'const { basename } = require("node:path");',
                'const { syncBuiltinESMExports } = require("node:module");',
                "const write = fs.writeFileSync;",
                "fs.writeFileSync = function (path, ...args) {",
                "    if (/^\\.nona-.*\\.tmp$/.test(basename(String(path))))",
                `        write(${JSON.stringify(marker)}, "attempted");`,
                "    return write.call(this, path, ...args);",
                "};",
                "syncBuiltinESMExports();",
            ].join("\n"),
        );
        assertProtected(dir, [...project.inputs, preload], dependency, () =>
            spawnSync(
                process.execPath,
                [
                    "--require",
                    preload,
                    "dist/cli.js",
                    "build",
                    project.input,
                    "-o",
                    dependency,
                    ...project.options,
                ],
                { encoding: "utf8", windowsHide: true, env: cliEnvironment },
            ),
        );
        assert.equal(existsSync(marker), false);
    }));

test("CLI protects a dependency aliased after compilation and cleans its temporary image", (t) =>
    fixture((dir) => {
        const project = protectionProject(dir),
            dependency = join(dir, "leaf.mjs"),
            output = join(dir, "late-output"),
            probe = join(dir, "hardlink-probe"),
            marker = join(dir, "alias-created"),
            preload = join(dir, "late-alias.cjs");
        if (!createAlias(t, "hardlink", dependency, probe)) return;
        rmSync(probe);
        writeFileSync(output, "previous executable");
        // The wrapper creates the alias only after the temporary image was
        // written, deterministically exercising the final pre-rename check.
        writeFileSync(
            preload,
            [
                'const fs = require("node:fs");',
                'const { basename } = require("node:path");',
                'const { syncBuiltinESMExports } = require("node:module");',
                "const write = fs.writeFileSync;",
                "fs.writeFileSync = function (path, ...args) {",
                "    const result = write.call(this, path, ...args);",
                "    if (/^\\.nona-.*\\.tmp$/.test(basename(String(path)))) {",
                `        fs.unlinkSync(${JSON.stringify(output)});`,
                `        fs.linkSync(${JSON.stringify(dependency)}, ${JSON.stringify(output)});`,
                `        write(${JSON.stringify(marker)}, String(path));`,
                "    }",
                "    return result;",
                "};",
                "syncBuiltinESMExports();",
            ].join("\n"),
        );
        assertProtected(dir, [...project.inputs, preload], dependency, () =>
            spawnSync(
                process.execPath,
                [
                    "--require",
                    preload,
                    "dist/cli.js",
                    "build",
                    project.input,
                    "-o",
                    output,
                    ...project.options,
                ],
                { encoding: "utf8", windowsHide: true, env: cliEnvironment },
            ),
        );
        assert.ok(existsSync(marker), "temporary-image write interception ran");
        assert.equal(existsSync(readFileSync(marker, "utf8")), false);
        assert.equal(
            readFileSync(output, "utf8"),
            readFileSync(dependency, "utf8"),
        );
    }));
test("CLI help and version", () => {
    const help = cli(["--help"]);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /Nona 0.33.0/);
    const version = cli(["--version"]);
    assert.equal(version.status, 0);
    assert.equal(version.stdout, "0.33.0\n");
});
test("CLI builds nested output and runs executable", () =>
    fixture((dir) => {
        const input = join(dir, "in.js"),
            output = join(dir, "nested", "out.exe");
        writeFileSync(input, 'console.log("hello");');
        const r = cli(["build", input, "-o", output]);
        assert.equal(r.status, 0, r.stderr);
        const native = spawnSync(output, [], {
            encoding: "utf8",
            windowsHide: true,
        });
        assert.equal(native.status, 0);
        assert.equal(native.stdout, "hello\n");
    }));
test("CLI emits Linux ELF for linux-x64 target", () =>
    fixture((dir) => {
        const input = join(dir, "in.js"),
            output = join(dir, "out");
        writeFileSync(input, 'console.log("hello");');
        const r = cli(["build", input, "-o", output, "--target", "linux-x64"]);
        assert.equal(r.status, 0, r.stderr);
        const elf = readFileSync(output);
        assert.equal(elf.subarray(0, 4).toString("hex"), "7f454c46");
        assert.equal(elf.readUInt16LE(18), 62);
    }));
test("CLI --full-runtime links the parts a program does not mention", () =>
    fixture((dir) => {
        const input = join(dir, "in.js");
        writeFileSync(input, 'console.log("hello");');
        const trimmed = cli([
                "build",
                input,
                "-o",
                join(dir, "trimmed"),
                "--target",
                "linux-x64",
            ]),
            full = cli([
                "build",
                input,
                "-o",
                join(dir, "full"),
                "--target",
                "linux-x64",
                "--full-runtime",
            ]);
        assert.equal(trimmed.status, 0, trimmed.stderr);
        assert.equal(full.status, 0, full.stderr);
        assert.ok(
            readFileSync(join(dir, "full")).length -
                readFileSync(join(dir, "trimmed")).length >
                3_000_000,
        );
        assert.equal(
            cli([
                "build",
                input,
                "-o",
                join(dir, "x"),
                "--full-runtime",
                "--full-runtime",
            ]).status,
            1,
        );
        assert.match(cli(["--help"]).stdout, /--full-runtime/);
    }));
test("CLI --link adds single parts and --print-link explains the link", () =>
    fixture((dir) => {
        const input = join(dir, "in.js");
        writeFileSync(
            input,
            'const name = ["Pro", "xy"].join(""); console.log(typeof globalThis[name], "a".match(/a/).length);',
        );
        const report = cli([
            "build",
            input,
            "--target",
            "linux-x64",
            "--print-link",
        ]);
        assert.equal(report.status, 0, report.stderr);
        assert.match(report.stdout, /^Linked runtime parts:\n/);
        assert.match(report.stdout, /\n {2}regexp +"match" in the source\n/);
        assert.match(
            report.stdout,
            /\n {2}timers +"globalThis" in the source\n/,
        );
        assert.doesNotMatch(report.stdout, /proxy/);
        const linked = cli([
            "build",
            input,
            "--target",
            "linux-x64",
            "--link",
            "proxy,unicodeNormalization",
            "--print-link",
        ]);
        assert.equal(linked.status, 0, linked.stderr);
        assert.match(linked.stdout, /\n {2}proxy +requested with --link\n/);
        assert.match(
            linked.stdout,
            /\n {2}unicodeNormalization +requested with --link\n/,
        );
        const empty = join(dir, "empty.js");
        writeFileSync(empty, "");
        assert.equal(
            cli(["build", empty, "--target", "linux-x64", "--print-link"])
                .stdout,
            "No optional runtime parts are linked.\n",
        );
        // Ordinary strings and local names link nothing (#438).
        const data = join(dir, "data.js");
        writeFileSync(
            data,
            'const bold = 1, small = 2; console.log("normalize", "link", bold + small);',
        );
        assert.equal(
            cli(["build", data, "--target", "linux-x64", "--print-link"])
                .stdout,
            "No optional runtime parts are linked.\n",
        );
        writeFileSync(data, 'console.log("a".normalize(), "a".link("x"));');
        const used = cli([
            "build",
            data,
            "--target",
            "linux-x64",
            "--print-link",
        ]).stdout;
        assert.match(
            used,
            /\n {2}unicodeNormalization +"normalize" in the source\n/,
        );
        assert.match(used, /\n {2}annexB +"link" in the source\n/);
        const unknown = cli([
            "build",
            input,
            "--target",
            "linux-x64",
            "--link=proxy,nothing",
            "--print-link",
        ]);
        assert.equal(unknown.status, 1);
        assert.match(
            unknown.stderr,
            /E_OPTION: Unknown runtime part "nothing"/,
        );
        assert.equal(
            cli(["build", input, "-o", join(dir, "x"), "--link"]).status,
            1,
        );
        assert.match(cli(["--help"]).stdout, /--print-link/);
    }));
test("CLI rejects missing/unknown/duplicate arguments", () => {
    for (const args of [
        [],
        ["build"],
        ["build", "a.js"],
        ["build", "a.js", "-o", "b.exe", "--target", "linux"],
        ["build", "a.js", "-o", "b", "-o", "c"],
        ["--wat"],
    ])
        assert.equal(cli(args).status, 1);
});
test("analysis failure preserves existing output with positioned diagnostic", () =>
    fixture((dir) => {
        const input = join(dir, "in.js"),
            output = join(dir, "out.exe");
        writeFileSync(input, "var x=1;\n)");
        writeFileSync(output, "original");
        const before = inputHashes([input]);
        const r = cli(["build", input, "-o", output, "--target", "linux-x64"]);
        assert.equal(r.status, 1);
        assert.match(r.stderr, /in\.js:2:1.*E_SYNTAX/);
        assert.equal(readFileSync(output, "utf8"), "original");
        assert.deepEqual(inputHashes([input]), before);
        assertNoTemporaryOutput(dir);
    }));
test("an internal compiler failure is a located E_INTERNAL diagnostic naming the phase", () =>
    fixture((dir) => {
        const input = join(dir, "in.js"),
            output = join(dir, "out");
        writeFileSync(input, "console.log(1);");
        writeFileSync(output, "original");
        const before = inputHashes([input]);
        for (const phase of ["parse", "lower", "codegen"]) {
            const r = spawnSync(
                process.execPath,
                [
                    "dist/cli.js",
                    "build",
                    input,
                    "-o",
                    output,
                    "--target",
                    "linux-x64",
                ],
                {
                    encoding: "utf8",
                    windowsHide: true,
                    env: { ...cliEnvironment, NONA_DEBUG_FAIL_PHASE: phase },
                },
            );
            assert.equal(r.status, 1);
            assert.equal(
                r.stderr,
                `${input}:1:1 E_INTERNAL: Internal compiler error in ${phase}: Injected failure (NONA_DEBUG_FAIL_PHASE)\n`,
            );
            assert.equal(readFileSync(output, "utf8"), "original");
            assert.deepEqual(inputHashes([input]), before);
            assertNoTemporaryOutput(dir);
        }
    }));
test("missing input produces no output", () =>
    fixture((dir) => {
        const output = join(dir, "out.exe");
        assert.equal(
            cli(["build", join(dir, "missing.js"), "-o", output]).status,
            1,
        );
        assert.equal(existsSync(output), false);
        assertNoTemporaryOutput(dir);
    }));
test(
    "locked output fails without removing previous executable",
    { skip: process.platform !== "win32" },
    async () => {
        mkdirSync(resolve("work"), { recursive: true });
        const dir = mkdtempSync(join(resolve("work"), "nona-cli-")),
            input = join(dir, "in.js"),
            output = join(dir, "out.exe");
        writeFileSync(input, 'console.log("ok");');
        writeFileSync(output, "original");
        const before = inputHashes([input]);
        const script =
            "$nonaLock=[System.IO.File]::Open('" +
            output.replaceAll("'", "''") +
            "',[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::Read); [Console]::Out.WriteLine('locked'); [Console]::Out.Flush(); [Console]::ReadLine() | Out-Null; $nonaLock.Dispose()";
        const holder = spawn(
            "powershell.exe",
            [
                "-NoProfile",
                "-NonInteractive",
                "-EncodedCommand",
                Buffer.from(script, "utf16le").toString("base64"),
            ],
            { windowsHide: true, stdio: "pipe" },
        );
        try {
            await new Promise<void>((res, rej) => {
                const timer = setTimeout(
                    () => rej(new Error("lock helper timed out")),
                    // PowerShell can take well over 10 s to start on a busy runner.
                    60000,
                );
                holder.on("error", (e) => {
                    clearTimeout(timer);
                    rej(e);
                });
                holder.stdout.once("data", () => {
                    clearTimeout(timer);
                    res();
                });
                holder.once("exit", (code) => {
                    clearTimeout(timer);
                    rej(new Error("lock helper exited " + code));
                });
            });
            const result = cli([
                "build",
                input,
                "-o",
                output,
                "--target",
                "win32-x64",
            ]);
            assert.equal(result.status, 1);
            assert.equal(readFileSync(output, "utf8"), "original");
            assert.deepEqual(inputHashes([input]), before);
            assertNoTemporaryOutput(dir);
        } finally {
            holder.stdin.end("\n");
            await new Promise<void>((res) => {
                if (holder.exitCode !== null) {
                    res();
                    return;
                }
                holder.once("exit", () => res());
                setTimeout(() => {
                    holder.kill();
                    res();
                }, 2000).unref();
            });
            assert.equal(dirname(resolve(dir)), resolve("work"));
            assert.ok(basename(dir).startsWith("nona-cli-"));
            rmSync(dir, { recursive: true, force: true });
        }
    },
);

test("CLI --subsystem option", () => {
    mkdirSync(resolve("work"), { recursive: true });
    const directory = mkdtempSync(join(resolve("work"), "nona-cli-subsystem-"));
    try {
        const input = join(directory, "app.js");
        writeFileSync(input, "console.log('x');\n");
        assert.equal(
            cli([
                "build",
                input,
                "-o",
                join(directory, "app.exe"),
                "--target",
                "win32-x64",
                "--subsystem",
                "windows",
            ]).status,
            0,
        );
        assert.equal(
            readFileSync(join(directory, "app.exe")).readUInt16LE(
                readFileSync(join(directory, "app.exe")).readUInt32LE(0x3c) +
                    24 +
                    68,
            ),
            2,
        );
        const bad = cli([
            "build",
            input,
            "-o",
            join(directory, "bad.exe"),
            "--target",
            "win32-x64",
            "--subsystem",
            "native",
        ]);
        assert.equal(bad.status, 1);
        assert.match(bad.stderr, /Unsupported subsystem/);
        const linux = cli([
            "build",
            input,
            "-o",
            join(directory, "app"),
            "--target",
            "linux-x64",
            "--subsystem",
            "windows",
        ]);
        assert.equal(linux.status, 1);
        assert.match(linux.stderr, /requires --target win32-x64/);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
