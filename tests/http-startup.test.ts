import { test } from "node:test";
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
                        event: {
                            pull_request: {
                                labels: label ? [{ name: "full-ci" }] : [],
                            },
                        },
                    },
                    contains: (a: string[], v: string) => a.includes(v),
                    startsWith: (s: string, p: string) => s.startsWith(p),
                });
            })
            .map(([name]) => name)
            .sort();
    }
    assert.deepEqual(selected("startup-602", "workflow_dispatch"), [
        "http-startup-602",
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
        "STARTUP_SNAPSHOT_BEGIN\n00000001`40000000 00000001`40100000 nona_http\nrip=00000001`40001234\nChild-SP RetAddr\n00 00000000`0014f728 00000001`40001234 nona_http+0x1234\nSTARTUP_SNAPSHOT_END\n";
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
