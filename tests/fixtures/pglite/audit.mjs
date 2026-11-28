import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    closeSync,
    mkdirSync,
    openSync,
    readFileSync,
    readSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
    fixtureDir,
    packageDir,
    resources,
    verifyPackage,
} from "./local-assets.mjs";

verifyPackage();
const wasmPath = join(packageDir, "dist/pglite.wasm");

function wabt(tool, args, path = wasmPath) {
    const result = spawnSync(
        process.execPath,
        [
            "--max-old-space-size=256",
            "--wasm-num-compilation-tasks=1",
            join(fixtureDir, "node_modules/wabt/bin", tool),
            ...args,
            path,
        ],
        {
            encoding: "utf8",
            timeout: 30_000,
            maxBuffer: 2 * 1024 * 1024,
            windowsHide: true,
            env: { ...process.env, NODE_OPTIONS: "" },
        },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout.replaceAll("\r\n", "\n").trim();
}

const work = join(fixtureDir, ".work");
mkdirSync(work, { recursive: true });
function opcodeInventory(path) {
    const statisticsPath = join(work, "wasm-stats.txt");
    let statistics;
    try {
        wabt("wasm-stats", ["-o", statisticsPath], path);
        // Discard WABT's large immediate-value histogram after reading the complete
        // opcode inventory from the first 64 KiB.
        const fd = openSync(statisticsPath, "r");
        try {
            const buffer = Buffer.alloc(64 * 1024);
            statistics = buffer
                .subarray(0, readSync(fd, buffer))
                .toString("utf8");
        } finally {
            closeSync(fd);
        }
    } finally {
        rmSync(statisticsPath, { force: true });
    }
    const opcodes = Object.fromEntries(
        statistics
            .split("Opcode counts:\n")[1]
            .split("\n\n")[0]
            .split("\n")
            .map((line) => {
                const [name, count] = line.split(": ");
                return [name, Number(count)];
            })
            .sort(([a], [b]) => a.localeCompare(b, "en")),
    );
    return {
        totalOpcodes: Number(statistics.match(/Total opcodes: (\d+)/)[1]),
        opcodes,
    };
}

const module = new WebAssembly.Module(readFileSync(wasmPath));
const audit = {
    package: resources.package,
    wasm: resources.files["dist/pglite.wasm"],
    tool: "wabt@1.0.39",
    headers: wabt("wasm-objdump", ["-h"]),
    types: wabt("wasm-objdump", ["-x", "-j", "Type"]),
    imports: wabt("wasm-objdump", ["-x", "-j", "Import"]),
    exportsByKind: WebAssembly.Module.exports(module).reduce((counts, item) => {
        counts[item.kind] = (counts[item.kind] || 0) + 1;
        return counts;
    }, {}),
    dylink: WebAssembly.Module.customSections(module, "dylink.0").map((bytes) =>
        Buffer.from(bytes).toString("hex"),
    ),
    ...opcodeInventory(wasmPath),
};
// pglite.data contains relocatable WASM libraries too, even with no optional
// extension selected. Parse the generated metadata as data, without eval.
const glue = readFileSync(join(packageDir, "dist/pglite.js"), "utf8");
const bundle = readFileSync(join(packageDir, "dist/pglite.data"));
const entries = [
    ...glue.matchAll(/\{filename:"([^"]+)",start:(\d+),end:(\d+)\}/g),
];
audit.bundleEntries = entries.length;
audit.bundledWasm = [];
for (const [, name, start, end] of entries) {
    const bytes = bundle.subarray(Number(start), Number(end));
    if (!bytes.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109]))) continue;
    const path = join(work, basename(name) + ".wasm");
    try {
        writeFileSync(path, bytes);
        audit.bundledWasm.push({
            name,
            bytes: bytes.length,
            sha256: createHash("sha256").update(bytes).digest("hex"),
            types: wabt("wasm-objdump", ["-x", "-j", "Type"], path),
            imports: wabt("wasm-objdump", ["-x", "-j", "Import"], path),
            dylink: WebAssembly.Module.customSections(
                new WebAssembly.Module(bytes),
                "dylink.0",
            ).map((section) => Buffer.from(section).toString("hex")),
            ...opcodeInventory(path),
        });
    } finally {
        rmSync(path, { force: true });
    }
}
const output = JSON.stringify(audit, null, 4) + "\n";
const path = join(fixtureDir, "audit.json");
if (process.argv[2] === "--check") {
    if (!isDeepStrictEqual(JSON.parse(readFileSync(path, "utf8")), audit)) {
        throw new Error(
            "PGlite audit differs; inspect the pinned package and regenerate audit.json",
        );
    }
    console.log("PGlite audit matches the pinned binary");
} else {
    writeFileSync(path, output);
    console.log("Wrote tests/fixtures/pglite/audit.json");
}
