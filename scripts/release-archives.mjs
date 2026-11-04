// Release assembly (used by .github/workflows/release.yml).
//
//   node scripts/release-archives.mjs --artifacts <dir> --out <dir> --notes <file> [--tag v<version>]
//
// <artifacts>/nona-<target>/ are the packaged compilers that
// scripts/package-native-cli.mjs produced for every supported native target.
// Checks that the tag (when given), package.json and every package's VERSION
// agree, then writes nona-<version>-<target>.tar.gz (.zip for Windows) and
// SHA256SUMS to <out>, and the CHANGELOG section of the version to <notes>.
// Needs tar and zip on PATH (ubuntu runners have both).
import {
    readFileSync,
    writeFileSync,
    mkdirSync,
    existsSync,
    readdirSync,
    cpSync,
    chmodSync,
    rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { supportedNativeTargets } from "../dist/src/target.js";
import {
    projectRoot,
    releaseVersion as version,
    validateNativePackage,
    validateReleaseTag,
} from "./native-package.mjs";

const options = {};
for (let index = 2; index < process.argv.length; index += 2) {
    const name = process.argv[index],
        value = process.argv[index + 1];
    if (
        !["--artifacts", "--out", "--notes", "--tag"].includes(name) ||
        value === undefined
    )
        throw new Error(
            "Usage: release-archives --artifacts <dir> --out <dir> --notes <file> [--tag v<version>]",
        );
    options[name.slice(2)] = value;
}
if (!options.artifacts || !options.out || !options.notes)
    throw new Error("--artifacts, --out and --notes are required");
const fail = (message) => {
    console.error("release: " + message);
    process.exit(1);
};

try {
    validateReleaseTag(options.tag);
} catch (error) {
    fail(error.message);
}

const artifacts = resolve(options.artifacts),
    out = resolve(options.out);
const unexpected = readdirSync(artifacts).filter(
    (name) =>
        name.startsWith("nona-") &&
        !supportedNativeTargets.includes(name.slice(5)),
);
if (unexpected.length)
    fail("artifacts for unknown targets: " + unexpected.join(", "));
// Validate every package before creating archives or replacing earlier output.
for (const target of supportedNativeTargets) {
    const source = join(artifacts, "nona-" + target);
    if (!existsSync(source)) fail("missing artifact nona-" + target);
    try {
        validateNativePackage(source, target, version);
    } catch (error) {
        fail(error.message);
    }
}
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const staging = join(out, ".staging");
const run = (command, args, cwd) => {
    const result = spawnSync(command, args, { cwd, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) fail(command + " exited with " + result.status);
};
const archives = [];
for (const target of supportedNativeTargets) {
    const source = join(artifacts, "nona-" + target),
        windows = target.startsWith("win32-"),
        executable = windows ? "nona.exe" : "nona";
    // Archives hold one top-level directory; artifact downloads lose the executable bit.
    const name = `nona-${version}-${target}`,
        directory = join(staging, name);
    cpSync(source, directory, { recursive: true });
    if (!windows) chmodSync(join(directory, executable), 0o755);
    const archive = name + (windows ? ".zip" : ".tar.gz");
    if (windows)
        run("zip", ["-q", "-r", "-X", join(out, archive), name], staging);
    else
        run(
            "tar",
            ["--owner=0", "--group=0", "-czf", join(out, archive), name],
            staging,
        );
    archives.push(archive);
}
rmSync(staging, { recursive: true, force: true });
writeFileSync(
    join(out, "SHA256SUMS"),
    archives
        .map(
            (archive) =>
                createHash("sha256")
                    .update(readFileSync(join(out, archive)))
                    .digest("hex") +
                "  " +
                archive +
                "\n",
        )
        .join(""),
);

// Release notes: the CHANGELOG section "## v<version> ...", or Unreleased for a dry run.
const changelog = readFileSync(join(projectRoot, "CHANGELOG.md"), "utf8").split(
    /\r?\n/,
);
const section = (heading) => {
    const start = changelog.findIndex((line) => heading(line));
    if (start < 0) return undefined;
    const end = changelog.findIndex(
        (line, index) => index > start && line.startsWith("## "),
    );
    return (
        changelog
            .slice(start + 1, end < 0 ? undefined : end)
            .join("\n")
            .trim() + "\n"
    );
};
const notes =
    section(
        (line) =>
            line === "## v" + version ||
            line.startsWith("## v" + version + " "),
    ) ??
    (options.tag === undefined
        ? section((line) => line === "## Unreleased")
        : undefined);
if (notes === undefined) fail(`CHANGELOG.md has no "## v${version}" section`);
mkdirSync(dirname(resolve(options.notes)), { recursive: true });
writeFileSync(resolve(options.notes), notes);
console.log(`Nona ${version}: ${archives.length} archives in ${out}`);
for (const archive of archives) console.log("  " + archive);
