import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const targets = [
    "win32-x64",
    "linux-x64",
    "darwin-x64",
    "darwin-arm64",
    "linux-arm64",
    "win32-arm64",
    "freebsd-x64",
    "openbsd-x64",
];
const version: string = JSON.parse(
    readFileSync("package.json", "utf8"),
).version;
const notice = readFileSync("THIRD_PARTY_NOTICES.md");
const image = Buffer.from([0, 1, 2, 0xff, 0x4e, 0x6f, 0x6e, 0x61]);
const executable = (target: string) =>
    target.startsWith("win32-") ? "nona.exe" : "nona";
const manifest = (target: string) =>
    [
        executable(target),
        "LICENSE",
        "README.txt",
        "THIRD_PARTY_NOTICES.md",
        "VERSION",
    ].sort();
const temporary = () => mkdtempSync(resolve(".native-packaging-test-"));
const script = (name: string, args: string[], env = process.env) =>
    spawnSync(process.execPath, [resolve("scripts", name), ...args], {
        encoding: "utf8",
        env,
        timeout: 30000,
    });
const succeeded = (result: ReturnType<typeof script>) => {
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
};
const rejected = (result: ReturnType<typeof script>, diagnostic: RegExp) => {
    assert.ifError(result.error);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, diagnostic);
};
const packageFixture = (directory: string, target: string) => {
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, executable(target)), image);
    chmodSync(join(directory, executable(target)), 0o755);
    writeFileSync(join(directory, "LICENSE"), readFileSync("LICENSE"));
    writeFileSync(join(directory, "THIRD_PARTY_NOTICES.md"), notice);
    writeFileSync(join(directory, "VERSION"), version + "\n");
    writeFileSync(
        join(directory, "README.txt"),
        `Nona ${version} for ${target}\n\nRun ${executable(target)} --help.\n`,
    );
};
const artifactFixtures = (directory: string) => {
    for (const target of targets)
        packageFixture(join(directory, "nona-" + target), target);
};
type PackageValidator = {
    validateNativePackage(
        directory: string,
        target: string,
        version: string,
    ): void;
};
const loadValidator = async () =>
    (await import(
        pathToFileURL(resolve("scripts/native-package.mjs")).href
    )) as PackageValidator;
const brokenNotices = [
    { name: "missing", bytes: undefined },
    { name: "empty", bytes: Buffer.alloc(0) },
    { name: "truncated", bytes: notice.subarray(0, notice.length - 1) },
    {
        name: "altered",
        bytes: Buffer.concat([
            Buffer.from([notice[0]! ^ 1]),
            notice.subarray(1),
        ]),
    },
];

