// Verify actual release bytes after assembly, before upload or publication.
//   node scripts/verify-release-archives.mjs --archives <dir> [--tag v<version>]
// Requires tar and unzip (available on the hosted Ubuntu release runner).
import {
    lstatSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { supportedNativeTargets } from "../dist/src/target.js";
import {
    packageFiles,
    releaseVersion,
    validateNativePackage,
    validateReleaseTag,
} from "./native-package.mjs";

const options = {};
for (let index = 2; index < process.argv.length; index += 2) {
    const name = process.argv[index],
        value = process.argv[index + 1];
    if (!["--archives", "--tag"].includes(name) || value === undefined)
        throw new Error(
            "Usage: verify-release-archives --archives <dir> [--tag v<version>]",
        );
    options[name.slice(2)] = value;
}
if (!options.archives) throw new Error("--archives is required");

const run = (command, args) => {
    const result = spawnSync(command, args, { encoding: "utf8" });
    if (result.error) throw result.error;
    if (result.status !== 0)
        throw new Error(
            `${command} exited with ${result.status}: ${result.stderr.trim()}`,
        );
    return result.stdout;
};
let temporary;
try {
    validateReleaseTag(options.tag);
    const archives = resolve(options.archives);
    const expected = supportedNativeTargets.map(
        (target) =>
            `nona-${releaseVersion}-${target}` +
            (target.startsWith("win32-") ? ".zip" : ".tar.gz"),
    );
    const actual = readdirSync(archives).filter(
        (name) => name.endsWith(".zip") || name.endsWith(".tar.gz"),
    );
    if (
        actual.length !== expected.length ||
        expected.some((name) => !actual.includes(name))
    )
        throw new Error(
            `expected ${expected.length} release archives: ${expected.join(", ")}; found: ${actual.join(", ")}`,
        );
    const sums = new Map();
    for (const line of readFileSync(join(archives, "SHA256SUMS"), "utf8")
        .trimEnd()
        .split(/\r?\n/)) {
        const entry = /^([a-f0-9]{64})  (.+)$/.exec(line);
        if (!entry || !expected.includes(entry[2]) || sums.has(entry[2]))
            throw new Error(`invalid or duplicate SHA256SUMS entry: ${line}`);
        sums.set(entry[2], entry[1]);
    }
    if (sums.size !== expected.length)
        throw new Error(
            "SHA256SUMS must list every release archive exactly once",
        );
    // Check all hashes before giving any bytes to archive extraction tools.
    for (const archive of expected) {
        const path = join(archives, archive);
        if (!lstatSync(path).isFile())
            throw new Error(`${archive} must be a regular file`);
        const hash = createHash("sha256")
            .update(readFileSync(path))
            .digest("hex");
        if (hash !== sums.get(archive))
            throw new Error(`${archive}: SHA256SUMS mismatch`);
    }
    temporary = mkdtempSync(join(archives, ".verify-"));
    for (const target of supportedNativeTargets) {
        const name = `nona-${releaseVersion}-${target}`,
            windows = target.startsWith("win32-"),
            archive = name + (windows ? ".zip" : ".tar.gz"),
            path = join(archives, archive);
        const members = run(
            windows ? "unzip" : "tar",
            windows ? ["-Z1", path] : ["-tzf", path],
        )
            .trimEnd()
            .split(/\r?\n/);
        const files = packageFiles(target).map((file) => `${name}/${file}`);
        const allowed = new Set([name + "/", ...files]);
        if (
            members.some((member) => !allowed.has(member)) ||
            files.some((file) => !members.includes(file)) ||
            new Set(members).size !== members.length
        )
            throw new Error(
                `${archive}: incorrect package directory or contents`,
            );
        run(
            windows ? "unzip" : "tar",
            windows
                ? ["-q", path, "-d", temporary]
                : ["-xzf", path, "-C", temporary],
        );
        const roots = readdirSync(temporary);
        if (roots.length !== 1 || roots[0] !== name)
            throw new Error(
                `${archive}: expected one top-level directory ${name}`,
            );
        const directory = join(temporary, name);
        validateNativePackage(directory, target, releaseVersion);
        if (
            !windows &&
            (lstatSync(join(directory, "nona")).mode & 0o777) !== 0o755
        )
            throw new Error(
                `${archive}: nona must retain executable mode 0755`,
            );
        rmSync(directory, { recursive: true, force: true });
        console.log(
            `${archive}: checksum, layout, version and exact notices verified`,
        );
    }
    console.log(
        `Verified ${expected.length} extracted release archives for Nona ${releaseVersion}`,
    );
} catch (error) {
    console.error("release verification: " + error.message);
    process.exitCode = 1;
} finally {
    if (temporary) rmSync(temporary, { recursive: true, force: true });
}
