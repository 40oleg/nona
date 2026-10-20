import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compile, compileModuleToIR } from "../src/compiler.js";
import {
    collectBuiltinPruning,
    type BuiltinPruning,
} from "../src/frontend/builtin-pruning.js";
import { removeTemporaryDirectory } from "./helpers/cleanup.js";
import { runModulesOnHost } from "./helpers/host.js";

// Reachability pruning of built-in modules (#440).
//
// Evidence, win32-x64, `nona build <file> --target win32-x64 --print-link`,
// compiler commit 75b366ad (the size without pruning is the same build with
// NONA_NO_BUILTIN_PRUNING=1):
//
//   console.log("hello");                       1,296,384 bytes, links moduleRecords
//   import { existsSync } from "node:fs";
//   console.log(existsSync("."));
//     without pruning                           5,018,624 bytes, links regexp,
//       unicodeProperties, unicodeNormalization, regexpProtocol, binaryData,
//       encoding ("TextEncoder"), timers ("setImmediate"), annexB ("link" in
//       a string), moduleRecords; every fs, fs-win32 and path declaration
//       survives into the IR
//     with pruning                              1,808,384 bytes, links binaryData
//       ("Uint8Array"), encoding ("TextDecoder"), moduleRecords
//
// Kept in node:fs for existsSync: the FFI imports CreateFileW,
// GetFileInformationByHandle(Ex), CloseHandle, GetFileAttributesExW, the
// constants INVALID_HANDLE, DIRECTORY, BACKUP_SEMANTICS, OPEN_REPARSE_POINT,
// codeOf, error, attributeData, attributeView, attributes, isDirectory,
// sys.stat, decoder, descriptions, fail, pathString and existsSync. Removed:
// the other 81 units (every other sync, callback and promise operation,
// Stats, Dirent, encodings, readChunks, the other sys members, the default
// object, promises and constants) and all 53 units of node:path.

function pruning(
    files: Record<string, string>,
    entry = "main.mjs",
): Map<string, BuiltinPruning> {
    const directory = mkdtempSync(join(tmpdir(), "nona-pruning-"));
    try {
        for (const [name, text] of Object.entries(files))
            writeFileSync(join(directory, name), text);
        const { pruning } = collectBuiltinPruning(() =>
            compileModuleToIR(files[entry]!, join(directory, entry)),
        );
        return new Map(pruning.map((p) => [p.path, p]));
    } finally {
        removeTemporaryDirectory(directory);
    }
}
const fsOf = (files: Record<string, string>) => {
    const fs = pruning(files).get("node:fs");
    assert.ok(fs, "node:fs is in the graph");
    return fs;
};

test("builtin pruning: one named fs operation keeps what it reaches", () => {
    const report = pruning({
        "main.mjs":
            "import { existsSync } from 'node:fs';\nconsole.log(existsSync('.'));\n",
    });
    const fs = report.get("node:fs")!;
    assert.equal(fs.full, false);
    assert.deepEqual(fs.exports, ["existsSync"]);
    assert.ok(fs.kept.includes("existsSync"));
    for (const name of ["readFileSync", "readdirSync", "promises", "default"])
        assert.ok(fs.removed.includes(name), name);
    const path = report.get("node:path");
    if (path) assert.deepEqual(path.kept, []);
});

test("builtin pruning: several operations, aliases and re-exports", () => {
    assert.deepEqual(
        fsOf({
            "main.mjs":
                "import { existsSync, readFileSync as read, writeFileSync } from 'node:fs';\nconsole.log(typeof existsSync, typeof read, typeof writeFileSync);\n",
        }).exports.sort(),
        ["existsSync", "readFileSync", "writeFileSync"],
    );
    const reexported = fsOf({
        "main.mjs": "import { e } from './lib.mjs';\nconsole.log(e('.'));\n",
        "lib.mjs": "export { existsSync as e } from 'node:fs';\n",
    });
    assert.equal(reexported.full, false);
    assert.deepEqual(reexported.exports, ["existsSync"]);
});

