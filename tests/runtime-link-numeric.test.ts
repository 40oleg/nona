// Public compile() selection and execution regressions for #612. Do not use
// runOnHost: supplying an IR link bypasses the selection being tested here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compile, hostTarget, type CompileOptions } from "../src/compiler.js";

const supported = hostTarget === "win32-x64" || hostTarget === "linux-x64";
const evidence = join(
    "work",
    "runtime-link-numeric",
    process.env.NONA_LINK_EVIDENCE ?? "candidate",
    hostTarget ?? "unsupported",
);
const compilerSha = spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    windowsHide: true,
}).stdout.trim();
const usageSha256 = createHash("sha256")
    .update(readFileSync("src/frontend/link-usage.ts"))
    .digest("hex");
const modes: [string, Partial<CompileOptions>][] = [
    ["default", {}],
    ["proxy", { link: ["proxy"] }],
    ["full-runtime", { fullRuntime: true }],
];

function processDetails(result: ReturnType<typeof spawnSync>) {
    const error = result.error;
    return {
        stdout: result.stdout,
        stderr: result.stderr,
        status: result.status,
        signal: result.signal,
        error: error
            ? {
                  ...Object.fromEntries(
                      Object.getOwnPropertyNames(error).map((key) => [
                          key,
                          (error as unknown as Record<string, unknown>)[key],
                      ]),
                  ),
                  name: error.name,
                  message: error.message,
              }
            : null,
    };
}

function probe(id: string, source: string, selectedModes = modes.slice(0, 1)) {
    assert.ok(supported);
    mkdirSync(evidence, { recursive: true });
    const sourcePath = join(evidence, `${id}.js`);
    writeFileSync(sourcePath, source);
    const nodeArguments = [
        "--input-type=commonjs",
        "--eval",
        'require("node:vm").runInThisContext(require("node:fs").readFileSync(process.argv[1], "utf8"), {filename: process.argv[1]})',
        sourcePath,
    ];
    const oracle = processDetails(
        spawnSync(process.execPath, nodeArguments, {
            encoding: "utf8",
            timeout: 10_000,
            windowsHide: true,
        }),
    );
    // Run every control before asserting, so a default-mode failure retains
    // explicit-link/full-runtime evidence too.
    const runs = selectedModes.map(([mode, options]) => {
        const result = compile(source, {
            fileName: sourcePath,
            target: hostTarget!,
            reportLink: true,
            ...options,
        });
        const executable = join(
            evidence,
            `${id}-${mode}${hostTarget === "win32-x64" ? ".exe" : ".bin"}`,
        );
        let execution;
        if (result.ok) {
            writeFileSync(executable, result.image);
            chmodSync(executable, 0o755);
            execution = processDetails(
                spawnSync(join(process.cwd(), executable), [], {
                    encoding: "utf8",
                    timeout: 10_000,
                    windowsHide: true,
                }),
            );
        }
        const record = {
            source,
            sourcePath,
            compilerSha,
            usageSha256,
            target: hostTarget,
            nodeVersion: process.version,
            nodeArguments,
            mode,
            options,
            selected: result.ok ? result.linked : undefined,
            imageSize: result.ok ? result.image.length : undefined,
            diagnostics: result.ok ? [] : result.diagnostics,
            oracle,
            execution,
        };
        const report = join(evidence, `${id}-${mode}.json`);
        writeFileSync(report, JSON.stringify(record, null, 2) + "\n");
        return { record, report };
    });
    for (const { record, report } of runs) {
        const context = `${report}\n${JSON.stringify(record, null, 2)}`;
        assert.equal(oracle.error, null, context);
        assert.equal(oracle.status, 0, context);
        assert.equal(record.execution?.error, null, context);
        assert.equal(record.execution?.status, oracle.status, context);
        assert.equal(record.execution?.stderr, oracle.stderr, context);
        assert.equal(record.execution?.stdout, oracle.stdout, context);
    }
    return runs.map(({ record }) => record);
}

