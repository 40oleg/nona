import assert from "node:assert/strict";
import test from "node:test";
import { peMetadata, bindMap, validateMap, locate } from "./issue646-map.mjs";
import {
    pins,
    verifyInputs,
    verifyProvenance,
    verifyObservation,
    changedProfileFiles,
} from "./issue646-profile.mjs";

function image() {
    const b = Buffer.alloc(1024);
    b.write("MZ");
    b.writeUInt32LE(128, 60);
    b.write("PE\0\0", 128);
    b.writeUInt16LE(0x8664, 132);
    b.writeUInt16LE(1, 134);
    b.writeUInt16LE(240, 148);
    b.writeUInt16LE(0x20b, 152);
    b.writeUInt32LE(0x1000, 168);
    b.writeBigUInt64LE(0x140000000n, 176);
    b.writeUInt32LE(0x2000, 208);
    b.writeUInt32LE(16, 260);
    b.write(".text", 392);
    b.writeUInt32LE(32, 400);
    b.writeUInt32LE(0x1000, 404);
    b.writeUInt32LE(512, 408);
    b.writeUInt32LE(512, 412);
    b.writeUInt32LE(0x60000020, 428);
    return b;
}
test("PE parser rejects wrong architecture, truncated/overlapping ranges", () => {
    assert.equal(peMetadata(image()).sections[0].rva, 4096);
    const bad = image();
    bad.writeUInt16LE(0xaa64, 132);
    assert.throws(() => peMetadata(bad), /AMD64/);
    assert.throws(() => peMetadata(image().subarray(0, 410)));
    const outside = image();
    outside.writeUInt32LE(0x3000, 400);
    assert.throws(() => peMetadata(outside), /range/);
});
test("function maps need exact bytes, complete executable layout and real boundaries", () => {
    const b = image();
    const fragments = [
        {
            name: "rt.collect",
            section: ".text",
            bytes: new Uint8Array(32),
            symbols: { end: 32 },
        },
    ];
    const map = bindMap(b, b, { fragments, functions: [] });
    validateMap(map, peMetadata(b));
    const incomplete = structuredClone(map);
    incomplete.ranges[0].end--;
    assert.throws(() => validateMap(incomplete, peMetadata(b)), /incomplete/);
    const foreign = structuredClone(map);
    foreign.imageSha256 = "wrong";
    assert.throws(() => validateMap(foreign, peMetadata(b)), /identity/);
    assert.equal(locate(map, 0x1001).name, "rt.collect");
    assert.equal(locate(map, 0x1020), null);
    const other = Buffer.from(b);
    other[600] = 1;
    assert.throws(
        () => bindMap(b, other, { fragments, functions: [] }),
        /hash/,
    );
    assert.throws(
        () => bindMap(b, b, { fragments: [], functions: [] }),
        /complete/,
    );
    assert.throws(
        () =>
            bindMap(b, b, {
                fragments: [{ ...fragments[0], symbols: { bad: 33 } }],
                functions: [],
            }),
        /label/,
    );
});
test("function label ranges must match retained PE exception boundaries", () => {
    const b = Buffer.alloc(1536);
    image().copy(b);
    b.writeUInt16LE(2, 134);
    b.writeUInt32LE(0x3000, 208);
    b.writeUInt32LE(0x2000, 288);
    b.writeUInt32LE(12, 292);
    b.write(".pdata", 432);
    b.writeUInt32LE(12, 440);
    b.writeUInt32LE(0x2000, 444);
    b.writeUInt32LE(512, 448);
    b.writeUInt32LE(1024, 452);
    b.writeUInt32LE(0x40000040, 468);
    b.writeUInt32LE(0x1000, 1024);
    b.writeUInt32LE(0x1020, 1028);
    const program = {
        fragments: [
            {
                name: "rt.collect",
                section: ".text",
                bytes: new Uint8Array(32),
                symbols: { end: 32 },
            },
        ],
        functions: [{ begin: "rt.collect", end: "end" }],
    };
    assert.equal(locate(bindMap(b, b, program), 0x101f).name, "rt.collect");
    const wrong = structuredClone(program);
    wrong.fragments[0].symbols.end = 31;
    assert.throws(() => bindMap(b, b, wrong), /\.pdata/);
    const malformed = Buffer.from(b);
    malformed.writeUInt32LE(0x1030, 1028);
    assert.throws(() => peMetadata(malformed), /function range/);
});
test("head commit selection fails closed on unknown or truncated filenames", () => {
    assert.equal(changedProfileFiles([{ filename: "README.md" }]), false);
    assert.equal(
        changedProfileFiles([{ filename: "scripts/issue646-map.mjs" }]),
        true,
    );
    assert.equal(
        changedProfileFiles([
            {
                filename: "elsewhere",
                previous_filename: "scripts/issue646-map.mjs",
            },
        ]),
        true,
    );
    assert.throws(() => changedProfileFiles(null));
    assert.throws(() => changedProfileFiles([{}]));
    assert.throws(() =>
        changedProfileFiles(
            Array.from({ length: 3000 }, () => ({ filename: "a" })),
        ),
    );
});
test("exact request/input provenance excludes lookalikes and altered modes", () => {
    assert.equal(
        pins.imagePath,
        "native-gc-diagnosis/01-original/executions/modules-2gJyVw/image.bin",
    );
    assert.throws(() => verifyInputs(new Map()), /missing/);
    const files = new Map([[pins.imagePath, Buffer.from("{}")]]);
    assert.throws(() => verifyInputs(files), /digest/);
});
function provenance() {
    const files = { "main.mjs": "unmodified fixture" },
        options = { gcStress: true, oracleSource: "original oracle" };
    const n = {
        input: {
            files,
            entry: "main.mjs",
            options,
            timeoutMs: 180000,
            target: "win32-x64",
            compilerMode: "compileModuleToIR/generate",
            link: "fullRuntimeLink",
        },
        source: pins.source,
        node: "v26.9.0",
        platform: "win32",
        arch: "x64",
        gcSelection: "on",
    };
    return [
        {
            id: "01-original",
            phase: "original",
            kind: "modules",
            source: pins.source,
            oracleArgs: null,
            args: [files, "main.mjs", options],
        },
        n,
        {
            ...n,
            input: { files, entry: "main.mjs", options, timeoutMs: 60000 },
        },
        {
            source: pins.source,
            diagnosticCommit: pins.diagnostic,
            run: String(pins.run),
        },
        {
            status: null,
            signal: "SIGTERM",
            error: {
                code: "ETIMEDOUT",
                path: "C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\nona-modules-OyJvPt\\image.exe",
            },
        },
    ];
}
test("provenance binds graph, oracle, stress, compiler owner and original deadline", () => {
    assert.equal(verifyProvenance(...provenance()).timeoutMs, 180000);
    for (const mutate of [
        (x) => {
            x[1].source = pins.diagnostic;
        },
        (x) => {
            x[1].input.timeoutMs = 200000;
        },
        (x) => {
            x[1].input.options = { ...x[1].input.options, gcStress: false };
        },
        (x) => {
            x[2].input.files = { "main.mjs": "synthetic" };
        },
        (x) => {
            x[2].input.options = {
                ...x[2].input.options,
                oracleSource: "changed",
            };
        },
        (x) => {
            x[0].phase = "marked-native-only";
        },
        (x) => {
            x[3].diagnosticCommit = pins.source;
        },
    ]) {
        const x = provenance();
        mutate(x);
        assert.throws(() => verifyProvenance(...x));
    }
});
function observation() {
    return {
        imageSha256: pins.imageSha256,
        nativeAssertionsPassed: true,
        nodeAssertionsPassed: true,
        nativeCount: 1,
        nodeCount: 1,
        native: {
            pid: 10,
            timeoutMs: 180000,
            status: null,
            signal: "SIGTERM",
            error: null,
            deadlineExpired: true,
            started: "2026-11-05T00:00:00Z",
            finished: "2026-11-05T00:03:00Z",
        },
        node: {
            timeoutMs: 60000,
            status: 0,
            signal: null,
            error: null,
            stdoutSha256: "a",
            stderrSha256: "b",
        },
        sampler: {
            complete: true,
            cleanup: true,
            pid: 10,
            creation: "123",
            imageSha256: pins.imageSha256,
            base: "0x140000000",
            imageSize: 8192,
            samples: 1,
            rows: 1,
            errors: [],
        },
        rows: [
            {
                pid: 10,
                creation: "123",
                at: "2026-11-05T00:00:01Z",
                cpuMs: 100,
                rss: 100000,
                threads: [{ tid: 11, creation: "456", rip: "0x140001001" }],
            },
        ],
        pe: {
            sizeOfImage: 8192,
            sections: [{ rva: 4096, size: 32, executable: true }],
        },
        samplerExit: { status: 0, signal: null, error: null },
    };
}
test("profile validity cannot clear native failure; identity and incomplete evidence fail closed", () => {
    assert.equal(verifyObservation(observation()).nativePassed, false);
    for (const mutate of [
        (x) => {
            x.sampler.complete = false;
        },
        (x) => {
            x.sampler.cleanup = false;
        },
        (x) => {
            x.rows[0].creation = "reused";
        },
        (x) => {
            x.rows[0].pid = 20;
        },
        (x) => {
            x.rows = [];
        },
        (x) => {
            x.rows[0].threads[0].rip = "0x7fff00000000";
        },
        (x) => {
            x.sampler.samples = 2;
        },
        (x) => {
            x.sampler.imageSha256 = "different";
        },
        (x) => {
            x.nativeCount = 2;
        },
        (x) => {
            x.samplerExit.status = 1;
        },
        (x) => {
            x.rows[0].at = "2026-11-05T00:05:00Z";
        },
        (x) => {
            delete x.native.error;
        },
        (x) => {
            x.nodeCount = 0;
        },
    ]) {
        const x = observation();
        mutate(x);
        assert.throws(() => verifyObservation(x));
    }
    const passing = observation();
    passing.native.status = 0;
    passing.native.signal = null;
    passing.native.deadlineExpired = false;
    assert.equal(verifyObservation(passing).nativePassed, true);
    assert.equal(verifyObservation(passing).historicalFailuresCleared, false);
    passing.nativeAssertionsPassed = false;
    assert.equal(verifyObservation(passing).nativePassed, false);
});