for (const [name, source] of [
    [
        "namespace import",
        "import * as fs from 'node:fs';\nconsole.log(typeof fs.existsSync);\n",
    ],
    [
        "default import",
        "import fs from 'node:fs';\nconsole.log(typeof fs.existsSync);\n",
    ],
    [
        "dynamic import",
        "import('node:fs').then((fs) => console.log(typeof fs.existsSync));\n",
    ],
    [
        "process.getBuiltinModule",
        "console.log(typeof process.getBuiltinModule('fs').existsSync);\n",
    ],
    [
        "require through createRequire",
        "import { createRequire } from 'node:module';\nconsole.log(typeof createRequire(import.meta.url)('fs').existsSync);\n",
    ],
    ["star re-export", "export * from 'node:fs';\nconsole.log('star');\n"],
] as [string, string][])
    test(`builtin pruning: ${name} keeps node:fs whole`, () => {
        const fs = fsOf({ "main.mjs": source });
        assert.equal(fs.full, true);
        assert.deepEqual(fs.removed, []);
    });

test("builtin pruning: unrelated fs code no longer selects runtime parts", () => {
    const result = compile(
        "import { existsSync } from 'node:fs';\nconsole.log(existsSync('.'));\n",
        {
            fileName: "main.mjs",
            target: "win32-x64",
            module: true,
            reportLink: true,
        },
    );
    assert.ok(result.ok);
    const linked = (result.linked ?? []).map((part) => part.part);
    for (const part of [
        "regexp",
        "unicodeProperties",
        "unicodeNormalization",
        "timers",
        "annexB",
    ])
        assert.ok(!linked.includes(part), part);
    // 5,018,624 bytes without pruning (see the evidence above).
    assert.ok(result.image.length < 2_500_000, `${result.image.length} bytes`);
});

const cases: [string, Record<string, string>][] = [
    [
        "initialization order, cycles, live bindings and identity",
        {
            "main.mjs":
                "import { existsSync } from 'node:fs';\nimport { e, count, check } from './a.mjs';\nimport { later } from './b.mjs';\nconsole.log('main', e === existsSync, count);\ncheck(); later();\nconsole.log('count', count);\n",
            "a.mjs":
                "import { existsSync as e } from 'node:fs';\nimport { b } from './b.mjs';\nconsole.log('a', typeof e, b);\nexport { e };\nexport let count = 0;\nexport function check() { count++; return e('.'); }\n",
            "b.mjs":
                "import { check } from './a.mjs';\nimport { statSync } from 'node:fs';\nexport const b = 'b';\nconsole.log('b', statSync('.').isDirectory());\nexport function later() { return check(); }\n",
        },
    ],
    [
        "a named import is the property of the default object",
        {
            "main.mjs":
                "import { existsSync, readFileSync } from 'node:fs';\nimport { fs } from './other.mjs';\nconsole.log(fs.existsSync === existsSync, fs.readFileSync === readFileSync);\n",
            "other.mjs": "import fs from 'node:fs';\nexport { fs };\n",
        },
    ],
    [
        "promises and fs/promises share identities",
        {
            "main.mjs":
                "import { promises, realpathSync } from 'node:fs';\nimport { readFile } from 'node:fs/promises';\nconsole.log(promises.readFile === readFile, typeof realpathSync.native);\n",
        },
    ],
    [
        "reflection on a namespace",
        {
            "main.mjs":
                "import * as ns from 'node:fs';\nimport { existsSync } from './lib.mjs';\nconsole.log('existsSync' in ns, ns.existsSync === existsSync, ns.default.existsSync === existsSync);\nconsole.log(Object.prototype.toString.call(ns), Object.isFrozen(ns), Reflect.ownKeys(ns).includes('statSync'));\n",
            "lib.mjs": "export { existsSync } from 'node:fs';\n",
        },
    ],
];
for (const [name, files] of cases)
    test("builtin pruning: " + name, () => {
        const { native, oracle } = runModulesOnHost(files, "main.mjs");
        assert.equal(native.error, undefined);
        assert.equal(native.status, 0, native.stderr);
        assert.equal(native.stdout, oracle);
    });
