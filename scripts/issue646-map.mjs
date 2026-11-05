// Metadata only. Rebuilding is allowed exclusively on the hosted Windows runner.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join, win32 } from "node:path";
import { pathToFileURL } from "node:url";

export const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const align = (n, a) => Math.ceil(n / a) * a;
export function peMetadata(bytes) {
    const b = Buffer.from(bytes);
    const range = (o, n) =>
        assert.ok(
            Number.isSafeInteger(o) && o >= 0 && o + n <= b.length,
            "PE file range",
        );
    range(0, 64);
    assert.equal(b.toString("ascii", 0, 2), "MZ");
    const p = b.readUInt32LE(60);
    range(p, 24);
    assert.equal(b.toString("ascii", p, p + 4), "PE\0\0");
    assert.equal(b.readUInt16LE(p + 4), 0x8664, "AMD64 PE required");
    const count = b.readUInt16LE(p + 6),
        optSize = b.readUInt16LE(p + 20),
        o = p + 24;
    assert.ok(count > 0 && count <= 96 && optSize >= 240);
    range(o, optSize + count * 40);
    assert.equal(b.readUInt16LE(o), 0x20b);
    const sizeOfImage = b.readUInt32LE(o + 56);
    assert.ok(
        sizeOfImage > 0 && sizeOfImage <= 256 * 1024 * 1024,
        "PE image range",
    );
    const sections = [];
    for (let i = 0; i < count; i++) {
        const s = o + optSize + i * 40,
            size = b.readUInt32LE(s + 8),
            rva = b.readUInt32LE(s + 12),
            rawSize = b.readUInt32LE(s + 16),
            raw = b.readUInt32LE(s + 20);
        range(raw, rawSize);
        assert.ok(
            size > 0 && rva > 0 && rva + Math.max(size, rawSize) <= sizeOfImage,
            "PE section range",
        );
        assert.ok(
            !sections.some(
                (x) =>
                    rva < x.rva + Math.max(x.size, x.rawSize) &&
                    x.rva < rva + Math.max(size, rawSize),
            ),
            "overlapping PE sections",
        );
        sections.push({
            name: b.toString("ascii", s, s + 8).replace(/\0.*$/s, ""),
            rva,
            size,
            raw,
            rawSize,
            executable: !!(b.readUInt32LE(s + 36) & 0x20000000),
        });
    }
    const exceptionRva = b.readUInt32LE(o + 112 + 3 * 8),
        exceptionSize = b.readUInt32LE(o + 116 + 3 * 8),
        functions = [];
    if (exceptionSize) {
        const s = sections.find(
            (x) =>
                exceptionRva >= x.rva &&
                exceptionRva + exceptionSize <= x.rva + x.rawSize,
        );
        assert.ok(s && exceptionSize % 12 === 0, "PE exception range");
        const start = s.raw + exceptionRva - s.rva;
        range(start, exceptionSize);
        for (let pos = start; pos < start + exceptionSize; pos += 12) {
            const begin = b.readUInt32LE(pos),
                end = b.readUInt32LE(pos + 4);
            assert.ok(
                sections.some(
                    (x) =>
                        x.executable &&
                        begin >= x.rva &&
                        begin < end &&
                        end <= x.rva + x.size,
                ),
                "PE function range",
            );
            assert.ok(
                !functions.length || functions.at(-1).end <= begin,
                "overlapping PE functions",
            );
            functions.push({ begin, end });
        }
    }
    return {
        imageSha256: sha256(b),
        sizeOfImage,
        preferredBase: "0x" + b.readBigUInt64LE(o + 24).toString(16),
        sections,
        functions,
    };
}

