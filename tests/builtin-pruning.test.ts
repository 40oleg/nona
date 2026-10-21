import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compile, compileModuleToIR } from "../src/compiler.js";
import {
    collectBuiltinPruning,
    danglingReferences,
    pruneBuiltinModules,
    type BuiltinPruning,
} from "../src/frontend/builtin-pruning.js";
import type * as A from "../src/frontend/ast.js";
import { withBuiltinModules } from "../src/frontend/builtin-modules.js";
import { lex } from "../src/frontend/lexer.js";
import { loadModuleGraph, type ModuleRecord } from "../src/frontend/modules.js";
import { parse } from "../src/frontend/parser.js";
import { requireHostTarget } from "../src/target.js";
import { removeTemporaryDirectory } from "./helpers/cleanup.js";
import { runModulesOnHost } from "./helpers/host.js";

// Reachability pruning of built-in modules (#440).
//
// Evidence, win32-x64, `node bench/size-builtin.mjs` (`nona build <file>
// --target win32-x64 --print-link`), compiler commit 4aafd672 (the size
// without pruning is the same build with NONA_NO_BUILTIN_PRUNING=1):
//
//   console.log("hello");                       1,296,384 bytes, links moduleRecords
//   import { existsSync } from "node:fs";
//   console.log(existsSync("."));
//     without pruning                           5,018,624 bytes, links regexp,
//       unicodeProperties, unicodeNormalization, regexpProtocol, binaryData,
//       encoding ("TextEncoder"), timers ("setImmediate"), annexB ("link" in
//       a string), moduleRecords; every fs, fs-win32 and path declaration
//       survives into the IR
//     with pruning                              1,808,896 bytes, links binaryData
//       ("Uint8Array"), encoding ("TextDecoder"), moduleRecords
//   readFileSync, writeFileSync, statSync       5,024,256 -> 1,946,112 bytes
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
    [
        "named path imports keep posix and win32 identities",
        {
            "main.mjs":
                "import { join, basename, normalize, posix, win32, sep } from 'node:path';\nimport posixDefault from 'node:path/posix';\nimport { join as winJoin } from 'node:path/win32';\nconsole.log(posix.join('a', 'b', '..', 'c'), win32.join('a', 'b'), basename('/x/y.txt', '.txt'), typeof join, typeof normalize, sep.length);\nconsole.log(posix.posix === posix, win32.win32 === win32, posix.win32 === win32, posixDefault === posix, winJoin === win32.join);\n",
        },
    ],
    [
        "a named path import is the property of the default object",
        {
            "main.mjs":
                "import { join, posix, dirname } from 'node:path';\nimport { path } from './other.mjs';\nconsole.log(path.join === join, path.posix === posix, path.dirname === dirname, typeof path.relative);\n",
            "other.mjs": "import path from 'node:path';\nexport { path };\n",
        },
    ],
    [
        "named fs/promises imports",
        {
            "main.mjs":
                "import { writeFile, readFile, stat } from 'node:fs/promises';\nwriteFile('p.txt', 'promised').then(() => readFile('p.txt', 'utf8')).then((text) => { console.log(text); return stat('p.txt'); }).then((s) => console.log(s.size, s.isFile()), (e) => console.log('error', e.code));\nconsole.log('sync first');\n",
        },
    ],
    [
        "callback fs operations alone",
        {
            "main.mjs":
                "import { writeFile, readFile, exists, unlink } from 'node:fs';\nwriteFile('c.txt', 'called', (error) => {\n  console.log('written', error);\n  readFile('c.txt', 'utf8', (error, text) => {\n    console.log('read', error, text);\n    exists('c.txt', (found) => {\n      console.log('exists', found);\n      unlink('c.txt', (error) => console.log('unlinked', error));\n    });\n  });\n});\nconsole.log('sync first');\n",
        },
    ],
    [
        "fs.promises alone",
        {
            "main.mjs":
                "import { promises } from 'node:fs';\npromises.readFile('missing.txt').then(() => console.log('found'), (e) => console.log(e.code, typeof promises.writeFile));\n",
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

// Soundness rules of the pass, on a synthetic built-in module "lib".
function synthetic(lib: string, main = "import { f } from 'lib';\nf();\n") {
    const program = (text: string) =>
        parse(lex(text, { module: true }), { module: true });
    const records: ModuleRecord[] = [
        {
            index: 0,
            path: "/main.mjs",
            ast: program(main),
            requests: new Map([["lib", 1]]),
            staticRequests: [1],
            dynamicRequests: [],
        },
        {
            index: 1,
            path: "lib",
            ast: program(lib),
            requests: new Map(),
            staticRequests: [],
            dynamicRequests: [],
            builtinAliases: ["lib"],
        },
    ];
    const original = records[1]!.ast;
    const report = pruneBuiltinModules(records).find((r) => r.path === "lib")!;
    assert.deepEqual(danglingReferences(original, records[1]!.ast), []);
    return report;
}

test("builtin pruning: private object members", () => {
    const lib = (read: string) =>
        `const o = { a() { return 1; }, b() { return 2; }, c: 3 };\nexport function f() { return ${read}; }\n`;
    // Control: calling a function of the literal keeps that member only.
    assert.ok(synthetic(lib("o.a()")).removed.includes("o.b"));
    assert.ok(synthetic(lib("o?.a()")).removed.includes("o.b"));
    // Inherited members can return or inspect the object itself.
    for (const read of [
        "o.valueOf()",
        "o.hasOwnProperty('b')",
        "o?.valueOf()",
        "o.missing",
        "Object.keys(o)",
        "'b' in o",
        "o[String('b')]",
    ]) {
        const report = synthetic(lib(read));
        assert.ok(report.kept.includes("o"), read);
        assert.ok(!report.removed.some((u) => u.startsWith("o.")), read);
    }
    // A called member that is not a function of the literal may read `this`.
    assert.ok(
        !synthetic(
            "function g() { return Object.keys(this); }\nconst o = { g, h: 1 };\nexport function f() { return o.g(); }\n",
        ).removed.includes("o.h"),
    );
    assert.ok(
        !synthetic(
            "const o = { a() { return this; }, b: 1 };\nexport function f() { return o.a(); }\n",
        ).removed.includes("o.b"),
    );
});

test("builtin pruning: initializers that may throw or run code are kept", () => {
    const main = "import { y } from 'lib';\nconsole.log(y);\n";
    for (const lib of [
        "const x = 1n + 1;\nexport const y = 1;\n",
        "const x = +1n;\nexport const y = 1;\n",
        "const x = Function.caller;\nexport const y = 1;\n",
        "function make() { return {}; }\nmake = function () { globalThis.hit = 1; return {}; };\nconst x = make();\nexport const y = 1;\n",
        "import { define } from 'nona:ffi';\nconst name = 'Beep';\nconst x = define('kernel32.dll', name, 'bool(u32,u32)');\nexport const y = 1;\n",
    ]) {
        const report = synthetic(lib, main);
        assert.ok(report.roots.includes("x"), lib);
        assert.ok(report.kept.includes("x"), lib);
    }
    // Controls: the same shapes without the hazard are removed.
    for (const lib of [
        "const x = 1n;\nexport const y = 1;\n",
        "const x = Math.max;\nexport const y = 1;\n",
        "function make() { return {}; }\nconst x = make();\nexport const y = 1;\n",
        "import { define } from 'nona:ffi';\nconst x = define('kernel32.dll', 'Beep', 'bool(u32,u32)');\nexport const y = 1;\n",
    ])
        assert.ok(synthetic(lib, main).removed.includes("x"), lib);
});

// Every built-in module the pass can split, one export imported at a time:
// no kept code mentions a removed declaration, and every import of a pruned
// module names an export that remains.
const target = requireHostTarget();
function prunedGraph(main: string, cache: Map<string, A.Program>) {
    const host = withBuiltinModules(
        {
            resolve: (specifier) => specifier,
            read: (path) => (path === "/main.mjs" ? main : undefined),
            program: (path) => cache.get(path),
        },
        target,
    );
    const records = loadModuleGraph("/main.mjs", main, host);
    const original = new Map(records.map((r) => [r.path, r.ast]));
    // Pruning builds new nodes, so the parsed built-ins can be reused.
    for (const record of records)
        if (record.builtinAliases && record.loadError === undefined)
            cache.set(record.path, record.ast);
    return { records, original, report: pruneBuiltinModules(records) };
}
const prunable = (() => {
    const cache = new Map<string, A.Program>();
    const paths = withBuiltinModules(
        { resolve: () => undefined, read: () => undefined },
        target,
    ).builtinCandidates!();
    const modules: { path: string; exports: string[] }[] = [];
    for (const path of paths) {
        const { report } = prunedGraph(
            `import * as ns from ${JSON.stringify(path)};\n`,
            cache,
        );
        const exports = report.find((r) => r.path === path)?.exports ?? [];
        if (exports.length) modules.push({ path, exports });
    }
    return { cache, modules };
})();

test("builtin pruning: each export alone keeps a closed module", () => {
    for (const path of ["node:fs", "node:fs/promises", "node:path"])
        assert.ok(
            prunable.modules.some((m) => m.path === path),
            path,
        );
    const failures: string[] = [];
    for (const { path, exports } of prunable.modules)
        for (const name of exports) {
            const { records, original, report } = prunedGraph(
                `import { ${JSON.stringify(name)} as x } from ${JSON.stringify(path)};\n`,
                prunable.cache,
            );
            const pruned = new Map(
                report.filter((r) => !r.full).map((r) => [r.path, r]),
            );
            for (const record of records) {
                if (pruned.has(record.path)) {
                    const dangling = danglingReferences(
                        original.get(record.path)!,
                        record.ast,
                    );
                    if (dangling.length)
                        failures.push(
                            `${path} ${name}: ${record.path} lost ${dangling.join(", ")}`,
                        );
                }
                for (const statement of record.ast.body) {
                    if (statement.kind !== "Import") continue;
                    const from =
                        records[record.requests.get(statement.source) ?? -1];
                    const exported = from && pruned.get(from.path)?.exports;
                    if (!exported) continue;
                    for (const s of statement.specifiers) {
                        const imported =
                            s.kind === "named"
                                ? s.imported!
                                : s.kind === "default"
                                  ? "default"
                                  : "*";
                        if (!exported.includes(imported))
                            failures.push(
                                `${path} ${name}: ${record.path} imports ${imported} of pruned ${from.path}`,
                            );
                    }
                }
            }
        }
    assert.deepEqual(failures, []);
});

// The same exports at run time against Node.js: batch k imports exports
// [k*B, (k+1)*B) of every module, so each module is pruned to a few exports.
// Exports Node.js lacks are skipped, and so are those that differ from
// Node.js without pruning too (NONA_NO_BUILTIN_PRUNING=1).
const knownGaps = new Set([
    "node:worker_threads MessageChannel",
    "node:worker_threads MessagePort",
    "node:worker_threads BroadcastChannel",
    "node:process umask",
]);
const nodeExports = prunable.modules
    .filter((m) => m.path.startsWith("node:"))
    .map(({ path, exports }) => {
        // Node.js's named exports of a built-in are the own enumerable keys.
        const module = process.getBuiltinModule(path) as object | undefined,
            named = new Set(module ? Object.keys(module) : []);
        return {
            path,
            exports: exports.filter(
                (name) =>
                    name !== "default" &&
                    named.has(name) &&
                    !knownGaps.has(`${path} ${name}`),
            ),
        };
    });
const batchSize = 12;
const longest = Math.max(...nodeExports.map((m) => m.exports.length));
for (let start = 0; start < longest; start += batchSize)
    test(`builtin pruning: exports ${start}.. of each module match Node.js`, () => {
        const imports: string[] = [],
            prints: string[] = [];
        nodeExports.forEach(({ path, exports }, m) => {
            const names = exports.slice(start, start + batchSize);
            if (!names.length) return;
            imports.push(
                `import { ${names.map((n, i) => `${n} as m${m}_${i}`).join(", ")} } from ${JSON.stringify(path)};`,
            );
            names.forEach((n, i) =>
                prints.push(
                    `console.log(${JSON.stringify(`${path} ${n}`)}, typeof m${m}_${i});`,
                ),
            );
        });
        const { native, oracle } = runModulesOnHost(
            { "main.mjs": [...imports, ...prints, ""].join("\n") },
            "main.mjs",
            { gcStress: false },
        );
        assert.equal(native.error, undefined);
        assert.equal(native.status, 0, native.stderr);
        assert.equal(native.stdout, oracle);
    });
