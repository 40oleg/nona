import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const fixtureDir = fileURLToPath(new URL(".", import.meta.url));
export const packageDir = join(fixtureDir, "node_modules/@electric-sql/pglite");
export const assetsDir = join(fixtureDir, "assets");
export const resources = JSON.parse(
    readFileSync(join(fixtureDir, "resources.json"), "utf8"),
);

export function verifiedFile(path, expected) {
    let bytes;
    try {
        bytes = readFileSync(path);
    } catch (cause) {
        throw new Error(
            `PGlite resource ${path}: cannot read (${cause.code}); run npm ci and npm run prepare:assets in tests/fixtures/pglite`,
            { cause },
        );
    }
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (bytes.length !== expected.bytes || hash !== expected.sha256) {
        throw new Error(
            `PGlite resource ${path}: integrity mismatch; expected ${expected.bytes} bytes, SHA256 ${expected.sha256}; got ${bytes.length} bytes, SHA256 ${hash}. Reinstall the pinned package and run npm run prepare:assets`,
        );
    }
    return bytes;
}

export function verifyPackage() {
    for (const [name, expected] of Object.entries(resources.files)) {
        verifiedFile(join(packageDir, name), expected);
    }
}

// Validate BOTH resources before compiling or importing executable package code.
export async function localOptions(directory = assetsDir) {
    const wasm = verifiedFile(
        join(directory, "pglite.wasm"),
        resources.files["dist/pglite.wasm"],
    );
    const data = verifiedFile(
        join(directory, "pglite.data"),
        resources.files["dist/pglite.data"],
    );
    return {
        wasmModule: await WebAssembly.compile(wasm),
        fsBundle: new Blob([data]),
    };
}