export function bindMap(retained, rebuilt, program) {
    assert.equal(
        sha256(rebuilt),
        sha256(retained),
        "rebuilt image hash differs; attribution forbidden",
    );
    const pe = peMetadata(retained),
        symbols = new Map(),
        ranges = [];
    const symbol = (name, rva) => {
        assert.equal(typeof name, "string");
        assert.ok(!symbols.has(name), "duplicate label");
        symbols.set(name, rva);
    };
    // Pinned linkPe places each .text fragment in input order, with its declared
    // alignment (default 16). Cross-check the complete section AND .pdata below.
    const text = pe.sections.filter((s) => s.executable);
    assert.ok(
        text.length === 1 && text[0].name === ".text",
        "map completeness: executable sections",
    );
    let offset = 0;
    for (const f of program.fragments.filter((f) => f.section === ".text")) {
        const a = f.alignment ?? 16;
        assert.ok(
            Number.isInteger(a) && a > 0 && a <= 4096 && !(a & (a - 1)),
            "fragment alignment",
        );
        const next = align(offset, a),
            base = text[0].rva;
        if (next > offset)
            ranges.push({
                name: "<alignment padding>",
                begin: base + offset,
                end: base + next,
                kind: "padding",
            });
        offset = next;
        symbol(f.name, base + offset);
        for (const [label, pos] of Object.entries(f.symbols)) {
            assert.ok(
                Number.isInteger(pos) && pos >= 0 && pos <= f.bytes.length,
                "label outside fragment",
            );
            if (label === f.name && pos === 0) continue;
            symbol(label, base + offset + pos);
        }
        if (f.bytes.length)
            ranges.push({
                name: f.name,
                begin: base + offset,
                end: base + offset + f.bytes.length,
                kind: "fragment",
            });
        offset += f.bytes.length;
    }
    assert.equal(
        offset,
        text[0].size,
        "map incomplete: executable byte coverage",
    );
    const functions = program.functions
        .map((f) => {
            const begin = symbols.get(f.begin),
                end = symbols.get(f.end);
            assert.ok(
                Number.isInteger(begin) && Number.isInteger(end) && end > begin,
                "function label missing",
            );
            return { name: f.begin, begin, end };
        })
        .sort((a, b) => a.begin - b.begin);
    assert.deepEqual(
        functions.map(({ begin, end }) => ({ begin, end })),
        pe.functions,
        "function map differs from retained .pdata",
    );
    const map = {
        imageSha256: sha256(retained),
        complete: true,
        ranges,
        functions,
        labels: Object.fromEntries(symbols),
        pe,
    };
    validateMap(map, pe);
    return map;
}
export function validateMap(map, pe) {
    assert.equal(map.complete, true, "incomplete map");
    assert.equal(map.imageSha256, pe.imageSha256, "map/image identity");
    assert.deepEqual(map.pe, pe, "map PE metadata differs");
    const ranges = [...map.ranges].sort((a, b) => a.begin - b.begin);
    let count = 0;
    for (const section of pe.sections.filter((s) => s.executable)) {
        let position = section.rva;
        for (const range of ranges.filter(
            (r) =>
                r.begin >= section.rva && r.begin < section.rva + section.size,
        )) {
            assert.equal(
                range.begin,
                position,
                "incomplete/overlapping map ranges",
            );
            assert.ok(
                Number.isInteger(range.end) &&
                    range.end > position &&
                    range.end <= section.rva + section.size,
                "map range outside section",
            );
            assert.ok(typeof range.name === "string" && range.name.length > 0);
            position = range.end;
            count++;
        }
        assert.equal(
            position,
            section.rva + section.size,
            "incomplete map coverage",
        );
    }
    assert.equal(
        count,
        ranges.length,
        "map ranges outside executable sections",
    );
    assert.deepEqual(
        map.functions.map(({ begin, end }) => ({ begin, end })),
        pe.functions,
        "map functions differ from retained .pdata",
    );
    for (const f of map.functions)
        assert.equal(map.labels[f.name], f.begin, "function label identity");
}
export function locate(map, rva) {
    assert.ok(map.complete, "incomplete map");
    return (
        map.functions.find((f) => rva >= f.begin && rva < f.end) ??
        map.ranges.find((f) => rva >= f.begin && rva < f.end) ??
        null
    );
}

async function hostedMap(output, source) {
    const { requireHosted, pins } = await import("./issue646-profile.mjs");
    requireHosted();
    const { execFileSync } = await import("node:child_process");
    const write = (name, value) =>
        writeFileSync(
            join(output, name),
            JSON.stringify(value, null, 2) + "\n",
        );
    const report = {
        complete: false,
        imageSha256: pins.imageSha256,
        source: pins.source,
        started: new Date().toISOString(),
        gap: null,
    };
    try {
        const certificateBytes = readFileSync(
            join(output, "derivation-certificate.json"),
        );
        const certificate = JSON.parse(certificateBytes);
        assert.equal(certificate.mode, "mapping-only-existing-partial");
        assert.equal(certificate.source, pins.source);
        assert.equal(certificate.helper.run, process.env.GITHUB_RUN_ID);
        assert.equal(certificate.helper.head, process.env.PROFILE_HEAD);
        assert.equal(
            certificate.helper.mapHelperSha256,
            sha256(readFileSync(new URL(import.meta.url))),
        );
        report.helper = certificate.helper;
        report.certificateSha256 = sha256(certificateBytes);
        assert.equal(
            execFileSync("git", ["rev-parse", "HEAD"], {
                cwd: source,
                encoding: "utf8",
            }).trim(),
            pins.source,
        );
        assert.equal(process.version, "v26.9.0");
        const retained = readFileSync(join(output, "image.bin"));
        assert.equal(sha256(retained), pins.imageSha256);
        const input = JSON.parse(
            readFileSync(join(output, "native-input.json"), "utf8"),
        ).input;
        const original = JSON.parse(
            readFileSync(join(output, "historical-native-result.json"), "utf8"),
        );
        const filename = win32.join(
            win32.dirname(original.error.path),
            input.entry,
        );
        assert.equal(
            win32.basename(win32.dirname(filename)),
            "nona-modules-OyJvPt",
        );
        mkdirSync(win32.dirname(filename), { recursive: true });
        for (const [name, text] of Object.entries(input.files))
            writeFileSync(win32.join(win32.dirname(filename), name), text);
        const { compileModuleToIR } = await import(
            pathToFileURL(join(source, "dist/src/compiler.js"))
        );
        const { generate } = await import(
            pathToFileURL(join(source, "dist/src/backend/x64/codegen.js"))
        );
        const { linkPe } = await import(
            pathToFileURL(join(source, "dist/src/backend/pe/writer.js"))
        );
        const program = generate(
            compileModuleToIR(input.files[input.entry], filename),
            { gcStress: true },
        );
        const rebuilt = Buffer.from(linkPe(program));
        report.rebuiltSha256 = sha256(rebuilt);
        // These bytes are never launched. The sole sampled executable is retained.
        writeFileSync(join(output, "rebuilt-for-map.bin"), rebuilt);
        const map = bindMap(retained, rebuilt, program);
        write("map.json", map);
        report.mapSha256 = sha256(readFileSync(join(output, "map.json")));
        report.complete = true;
    } catch (error) {
        report.gap = { message: error.message, stack: error.stack };
        process.exitCode = 1;
    } finally {
        report.finished = new Date().toISOString();
        write("map-result.json", report);
    }
}
if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
    // Let this module finish evaluation before profile imports it back.
    setImmediate(() => {
        Promise.resolve()
            .then(() =>
                hostedMap(resolve(process.argv[2]), resolve(process.argv[3])),
            )
            .catch((error) => {
                console.error(error);
                process.exitCode = 1;
            });
    });
}
