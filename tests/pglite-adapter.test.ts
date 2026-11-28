import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const fixture = resolve("tests/fixtures/pglite");
const adapter = await import(pathToFileURL(join(fixture, "offline.mjs")).href);

test("PGlite exactBytes preserves the offset and length of pooled views", () => {
    const backing = Buffer.from([255, 0, 1, 128, 0, 254]);
    const view = backing.subarray(1, 5);
    const bytes = adapter.exactBytes(view);
    assert.equal(bytes.buffer, view.buffer);
    assert.equal(bytes.byteOffset, view.byteOffset);
    assert.equal(bytes.byteLength, view.byteLength);
    assert.deepEqual(Array.from(bytes), [0, 1, 128, 0]);
});

test("PGlite embedded asset pins match the reviewed resource manifest", () => {
    const manifest = JSON.parse(
        readFileSync(join(fixture, "resources.json"), "utf8"),
    );
    for (const [name, pin] of Object.entries(adapter.assetPins)) {
        const expected = manifest.files[`dist/${name}`];
        assert.deepEqual(pin, [expected.bytes, expected.sha256]);
    }
});

test("PGlite requires an explicit directory and rejects a missing resource before importing the package", async () => {
    await assert.rejects(
        adapter.createOfflinePGlite(),
        /explicit local asset directory/,
    );
    mkdirSync(join(fixture, ".work"), { recursive: true });
    const directory = mkdtempSync(join(fixture, ".work/adapter-"));
    try {
        await assert.rejects(
            adapter.createOfflinePGlite(directory),
            (error: any) => {
                assert.ok(
                    error.message.includes(join(directory, "pglite.wasm")),
                );
                assert.equal(error.cause.code, "ENOENT");
                return true;
            },
        );
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test("PGlite platform scope restores descriptors after asynchronous success and failure", async () => {
    const versions = process.versions as Record<string, string | undefined>;
    const original = Object.getOwnPropertyDescriptor(versions, "node")!;
    const binding = Object.getOwnPropertyDescriptor(process, "binding");
    delete versions.node;
    try {
        for (const fail of [false, true]) {
            const cause = new Error("initialization failed");
            const promise = adapter.withPGlitePlatform(async () => {
                assert.equal(typeof versions.node, "string");
                const load = (process as any).binding;
                assert.equal(
                    load("constants").fs,
                    (await import("node:fs")).constants,
                );
                assert.throws(
                    () => load("other"),
                    /Unsupported PGlite internal binding/,
                );
                await assert.rejects(
                    adapter.withPGlitePlatform(() => {}),
                    /Concurrent PGlite/,
                );
                await Promise.resolve();
                if (fail) throw cause;
                return 42;
            });
            if (fail)
                await assert.rejects(
                    promise,
                    (error: Error) => error === cause,
                );
            else assert.equal(await promise, 42);
            assert.equal(Object.hasOwn(versions, "node"), false);
            assert.deepEqual(
                Object.getOwnPropertyDescriptor(process, "binding"),
                binding,
            );
        }
    } finally {
        Object.defineProperty(versions, "node", original);
    }
});
