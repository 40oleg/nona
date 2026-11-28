import { readFileSync, constants } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";

// Reviewed pins from resources.json, embedded so the executable needs no manifest.
export const assetPins = {
    "pglite.wasm": [
        8859436,
        "8140392c5f70c5aecb40f514db242fce4223cfdd5f37a2b101dbdc30208dc49d",
    ],
    "pglite.data": [
        4939155,
        "4703ec26f5710abb62db42acad229478b75c51ef7f3bb037286bb2bac139a930",
    ],
};

export function exactBytes(bytes) {
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function readResource(directory, name) {
    const path = join(directory, name);
    try {
        const bytes = exactBytes(readFileSync(path));
        const [size, digest] = assetPins[name];
        const actual = createHash("sha256").update(bytes).digest("hex");
        if (bytes.byteLength !== size || actual !== digest)
            throw new Error(
                `integrity mismatch: expected ${size} bytes SHA256 ${digest}, got ${bytes.byteLength} bytes SHA256 ${actual}`,
            );
        return bytes;
    } catch (cause) {
        throw new Error(
            `PGlite resource ${path}: ${cause.message}. Restore the pinned 0.3.14 assets with npm run prepare:assets`,
            { cause },
        );
    }
}

export async function createOfflinePGlite(assetDirectory) {
    if (typeof assetDirectory !== "string" || assetDirectory.length === 0)
        throw new Error("PGlite requires an explicit local asset directory");
    const directory = resolve(assetDirectory);
    // Validate BOTH files before entering upstream's asynchronous initialization.
    const wasm = readResource(directory, "pglite.wasm");
    const data = readResource(directory, "pglite.data");
    let wasmModule;
    try {
        wasmModule = await WebAssembly.compile(wasm);
    } catch (cause) {
        throw new Error(
            `PGlite resource ${join(directory, "pglite.wasm")}: ${cause.message}`,
            { cause },
        );
    }
    return withPGlitePlatform(async () => {
        const { PGlite } = await import("@electric-sql/pglite");
        return PGlite.create({ wasmModule, fsBundle: new Blob([data]) });
    });
}

let platformBusy = false;

// This is an adapter for the audited package, not global Node impersonation.
// Keep it active through import and readiness: the glue checks the platform
// later than utils.ts, then initializes NODEFS even for an in-memory database.
export async function withPGlitePlatform(create) {
    if (platformBusy)
        throw new Error(
            "Concurrent PGlite initialization is unsupported by the offline adapter",
        );
    platformBusy = true;
    const versions = process.versions;
    const previous = Object.getOwnPropertyDescriptor(versions, "node");
    const binding = Object.getOwnPropertyDescriptor(process, "binding");
    const adaptVersion = typeof versions.node !== "string";
    try {
        if (adaptVersion)
            Object.defineProperty(versions, "node", {
                value: "nona-pglite-offline",
                configurable: true,
            });
        Object.defineProperty(process, "binding", {
            configurable: true,
            value(name) {
                if (name === "constants") return { fs: constants };
                throw new Error(`Unsupported PGlite internal binding: ${name}`);
            },
        });
        return await create();
    } finally {
        if (adaptVersion) {
            if (previous) Object.defineProperty(versions, "node", previous);
            else delete versions.node;
        }
        if (binding) Object.defineProperty(process, "binding", binding);
        else delete process.binding;
        platformBusy = false;
    }
}