test("native packages include the canonical notices for all eight targets", () => {
    const work = temporary();
    try {
        const source = join(work, "compiler-image");
        writeFileSync(source, image);
        for (const target of targets) {
            const directory = join(work, target);
            succeeded(
                script("package-native-cli.mjs", [target, source, directory]),
            );
            assert.deepEqual(
                readdirSync(directory).sort(),
                manifest(target),
                target,
            );
            assert.deepEqual(
                readFileSync(join(directory, "THIRD_PARTY_NOTICES.md")),
                notice,
                target,
            );
            assert.deepEqual(
                readFileSync(join(directory, executable(target))),
                image,
                target,
            );
            assert.deepEqual(
                readFileSync(join(directory, "LICENSE")),
                readFileSync("LICENSE"),
                target,
            );
            assert.equal(
                readFileSync(join(directory, "VERSION"), "utf8"),
                version + "\n",
                target,
            );
            assert.ok(
                readFileSync(join(directory, "README.txt"), "utf8").startsWith(
                    `Nona ${version} for ${target}\n`,
                ),
                target,
            );
            if (process.platform !== "win32" && !target.startsWith("win32-"))
                assert.equal(
                    statSync(join(directory, executable(target))).mode & 0o111,
                    0o111,
                    target,
                );
        }
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test("package validation rejects missing and nonregular required files", async () => {
    const { validateNativePackage } = await loadValidator();
    const work = temporary(),
        target = "linux-x64";
    try {
        for (const name of manifest(target)) {
            const directory = join(work, name);
            packageFixture(directory, target);
            assert.doesNotThrow(() =>
                validateNativePackage(directory, target, version),
            );
            rmSync(join(directory, name));
            assert.throws(
                () => validateNativePackage(directory, target, version),
                new RegExp(name.replaceAll(".", "\\.")),
            );
            mkdirSync(join(directory, name));
            assert.throws(
                () => validateNativePackage(directory, target, version),
                new RegExp(name.replaceAll(".", "\\.")),
            );
        }
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test("package validation requires complete canonical notice bytes", async () => {
    const { validateNativePackage } = await loadValidator();
    const work = temporary(),
        target = "win32-arm64";
    try {
        for (const broken of brokenNotices) {
            const directory = join(work, broken.name);
            packageFixture(directory, target);
            const file = join(directory, "THIRD_PARTY_NOTICES.md");
            if (broken.bytes === undefined) rmSync(file);
            else writeFileSync(file, broken.bytes);
            assert.throws(
                () => validateNativePackage(directory, target, version),
                /THIRD_PARTY_NOTICES\.md/,
                broken.name,
            );
        }
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test("package validation rejects stale versions and README identities", async () => {
    const { validateNativePackage } = await loadValidator();
    const work = temporary(),
        target = "darwin-arm64";
    try {
        packageFixture(work, target);
        writeFileSync(join(work, "VERSION"), "0.0.0\n");
        assert.throws(
            () => validateNativePackage(work, target, version),
            /VERSION/,
        );
        writeFileSync(join(work, "VERSION"), version + "\n");
        for (const header of [
            `Nona 0.0.0 for ${target}\n`,
            `Nona ${version} for linux-x64\n`,
        ]) {
            writeFileSync(join(work, "README.txt"), header);
            assert.throws(
                () => validateNativePackage(work, target, version),
                /README\.txt/,
            );
        }
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test("release assembly preflights every notice before modifying output or invoking archive tools", () => {
    const work = temporary(),
        artifacts = join(work, "artifacts"),
        out = join(work, "archives");
    try {
        artifactFixtures(artifacts);
        mkdirSync(out);
        writeFileSync(join(out, "keep.txt"), "previous release");
        const file = join(
            artifacts,
            "nona-openbsd-x64",
            "THIRD_PARTY_NOTICES.md",
        );
        for (const broken of brokenNotices) {
            if (broken.bytes === undefined) rmSync(file);
            else writeFileSync(file, broken.bytes);
            const result = script(
                "release-archives.mjs",
                [
                    "--artifacts",
                    artifacts,
                    "--out",
                    out,
                    "--notes",
                    join(work, "notes.md"),
                ],
                { ...process.env, PATH: "" },
            );
            rejected(result, /nona-openbsd-x64[\s\S]*THIRD_PARTY_NOTICES\.md/);
            assert.deepEqual(readdirSync(out), ["keep.txt"], broken.name);
            assert.equal(existsSync(join(work, "notes.md")), false);
        }
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test("release assembly rejects a stale package VERSION and mismatched release tag", () => {
    const work = temporary(),
        artifacts = join(work, "artifacts");
    try {
        artifactFixtures(artifacts);
        const args = [
            "--artifacts",
            artifacts,
            "--out",
            join(work, "archives"),
            "--notes",
            join(work, "notes.md"),
        ];
        writeFileSync(
            join(artifacts, "nona-openbsd-x64", "VERSION"),
            "0.0.0\n",
        );
        rejected(
            script("release-archives.mjs", args, { ...process.env, PATH: "" }),
            /nona-openbsd-x64[\s\S]*VERSION/,
        );
        rejected(
            script("release-archives.mjs", [...args, "--tag", "v0.0.0"]),
            /tag[\s\S]*package\.json/,
        );
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

const archiveName = (target: string) =>
    `nona-${version}-${target}${target.startsWith("win32-") ? ".zip" : ".tar.gz"}`;
const command = (name: string, args: string[], cwd: string) => {
    const result = spawnSync(name, args, {
        cwd,
        encoding: "utf8",
        timeout: 30000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
};
const extract = (archive: string, directory: string) => {
    mkdirSync(directory, { recursive: true });
    if (archive.endsWith(".zip"))
        command("unzip", ["-q", archive, "-d", directory], directory);
    else command("tar", ["-xzf", archive, "-C", directory], directory);
};
const checksums = (directory: string) => {
    writeFileSync(
        join(directory, "SHA256SUMS"),
        targets
            .map((target) => {
                const name = archiveName(target);
                return (
                    createHash("sha256")
                        .update(readFileSync(join(directory, name)))
                        .digest("hex") +
                    "  " +
                    name +
                    "\n"
                );
            })
            .join(""),
    );
};

test("release verification rejects invalid archive metadata and hashes before extraction", () => {
    const work = temporary();
    const verify = (extra: string[] = []) =>
        script("verify-release-archives.mjs", ["--archives", work, ...extra], {
            ...process.env,
            PATH: "",
        });
    try {
        for (const target of targets)
            writeFileSync(join(work, archiveName(target)), image);
        checksums(work);
        const originalSums = readFileSync(join(work, "SHA256SUMS"));
        rejected(verify(["--tag", "v0.0.0"]), /tag[\s\S]*package\.json/);
        const lastArchive = join(work, archiveName("openbsd-x64"));
        rmSync(lastArchive);
        rejected(verify(), /expected 8 release archives/);
        writeFileSync(lastArchive, image);
        const extraArchive = join(work, "unexpected.zip");
        writeFileSync(extraArchive, image);
        rejected(verify(), /expected 8 release archives/);
        rmSync(extraArchive);
        rmSync(join(work, "SHA256SUMS"));
        rejected(verify(), /SHA256SUMS/);
        for (const sums of [
            originalSums.toString().split("\n").slice(1).join("\n"),
            originalSums.toString() +
                originalSums.toString().split("\n")[0] +
                "\n",
            "not a checksum\n",
        ]) {
            writeFileSync(join(work, "SHA256SUMS"), sums);
            rejected(verify(), /SHA256SUMS/);
        }
        writeFileSync(join(work, "SHA256SUMS"), originalSums);
        // The final archive must be checked before tools see the first archive.
        writeFileSync(lastArchive, Buffer.concat([image, Buffer.from([0])]));
        rejected(verify(), /openbsd-x64[\s\S]*SHA256SUMS mismatch/);
        assert.equal(
            readdirSync(work).some((name) => name.startsWith(".verify-")),
            false,
        );
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test(
    "release archives round-trip all targets and reject corrupt published contents",
    {
        skip:
            process.platform !== "linux" ||
            process.env.NONA_NATIVE_ARCHIVE_INTEGRATION !== "1"
                ? "real zip/tar integration runs in the Linux packaging CI job"
                : false,
    },
    async (t) => {
        const work = temporary(),
            artifacts = join(work, "artifacts"),
            archives = join(work, "archives");
        const verify = () =>
            script("verify-release-archives.mjs", [
                "--archives",
                archives,
                "--tag",
                "v" + version,
            ]);
        try {
            artifactFixtures(artifacts);
            succeeded(
                script("release-archives.mjs", [
                    "--artifacts",
                    artifacts,
                    "--out",
                    archives,
                    "--notes",
                    join(work, "notes.md"),
                ]),
            );
            assert.deepEqual(
                readdirSync(archives).sort(),
                ["SHA256SUMS", ...targets.map(archiveName)].sort(),
            );
            const originalSums = readFileSync(join(archives, "SHA256SUMS"));
            checksums(archives);
            assert.deepEqual(
                readFileSync(join(archives, "SHA256SUMS")),
                originalSums,
            );
            succeeded(verify());
            for (const target of targets) {
                const unpacked = join(work, "round-trip", target),
                    name = `nona-${version}-${target}`;
                extract(join(archives, archiveName(target)), unpacked);
                assert.deepEqual(readdirSync(unpacked), [name]);
                const directory = join(unpacked, name);
                assert.deepEqual(
                    readdirSync(directory).sort(),
                    manifest(target),
                    target,
                );
                assert.deepEqual(
                    readFileSync(join(directory, "THIRD_PARTY_NOTICES.md")),
                    notice,
                    target,
                );
                assert.deepEqual(
                    readFileSync(join(directory, executable(target))),
                    image,
                    target,
                );
                assert.deepEqual(
                    readFileSync(join(directory, "LICENSE")),
                    readFileSync("LICENSE"),
                    target,
                );
                assert.ok(
                    readFileSync(
                        join(directory, "README.txt"),
                        "utf8",
                    ).startsWith(`Nona ${version} for ${target}\n`),
                    target,
                );
                assert.equal(
                    readFileSync(join(directory, "VERSION"), "utf8"),
                    version + "\n",
                    target,
                );
                if (!target.startsWith("win32-"))
                    assert.equal(
                        statSync(join(directory, "nona")).mode & 0o111,
                        0o111,
                        target,
                    );
            }

            await t.test("checksum mismatch", () => {
                writeFileSync(
                    join(archives, "SHA256SUMS"),
                    originalSums
                        .toString()
                        .replace(/^[a-f0-9]{64}/, "0".repeat(64)),
                );
                try {
                    rejected(verify(), /checksum|SHA256/i);
                } finally {
                    writeFileSync(join(archives, "SHA256SUMS"), originalSums);
                }
            });
            await t.test("missing archive", () => {
                const file = join(archives, archiveName("win32-x64")),
                    saved = file + ".saved";
                renameSync(file, saved);
                try {
                    rejected(verify(), /win32-x64/);
                } finally {
                    renameSync(saved, file);
                }
            });

            const tamper = async (
                label: string,
                target: string,
                change: (directory: string) => string | void,
                diagnostic: RegExp,
            ) => {
                await t.test(label, () => {
                    const file = join(archives, archiveName(target)),
                        original = readFileSync(file);
                    const staging = join(
                            work,
                            "tamper-" + label.replaceAll(" ", "-"),
                        ),
                        name = `nona-${version}-${target}`;
                    extract(file, staging);
                    const top = change(join(staging, name)) ?? name;
                    rmSync(file);
                    if (target.startsWith("win32-"))
                        command("zip", ["-q", "-r", "-X", file, top], staging);
                    else command("tar", ["-czf", file, top], staging);
                    checksums(archives);
                    try {
                        rejected(verify(), diagnostic);
                    } finally {
                        writeFileSync(file, original);
                        writeFileSync(
                            join(archives, "SHA256SUMS"),
                            originalSums,
                        );
                    }
                });
            };
            for (const [index, broken] of brokenNotices.entries()) {
                await tamper(
                    broken.name + " notice",
                    index === 1 ? "win32-x64" : "openbsd-x64",
                    (directory) => {
                        const file = join(directory, "THIRD_PARTY_NOTICES.md");
                        if (broken.bytes === undefined) rmSync(file);
                        else writeFileSync(file, broken.bytes);
                    },
                    broken.bytes === undefined
                        ? /incorrect package directory or contents/
                        : /THIRD_PARTY_NOTICES\.md/,
                );
            }
            await tamper(
                "stale VERSION",
                "linux-arm64",
                (directory) => {
                    writeFileSync(join(directory, "VERSION"), "0.0.0\n");
                },
                /VERSION/,
            );
            await tamper(
                "missing LICENSE",
                "darwin-arm64",
                (directory) => {
                    rmSync(join(directory, "LICENSE"));
                },
                /incorrect package directory or contents/,
            );
            await tamper(
                "wrong top directory",
                "linux-x64",
                (directory) => {
                    renameSync(directory, join(directory, "..", "wrong-name"));
                    return "wrong-name";
                },
                /top.level|directory|nona-/i,
            );
            await tamper(
                "lost executable mode",
                "freebsd-x64",
                (directory) => {
                    chmodSync(join(directory, "nona"), 0o644);
                },
                /executable|permission|mode/i,
            );
            succeeded(verify());
        } finally {
            rmSync(work, { recursive: true, force: true });
        }
    },
);
