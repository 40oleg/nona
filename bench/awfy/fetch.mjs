// Fetches the Are-We-Fast-Yet JavaScript benchmarks into bench/awfy/vendor/
// (git-ignored: no third-party code is kept in the repository) at the pinned
// revision below, with the suite's LICENSE.md and AUTORS.md. The benchmarks
// have several licenses (MIT for the SOM-derived ones, the Sun Labs terms for
// Richards and DeltaBlue, Apache 2.0 for Havlak); see vendor/LICENSE.md.
//
//   node bench/awfy/fetch.mjs
//
// Needs git and access to github.com. The clone is sparse (only the JavaScript
// directory) and shallow, pinned by commit hash.

import { spawnSync } from "node:child_process";
import {
    copyFileSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repository = "https://github.com/smarr/are-we-fast-yet";
export const revision = "74306fec151070fd07157cefeacf19e7e0bcdc89"; // master, 2026-10
const here = dirname(fileURLToPath(import.meta.url));
const vendor = join(here, "vendor");

function git(cwd, ...args) {
    const r = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout;
}

const work = mkdtempSync(join(tmpdir(), "awfy-"));
try {
    git(work, "init", "-q");
    git(work, "remote", "add", "origin", repository);
    git(
        work,
        "sparse-checkout",
        "set",
        "--no-cone",
        "/benchmarks/JavaScript/*.js",
        "/LICENSE.md",
        "/AUTORS.md",
    );
    git(
        work,
        "fetch",
        "-q",
        "--depth",
        "1",
        "--filter=blob:none",
        "origin",
        revision,
    );
    git(work, "checkout", "-q", revision);
    rmSync(vendor, { recursive: true, force: true });
    mkdirSync(vendor, { recursive: true });
    const source = join(work, "benchmarks", "JavaScript");
    for (const f of readdirSync(source).filter((f) => f.endsWith(".js")))
        copyFileSync(join(source, f), join(vendor, f));
    for (const f of ["LICENSE.md", "AUTORS.md"])
        copyFileSync(join(work, f), join(vendor, f));
    writeFileSync(join(vendor, "REVISION"), `${repository} ${revision}\n`);
    console.log(
        `are-we-fast-yet ${revision.slice(0, 7)} -> ${resolve(vendor)}`,
    );
} finally {
    rmSync(work, { recursive: true, force: true });
}
