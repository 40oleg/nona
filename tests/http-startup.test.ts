import { test } from "node:test";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import {
    readFileSync,
    mkdtempSync,
    mkdirSync,
    writeFileSync,
    copyFileSync,
    realpathSync,
    rmSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";

const api = await import(
    pathToFileURL(resolve("scripts/http-startup-plan.mjs")).href
).catch((e) => {
    if (e.code === "ERR_MODULE_NOT_FOUND") return {};
    throw e;
});
const { startupChildEnv } = await import(
    pathToFileURL(resolve("scripts/http-startup-env.mjs")).href
);
const head = "a".repeat(40);
const env = {
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: "40oleg/nona",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_SHA: head,
    GITHUB_WORKFLOW_SHA: head,
    GITHUB_WORKFLOW_REF:
        "40oleg/nona/.github/workflows/native-platforms.yml@refs/heads/issue-602-startup-review",
    GITHUB_REF: "refs/heads/issue-602-startup-review",
    STARTUP_EXPECTED_SHA: head,
    STARTUP_MODE: "startup-602",
    RUNNER_ENVIRONMENT: "github-hosted",
    RUNNER_OS: "Windows",
};

test("startup guard rejects local/fork/main/tag/PR/mismatched workflow and checkout before native work", () => {
    assert.equal(
        api.startupAllowed?.(env, head, "win32", "x64", "v26.9.0"),
        true,
    );
    for (const [key, value] of Object.entries({
        GITHUB_ACTIONS: "false",
        GITHUB_REPOSITORY: "fork/nona",
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_REF: "refs/heads/main",
        STARTUP_MODE: "full",
        STARTUP_EXPECTED_SHA: "b".repeat(40),
        GITHUB_WORKFLOW_SHA: "b".repeat(40),
    })) {
        assert.equal(
            api.startupAllowed(
                { ...env, [key]: value },
                head,
                "win32",
                "x64",
                "v26.9.0",
            ),
            false,
            key,
        );
    }
    for (const ref of [
        "refs/tags/v0.35.0",
        "refs/heads/release-035",
        "refs/heads/nona/issue-602",
    ])
        assert.equal(
            api.startupAllowed(
                { ...env, GITHUB_REF: ref },
                head,
                "win32",
                "x64",
                "v26.9.0",
            ),
            false,
        );
    assert.equal(
        api.startupAllowed(env, "b".repeat(40), "win32", "x64", "v26.9.0"),
        false,
    );
    for (const [platform, arch, node] of [
        ["linux", "x64", "v26.9.0"],
        ["win32", "arm64", "v26.9.0"],
        ["win32", "x64", "v26.8.0"],
    ])
        assert.equal(
            api.startupAllowed(env, head, platform, arch, node),
            false,
        );
});

test("startup plan keeps retained reference first, one probe per channel/phase, immutable bounds and explicit pipeline comparison", () => {
    const plan = api.startupPlan?.();
    assert.deepEqual(
        plan?.map((p: { id: string }) => p.id),
        [
            "retained-reference",
            "console",
            "stdout",
            "http-import",
            "http-listen",
            "instrumented-reference",
            "helper-reference",
        ],
    );
    assert.equal(
        plan[0].imageHash,
        "23bfce34206002318c362f7c285eef3dc3547901113b8146fd9e8f7153a770d7",
    );
    assert.ok(
        plan.every(
            (p: {
                startupMs: number;
                hardMs: number;
                compilerMs: number;
                gc: string;
                attempts: number;
            }) =>
                p.startupMs === 60000 &&
                p.hardMs === 90000 &&
                p.compilerMs === 120000 &&
                p.gc === "stress" &&
                p.attempts === 1,
        ),
    );
    assert.equal(
        plan[6].pipeline,
        "compileModuleToIR/generate(default fullRuntimeLink)/linkPe",
    );
    assert.equal(plan[6].optional, true);
    assert.ok(
        api
            .probeSource("stdout")
            .includes('console.log("checkpoint before-stdout")'),
    );
    assert.ok(
        api.probeSource("http-import").includes('import http from "node:http"'),
    );
    const instrumented = api.probeSource("instrumented-reference");
    for (const phase of [
        "after-import",
        "after-process",
        "after-json",
        "after-big-string",
        "after-create",
        "after-listen",
    ])
        assert.ok(instrumented.includes(`checkpoint ${phase}`), phase);
    const fixture = readFileSync(
        "tests/fixtures/http-crash/soak-server.mjs",
        "utf8",
    );
    assert.equal(
        api.probeSource("helper-reference"),
        fixture + api.referenceSettings(),
    );
});

test("artifact paths reject traversal, Windows aliases, links and duplicated normalized entries", () => {
    assert.equal(
        api.safeArtifactPath?.("reference-stress/nona-http.exe"),
        true,
    );
    for (const path of [
        "../bad",
        "x/../../bad",
        "C:/bad",
        "/bad",
        "x\\bad",
        "x:ads",
        "x/CON",
        "x/..",
        "x./bad",
        "x /bad",
        "x//bad",
        "x\u0000bad",
    ])
        assert.equal(api.safeArtifactPath(path), false, path);
    const file = {
        path: "reference-stress/nona-http.exe",
        bytes: 123,
        attributes: 0,
    };
    assert.deepEqual(api.validateZipInventory([file]), [file]);
    for (const entries of [
        [file, { ...file, path: "Reference-Stress/NONA-HTTP.EXE" }],
        [file, { ...file, path: "../outside" }],
        [{ ...file, attributes: 0xa000 << 16 }],
        [{ ...file, attributes: 0x400 }],
        [{ ...file, bytes: 65 * 1024 * 1024 }],
        [file, { ...file, path: "reference-stress" }],
    ])
        assert.throws(() => api.validateZipInventory(entries));
});

test("dispatch mode runs only startup job; default/full retain original jobs and PR label behavior", () => {
    const workflow = readFileSync(
        ".github/workflows/native-platforms.yml",
        "utf8",
    ).split(/^jobs:\r?\n/m)[1]!;
    const jobText: Record<string, string> = Object.fromEntries(
        [
            ...workflow.matchAll(
                /^    ([\w-]+):\r?\n([\s\S]*?)(?=^    [\w-]+:|$(?![\s\S]))/gm,
            ),
        ].map((m) => [m[1], m[2]]),
    );
    function selected(
        mode: string,
        eventName: string,
        label = false,
        ref = "refs/heads/issue-602-startup-review",
    ) {
        return Object.entries(jobText)
            .filter(([, body]) => {
                const condition =
                    body.match(/^        if: (.+)$/m)?.[1] ?? "true";
                const expr = condition
                    .replace(/\$\{\{|\}\}/g, "")
                    .replace("labels.*.name", "labels.map(l => l.name)");
                return runInNewContext(expr, {
                    inputs: { diagnostic_mode: mode, diagnostic_sha: head },
                    github: {
                        repository: "40oleg/nona",
                        event_name: eventName,
                        sha: head,
                        ref,
                        workflow_sha: head,
                        workflow_ref: `40oleg/nona/.github/workflows/native-platforms.yml@${ref}`,
                        event: {
                            pull_request: {
                                labels: label ? [{ name: "full-ci" }] : [],
                            },
                        },
                    },
                    contains: (a: string[], v: string) => a.includes(v),
                    startsWith: (s: string, p: string) => s.startsWith(p),
                    format: (s: string, a: string) => s.replace("{0}", a),
                });
            })
            .map(([name]) => name)
            .sort();
    }
    assert.deepEqual(selected("startup-602", "workflow_dispatch"), [
        "http-startup-602",
    ]);
    assert.deepEqual(selected("env-602", "workflow_dispatch"), [
        "http-env-602",
    ]);
    assert.deepEqual(selected("http602-current", "workflow_dispatch"), [
        "http602-current",
    ]);
    const original = [
        "browser-compiler",
        "windows-regression",
        "linux-regression",
        "loaders",
        "linux-distributions",
        "bsd-loaders",
    ].sort();
    assert.deepEqual(selected("full", "workflow_dispatch"), original);
    assert.deepEqual(
        selected("", "push", false, "refs/heads/main"),
        original.filter((n) => n !== "windows-regression"),
    );
    assert.deepEqual(selected("", "pull_request"), ["browser-compiler"]);
    assert.deepEqual(
        selected("", "pull_request", true),
        original.filter((n) => n !== "windows-regression"),
    );
    assert.deepEqual(
        selected("startup-602", "workflow_dispatch", false, "refs/heads/main"),
        [],
    );
});

test("bounded inspector retains partial fake-child output and aborts before cleanup returns", async () => {
    assert.equal(typeof api.captureText, "function");
    const directory = mkdtempSync(join(tmpdir(), "nona-startup-pure-"));
    try {
        const controller = new AbortController();
        const result = await api.captureText(
            process.execPath,
            ["-e", "console.log('partial');setInterval(()=>{},1000)"],
            {
                directory,
                timeoutMs: 1000,
                signal: controller.signal,
                onLine(line: string) {
                    if (line === "partial") controller.abort();
                },
            },
        );
        assert.equal(result.reason, "aborted");
        assert.ok(result.elapsedMs < 1500);
        assert.match(
            readFileSync(join(directory, "stdout.log"), "utf8"),
            /partial/,
        );
        assert.throws(() => process.kill(result.pid, 0));
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test("live inspector commands cannot suspend or extend startup, and empty debugger output is incomplete", () => {
    const command = api.snapshotCommand?.(42, 1000, 21000);
    assert.equal(command?.timeoutMs, 5000);
    assert.deepEqual(command.args.slice(0, 3), ["-pvr", "-p", "42"]);
    assert.ok(command.args.at(-1).endsWith("qd"));
    assert.deepEqual(
        command.args.at(-1).split("; "),
        [
            ".echo STARTUP_SNAPSHOT_BEGIN",
            "lm",
            "~* r",
            "~* kv",
            ".echo STARTUP_SNAPSHOT_END",
            "qd",
        ],
        "only modules, registers and stacks; no environment or command line dump",
    );
    assert.equal(api.snapshotCommand(42, 1000, 58000).timeoutMs, 1000);
    assert.equal(api.snapshotCommand(42, 1000, 59000), null);
    assert.equal(
        api.snapshotEvidence("", { code: 0, reason: null }).status,
        "incomplete",
    );
    const raw =
        "STARTUP_SNAPSHOT_BEGIN\nstart end module name\n00000001`40000000 00000001`40100000 nona_http\nrip=00000001`40001234\nChild-SP RetAddr\n00 00000000`0014f728 00000001`40001234 nona_http+0x1234\nSTARTUP_SNAPSHOT_END\n";
    const parsed = api.snapshotEvidence(raw, {
        code: 0,
        reason: null,
        dropped: { stdout: 0, stderr: 0 },
    });
    assert.equal(parsed.status, "raw-context-and-stack-present-unvalidated");
    assert.deepEqual(parsed.relativePCs, [
        { pc: "00000001`40001234", module: "nona_http", offset: "0x1234" },
    ]);
    assert.equal(
        api.snapshotEvidence(raw, { code: null, reason: "deadline" }).status,
        "incomplete",
    );
    assert.equal(
        api.snapshotEvidence(raw, {
            code: 0,
            reason: null,
            dropped: { stdout: 1, stderr: 0 },
        }).status,
        "incomplete",
    );
    const headerOnly = raw.replace(
        "00 00000000`0014f728 00000001`40001234 nona_http+0x1234\n",
        "",
    );
    assert.equal(
        api.snapshotEvidence(headerOnly, {
            code: 0,
            reason: null,
            dropped: { stdout: 0, stderr: 0 },
        }).status,
        "incomplete",
        "a stack header alone is not a sampled frame",
    );
});

// No real credentials are read here. These are deliberately innocuous sentinels.
const polluted = {
    ...env,
    pAtH: "C:/fake/bin",
    sYsTeMrOoT: "C:/Windows",
    tEmP: "C:/fake/temp",
    WindowsSdkDir: "C:/fake/sdk",
    GITHUB_WORKSPACE: "C:/fake/workspace",
    PORT: "43210",
    NONA_GC_STRESS: "on",
    NONA_CACHE: "0",
    gH_tOkEn: "innocuous-test-sentinel",
    GITHUB_TOKEN: "innocuous-test-sentinel",
    ACTIONS_RUNTIME_TOKEN: "innocuous-test-sentinel",
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: "innocuous-test-sentinel",
    UNKNOWN_VENDOR_CREDENTIAL: "innocuous-test-sentinel",
    ARBITRARY_WITHOUT_SECRET_NAME: "innocuous-test-sentinel",
    NODE_OPTIONS: "--trace-warnings",
    _NT_SYMBOL_PATH: "https://invalid.example",
};
function assertIsolated(value: any) {
    assert.ok(
        value && typeof value === "object",
        "explicit child env required",
    );
    assert.equal(
        Object.values(value).includes("innocuous-test-sentinel"),
        false,
        "a sentinel reached a child environment",
    );
    const keys = Object.keys(value).map((k) => k.toUpperCase());
    for (const key of [
        "GH_TOKEN",
        "GITHUB_TOKEN",
        "ACTIONS_RUNTIME_TOKEN",
        "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
        "UNKNOWN_VENDOR_CREDENTIAL",
        "ARBITRARY_WITHOUT_SECRET_NAME",
        "NODE_OPTIONS",
    ])
        assert.equal(keys.includes(key), false, `unexpected child key: ${key}`);
    assert.equal(new Set(keys).size, keys.length, "Windows keys cannot alias");
    assert.equal(value.PATH, "C:/fake/bin");
    assert.equal(value.SystemRoot, "C:/Windows");
    assert.equal(value.TEMP, "C:/fake/temp");
    assert.equal(value.WindowsSdkDir, "C:/fake/sdk");
    assert.equal(value.PORT, "43210");
    assert.equal(value.NONA_GC_STRESS, "on");
    assert.equal(value.NONA_CACHE, "0");
    assert.equal(
        api.startupAllowed(value, head, "win32", "x64", "v26.9.0"),
        true,
    );
}

test("capture helper excludes credential and arbitrary env at the real tiny-child spawn boundary", async () => {
    const directory = mkdtempSync(join(tmpdir(), "nona-env-pure-"));
    try {
        const result = await api.captureText(
            process.execPath,
            [
                "-e",
                `
            const bad = Object.values(process.env).includes('innocuous-test-sentinel');
            const good = process.env.PORT === '43210' && process.env.NONA_GC_STRESS === 'on';
            console.log(!bad && good ? 'isolated' : 'unsafe');
        `,
            ],
            { directory, timeoutMs: 2000, env: polluted },
        );
        assert.equal(result.code, 0);
        assert.equal(
            readFileSync(join(directory, "stdout.log"), "utf8").trim(),
            "isolated",
        );
    } finally {
        // Only this test-created absolute directory is removed.
        assert.ok(directory.startsWith(join(tmpdir(), "nona-env-pure-")));
        rmSync(directory, { recursive: true, force: true });
    }
});

function assertHelperFile(actual: string, expected: string) {
    // PowerShell expands 8.3 aliases that Node's tmpdir() can retain.
    // Resolve both existing files; keep raw paths in assertion diagnostics.
    assert.equal(
        realpathSync.native(actual),
        realpathSync.native(expected),
        JSON.stringify({ actual, expected }),
    );
}

test("helper file identity accepts host aliases and rejects a different file with identical basename and body", (t) => {
    const directory = mkdtempSync(join(tmpdir(), "nona-helper-identity-"));
    try {
        mkdirSync(join(directory, "scripts"));
        mkdirSync(join(directory, "other"));
        const expected = join(directory, "scripts/http-startup-install.ps1");
        const other = join(directory, "other/http-startup-install.ps1");
        writeFileSync(expected, "# harmless identical helper fixture\n");
        copyFileSync(expected, other);
        const canonical = realpathSync.native(expected);
        assertHelperFile(canonical, expected);
        assertHelperFile(expected, canonical);
        assert.throws(() => assertHelperFile(other, expected), {
            code: "ERR_ASSERTION",
        });
        t.diagnostic(
            JSON.stringify({
                expected,
                canonical,
                other,
                shortAliasExercised:
                    /~\d+[\\/]/.test(expected) && expected !== canonical,
            }),
        );
    } finally {
        assert.ok(
            directory.startsWith(join(tmpdir(), "nona-helper-identity-")),
        );
        rmSync(directory, { recursive: true, force: true });
    }
});

test("installer workflow reaches the checked-in ps1 through the allowlist with an extensionless Actions runscript", (t) => {
    const step = readFileSync(".github/workflows/native-platforms.yml", "utf8")
        .split(
            "            - name: Install Windows debugging tools if absent (same SDK as original collector)",
        )[1]!
        .split("            - name:")[0]!;
    const shell = step.match(/^              shell: (.+)$/m)![1]!;
    const directory = mkdtempSync(join(tmpdir(), "nona-shell-pure-"));
    try {
        mkdirSync(join(directory, "scripts"));
        mkdirSync(join(directory, "a", "_temp"), { recursive: true });
        copyFileSync(
            "scripts/http-startup-env.mjs",
            join(directory, "scripts/http-startup-env.mjs"),
        );
        // Only the external installer is replaced; the workflow command, wrapper,
        // PowerShell -File boundary and inherited child environment are real.
        writeFileSync(
            join(directory, "scripts/http-startup-install.ps1"),
            `
@{ helper = $PSCommandPath; args = @($args); env = [Environment]::GetEnvironmentVariables() } | ConvertTo-Json -Depth 4 -Compress | Set-Content helper.json
& node scripts/fake-installer.mjs 'installer-fixture' 'argument with spaces'
exit $LASTEXITCODE
`,
        );
        writeFileSync(
            join(directory, "scripts/fake-installer.mjs"),
            `
import { writeFileSync } from 'node:fs';
writeFileSync('child.json', JSON.stringify({ args: process.argv.slice(2), env: process.env }));
`,
        );
        const custom = shell.includes("{0}");
        const run = custom
            ? "throw 'harmless inline fixture must not be executed'"
            : step.match(/^              run: (.+)$/m)![1]!;
        if (!custom) {
            assert.equal(shell, "pwsh");
            assert.equal(
                run,
                "node scripts/http-startup-env.mjs pwsh -NoProfile -File scripts/http-startup-install.ps1",
            );
        }
        // Mirrors the failing D:\a\_temp\GUID shape: deliberately no .ps1.
        const runscript = join(
            directory,
            "a",
            "_temp",
            "e3749b79-a938-496a-9df2-30372f5e43e7",
        );
        writeFileSync(runscript, run);
        const childEnv = {
            ...startupChildEnv(process.env),
            ...env,
            PORT: "43210",
            GH_TOKEN: "innocuous-test-sentinel",
            GITHUB_TOKEN: "innocuous-test-sentinel",
            ACTIONS_RUNTIME_TOKEN: "innocuous-test-sentinel",
            ACTIONS_ID_TOKEN_REQUEST_TOKEN: "innocuous-test-sentinel",
            ARBITRARY_WITHOUT_SECRET_NAME: "innocuous-test-sentinel",
            UNKNOWN_VENDOR_CREDENTIAL: "innocuous-test-sentinel",
            NODE_OPTIONS: "--trace-warnings",
        };
        const launch = () =>
            spawnSync(
                custom ? process.execPath : "pwsh",
                custom
                    ? shell
                          .split(" ")
                          .slice(1)
                          .map((arg) => (arg === "{0}" ? runscript : arg))
                    : // Ordinary pwsh compiles the run body. Its inner -File argument
                      // must be the checked-in helper, independent of the outer name.
                      [
                          "-NoProfile",
                          "-Command",
                          "$ErrorActionPreference = 'Stop';\n" +
                              readFileSync(runscript, "utf8") +
                              "\nif (Test-Path variable:\\LASTEXITCODE) { exit $LASTEXITCODE }",
                      ],
                {
                    cwd: directory,
                    env: childEnv,
                    encoding: "utf8",
                    windowsHide: true,
                    timeout: 10000,
                },
            );
        const result = launch();
        assert.equal(result.error, undefined);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        const helper = JSON.parse(
            readFileSync(join(directory, "helper.json"), "utf8").replace(
                /^\uFEFF/,
                "",
            ),
        );
        const installer = JSON.parse(
            readFileSync(join(directory, "child.json"), "utf8"),
        );
        const expectedHelper = join(
            directory,
            "scripts/http-startup-install.ps1",
        );
        t.diagnostic(
            JSON.stringify({ actual: helper.helper, expected: expectedHelper }),
        );
        assertHelperFile(helper.helper, expectedHelper);
        assert.deepEqual(helper.args, []);
        assert.deepEqual(installer.args, [
            "installer-fixture",
            "argument with spaces",
        ]);
        for (const received of [helper.env, installer.env]) {
            assert.equal(received.PORT, "43210");
            assert.equal(received.GITHUB_SHA, head);
            assert.equal(
                Object.values(received).includes("innocuous-test-sentinel"),
                false,
            );
            for (const key of [
                "GH_TOKEN",
                "GITHUB_TOKEN",
                "ACTIONS_RUNTIME_TOKEN",
                "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
                "ARBITRARY_WITHOUT_SECRET_NAME",
                "UNKNOWN_VENDOR_CREDENTIAL",
                "NODE_OPTIONS",
            ])
                assert.equal(
                    Object.keys(received).some(
                        (name) => name.toUpperCase() === key,
                    ),
                    false,
                    key,
                );
            assert.equal(received._NT_SYMBOL_PATH, "");
            assert.equal(received._NT_ALT_SYMBOL_PATH, "");
        }
        writeFileSync(
            join(directory, "scripts/http-startup-install.ps1"),
            "throw 'harmless helper failure'",
        );
        const failed = launch();
        assert.equal(failed.error, undefined);
        assert.equal(failed.status, 1, failed.stdout + failed.stderr);
        assert.match(failed.stderr, /harmless helper failure/);
    } finally {
        assert.ok(directory.startsWith(join(tmpdir(), "nona-shell-pure-")));
        rmSync(directory, { recursive: true, force: true });
    }
});

test("installer helper preserves SDK arguments, timeout, cleanup and actual failures without running setup", () => {
    const directory = mkdtempSync(join(tmpdir(), "nona-install-pure-"));
    try {
        // Fail closed: every installer-facing command is a local function.
        // The actual helper runs unchanged; no SDK/network/registry IO.
        const fixture = join(directory, "fixture.ps1");
        writeFileSync(
            fixture,
            `
param([string]$Helper)
$ErrorActionPreference = 'Continue'
function Test-Path { param($LiteralPath) $global:fixtureSeen602.cdb = $LiteralPath; return $global:fixtureMode602 -eq 'present' }
function Invoke-WebRequest { param($Uri, $OutFile) $global:fixtureSeen602.download = @($Uri, $OutFile); if ($global:fixtureMode602 -eq 'download-error') { Write-Error 'fake download failed' } }
function Start-Process {
    param($FilePath, $WindowStyle, $ArgumentList, [switch]$PassThru)
    $global:fixtureSeen602.start = @($FilePath, $WindowStyle, $ArgumentList, $PassThru.IsPresent)
    if ($global:fixtureMode602 -eq 'launch-error') { Write-Error 'fake launch failed' }
    $p = [pscustomobject]@{ Id = 42; HasExited = $global:fixtureMode602 -ne 'timeout'; ExitCode = $(if ($global:fixtureMode602 -eq 'failure') { 7 } elseif ($global:fixtureMode602 -eq 'reboot') { 3010 } else { 0 }) }
    $p | Add-Member ScriptMethod WaitForExit { param($Milliseconds) $global:fixtureSeen602.wait = $Milliseconds; return $this.HasExited }
    return $p
}
function Stop-Process { param($Id, [switch]$Force) $global:fixtureSeen602.stop = @($Id, $Force.IsPresent) }
$results = foreach ($global:fixtureMode602 in @('present', 'success', 'reboot', 'failure', 'timeout', 'download-error', 'launch-error')) {
    $global:fixtureSeen602 = @{ mode = $global:fixtureMode602 }
    try { & $Helper; $global:fixtureSeen602.ok = $true } catch { $global:fixtureSeen602.ok = $false; $global:fixtureSeen602.error = $_.Exception.Message }
    $global:fixtureSeen602
}
ConvertTo-Json -InputObject @($results) -Depth 5 -Compress
`,
        );
        const result = spawnSync(
            process.execPath,
            [
                "scripts/http-startup-env.mjs",
                "pwsh",
                "-NoProfile",
                "-File",
                fixture,
                "-Helper",
                resolve("scripts/http-startup-install.ps1"),
            ],
            {
                env: startupChildEnv(process.env),
                encoding: "utf8",
                windowsHide: true,
                timeout: 10000,
            },
        );
        assert.equal(result.error, undefined);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        const rows: {
            mode: string;
            ok: boolean;
            error?: string;
            cdb: string;
            download?: string[];
            start?: unknown[];
            wait?: number;
            stop?: unknown[];
        }[] = JSON.parse(result.stdout);
        assert.deepEqual(
            rows.map((row) => [row.mode, row.ok]),
            [
                ["present", true],
                ["success", true],
                ["reboot", true],
                ["failure", false],
                ["timeout", false],
                ["download-error", false],
                ["launch-error", false],
            ],
            result.stdout,
        );
        for (const row of rows) {
            assert.equal(
                row.cdb,
                process.env["ProgramFiles(x86)"] +
                    "\\Windows Kits\\10\\Debuggers\\x64\\cdb.exe",
            );
            if (row.mode === "present") {
                assert.equal(row.download, undefined);
                assert.equal(row.start, undefined);
                continue;
            }
            assert.deepEqual(row.download, [
                "https://go.microsoft.com/fwlink/?linkid=2196241",
                "work/http-startup/winsdksetup.exe",
            ]);
            if (row.mode === "download-error") {
                assert.equal(row.start, undefined);
                assert.match(row.error!, /fake download failed/);
                continue;
            }
            assert.deepEqual(row.start, [
                "work/http-startup/winsdksetup.exe",
                "Hidden",
                "/features OptionId.WindowsDesktopDebuggers /quiet /norestart",
                true,
            ]);
            if (row.mode === "launch-error") {
                assert.equal(row.wait, undefined);
                assert.match(row.error!, /fake launch failed/);
                continue;
            }
            assert.equal(row.wait, 420000);
            if (row.mode === "timeout") {
                assert.deepEqual(row.stop, [42, true]);
                assert.match(row.error!, /SDK installation timed out/);
            } else {
                assert.equal(row.stop, undefined);
                if (row.mode === "failure")
                    assert.match(row.error!, /SDK installation failed: 7/);
            }
        }
    } finally {
        assert.ok(directory.startsWith(join(tmpdir(), "nona-install-pure-")));
        rmSync(directory, { recursive: true, force: true });
    }
});

// Execute the real driver bodies with in-memory IO and child boundaries replaced.
// No main entry, compiler import, TCP socket, native image or debugger can run.
function pureBody(file: string, keepEntry = false) {
    const source = readFileSync(file, "utf8")
        .replace(/^import\s[\s\S]*?;\r?\n/gm, "")
        .replace(/^export\s*\{[\s\S]*?;\r?\n/gm, "")
        .replace(/^export /gm, "");
    return keepEntry
        ? source
        : source.split(/^if \(\r?\n    process\.argv\[1\]/m)[0]!;
}

test("startup compiler, finite native, reference runTrial and inspector call paths use isolated spawn options", async () => {
    const captures: any[] = [],
        natives: any[] = [],
        references: any[] = [];
    const term = {
        code: 0,
        error: null,
        reason: null,
        dropped: { stdout: 0, stderr: 0 },
    };
    const context: any = {
        ...api,
        join,
        resolve,
        AbortController,
        startupChildEnv: (source = polluted, overrides = {}) =>
            startupChildEnv(source, overrides),
        process: {
            env: polluted,
            execPath: "fake-node",
            pid: 1,
            argv: [],
            once() {},
            removeListener() {},
        },
        Date: class extends Date {
            static now() {
                return 21000;
            }
        },
        setTimeout: () => 1,
        clearTimeout() {},
        mkdirSync() {},
        writeFileSync() {},
        existsSync: () => true,
        readFileSync: (file: string) =>
            file.endsWith("trial.json")
                ? JSON.stringify({
                      pid: 42,
                      startedAt: new Date(1000).toISOString(),
                      status: "starting",
                  })
                : file.endsWith("inspection.json")
                  ? JSON.stringify({ samples: [], snapshots: [] })
                  : file.includes("cpu-")
                    ? JSON.stringify({ pid: 42, cpuMs: 1, workingSetBytes: 1 })
                    : "",
        delay: async () => {},
        hashFile: () => api.retained.sourceHash,
        untrackedCapture: async (
            command: string,
            args: string[],
            options: any,
        ) => {
            captures.push({ command, args, options });
            return term;
        },
        supervise: (command: string, args: string[], options: any) => {
            natives.push({ command, args, options });
            return {
                child: { pid: 2 },
                done: Promise.resolve(term),
                stop() {},
            };
        },
        runTrial: async (_spec: any, options: any) => {
            references.push(options);
            return { verdict: "observed-no-fault" };
        },
        classifyTermination: () => "observed-no-fault",
    };
    const driver = runInNewContext(
        pureBody("scripts/http-startup.mjs") +
            `
        const originalInspector = inspectBaseline;
        verify = () => ({ checkout: { head: '${head}' } });
        restore = async () => ({binary:'fake-image', source:'fake-source'});
        inspectBaseline = async () => {};
        ({ main, captureText, inspect: originalInspector });
    `,
        context,
    );
    await driver.main();
    assert.equal(captures.length, 6, "all six compiler children");
    assert.equal(natives.length, 4, "all finite native probe children");
    assert.equal(
        references.length,
        3,
        "retained, instrumented and helper reference",
    );
    for (const c of [...captures, ...natives]) assertIsolated(c.options.env);
    for (const c of references) assertIsolated(c.env);

    captures.length = 0;
    await driver.captureText("pwsh", ["artifact-helper"], {
        directory: "fake-dir",
    });
    await driver.inspect("fake-dir", new AbortController().signal);
    assert.equal(captures.filter((c) => c.command === "pwsh").length, 7);
    assert.equal(
        captures.filter((c) => c.command.endsWith("cdb.exe")).length,
        2,
    );
    for (const c of captures) assertIsolated(c.options.env);

    // Exercise runTrial through its actual supervise call, stopping BEFORE any
    // ready/workload loop. freePort and http.Agent are inert, with no TCP IO.
    let received: any;
    const stopped = new Error("pure-boundary-stop");
    const trial = runInNewContext(
        pureBody("scripts/http-crash.mjs") +
            `
        freePort = async () => 43210;
        runTrial;
    `,
        {
            ...context,
            http: { Agent: class {} },
            spawn: (_c: any, _a: any, opts: any) => {
                received = opts;
                throw stopped;
            },
        },
    );
    await assert.rejects(
        trial(
            {
                listeners: "original",
                state: "keepalive",
                concurrency: 1,
                chunkBytes: 65536,
                chunks: 16,
            },
            references[0],
        ),
        (e: any) => e === stopped,
    );
    assertIsolated(received.env);
    assert.equal(received.env.DIAG_LISTENERS, "original");
    assert.equal(received.env.DIAG_STATE, "keepalive");
    assert.equal(received.env.DIAG_CHUNK_BYTES, "65536");
    assert.equal(received.env.DIAG_CHUNKS, "16");
});

test("workflow helper wrapper and guarded compiler Git query isolate their actual spawn options", async () => {
    let wrapperEnv: any, compilerEnv: any;
    const helper = resolve("scripts/http-startup-env.mjs");
    runInNewContext(
        pureBody(helper, true).replace(
            "import.meta.url",
            JSON.stringify(pathToFileURL(helper).href),
        ),
        {
            resolve,
            pathToFileURL,
            process: {
                argv: [
                    "node",
                    helper,
                    "pwsh",
                    "-NoProfile",
                    "-File",
                    "fake-helper.ps1",
                ],
                env: polluted,
            },
            spawn: (command: string, args: string[], opts: any) => {
                assert.equal(command, "pwsh");
                assert.equal(args.at(-1), "fake-helper.ps1");
                assert.equal(opts.windowsHide, true);
                wrapperEnv = opts.env;
                return { once() {} };
            },
        },
    );
    assertIsolated(wrapperEnv);

    const compile = runInNewContext(
        pureBody("scripts/http-startup-build.mjs") + "main;",
        {
            process: {
                env: polluted,
                platform: "linux",
                arch: "x64",
                version: "v26.9.0",
            },
            startupAllowed: api.startupAllowed,
            startupChildEnv: () => startupChildEnv(polluted),
            execFileSync: (_c: any, _a: any, opts: any) => {
                compilerEnv = opts.env;
                return head;
            },
        },
    );
    await assert.rejects(compile(), /requires exact hosted startup provenance/);
    assertIsolated(compilerEnv);

    const gitEnvs: any[] = [];
    const provenance = runInNewContext(
        pureBody("scripts/http-crash-provenance.mjs") + "collectProvenance;",
        {
            execFileSync: (_c: any, _a: any, opts: any) => {
                gitEnvs.push(opts.env);
                return head;
            },
            spawnSync: (_c: any, _a: any, opts: any) => {
                gitEnvs.push(opts.env);
                return { status: 0, stderr: "" };
            },
        },
    );
    provenance(polluted, {}, startupChildEnv(polluted));
    assert.equal(gitEnvs.length, 3);
    for (const childEnv of gitEnvs) assertIsolated(childEnv);

    const workflow = readFileSync(
        ".github/workflows/native-platforms.yml",
        "utf8",
    )
        .split("    http-startup-602:")[1]!
        .split("    bsd-loaders:")[0]!;
    assert.match(
        workflow,
        /shell: pwsh\s+timeout-minutes: 8\s+run: node scripts\/http-startup-env\.mjs pwsh -NoProfile -File scripts\/http-startup-install\.ps1/,
    );
    for (const line of workflow
        .split("\n")
        .filter((l) => /run: .*pwsh/.test(l)))
        assert.match(
            line,
            /run: node scripts\/http-startup-env\.mjs pwsh -NoProfile -File /,
        );
    assert.match(workflow, /collect -Output work\/http-startup -Startup602/);
    const collector = readFileSync("scripts/http-crash-windows.ps1", "utf8");
    const commands = collector.match(
        /if \(\$Startup602\) \{[\s\S]*?\$commands = '([^']+)'/,
    );
    assert.ok(commands);
    assert.deepEqual(commands[1]!.split("; "), [
        ".exr -1",
        ".ecxr",
        "r",
        "lm",
        "ln @rip",
        "u @rip-20 L40",
        "kv",
        "q",
    ]);
});

// These regressions reject the actual hosted parser/count failure, not invented
// numbered-only frames. The adjacent manifest records the verified text hashes.
const retainedInspector = JSON.parse(
    readFileSync(
        "tests/fixtures/http-startup/retained-inspection.json",
        "utf8",
    ),
);
const retainedCdb = readFileSync(
    "tests/fixtures/http-startup/retained-cdb20.stdout.txt",
    "utf8",
);
function retainedInspection() {
    const fixture = structuredClone(retainedInspector);
    Object.assign(
        fixture.inspection.snapshots[0],
        api.snapshotEvidence(
            retainedCdb,
            fixture.inspection.snapshots[0].termination,
            fixture.snapshotStderr,
        ),
    );
    return fixture;
}

const f407Inspector = JSON.parse(
    readFileSync("tests/fixtures/http-startup/f407-inspection.json", "utf8"),
);
const f407Cdb = readFileSync(
    "tests/fixtures/http-startup/f407-cdb20.stdout.txt",
    "utf8",
);
function f407Inspection(raw = f407Cdb) {
    const fixture = structuredClone(f407Inspector);
    Object.assign(
        fixture.inspection.snapshots[0],
        api.snapshotEvidence(
            raw,
            fixture.inspection.snapshots[0].termination,
            fixture.snapshotStderr,
        ),
    );
    return fixture;
}

test("f407 CDB20 accepts the verbatim export-symbols image-path row and maps all four PCs", () => {
    assert.equal(
        createHash("sha256").update(f407Cdb).digest("hex"),
        "928f23e67c6b122467fd21551531ceb30ec8af2116aca065d410373ae2e7c9d8",
    );
    assert.equal(f407Inspector.provenance.originalJobConclusion, "failure");
    const parsed = f407Inspection().inspection.snapshots[0];
    assert.equal(parsed.status, "raw-context-and-stack-present-unvalidated");
    assert.equal(parsed.moduleBases.length, 9);
    assert.equal(parsed.rawThreads.length, 4);
    assert.equal(parsed.rawStackFrames.length, 46);
    assert.deepEqual(parsed.relativePCs, [
        { pc: "00007ff6a1a21762", module: "nona_http", offset: "0x1762" },
        ...Array.from({ length: 3 }, () => ({
            pc: "00007ffbf5e05f74",
            module: "ntdll",
            offset: "0x165f74",
        })),
    ]);
});

test("f407 lm suffix variants stay bounded to image paths and genuine table context", () => {
    const row = f407Cdb
        .split(/\r?\n/)
        .find((line) => line.includes("ntdll      (export symbols)"))!;
    const path = String.raw`C:\Windows\SYSTEM32\ntdll.dll`;
    assert.ok(row.endsWith(path));
    // Synthetic format controls; only the original row above is hosted evidence.
    for (const replacement of [
        row.replace("(export symbols)", "(deferred)"),
        row.replace(
            path,
            String.raw`C:\Program Files (x86)\Windows Kits\ntdll.dll`,
        ),
        row.replace(/\s+C:\\.*$/, ""),
    ]) {
        const parsed = f407Inspection(f407Cdb.replace(row, replacement))
            .inspection.snapshots[0];
        assert.equal(
            parsed.status,
            "raw-context-and-stack-present-unvalidated",
        );
        assert.equal(parsed.moduleBases.length, 9);
        assert.ok(parsed.relativePCs.every((p: any) => p.module !== null));
    }
    for (const badPath of [
        "ntdll.dll",
        String.raw`C:ntdll.dll`,
        String.raw`C:\Windows\..\ntdll.dll`,
        String.raw`C:\Windows\.\ntdll.dll`,
        String.raw`C:\Windows\\ntdll.dll`,
        String.raw`C:\Windows \ntdll.dll`,
        String.raw`C:\Windows.\ntdll.dll`,
        String.raw`C:\Windows\ntdll.dll:stream`,
        String.raw`C:\Windows\*.dll`,
        String.raw`C:\Windows\ntdll.txt`,
        String.raw`C:\Windows\ntdll.dll extra`,
        String.raw`C:\Windows\ntdll.dll (deferred)`,
        '"' + path + '"',
        path.replace("SYSTEM32", "SYS\u0000TEM32"),
    ]) {
        const parsed = f407Inspection(
            f407Cdb.replace(row, row.replace(path, badPath)),
        ).inspection.snapshots[0];
        assert.equal(parsed.status, "incomplete", badPath);
    }
    const withoutRow = f407Cdb.replace(row, "");
    for (const raw of [
        withoutRow.replace(
            "STARTUP_SNAPSHOT_END",
            row + "\nSTARTUP_SNAPSHOT_END",
        ),
        f407Cdb.replace(
            "start             end                 module name",
            "not an lm table",
        ),
        f407Cdb.replace(
            row,
            row.replace("00007ffb`f5ca0000", "00000000`00000000"),
        ),
        f407Cdb.replace(
            row,
            row.replace("00007ffb`f5f04000", "00007ffb`f5ca0000"),
        ),
        f407Cdb.replace(
            row,
            row.replace("00007ffb`f5ca0000", "00007ffb`f5950000"),
        ),
        f407Cdb.replace(
            row,
            row.replace("00007ffb`f5ca0000", "07ffb`f5ca0000"),
        ),
        f407Cdb.replace(
            row,
            row + "\n00007ffc`00000000 00007ffc`00001000 mov rcx,r10",
        ),
        f407Cdb.replace(
            row,
            row + "\n00000014`5dbfd440 00007ffb`f5e05f74 ntdll!ret",
        ),
        f407Cdb.replace("rip=00007ffbf5e05f74", "rip=0000000112345678"),
        f407Cdb.replace(/^00000014`5ebf[^\n]+$/gm, ""),
    ]) {
        assert.notEqual(raw, f407Cdb, "control must alter the capture");
        assert.equal(
            f407Inspection(raw).inspection.snapshots[0].status,
            "incomplete",
        );
    }
});

test("f407 post-hoc coverage keeps original failure and strict actual clock, due, drop and corruption controls", () => {
    assert.equal(api.inspectionCoverage(f407Inspector).complete, false);
    const f = f407Inspection();
    const coverage = api.inspectionCoverage(f);
    assert.equal(coverage.complete, true);
    assert.equal(coverage.boundary.elapsedMs, 36288);
    assert.deepEqual(
        coverage.samples.map((s: any) => [s.targetMs, s.status]),
        [
            [5000, "captured"],
            [15000, "captured"],
            [20000, "captured"],
            [30000, "captured"],
            [40000, "not-due"],
            [50000, "not-due"],
        ],
    );
    assert.deepEqual(
        coverage.snapshots.map((s: any) => [s.targetMs, s.status]),
        [
            [20000, "captured"],
            [40000, "not-due"],
        ],
    );
    for (const mutate of [
        (f: any) => f.inspection.snapshots.pop(),
        (f: any) => f.inspection.samples.pop(),
        (f: any) => f.inspection.snapshots[0].startElapsedMs++,
        (f: any) => f.inspection.snapshots[0].endElapsedMs++,
        (f: any) => f.inspection.snapshots[0].termination.dropped.stdout++,
        (f: any) => f.inspection.samples[0].termination.dropped.stderr++,
    ]) {
        const corrupted = structuredClone(f);
        mutate(corrupted);
        assert.equal(api.inspectionCoverage(corrupted).complete, false);
    }
    const term = f.inspection.snapshots[0].termination;
    for (const [raw, termination, stderr] of [
        [f407Cdb, { ...term, code: 1 }, ""],
        [f407Cdb, { ...term, reason: "deadline" }, ""],
        [f407Cdb, { ...term, dropped: { stdout: 0, stderr: 1 } }, ""],
        [f407Cdb, term, "Unable to read memory"],
        [
            f407Cdb.replace(
                "STARTUP_SNAPSHOT_END",
                "Unable to get context\nSTARTUP_SNAPSHOT_END",
            ),
            term,
            "",
        ],
        [f407Cdb.replace(/^STARTUP_SNAPSHOT_END$/m, ""), term, ""],
    ] as const) {
        assert.equal(
            api.snapshotEvidence(raw, termination, stderr).status,
            "incomplete",
        );
    }
});

test("retained CDB20 accepts real unnumbered per-thread kv frames and only genuine lm modules", () => {
    const parsed = api.snapshotEvidence(
        retainedCdb,
        retainedInspector.inspection.snapshots[0].termination,
        "",
    );
    assert.equal(parsed.status, "raw-context-and-stack-present-unvalidated");
    assert.equal(parsed.rawStackFrames.length, 35);
    assert.equal(parsed.rawThreads.length, 4);
    assert.equal(parsed.moduleBases.length, 9);
    assert.deepEqual(parsed.relativePCs[0], {
        pc: "00007ff6c2c51678",
        module: "nona_http",
        offset: "0x1678",
    });
    assert.ok(
        parsed.moduleBases.every((m: any) => !["mov", ":"].includes(m.module)),
    );
    assert.ok(parsed.rawStackFrames[0].startsWith("0000003e`521fd1f0"));
    assert.equal(parsed.moduleBases[0].start, "00007ff6`c2c50000");
    assert.equal(parsed.relativePCs[1].module, "ntdll");
});

test("each retained thread requires its own nonempty stack section", (t) => {
    const term = retainedInspector.inspection.snapshots[0].termination;
    for (const thread of [3, 0, 1, 2]) {
        const section = new RegExp(
            "(^[ .]*" +
                thread +
                "  Id:[^\\n]*\\n)([\\s\\S]*?)(?=^[ .]*\\d+  Id:|^STARTUP_SNAPSHOT_END)",
            "m",
        );
        assert.ok(section.test(retainedCdb), `fixture thread ${thread}`);
        for (const [label, body] of [
            ["whole stack absent", ""],
            ["header only", "Child-SP RetAddr\n"],
            [
                "frames without header",
                retainedCdb
                    .match(section)![2]!
                    .replace(/^Child-SP[^\n]*\n/m, ""),
            ],
        ]) {
            const parsed = api.snapshotEvidence(
                retainedCdb.replace(section, (_all, row) => row + body),
                term,
                "",
            );
            if (thread === 3 && label === "whole stack absent")
                t.diagnostic(
                    JSON.stringify({
                        status: parsed.status,
                        pcs: parsed.rawPCs.length,
                        threads: parsed.rawThreads.length,
                        frames: parsed.rawStackFrames.length,
                    }),
                );
            assert.equal(parsed.rawThreads.length, 4);
            assert.equal(parsed.rawPCs.length, 4);
            assert.equal(
                parsed.status,
                "incomplete",
                `thread ${thread}: ${label}`,
            );
        }
    }
    const numbered = retainedCdb.replace(/^(0000003e`[^\n]+)$/gm, "00 $1");
    const parsed = api.snapshotEvidence(numbered, term, "");
    assert.equal(parsed.status, "raw-context-and-stack-present-unvalidated");
    assert.equal(parsed.rawStackFrames.length, 35);
});

test("inspector snapshot timestamps share one clock read at start and end including finally", async (t) => {
    for (const interrupted of [false, true])
        await t.test(String(interrupted), async () => {
            const start = Date.parse(retainedInspector.trial.startedAt);
            let now = start;
            let captured = false;
            let saved: any;
            const commands: number[] = [];
            const inspector = runInNewContext(
                pureBody("scripts/http-startup.mjs") + "inspectBaseline;",
                {
                    ...api,
                    join,
                    process: { env: {} },
                    startupChildEnv: () => ({}),
                    Date: class extends Date {
                        constructor(value?: any) {
                            super(value === undefined ? ++now : value);
                        }
                        static now() {
                            return ++now;
                        }
                    },
                    delay: async (ms: number) => {
                        now += ms;
                    },
                    existsSync: () => true,
                    writeFileSync: (_file: string, text: string) => {
                        saved = JSON.parse(text);
                    },
                    readFileSync: (file: string) => {
                        if (file.endsWith("trial.json"))
                            return JSON.stringify({
                                ...retainedInspector.trial,
                                status: captured ? "observed" : "starting",
                            });
                        if (file.includes("cpu-"))
                            return file.endsWith("stderr.log")
                                ? ""
                                : JSON.stringify({
                                      pid: retainedInspector.trial.pid,
                                      cpuMs: 1,
                                      workingSetBytes: 1,
                                      utc: new Date(now).toISOString(),
                                  });
                        if (file.endsWith("stdout.log")) return retainedCdb;
                        if (file.endsWith("stderr.log")) return "";
                        throw Error("unexpected read: " + file);
                    },
                    snapshotCommand: (
                        pid: number,
                        origin: number,
                        stamp: number,
                    ) => {
                        commands.push(stamp);
                        return api.snapshotCommand(pid, origin, stamp);
                    },
                    // Inert boundary: no child, SDK or debugger is started.
                    untrackedCapture: async (command: string) => {
                        if (command.endsWith("cdb.exe")) {
                            captured = true;
                            if (interrupted)
                                throw Error("fake capture interruption");
                        }
                        return retainedInspector.inspection.snapshots[0]
                            .termination;
                    },
                },
            );
            await inspector("memory", new AbortController().signal);
            assert.equal(saved.snapshots.length, 1);
            assert.equal(commands.length, 1);
            const snapshot = saved.snapshots[0];
            t.diagnostic(
                JSON.stringify({
                    interrupted,
                    commandAt: commands[0],
                    startElapsedMs: snapshot.startElapsedMs,
                    startedAt: snapshot.startedAt,
                    endElapsedMs: snapshot.endElapsedMs,
                    endedAt: snapshot.endedAt,
                }),
            );
            assert.equal(saved.status, interrupted ? "incomplete" : "finished");
            assert.equal(
                snapshot.status,
                interrupted
                    ? "incomplete"
                    : "raw-context-and-stack-present-unvalidated",
            );
            assert.deepEqual(
                [
                    snapshot.startElapsedMs,
                    Date.parse(snapshot.startedAt),
                    Date.parse(snapshot.endedAt),
                ],
                [
                    commands[0]! - start,
                    commands[0],
                    start + snapshot.endElapsedMs,
                ],
            );
            assert.ok(snapshot.endElapsedMs >= snapshot.startElapsedMs);
            assert.equal(snapshot.timeoutMs, 5000);
            if (!interrupted) {
                const fixture = scheduledInspector(25000);
                fixture.inspection = saved;
                assert.equal(api.inspectionCoverage(fixture).complete, true);
            }
        });
});

test("snapshot parsing fails closed for missing context, malformed addresses, debugger errors and partial streams", () => {
    const term = retainedInspector.inspection.snapshots[0].termination;
    for (const [label, raw, termination, stderr] of [
        [
            "no module table",
            retainedCdb.replace(
                "start             end                 module name",
                "unknown",
            ),
            term,
            "",
        ],
        [
            "no module rows",
            retainedCdb.replace(/^00007ff[69]`[^\n]+\(.*\)[^\n]*$/gm, ""),
            term,
            "",
        ],
        [
            "reversed range",
            retainedCdb.replace("00007ff6`c3571000", "00007ff6`c2c40000"),
            term,
            "",
        ],
        [
            "bad module address",
            retainedCdb.replace("00007ff6`c3571000", "00007ff6`zzzzzzzz"),
            term,
            "",
        ],
        [
            "unknown PC module",
            retainedCdb.replace("rip=00007ff6c2c51678", "rip=0000000112345678"),
            term,
            "",
        ],
        [
            "one thread has header only",
            retainedCdb.replace(/^0000003e`531f[^\n]+$/gm, ""),
            term,
            "",
        ],
        [
            "bad stack address",
            retainedCdb.replace("0000003e`521fd1f0", "0000003e`zzzzzzzz"),
            term,
            "",
        ],
        ["duplicate end", retainedCdb + "\nSTARTUP_SNAPSHOT_END\n", term, ""],
        [
            "overlapping modules",
            retainedCdb.replace("00007ff9`b97a0000", "00007ff6`c2c60000"),
            term,
            "",
        ],
        [
            "malformed extra module row",
            retainedCdb.replace(
                "rax=0000000024986f54",
                "zzzzzzzz`12345678 00007ff9`bfda5000 bogus\nrax=0000000024986f54",
            ),
            term,
            "",
        ],
        ["bad rip", retainedCdb.replace(/rip=[^ ]+/g, "rip=xyz"), term, ""],
        ["no frames", retainedCdb.replace(/^0000003e`[^\n]+$/gm, ""), term, ""],
        [
            "end missing",
            retainedCdb.replace(/^STARTUP_SNAPSHOT_END$/m, ""),
            term,
            "",
        ],
        [
            "echo is not marker",
            retainedCdb.replace(/^STARTUP_SNAPSHOT_BEGIN$/m, ""),
            term,
            "",
        ],
        [
            "dropped stdout",
            retainedCdb,
            { ...term, dropped: { stdout: 1, stderr: 0 } },
            "",
        ],
        [
            "dropped stderr",
            retainedCdb,
            { ...term, dropped: { stdout: 0, stderr: 1 } },
            "",
        ],
        ["timeout", retainedCdb, { ...term, reason: "deadline" }, ""],
        ["spawn error", retainedCdb, { ...term, error: "failed" }, ""],
        [
            "debugger error",
            retainedCdb.replace(
                /^STARTUP_SNAPSHOT_END$/m,
                "Unable to read thread context\nSTARTUP_SNAPSHOT_END",
            ),
            term,
            "",
        ],
        ["stderr error", retainedCdb, term, "Unable to read memory"],
        ["oversized", retainedCdb + "x".repeat(1024 * 1024), term, ""],
    ] as const) {
        assert.equal(
            api.snapshotEvidence(raw, termination, stderr).status,
            "incomplete",
            label,
        );
    }
    const noContext = api.snapshotEvidence(
        retainedCdb.replace(
            "start             end                 module name",
            "unknown",
        ),
        term,
        "",
    );
    assert.deepEqual(noContext.moduleBases, []);
    assert.ok(
        noContext.relativePCs.every(
            (p: any) => p.module === null && p.offset === null,
        ),
    );
});

test("retained readiness upper bound makes CDB40 explicitly not due in post-hoc re-analysis", () => {
    const f = retainedInspection();
    const coverage = api.inspectionCoverage?.(f);
    assert.equal(coverage?.complete, true);
    assert.deepEqual(
        coverage.snapshots.map((s: any) => [s.targetMs, s.status]),
        [
            [20000, "captured"],
            [40000, "not-due"],
        ],
    );
    assert.deepEqual(
        coverage.samples.map((s: any) => [s.targetMs, s.status]),
        [
            [5000, "captured"],
            [15000, "captured"],
            [20000, "captured"],
            [30000, "captured"],
            [40000, "not-due"],
            [50000, "not-due"],
        ],
    );
    assert.equal(coverage.boundary.kind, "readiness-upper-bound");
    assert.equal(coverage.boundary.traceMs, 35898);
    assert.equal(f.provenance.originalJobConclusion, "failure");
});

function scheduledInspector(readyMs: number | null) {
    const f = retainedInspection();
    const terminalMs = readyMs === null ? 60010 : readyMs + 22005;
    const boundary = readyMs ?? 60000;
    const sample = f.inspection.samples[0];
    f.inspection.samples = [5000, 15000, 20000, 30000, 40000, 50000]
        .filter((ms) => ms < boundary)
        .map((ms) => ({
            ...structuredClone(sample),
            targetMs: ms,
            actualElapsedMs: ms + 500,
            data: {
                ...sample.data,
                utc: new Date(
                    Date.parse(f.trial.startedAt) + ms + 400,
                ).toISOString(),
            },
        }));
    const snapshot = f.inspection.snapshots[0];
    f.inspection.snapshots = [20000, 40000]
        .filter((ms) => ms < boundary)
        .map((ms) => ({
            ...structuredClone(snapshot),
            targetMs: ms,
            startElapsedMs: ms + 516,
            endElapsedMs: ms + 2311,
            startedAt: new Date(
                Date.parse(f.trial.startedAt) + ms + 516,
            ).toISOString(),
            endedAt: new Date(
                Date.parse(f.trial.startedAt) + ms + 2311,
            ).toISOString(),
        }));
    f.trial.elapsedMs = terminalMs;
    f.trial.termination.elapsedMs = terminalMs - 1;
    f.trial.termination.reason =
        readyMs === null ? "deadline" : "observation-complete";
    f.trial.verdict =
        readyMs === null ? "startup-timeout" : "observed-no-fault";
    f.trial.workload.requests = readyMs === null ? 0 : 1;
    f.trial.workload.completed = readyMs === null ? 0 : 1;
    const events: any[] = [{ event: "spawn", ms: 6, pid: f.trial.pid }];
    if (readyMs !== null)
        events.push({ event: "request", ms: readyMs, client: 0, round: 0 });
    events.push({
        event: "termination",
        ms: terminalMs,
        ...f.trial.termination,
    });
    f.client = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
    f.endedAt = new Date(
        Date.parse(f.trial.startedAt) + terminalMs,
    ).toISOString();
    if (readyMs === null) f.stdout = "";
    return f;
}

test("schedule coverage requires every due capture and verified readiness or a complete startup deadline", () => {
    assert.equal(typeof api.inspectionCoverage, "function");
    for (const [ready, count] of [
        [1000, 0],
        [19000, 0],
        [20000, 0],
        [40000, 1],
        [35898, 1],
        [45000, 2],
        [null, 2],
    ] as const) {
        const c = api.inspectionCoverage(scheduledInspector(ready));
        assert.equal(c.complete, true, String(ready));
        assert.equal(
            c.snapshots.filter((s: any) => s.status === "captured").length,
            count,
        );
    }
    const corruptions: Record<string, (f: any) => void> = {
        "missing due snapshot": (f: any) => f.inspection.snapshots.pop(),
        "missing first due snapshot": (f: any) =>
            f.inspection.snapshots.shift(),
        "malformed trace row": (f: any) => (f.client = "null\n"),
        "malformed capture": (f: any) => (f.inspection.snapshots[0] = null),
        "missing due sample": (f: any) => f.inspection.samples.pop(),
        "missing manifest": (f: any) => (f.inspection = null),
        "missing pid": (f: any) => (f.trial.pid = null),
        "wrong SHA": (f: any) => (f.trial.sha = "f".repeat(40)),
        "missing expected SHA": (f: any) => delete f.expectedSha,
        "wrong identity": (f: any) => f.inspection.pid++,
        "sample from another trial": (f: any) =>
            (f.inspection.samples[0].data.utc = "2000-01-01T00:00:00Z"),
        "snapshot from another trial": (f: any) =>
            (f.inspection.snapshots[0].startedAt = "2000-01-01T00:00:00Z"),
        "snapshot start off by one ms": (f: any) =>
            (f.inspection.snapshots[0].startElapsedMs += 1),
        "snapshot end off by one ms": (f: any) =>
            (f.inspection.snapshots[0].endElapsedMs += 1),
        "snapshot wrong target": (f: any) =>
            (f.inspection.snapshots[0].args[2] = "9999"),
        "unknown readiness": (f: any) =>
            (f.client = f.client
                .split("\n")
                .filter((l: string) => !l.includes('"request"'))
                .join("\n")),
        "no ready stdout": (f: any) => (f.stdout = ""),
        cancel: (f: any) => (f.trial.termination.reason = "aborted"),
        "truncated inspector": (f: any) =>
            (f.inspection.status = "waiting-for-pid"),
        "aborted inspector": (f: any) =>
            (f.inspection.status = "stopped-with-trial"),
        "inspector error": (f: any) => (f.inspection.error = "cancelled"),
        "failed capture": (f: any) =>
            (f.inspection.snapshots[0].termination.code = 1),
        "capture drop": (f: any) =>
            (f.inspection.snapshots[0].termination.dropped.stdout = 1),
        "sample stderr drop": (f: any) =>
            (f.inspection.samples[0].termination.dropped.stderr = 1),
        "unavailable capture": (f: any) => {
            f.inspection.snapshots[0].status = "unavailable";
            f.inspection.snapshots[0].unavailableReason = "CDB missing";
        },
        "duplicate capture": (f: any) =>
            f.inspection.snapshots.push(f.inspection.snapshots[0]),
        "truncated trace": (f: any) => (f.client = f.client.trimEnd()),
        "terminal missing": (f: any) =>
            (f.client = f.client
                .split("\n")
                .filter((l: string) => !l.includes('"termination"'))
                .join("\n")),
        "trial streams drop": (f: any) =>
            (f.trial.termination.dropped.stdout = 1),
        stderr: (f: any) => (f.stderr = "error"),
    };
    for (const [label, mutate] of Object.entries(corruptions)) {
        const f = scheduledInspector(45000);
        mutate(f);
        assert.equal(api.inspectionCoverage(f).complete, false, label);
    }
    const missing = scheduledInspector(1000);
    missing.inspection = null;
    assert.equal(
        api.inspectionCoverage(missing).complete,
        false,
        "early readiness cannot bypass manifest",
    );
    const unavailable = scheduledInspector(35898);
    unavailable.inspection.snapshots[0].status = "unavailable";
    unavailable.inspection.snapshots[0].unavailableReason = "CDB missing";
    assert.equal(
        api.inspectionCoverage(unavailable).snapshots[0].actual[0]
            .unavailableReason,
        "CDB missing",
    );
});

test("retained CDB fixture keeps the hash-verified stdout bytes", () => {
    assert.equal(
        createHash("sha256")
            .update(
                readFileSync(
                    "tests/fixtures/http-startup/retained-cdb20.stdout.txt",
                ),
            )
            .digest("hex"),
        "b9f79b0ae3d0417e951a3f3406941a4d3f075aabc34b9aa32cfbe0206bebd117",
    );
});

test("hosted report uses due coverage instead of unconditional two snapshots with only in-memory IO", async () => {
    for (const [f, missingDue, complete] of [
        [retainedInspection(), false, true],
        [scheduledInspector(45000), true, false],
        [f407Inspection(), false, true],
        [structuredClone(f407Inspector), false, false],
        [f407Inspection(), true, false],
        [
            f407Inspection(
                f407Cdb.replace(
                    String.raw`C:\Windows\SYSTEM32\ntdll.dll`,
                    "relative.dll",
                ),
            ),
            false,
            false,
        ],
    ] as const) {
        if (missingDue) f.inspection.snapshots.pop();
        let saved: any;
        const fakeProcess: any = {
            env: {},
            argv: [],
            pid: 1,
            once() {},
            removeListener() {},
        };
        const driver = runInNewContext(
            pureBody("scripts/http-startup.mjs") +
                `
            verify = () => ({checkout:{head:'${f.expectedSha}'}});
            restore = async () => ({binary:'fake-image',source:'fake-source'});
            inspectBaseline = async () => {};
            main;
        `,
            {
                ...api,
                join,
                resolve,
                AbortController,
                process: fakeProcess,
                startupPlan: () => [api.startupPlan()[0]],
                startupChildEnv: () => ({}),
                runTrial: async () => f.trial,
                Date: class extends Date {
                    constructor() {
                        super(f.endedAt);
                    }
                    static now() {
                        return Date.parse(f.endedAt);
                    }
                },
                setTimeout: () => 1,
                clearTimeout() {},
                mkdirSync() {},
                existsSync: () => true,
                hashFile: (file: string) =>
                    file === "fake-image"
                        ? api.retained.imageHash
                        : api.retained.sourceHash,
                writeFileSync: (file: string, contents: string) => {
                    if (file.endsWith("startup.json"))
                        saved = JSON.parse(contents);
                },
                readFileSync: (file: string) => {
                    if (file.endsWith("inspection.json"))
                        return JSON.stringify(f.inspection);
                    if (file.endsWith("trial.json"))
                        return JSON.stringify(f.trial);
                    if (file.endsWith("client.jsonl")) return f.client;
                    if (file.endsWith("stdout.log")) return f.stdout;
                    if (file.endsWith("stderr.log")) return f.stderr;
                    throw Error("unexpected read: " + file);
                },
            },
        );
        await driver();
        assert.equal(saved.inspectionComplete, complete);
        assert.equal(fakeProcess.exitCode, complete ? undefined : 1);
        assert.equal(saved.results[0].rawVerdict, f.trial.verdict);
        assert.equal(saved.results[0].imageHash, api.retained.imageHash);
        if (missingDue && f.expectedSha === f407Inspector.expectedSha)
            assert.equal(
                saved.inspectionCoverage.snapshots[0].status,
                "missing-due",
            );
        assert.equal(
            saved.inspectionCoverage.snapshots[1].status,
            missingDue && f.expectedSha !== f407Inspector.expectedSha
                ? "missing-due"
                : "not-due",
        );
    }
});
