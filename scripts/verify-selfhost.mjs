// Development verification only: child compilers receive an empty PATH.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    chmodSync,
    readFileSync,
    writeFileSync,
    statSync,
    copyFileSync,
    mkdirSync,
    renameSync,
    readdirSync,
    linkSync,
    symlinkSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { compileToIR, compileModuleToIR } from "../dist/src/compiler.js";

if (process.platform === "win32" && process.env.GITHUB_ACTIONS !== "true")
    throw Error("Native Windows verification runs only in CI");
const target = process.argv[2],
    stage1 = resolve(process.argv[3]);
const cliMode = process.argv.includes("--cli");
const platformSmoke = process.argv.includes("--platform-smoke");
const directory = dirname(stage1),
    stage2 = join(
        directory,
        "stage2" + (process.platform === "win32" ? ".exe" : ""),
    );
const environment = {
    PATH: "",
    NONA_CACHE: "0",
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
};
function invoke(image, args, extra = {}) {
    const result = spawnSync(image, args, {
        env: { ...environment, ...extra },
        encoding: "utf8",
        timeout: 1800000,
        maxBuffer: 16 << 20,
        windowsHide: true,
    });
    writeFileSync(
        join(directory, "last-native-run.json"),
        JSON.stringify(
            {
                image,
                args,
                status: result.status,
                signal: result.signal,
                error: result.error?.message,
                stdout: result.stdout,
                stderr: result.stderr,
            },
            null,
            2,
        ),
    );
    assert.equal(result.error, undefined, result.error?.message);
    return result;
}
function run(image, args, extra = {}) {
    const result = invoke(image, args, extra);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
}
function sameImage(actual, expected, description) {
    assert.equal(actual.length, expected.length, description + " (length)");
    const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
    assert.equal(hash(actual), hash(expected), description + " (SHA-256)");
}
function buildArgs(input, output) {
    return cliMode
        ? ["build", input, "-o", output, "--target", target]
        : [input, output, target];
}
function checkOutputProtection(image) {
    const root = join(directory, "output-protection");
    mkdirSync(root);
    const files = [];
    const put = (name, contents) => {
        const path = join(root, name);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, contents);
        files.push(path);
        return path;
    };
    const packageDirectory = join(root, "package");
    put("package/package.json", '{"name":"protected-app","bin":"entry.mjs"}');
    put(
        "package/entry.mjs",
        "import { value } from './middle.mjs';import common from './common.cjs';import { number } from 'protected-dependency';console.log(value+common+number);",
    );
    put("package/middle.mjs", "export { value } from './leaf.mjs';");
    put("package/leaf.mjs", "export const value=20;");
    put(
        "package/common.cjs",
        "module.exports=require('./data.json')+require('./fallback');",
    );
    put("package/data.json", "20");
    // Successful metadata reads still count when the resolver ignores the value.
    put("package/fallback/package.json", "null");
    put("package/fallback/index.js", "module.exports=0;");
    put(
        "package/node_modules/protected-dependency/package.json",
        '{"type":"module","exports":"./index.js"}',
    );
    put(
        "package/node_modules/protected-dependency/index.js",
        "export const number=2;",
    );
    const application = join(
        root,
        process.platform === "win32" ? "app.exe" : "app",
    );
    run(image, buildArgs(packageDirectory, application));
    assert.equal(run(application, []), "42\n");
    const snapshots = new Map(files.map((path) => [path, readFileSync(path)]));
    snapshots.set(application, readFileSync(application));
    const temporaryFiles = (path) =>
        readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
            const child = join(path, entry.name);
            return entry.isDirectory()
                ? temporaryFiles(child)
                : /^\.nona-.*\.tmp$/.test(entry.name)
                  ? [child]
                  : [];
        });
    const refuse = (input, output, consumed, args = []) => {
        const beforeOutput = readFileSync(output);
        const result = invoke(image, ["build", input, "-o", output, ...args]);
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr, /compilation input/);
        assert.ok(result.stderr.includes(consumed), result.stderr);
        for (const [path, original] of snapshots)
            sameImage(
                readFileSync(path),
                original,
                "native CLI modified " + path,
            );
        sameImage(
            readFileSync(output),
            beforeOutput,
            "native CLI modified alias " + output,
        );
        assert.deepEqual(
            temporaryFiles(root),
            [],
            "native CLI left temporary output",
        );
    };
    let serial = 0;
    const unavailable = ["EPERM", "EACCES", "ENOSYS", "EOPNOTSUPP", "ENOTSUP"];
    const aliases = (path) => {
        const hard = join(root, "hardlink-" + serial);
        const symbolic = join(root, "symlink-" + serial++);
        const outputs = [path];
        try {
            linkSync(path, hard);
            outputs.push(hard);
        } catch (error) {
            if (!unavailable.includes(error.code)) throw error;
            console.log("Native CLI hard-link check unavailable:", error.code);
        }
        try {
            symlinkSync(path, symbolic);
            outputs.push(symbolic);
        } catch (error) {
            if (!unavailable.includes(error.code)) throw error;
            console.log(
                "Native CLI symbolic-link check unavailable:",
                error.code,
            );
        }
        return outputs;
    };
    for (const consumed of files)
        for (const output of aliases(consumed))
            refuse(packageDirectory, output, consumed, ["--target", target]);
    const packageAlias = join(root, "package-alias");
    try {
        symlinkSync(
            packageDirectory,
            packageAlias,
            process.platform === "win32" ? "junction" : "dir",
        );
    } catch (error) {
        if (!unavailable.includes(error.code)) throw error;
        console.log(
            "Native CLI parent-directory alias check unavailable:",
            error.code,
        );
    }
    if (readdirSync(root).includes("package-alias"))
        refuse(
            packageDirectory,
            join(packageAlias, "leaf.mjs"),
            join(packageDirectory, "leaf.mjs"),
            ["--target", target],
        );

    const scopePackage = put(
        "scope/package.json",
        '{"name":"protected-scope"}',
    );
    const scopeInput = put(
        "scope/main.js",
        "import { value } from './dependency.js';console.log(value);",
    );
    const scopeDependency = put(
        "scope/dependency.js",
        "export const value=42;",
    );
    for (const path of [scopePackage, scopeInput, scopeDependency])
        snapshots.set(path, readFileSync(path));
    run(image, buildArgs(scopeInput, join(root, "scope.image")));
    for (const output of aliases(scopePackage))
        refuse(scopeInput, output, scopePackage, ["--target", target]);

    const analysisInput = put(
        "analysis/main.mjs",
        "import { createRequire } from 'node:module';const require=createRequire(import.meta.url);require.resolve('./format-only.mjs');try{require('./async.mjs');}catch{}console.log(42);",
    );
    const analysisFiles = [
        put("analysis/format-only.mjs", "export const value=1;"),
        put("analysis/async.mjs", "export { value } from './async-leaf.mjs';"),
        put(
            "analysis/async-leaf.mjs",
            "export const value=await Promise.resolve(1);",
        ),
    ];
    for (const path of [analysisInput, ...analysisFiles])
        snapshots.set(path, readFileSync(path));
    run(image, buildArgs(analysisInput, join(root, "analysis.image")));
    for (const consumed of analysisFiles)
        refuse(analysisInput, consumed, consumed, ["--target", target]);

    // Cross-compile PE resources on every host; these outputs are never run.
    const resourceInput = put("resources/app.js", "console.log(42);");
    const ico = Buffer.alloc(70);
    ico.writeUInt16LE(1, 2);
    ico.writeUInt16LE(1, 4);
    ico[6] = ico[7] = 1;
    ico.writeUInt16LE(1, 10);
    ico.writeUInt16LE(32, 12);
    ico.writeUInt32LE(48, 14);
    ico.writeUInt32LE(22, 18);
    ico.writeUInt32LE(40, 22);
    ico.writeInt32LE(1, 26);
    ico.writeInt32LE(2, 30);
    ico.writeUInt16LE(1, 34);
    ico.writeUInt16LE(32, 36);
    const resourceFiles = [
        ["--icon", put("resources/app.ico", ico)],
        ["--manifest", put("resources/app.manifest", "<assembly/>")],
        [
            "--version-info",
            put("resources/version.json", '{"FileVersion":"1.2.3.4"}'),
        ],
    ];
    snapshots.set(resourceInput, readFileSync(resourceInput));
    for (const [, path] of resourceFiles)
        snapshots.set(path, readFileSync(path));
    const resourceArgs = ["--target", "win32-x64", ...resourceFiles.flat()];
    run(image, [
        "build",
        resourceInput,
        "-o",
        join(root, "resources/app.exe"),
        ...resourceArgs,
    ]);
    for (const [, consumed] of resourceFiles)
        for (const output of aliases(consumed))
            refuse(resourceInput, output, consumed, resourceArgs);
    console.log(
        "Native CLI protected consumed modules, JSON, package metadata and resources, including aliases",
    );
}
const fixtures = [
    ["arithmetic.js", "console.log(6*7);", "42\n"],
    [
        "module.mjs",
        "import path from 'node:path';console.log(path.posix.normalize('/a/../b'));",
        "/b\n",
    ],
    [
        "regexp.js",
        "console.log(/(?<word>a+)/u.exec('aaa').groups.word);",
        "aaa\n",
    ],
];
function check(image) {
    for (const [name, source, expected] of fixtures) {
        const input = join(directory, name),
            output = join(
                directory,
                name + "." + (process.platform === "win32" ? "exe" : "elf"),
            );
        writeFileSync(input, source);
        run(image, buildArgs(input, output));
        // Assembler serials are process state. Compare fresh native and fresh Node
        // compiler processes rather than reusing the verifier's compiler cache.
        const oracleOutput = output + ".oracle";
        const oracle = spawnSync(
            process.execPath,
            [
                resolve("dist/cli.js"),
                "build",
                input,
                "-o",
                oracleOutput,
                "--target",
                target,
            ],
            {
                env: { ...process.env, NONA_CACHE: "0" },
                encoding: "utf8",
                timeout: 120000,
                windowsHide: true,
            },
        );
        assert.equal(oracle.status, 0, oracle.stderr);
        if (process.platform !== "win32") chmodSync(output, 0o755);
        assert.equal(run(output, []), expected);
        try {
            sameImage(
                readFileSync(output),
                readFileSync(oracleOutput),
                "native compiler image differs from bootstrap: " + name,
            );
        } catch (error) {
            const nativeIR = output + ".native-ir.json";
            run(image, buildArgs(input, output), {
                NONA_SELFHOST_DUMP_IR: nativeIR,
            });
            const oracleIR = name.endsWith(".mjs")
                ? compileModuleToIR(source, input, undefined, "", target)
                : compileToIR(source, input, undefined, target);
            writeFileSync(
                output + ".oracle-ir.json",
                JSON.stringify(oracleIR, (_key, value) =>
                    typeof value === "bigint"
                        ? { bigint: String(value) }
                        : value,
                ),
            );
            run(image, buildArgs(input, output), {
                NONA_SELFHOST_TRACE: output + ".native",
            });
            const trace = spawnSync(
                process.execPath,
                [
                    join(directory, "sources", "selfhost-entry.mjs"),
                    ...buildArgs(input, output + ".trace-oracle"),
                ],
                {
                    env: {
                        ...process.env,
                        NONA_CACHE: "0",
                        NONA_SELFHOST_TRACE: output + ".oracle",
                    },
                    encoding: "utf8",
                    timeout: 120000,
                    windowsHide: true,
                },
            );
            assert.equal(trace.status, 0, trace.stderr);
            throw error;
        }
        console.log("Native compiler regression passed:", image, name);
    }
}
check(stage1);
let validated = stage1;
if (!platformSmoke) {
    run(
        stage1,
        buildArgs(join(directory, "sources", "selfhost-entry.mjs"), stage2),
    );
    if (process.platform !== "win32") chmodSync(stage2, 0o755);
    sameImage(
        readFileSync(stage2),
        readFileSync(stage1),
        "stage 1 and stage 2 compiler images differ",
    );
    console.log(
        "Stage 1 built deterministic stage 2 with Node absent from PATH",
    );
    check(stage2);
    validated = stage2;
}
if (cliMode) {
    assert.match(run(validated, ["--help"]), /Usage: nona build/);
    assert.equal(
        run(validated, ["--version"]),
        JSON.parse(readFileSync("package.json", "utf8")).version + "\n",
    );
    const input = join(directory, "arithmetic.js"),
        cached = join(
            directory,
            "cached" + (process.platform === "win32" ? ".exe" : ".elf"),
        );
    const cacheDirectory = join(directory, "cache");
    run(validated, buildArgs(input, cached), {
        NONA_CACHE: "1",
        NONA_CACHE_DIR: cacheDirectory,
    });
    const first = readFileSync(cached);
    run(validated, buildArgs(input, cached), {
        NONA_CACHE: "1",
        NONA_CACHE_DIR: cacheDirectory,
    });
    sameImage(readFileSync(cached), first, "native CLI warm cache differs");
    checkOutputProtection(validated);
    if (process.platform !== "win32")
        assert.equal(statSync(cached).mode & 0o777, 0o755);
    console.log(
        "Native CLI help, version, warm cache and output protections passed",
    );
    const standalone = join(directory, "standalone");
    mkdirSync(standalone);
    const relocated = join(
        standalone,
        process.platform === "win32" ? "nona.exe" : "nona",
    );
    copyFileSync(validated, relocated);
    if (process.platform !== "win32") chmodSync(relocated, 0o755);
    const sources = join(directory, "sources"),
        hidden = join(directory, "sources.hidden");
    renameSync(sources, hidden);
    try {
        const input = join(directory, "module.mjs"),
            output = join(
                standalone,
                process.platform === "win32"
                    ? "application.exe"
                    : "application",
            );
        run(relocated, buildArgs(input, output), {
            NONA_CACHE: "1",
            NONA_CACHE_DIR: join(standalone, "cache"),
        });
        if (process.platform !== "win32")
            assert.equal(statSync(output).mode & 0o777, 0o755);
        assert.equal(run(output, []), "/b\n");
    } finally {
        renameSync(hidden, sources);
    }
    console.log(
        "Relocated native CLI compiled a module with its compiler source tree absent",
    );
}
