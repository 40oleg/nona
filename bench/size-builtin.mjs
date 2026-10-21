// Executable sizes of the built-in module pruning fixtures (#440).
//
//   npm run build
//   node bench/size-builtin.mjs [--cli dist/cli.js] [--targets win32-x64,linux-x64]
//
// Builds every file of bench/size/ with `build --print-link` and prints one
// row per fixture and target: the exact byte count and the linked runtime
// parts. Run it twice (with and without NONA_NO_BUILTIN_PRUNING=1, or with the
// --cli of an older checkout) to get the before/after table of
// docs/builtin-module-pruning.md.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
    const at = args.indexOf(name);
    return at >= 0 ? args[at + 1] : fallback;
};
const cli = resolve(option("--cli", join(root, "dist", "cli.js")));
const targets = option(
    "--targets",
    process.platform === "linux" ? "win32-x64,linux-x64" : "win32-x64",
).split(",");

const fixtures = [
    ["hello", "hello.mjs", "console.log"],
    ["one named operation", "one.mjs", "existsSync"],
    [
        "several operations",
        "several.mjs",
        "readFileSync, writeFileSync, statSync",
    ],
    ["alias", "alias.mjs", "existsSync as exists"],
    ["re-export", "reexport.mjs", "export { existsSync as check }"],
    ["namespace import", "namespace.mjs", "import * as fs"],
    ["default import", "default.mjs", "import fs from"],
    ["dynamic import", "dynamic.mjs", 'import("node:fs")'],
];

const work = mkdtempSync(join(tmpdir(), "nona-size-"));
try {
    console.log(
        `cli ${cli}\npruning ${process.env.NONA_NO_BUILTIN_PRUNING ? "disabled" : "enabled"}\n`,
    );
    for (const target of targets) {
        console.log(`target ${target}`);
        for (const [label, file] of fixtures) {
            const out = join(work, file.replace(/\.mjs$/, "") + "-" + target);
            const text = execFileSync(
                process.execPath,
                [
                    cli,
                    "build",
                    join(root, "bench", "size", file),
                    "-o",
                    out,
                    "--target",
                    target,
                    "--print-link",
                ],
                { encoding: "utf8", cwd: work },
            );
            const parts = [...text.matchAll(/^ {2}(\w+)\s/gm)].map((m) => m[1]);
            const bytes = statSync(out).size;
            console.log(
                `  ${label.padEnd(22)} ${bytes.toLocaleString("en-US").padStart(11)} bytes  ${parts.join(", ")}`,
            );
        }
    }
} finally {
    rmSync(work, { recursive: true, force: true });
}
