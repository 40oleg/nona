import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { compileModuleToIR } from "../src/compiler.js";
import { generate } from "../src/backend/x64/codegen.js";
import { linkHost } from "./helpers/program.js";
import { runModulesOnHost } from "./helpers/host.js";
import { removeTemporaryDirectory } from "./helpers/cleanup.js";

/** Compile an ES module, run it with `input` piped to stdin. */
function runWithInput(source: string, input: string) {
    const directory = mkdtempSync(join(tmpdir(), "nona-fs-fd-"));
    try {
        const entry = join(directory, "main.mjs");
        writeFileSync(entry, source);
        const executable = join(
            directory,
            process.platform === "win32" ? "image.exe" : "image",
        );
        writeFileSync(
            executable,
            linkHost(generate(compileModuleToIR(source, entry))),
        );
        chmodSync(executable, 0o755);
        return spawnSync(executable, [], {
            input,
            encoding: "utf8",
            timeout: 60_000,
            windowsHide: true,
        });
    } finally {
        removeTemporaryDirectory(directory);
    }
}

const repro = String.raw`
import fs from "node:fs";
const input = fs.readFileSync(0, "utf8");
console.log(input.trim().split(/\s+/).map(Number).reduce((a, b) => a + b, 0));
fs.writeFileSync(1, "done\n");
fs.appendFileSync(1, new Uint8Array([111, 107, 10]));
fs.writeFileSync(2, "to stderr\n");
`;

test("fs.readFileSync(0) and writeFileSync(1) work on piped stdin and stdout", () => {
    const result = runWithInput(repro, "1 2 3\n");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "6\ndone\nok\n");
    assert.equal(result.stderr, "to stderr\n");
});

test("fs.readFileSync(0) without encoding reads until EOF", () => {
    const source = `import fs from "node:fs"; console.log(fs.readFileSync(0).length);`;
    const result = runWithInput(source, "x".repeat(200000));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "200000\n");
});

test("fs rejects invalid path and descriptor arguments with Node.js error codes", () => {
    const source = String.raw`
import fs from "node:fs";
const probe = (f) => { try { f(); console.log("no error"); } catch (e) { console.log(e.name, e.code); } };
probe(() => fs.readFileSync({}));
probe(() => fs.readFileSync(null));
probe(() => fs.readFileSync(1.5));
probe(() => fs.readFileSync(-1));
probe(() => fs.writeFileSync(1, 5));
probe(() => fs.writeFileSync({}, "x"));
probe(() => fs.appendFileSync(true, "x"));
`;
    const { native, oracle } = runModulesOnHost(
        { "main.mjs": source },
        "main.mjs",
        {
            gcStress: false,
        },
    );
    assert.equal(native.status, 0, native.stderr);
    assert.equal(native.stdout, oracle);
});
