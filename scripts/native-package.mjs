// Shared package contract for release assembly and extracted-archive verification.
import { lstatSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const releaseVersion = JSON.parse(
    readFileSync(join(projectRoot, "package.json"), "utf8"),
).version;
export const noticeName = "THIRD_PARTY_NOTICES.md";
const canonicalNotices = readFileSync(join(projectRoot, noticeName));

export function packageFiles(target) {
    return [
        target.startsWith("win32-") ? "nona.exe" : "nona",
        "LICENSE",
        "VERSION",
        "README.txt",
        noticeName,
    ];
}

export function validateNativePackage(directory, target, version) {
    const label = `nona-${target}`;
    for (const file of packageFiles(target)) {
        let stat;
        try {
            stat = lstatSync(join(directory, file));
        } catch (error) {
            if (error.code !== "ENOENT") throw error;
            throw new Error(`${label} has no ${file}`);
        }
        if (!stat.isFile())
            throw new Error(`${label}/${file} must be a regular file`);
    }
    if (!readFileSync(join(directory, noticeName)).equals(canonicalNotices))
        throw new Error(
            `${label}/${noticeName} does not match the repository notice bytes`,
        );
    const packaged = readFileSync(join(directory, "VERSION"), "utf8").trim();
    if (packaged !== version)
        throw new Error(
            `${label}/VERSION is ${packaged}, package.json is ${version}`,
        );
    const heading = readFileSync(join(directory, "README.txt"), "utf8").split(
        /\r?\n/,
    )[0];
    if (heading !== `Nona ${version} for ${target}`)
        throw new Error(
            `${label}/README.txt has an incorrect version or target`,
        );
}

export function validateReleaseTag(tag) {
    if (tag !== undefined && tag !== "v" + releaseVersion)
        throw new Error(
            `tag ${tag} does not match package.json version ${releaseVersion} (expected v${releaseVersion})`,
        );
}