const retained = [
    [
        "length-data",
        'const holder = {length: "Proxy"};\nconsole.log(typeof globalThis[holder.length]);\n',
    ],
    [
        "body-reassignment",
        'for (let key = 0; key < 1; key++) {\n    key = "Proxy";\n    console.log(typeof globalThis[key]);\n    break;\n}\n',
    ],
] as const;
for (const [id, source] of retained)
    test(
        `numeric key public compile retained repro: ${id}`,
        { skip: !supported },
        () => {
            for (const record of probe(id, source, modes)) {
                assert.equal(record.oracle.stdout, "function\n");
                assert.equal(record.execution?.stdout, "function\n");
            }
        },
    );

test(
    "numeric key public compile mutation and scope cases",
    { skip: !supported },
    () => {
        for (const [id, source] of [
            [
                "length-getter",
                'const holder = {get length() { return "Proxy"; }}; console.log(typeof globalThis[holder.length]);',
            ],
            [
                "length-computed",
                'const holder = {length: "Proxy"}; console.log(typeof globalThis[holder["length"]]);',
            ],
            [
                "test-reassignment",
                'for (let key = 0; (key = "Proxy"); key++) { console.log(typeof globalThis[key]); break; }',
            ],
            [
                "update-reassignment",
                'for (let key = 0, n = 0; n < 2; key = "Proxy", n++) { if (n) console.log(typeof globalThis[key]); }',
            ],
            [
                "init-reassignment",
                'for (let key = 0, x = (key = "Proxy"); ; key++) { console.log(typeof globalThis[key]); break; }',
            ],
            [
                "nested-mutation",
                'for (let key = 0; key < 1; key++) { function mutate() { key = "Proxy"; } mutate(); console.log(typeof globalThis[key]); break; }',
            ],
            [
                "nested-capture",
                'for (let key = 0; key < 1; key++) { const pick = () => console.log(typeof globalThis[key]); key = "Proxy"; pick(); break; }',
            ],
            [
                "default-capture",
                'for (let key = 0; key < 1; key++) { function f(x = (key = "Proxy")) { let key; } f(); console.log(typeof globalThis[key]); break; }',
            ],
            [
                "arrow-arguments",
                'for (let arguments = 0; arguments < 1; arguments++) { (() => { arguments = "Proxy"; })(); console.log(typeof globalThis[arguments]); break; }',
            ],
            [
                "shadowing",
                'for (let key = 0; key < 1; key++) { { let key = "Proxy"; console.log(typeof globalThis[key]); } }',
            ],
            [
                "array-target",
                'for (let key = 0; key < 1; key++) { [key] = ["Proxy"]; console.log(typeof globalThis[key]); break; }',
            ],
            [
                "object-target",
                'for (let key = 0; key < 1; key++) { ({value: key} = {value: "Proxy"}); console.log(typeof globalThis[key]); break; }',
            ],
            [
                "rest-target",
                'for (let key = 0; key < 1; key++) { [...key] = ["Proxy"]; console.log(typeof globalThis[key]); break; }',
            ],
            [
                "for-of-target",
                'for (let key = 0; key < 1; key++) { for (key of ["Proxy"]) console.log(typeof globalThis[key]); break; }',
            ],
            [
                "for-in-target",
                'for (let key = 0; key < 1; key++) { for (key in {["Proxy"]: 1}) console.log(typeof globalThis[key]); break; }',
            ],
            [
                "compound-target",
                'for (let key = 0; key < 1; key++) { key += "Proxy"; key = key.slice(1); console.log(typeof globalThis[key]); break; }',
            ],
        ]) {
            const [record] = probe(id!, source!);
            assert.equal(
                record!.selected?.find(({ part }) => part === "proxy")?.reason,
                '"Proxy" in a string (dynamic property access)',
                id!,
            );
        }
    },
);

test(
    "numeric key public compile selective size controls",
    { skip: !supported },
    () => {
        for (const [id, source] of [
            ["numeric-literal", 'const label = "Proxy"; console.log([7][0]);'],
            [
                "numeric-counter",
                'const label = "Proxy"; const a = [7]; for (let i = 0; i < 1; i++) console.log(a[i]);',
            ],
            [
                "numeric-coercion",
                'const label = "Proxy"; const a = [7]; console.log(a[a.length - 1]);',
            ],
            [
                "local-proxy",
                "function f(Proxy) { return Proxy; } console.log(f(7));",
            ],
        ]) {
            const [record] = probe(id!, source!);
            assert.equal(
                record!.selected?.some(({ part }) => part === "proxy"),
                false,
            );
        }
    },
);
