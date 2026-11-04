import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";

const api = await import(
    pathToFileURL(resolve("scripts/http-startup-env-boundary-plan.mjs")).href
).catch((e) => {
    if (e.code === "ERR_MODULE_NOT_FOUND") return {};
    throw e;
});

test("workflow isolates env runs at top level and preserves normal/full/legacy gates", () => {
    const text = readFileSync(".github/workflows/native-platforms.yml", "utf8");
    assert.match(
        text,
        /options: \[full, startup-602, env-602, http602-current\]/,
    );
    const group = text.match(/^    group: (.+)$/m)![1]!;
    assert.ok(group.includes("inputs.diagnostic_mode == 'env-602'"));
    assert.ok(
        group.includes("github.run_id") && group.includes("github.run_attempt"),
    );
    assert.ok(
        group.includes(
            "github.event_name == 'pull_request' && github.head_ref || github.ref",
        ),
    );
    const groups = (mode: string, event: string, run = 123, attempt = 1) =>
        runInNewContext(group.replace(/^\$\{\{|\}\}$/g, ""), {
            inputs: { diagnostic_mode: mode },
            github: {
                run_id: run,
                run_attempt: attempt,
                event_name: event,
                head_ref: "topic",
                ref: "refs/heads/main",
            },
            format: (s: string, ...a: any[]) =>
                s.replace(/\{(\d+)\}/g, (_, n) => a[Number(n)]),
        });
    assert.equal(groups("full", "push"), "native-platforms-refs/heads/main");
    assert.equal(
        groups("startup-602", "workflow_dispatch"),
        groups("full", "push"),
    );
    assert.equal(groups("full", "pull_request"), "native-platforms-topic");
    assert.notEqual(
        groups("env-602", "workflow_dispatch"),
        groups("full", "workflow_dispatch"),
    );
    assert.notEqual(
        groups("env-602", "workflow_dispatch"),
        groups("env-602", "workflow_dispatch", 124),
    );
    assert.notEqual(
        groups("env-602", "workflow_dispatch"),
        groups("env-602", "workflow_dispatch", 123, 2),
    );
    const jobs = text
        .slice(text.indexOf("\njobs:"))
        .split(/^    (?=[a-z].+:$)/m)
        .slice(1);
    for (const job of jobs) {
        const name = job.split(":")[0]!,
            guard = job.match(/^        if: (.+)$/m)![1]!;
        if (name === "http-env-602") {
            assert.match(guard, /inputs.diagnostic_mode == 'env-602'/);
            for (const required of [
                "github.repository == '40oleg/nona'",
                "github.event_name == 'workflow_dispatch'",
                "inputs.diagnostic_sha == github.sha",
            ])
                assert.ok(guard.includes(required));
            assert.match(job, /runs-on: windows-2025/);
            assert.match(job, /timeout-minutes: 35/);
            assert.equal(job.includes("concurrency:"), false);
            assert.equal(job.includes("npm run build"), false);
            assert.match(job, /actions: read/);
            assert.match(job, /contents: read/);
            assert.match(job, /if: always\(\)/);
            assert.ok(job.indexOf("--verify") < job.indexOf("GH_TOKEN:"));
            assert.equal(job.includes("self-hosted"), false);
            const admitted = (
                mode: string,
                event: string,
                repo = "40oleg/nona",
                ref = env.GITHUB_REF,
                sha = head,
            ) =>
                runInNewContext(guard, {
                    github: {
                        repository: repo,
                        event_name: event,
                        ref,
                        sha,
                        workflow_sha: head,
                        workflow_ref: env.GITHUB_WORKFLOW_REF,
                    },
                    inputs: { diagnostic_mode: mode, diagnostic_sha: head },
                    startsWith: (s: string, p: string) => s.startsWith(p),
                    format: (s: string, a: string) => s.replace("{0}", a),
                });
            assert.equal(admitted("env-602", "workflow_dispatch"), true);
            for (const [mode, event, repo, ref, sha] of [
                ["full", "workflow_dispatch"],
                ["startup-602", "workflow_dispatch"],
                ["unknown", "workflow_dispatch"],
                ["env-602", "push"],
                ["env-602", "pull_request"],
                ["env-602", "workflow_dispatch", "foreign/nona"],
                [
                    "env-602",
                    "workflow_dispatch",
                    "40oleg/nona",
                    "refs/heads/main",
                ],
                [
                    "env-602",
                    "workflow_dispatch",
                    "40oleg/nona",
                    env.GITHUB_REF,
                    "b".repeat(40),
                ],
            ])
                assert.equal(admitted(mode!, event!, repo, ref, sha), false);
        } else if (name === "http602-current")
            assert.match(guard, /inputs.diagnostic_mode == 'http602-current'/);
        else if (name === "http-startup-602")
            assert.match(guard, /inputs.diagnostic_mode == 'startup-602'/);
        else {
            assert.ok(
                guard.includes("inputs.diagnostic_mode != 'startup-602'"),
                name,
            );
            assert.ok(
                guard.includes("inputs.diagnostic_mode != 'env-602'"),
                name,
            );
            assert.ok(
                guard.includes("inputs.diagnostic_mode != 'http602-current'"),
                name,
            );
        }
    }
});

test("actual runTrial and supervise pass generated environment to fake spawn without filtering", async () => {
    assert.equal(typeof api.conditions, "function");
    const parent = {
        ...env,
        PATH: "safe",
        GH_TOKEN: "secret",
        NODE_OPTIONS: "inject",
        COMSPEC_INJECTION: "bad",
        _NT_SYMBOL_PATH: "bad",
    };
    const b = api.blockMetrics(api.baseEnvironment(parent));
    const conditions = api.conditions(parent, {
        keys: b.keys + 5,
        units: b.units + 600,
    });
    const text = readFileSync("scripts/http-crash.mjs", "utf8");
    const supervise = text.slice(
        text.indexOf("export function supervise("),
        text.indexOf("async function freePort()"),
    );
    const runTrial = text.slice(
        text.indexOf("export async function runTrial("),
        text.indexOf("async function main()"),
    );
    let seen: any;
    const outcome = {
        pid: 91,
        code: 1,
        signal: null,
        hex: "0x1",
        reason: null,
        error: null,
        elapsedMs: 1,
        dropped: { stdout: 0, stderr: 0 },
    };
    const context = {
        spawn(command: any, args: any, options: any) {
            seen = { command, args, options };
            const child: any = new EventEmitter();
            child.pid = 91;
            child.stdout = new EventEmitter();
            child.stderr = new EventEmitter();
            child.exitCode = null;
            child.signalCode = null;
            child.kill = () => {};
            queueMicrotask(() => {
                child.exitCode = 1;
                child.emit("close", 1, null);
            });
            return child;
        },
        mkdirSync() {},
        writeFileSync() {},
        appendFileSync() {},
        save() {},
        join: (...p: string[]) => p.join("/"),
        freePort: async () => 4321,
        http: {
            Agent: class {
                destroy() {}
            },
        },
        process: { pid: 1, on() {}, removeListener() {} },
        Date,
        Promise,
        Set,
        Map,
        JSON,
        Math,
        Number,
        Buffer,
        setTimeout,
        clearTimeout,
        classifyTermination: () => "startup-failure",
    };
    const run = runInNewContext(
        supervise.replace("export ", "") +
            runTrial.replace("export ", "") +
            "\nrunTrial",
        context,
    );
    for (const spec of api.envPlan()) {
        const condition = conditions.find((c: any) => c.id === spec.condition);
        const args = spec.runtime === "node" ? ["pinned.mjs"] : [];
        const row = await run(spec, {
            directory: "fake",
            command:
                spec.runtime === "node" ? "node.exe" : "retained/nona-http.exe",
            args,
            env: condition.env,
            startupMs: 60000,
            hardMs: 90000,
            observationMs: 22000,
        });
        assert.deepEqual([...seen.args], [...args, "4321"]);
        assert.deepEqual({ ...seen.options.env }, condition.env);
        assert.deepEqual(api.blockMetrics(seen.options.env), condition.metrics);
        assert.equal(seen.options.env.GH_TOKEN, undefined);
        assert.equal(seen.options.env.NODE_OPTIONS, undefined);
        assert.equal(seen.options.env._NT_SYMBOL_PATH, "");
        assert.equal(row.verdict, "startup-failure");
    }
});

function rawProof() {
    const spec = api.envPlan()[0];
    const settings = {
        event: "settings",
        keepAliveTimeout: "5000",
        keepAliveTimeoutBuffer: "1000",
        timeout: "0",
        requestTimeout: "300000",
        headersTimeout: "60000",
    };
    const termination = {
        pid: 91,
        code: null,
        signal: "SIGKILL",
        hex: null,
        reason: "observation-complete",
        error: null,
        elapsedMs: 23000,
        dropped: { stdout: 0, stderr: 0 },
    };
    const row = {
        ...spec,
        sourceHash:
            "bd8e4abac8b6cde1af33a8dd717882ab34a0e894243fd8bb2e75c04b4d380eda",
        imageHash: "a".repeat(64),
        sha: head,
        tree: "b".repeat(40),
        imageCompilerHead: null,
        pid: 91,
        port: 4321,
        startedAt: "2026-11-02T12:00:00Z",
        status: "finished",
        settings,
        timeoutWindowCovered: true,
        termination,
        verdict: "observed-no-fault",
        elapsedMs: 23001,
        limits: {
            startupMs: 60000,
            hardMs: 90000,
            observationMs: 22000,
            rounds: 4,
        },
        workload: {
            requests: 128,
            completed: 128,
            wrongOutput: 0,
            errors: 0,
            hangs: 0,
        },
    };
    const events: any[] = [
        {
            ms: 0,
            event: "spawn",
            pid: 91,
            command: "node.exe",
            args: ["pinned.mjs"],
        },
    ];
    for (let client = 0; client < 32; client++) {
        for (let round = 0; round < 4; round++) {
            events.push({
                ms: 1000 + round * 2,
                event: "request",
                client,
                round,
            });
            if (round === 0)
                events.push({
                    ms: 1000,
                    event: "client-socket",
                    client,
                    socket: client + 1,
                });
            events.push({
                ms: 1001 + round * 2,
                event: "response",
                client,
                round,
                valid: true,
                status: 200,
                bytes: 1048576,
                headers: { "transfer-encoding": "chunked" },
                reused: round > 0,
            });
        }
    }
    // Interleave monotonically, retaining spawn first and termination last.
    events.sort((a, b) => a.ms - b.ms);
    for (let client = 0; client < 32; client++)
        events.push({
            ms: 22000,
            event: "client-close",
            client,
            socket: client + 1,
            hadError: false,
        });
    events.push({ ms: 23000, event: "termination", ...termination });
    const json = (v: any) => JSON.stringify(v) + "\n";
    const raw = {
        trial: json(row),
        termination: json(termination),
        stdout: `diagnostic ${JSON.stringify(settings)}\nready 4321\n`,
        stderr: "",
        client: events.map(json).join(""),
        expectedImageHash: row.imageHash,
        expectedDriver: {
            sha: head,
            tree: "b".repeat(40),
            imageCompilerHead: null,
        },
    };
    return { spec, row, raw };
}
test("strong oracle requires all 128 responses, raw lifecycle and unchanged settings/timing; expected failures never green", () => {
    assert.equal(typeof api.trialEvidence, "function");
    const evaluate = (p: any) =>
        api.trialEvidence(p.spec, p.row, p.raw, "node.exe", ["pinned.mjs"]);
    assert.deepEqual(evaluate(rawProof()), {
        passed: true,
        errors: [],
        timing: {
            readyUpperBoundMs: 1000,
            firstRequestMs: 1000,
            lastResponseMs: 1007,
            terminationMs: 23000,
        },
    });
    for (const mutate of [
        (p: any) => {
            p.row.settings = null;
        },
        (p: any) => {
            p.row.verdict = "startup-timeout";
        },
        (p: any) => {
            p.row.workload.completed = 127;
        },
        (p: any) => {
            p.raw.stderr = "failure";
        },
        (p: any) => {
            p.row.termination.dropped.stdout = 1;
        },
        (p: any) => {
            p.row.limits.observationMs = 8500;
        },
        (p: any) => {
            p.row.sourceHash = "wrong";
        },
        (p: any) => {
            p.row.sha = "b".repeat(40);
        },
        (p: any) => {
            p.raw.client = p.raw.client.replace('"status":200', '"status":500');
        },
        (p: any) => {
            delete p.raw.trial;
        },
        (p: any) => {
            p.raw.client = p.raw.client.trimEnd();
        },
        (p: any) => {
            p.row.termination.error = { message: "spawn" };
        },
        (p: any) => {
            p.row.runtime = "nona";
        },
    ]) {
        const p = rawProof();
        mutate(p);
        assert.equal(evaluate(p).passed, false);
    }
    const results = api.envPlan().map((p: any) => ({
        id: p.id,
        condition: p.condition,
        trial: p,
        rawVerdict: "observed-no-fault",
        status: "finished",
        evidence: { passed: true },
    }));
    assert.equal(api.completedEvidence(results), true);
    for (const r of [
        results.slice(0, 5),
        [...results].reverse(),
        [results[0], ...results.slice(0, 5)],
        results.map((r: any, i: number) =>
            i === 1 ? { ...r, evidence: { passed: false } } : r,
        ),
        results.map((r: any, i: number) =>
            i === 1 ? { ...r, condition: "few" } : r,
        ),
        results.map((r: any, i: number) =>
            i === 1 ? { ...r, rawVerdict: "startup-timeout" } : r,
        ),
    ])
        assert.equal(api.completedEvidence(r), false);
});

test("PowerShell has separate strict env admission and exact Node/native birth/parent/command identity", () => {
    for (const file of [
        "scripts/http-startup-artifact.ps1",
        "scripts/http-startup-cleanup.ps1",
    ]) {
        const text = readFileSync(file, "utf8");
        assert.ok(text.includes("'startup-602'"));
        assert.ok(text.includes("'env-602'"));
        assert.ok(text.includes("--admit-helper"));
    }
    const text = readFileSync("scripts/http-startup-cleanup.ps1", "utf8");
    const functions = text.match(
        /# BEGIN ENV602 PURE[\s\S]+?# END ENV602 PURE/,
    )?.[0];
    assert.ok(functions, "missing exact identity predicates");
    const result = spawnSync(
        "pwsh",
        [
            "-NoProfile",
            "-Command",
            functions +
                `
$ErrorActionPreference='Stop'
$row=@{pid=42;parentPid=8;creationTicks='123';command='node.exe';args=@('pinned.mjs','4321');executable='C:\\node.exe'}
$live=@{ProcessId=42;ParentProcessId=8;CreationDate=[DateTime]::new(123,[DateTimeKind]::Utc);Name='node.exe';ExecutablePath='C:\\node.exe';CommandLine='node.exe pinned.mjs 4321'}
if (-not (Test-Env602Identity $row $live)) {throw 'valid Node rejected'}
foreach($key in @('ProcessId','ParentProcessId','CreationDate','Name','ExecutablePath','CommandLine')) {
 $bad=$live.Clone();$bad[$key]=switch($key){'ProcessId'{43};'ParentProcessId'{9};'CreationDate'{[DateTime]::new(124,[DateTimeKind]::Utc)};'Name'{'nona-http.exe'};'ExecutablePath'{'C:\\foreign\\node.exe'};'CommandLine'{'node.exe foreign.mjs 4321'}}
 if(Test-Env602Identity $row $bad) {throw "accepted foreign $key"}
}
$row.command='C:\\retained\\nona-http.exe';$row.args=@('4321');$row.executable=$row.command
$live.Name='nona-http.exe';$live.ExecutablePath=$row.command;$live.CommandLine='C:\\retained\\nona-http.exe 4321'
if(-not (Test-Env602Identity $row $live)){throw 'valid native rejected'}
if((ConvertTo-Env602Command 'C:\\Program Files\\node.exe' @('a b.mjs','4321')) -cne '"C:\\Program Files\\node.exe" "a b.mjs" 4321'){throw 'quoting'}
'exact identity controls passed'
`,
        ],
        { encoding: "utf8", timeout: 10000, windowsHide: true },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("actual cleanup with fake process queries leaves reused Node PID untouched and still cleans native and restore helpers", () => {
    const source = readFileSync("scripts/http-startup-cleanup.ps1", "utf8");
    const fake = String.raw`
$ErrorActionPreference='Stop'
$env:STARTUP_MODE='env-602';$env:GITHUB_WORKSPACE='C:\env602-fake'
$script:out=@{};$script:stopped=@()
$root=Join-Path $env:GITHUB_WORKSPACE 'work/http-startup'
$native=Join-Path $root 'retained/reference-stress/nona-http.exe'
$p=@{driver=@{head='head';tree='tree'};workflow=@{runId='1';runAttempt='1'};nodeExecutable='C:\node.exe'}
$owner=@{head='head';tree='tree';run='1';attempt='1';driverPid=8}
$script:fixtureOwned=@(
 @{pid=100;parentPid=8;creationTicks='100';command='C:\node.exe';args=@('source.mjs','4321');executable='C:\node.exe'},
 @{pid=101;parentPid=8;creationTicks='100';command=$native;args=@('4322');executable=$native},
 @{pid=102;parentPid=8;creationTicks='100';command='pwsh';args=@('-NoProfile','-File','scripts/http-startup-artifact.ps1','inventory','-Output',$root);executable='C:\pwsh.exe'}
)
function node { $global:LASTEXITCODE=0 }
function Get-Command { @{Source='C:\pwsh.exe'} }
function Test-Path {param($LiteralPath) $LiteralPath.EndsWith('env-children.json') }
function Get-Content {param($LiteralPath,[switch]$Raw)
 if($LiteralPath.EndsWith('env-boundary-provenance.json')) {return ($p|ConvertTo-Json -Depth 9)}
 if($LiteralPath.EndsWith('env-owner.json')) {return ($owner|ConvertTo-Json -Depth 9)}
 if($LiteralPath.EndsWith('env-children.json')) {return (ConvertTo-Json -InputObject $script:fixtureOwned -Depth 9)}
 throw 'Unexpected fake read'
}
function Get-ChildItem { @() }
function Get-CimInstance {param($ClassName,$Filter,$ErrorAction)
 if($Filter -notmatch '^ProcessId=(\d+)$') {throw 'unbounded process query'}
 $id=[int]$Matches[1];$record=$script:fixtureOwned | Where-Object {$_.pid -eq $id}
 $ticks=100;if($id -eq 100){$ticks=101}
 @{ProcessId=$id;ParentProcessId=8;CreationDate=[DateTime]::new($ticks,[DateTimeKind]::Utc);Name=[IO.Path]::GetFileName($record.executable);ExecutablePath=$record.executable;CommandLine=(ConvertTo-Env602Command $record.command $record.args)}
}
function Stop-Process {param($Id,[switch]$Force,$ErrorAction) $script:stopped+=@($Id) }
function Set-Content {param($LiteralPath,[Parameter(ValueFromPipeline=$true)]$Value) process {$script:out[$LiteralPath]=$Value} }
$script:cleanupBody=__BODY__
try { & ([scriptblock]::Create($script:cleanupBody));throw 'expected cleanup failure' }
catch { if($_.Exception.Message -notlike 'Owned cleanup incomplete*'){throw} }
if(($script:stopped -join ',') -cne '101,102') {throw 'Foreign PID stopped or later owned children skipped'}
$rows=$script:out[(Join-Path $root 'cleanup.json')]|ConvertFrom-Json
if($rows.Count -ne 3 -or $rows[0].status -cne 'identity mismatch; untouched'){throw 'missing partial cleanup receipt'}
'fake cleanup passed'
`.replace("__BODY__", () => "'" + source.replaceAll("'", "''") + "'");
    const result = spawnSync("pwsh", ["-NoProfile", "-Command", fake], {
        encoding: "utf8",
        timeout: 10000,
        windowsHide: true,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
});
const head = "a".repeat(40);
const env: Record<string, string> = {
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: "40oleg/nona",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_SHA: head,
    GITHUB_WORKFLOW_SHA: head,
    GITHUB_REF: "refs/heads/issue-602-startup-review",
    GITHUB_WORKFLOW_REF:
        "40oleg/nona/.github/workflows/native-platforms.yml@refs/heads/issue-602-startup-review",
    STARTUP_MODE: "env-602",
    STARTUP_EXPECTED_SHA: head,
    GITHUB_RUN_ID: "123",
    GITHUB_RUN_ATTEMPT: "1",
    RUNNER_ENVIRONMENT: "github-hosted",
    RUNNER_OS: "Windows",
    RUNNER_NAME: "hosted",
    ImageOS: "win25",
    ImageVersion: "1",
};

test("actual verification binds pre-token aggregates to driver/event/run and rejects corrupt ancestry/source/receipts before restore", () => {
    const text = readFileSync("scripts/http-startup-env-boundary.mjs", "utf8");
    const body = text.slice(
        text.indexOf("function identity()"),
        text.indexOf("function ownership("),
    );
    const base = {
        ...env,
        GITHUB_EVENT_PATH: "event",
        PATH: "safe",
        UNKNOWN_CURRENT_PRESSURE: "x".repeat(2000),
        MORE1: "x",
        MORE2: "x",
        MORE3: "x",
        MORE4: "x",
        MORE5: "x",
        MORE6: "x",
        MORE7: "x",
        MORE8: "x",
    };
    function harness() {
        const input: any = {
            env: { ...base },
            platform: "win32",
            arch: "x64",
            version: "v26.9.0",
            execPath: "node.exe",
        };
        const event: any = {
            repository: {
                full_name: "40oleg/nona",
                owner: { login: "40oleg" },
            },
            inputs: { diagnostic_mode: "env-602", diagnostic_sha: head },
        };
        const records: any = {};
        let children = 0,
            changed = "",
            untracked = "",
            ancestry = true,
            sourceHash =
                "bd8e4abac8b6cde1af33a8dd717882ab34a0e894243fd8bb2e75c04b4d380eda";
        const verify = runInNewContext(body + "\nverify", {
            process: input,
            ...api,
            output: "output",
            mainPin: "ba94164b6573eef306b87a59d0b174630973e364",
            dependencyPin: "47193961f3bf9b69c0177d5522de3db1069447df",
            retained: { sourceHash },
            read: (p: string) => (p === "event" ? event : records[p]),
            resolve: (p: string) => p,
            git: (...args: string[]) => {
                children++;
                if (args[0] === "diff") return changed;
                if (args[0] === "ls-files") return untracked;
                if (args[1] === "HEAD") return head;
                return "b".repeat(40);
            },
            dependencyStatus: (_h: any, _e: any, pin: string) => ({
                commit: pin,
                isAncestor: ancestry,
                exitCode: ancestry ? 0 : 1,
                error: null,
            }),
            startupChildEnv: () => ({}),
            sha: () => sourceHash,
            serverSource: () => "pinned",
            collectProvenance: () => ({
                verified: true,
                errors: [],
                checkout: { head, expectedHead: head, tree: "b".repeat(40) },
                dependency: {
                    commit: "47193961f3bf9b69c0177d5522de3db1069447df",
                    isAncestor: true,
                    exitCode: 0,
                    error: null,
                },
                repository: env.GITHUB_REPOSITORY,
                event: {
                    name: env.GITHUB_EVENT_NAME,
                    sha: head,
                    ref: env.GITHUB_REF,
                },
                workflow: {
                    sha: head,
                    ref: env.GITHUB_WORKFLOW_REF,
                    runId: "123",
                    runAttempt: "1",
                },
                runner: {
                    name: "hosted",
                    environment: "github-hosted",
                    os: "Windows",
                },
            }),
            mkdirSync() {},
            save: (p: string, v: any, exclusive: boolean) => {
                if (exclusive && records[p]) throw Error("exclusive receipt");
                records[p] = v;
            },
            Date,
            JSON,
        });
        return {
            input,
            event,
            records,
            verify,
            get children() {
                return children;
            },
            set changed(v: string) {
                changed = v;
            },
            set untracked(v: string) {
                untracked = v;
            },
            set ancestry(v: boolean) {
                ancestry = v;
            },
            set sourceHash(v: string) {
                sourceHash = v;
            },
        };
    }
    const h = harness();
    const receipt = h.verify(true);
    assert.equal(receipt.preToken, true);
    assert.deepEqual({ ...receipt.parentAggregate }, api.blockMetrics(base));
    assert.equal(
        JSON.stringify(receipt).includes(base.UNKNOWN_CURRENT_PRESSURE),
        false,
    );
    assert.equal(
        JSON.stringify(receipt).includes("UNKNOWN_CURRENT_PRESSURE"),
        false,
    );
    assert.throws(() => h.verify(true), /exclusive/);
    h.input.env.GH_TOKEN = "restoration-only";
    assert.equal(h.verify(false), receipt);
    for (const mutate of [
        (h: any) => {
            h.input.env.STARTUP_MODE = "startup-602";
        },
        (h: any) => {
            h.event.repository.owner.login = "foreign";
        },
        (h: any) => {
            h.event.inputs.diagnostic_sha = "b".repeat(40);
        },
        (h: any) => {
            h.changed = "modified src";
        },
        (h: any) => {
            h.untracked = "src/new.ts";
        },
        (h: any) => {
            h.ancestry = false;
        },
        (h: any) => {
            h.sourceHash = "changed";
        },
        (h: any) => {
            h.input.env.GH_TOKEN = "too-early";
        },
    ]) {
        const h = harness();
        mutate(h);
        assert.throws(() => h.verify(true));
    }
    for (const mutate of [
        (p: any) => {
            p.preToken = false;
        },
        (p: any) => {
            p.workflow.runId = "124";
        },
        (p: any) => {
            p.workflow.runAttempt = "2";
        },
        (p: any) => {
            p.driver.tree = "c".repeat(40);
        },
        (p: any) => {
            p.mode = "startup-602";
        },
        (p: any) => {
            delete p.parentAggregate;
        },
        (p: any) => {
            p.parentAggregate.units++;
        },
        (p: any) => {
            p.verified = false;
        },
        (p: any) => {
            p.conditions.reverse();
        },
    ]) {
        const h = harness();
        const p = h.verify(true);
        mutate(p);
        assert.throws(() => h.verify(false));
    }
    const rejected = harness();
    rejected.input.platform = "linux";
    assert.throws(() => rejected.verify(true));
    assert.equal(rejected.children, 0);
});

test("actual restore keeps original API, archive, producer, build, source and image checks with env-specific capture only", async () => {
    const old = await import(
        pathToFileURL(resolve("scripts/http-startup-plan.mjs")).href
    );
    const text = readFileSync("scripts/http-startup.mjs", "utf8");
    const body = text.slice(
        text.indexOf("export async function restore("),
        text.indexOf("// All inspector processes"),
    );
    async function restore(mutate: (v: any) => void = () => {}) {
        const r = old.retained;
        const v: any = {
            artifact: {
                id: r.artifact,
                expired: false,
                digest: `sha256:${r.zipHash}`,
                size_in_bytes: 3,
                workflow_run: { id: r.run },
            },
            run: { head_sha: r.head, conclusion: "failure" },
            origin: {
                verified: true,
                errors: [],
                repository: "40oleg/nona",
                checkout: { head: r.head, expectedHead: r.head, tree: r.tree },
                workflow: { runId: r.run },
                dependency: { isAncestor: true, commit: "pin" },
            },
            trial: {
                sha: r.head,
                runtime: "nona",
                gc: "stress",
                fixture: "reference",
                imageHash: r.imageHash,
                sourceHash: r.sourceHash,
            },
            control: { runtime: "node", sourceHash: r.sourceHash },
            spawn: { event: "spawn", args: ["retained/reference.mjs"] },
            build: { code: 0, reason: null, error: null, signal: null },
            inventory: [{ path: "reference.mjs", bytes: 10, attributes: 0 }],
            zipHash: r.zipHash,
            sourceHash: r.sourceHash,
            imageHash: r.imageHash,
            assembly: true,
        };
        mutate(v);
        const helpers: any[] = [];
        const restore = runInNewContext(
            body.replace("export ", "") + "\nrestore",
            {
                retained: r,
                process: {
                    env: {
                        GH_TOKEN: "fake-nonsecret",
                        STARTUP_MODE: "env-602",
                    },
                },
                Buffer,
                AbortSignal,
                fetch: async (url: string) => ({
                    ok: true,
                    json: async () =>
                        url.endsWith(`/artifacts/${r.artifact}`)
                            ? v.artifact
                            : v.run,
                    body: (async function* () {
                        yield Buffer.from("zip");
                    })(),
                }),
                join: (...parts: string[]) => parts.join("/"),
                save() {},
                writeFileSync() {},
                read: (file: string) =>
                    file.endsWith("zip-inventory/stdout.log")
                        ? v.inventory
                        : file.endsWith("provenance.json")
                          ? v.origin
                          : file.endsWith("trial-3/trial.json")
                            ? v.trial
                            : file.endsWith("trial-1/trial.json")
                              ? v.control
                              : v.build,
                readFileSync: () => JSON.stringify(v.spawn) + "\n",
                existsSync: () => v.assembly,
                hashFile: (file: string) =>
                    file.endsWith(".zip")
                        ? v.zipHash
                        : file.endsWith(".exe")
                          ? v.imageHash
                          : file.endsWith(".mjs")
                            ? v.sourceHash
                            : "assembly-hash",
                validateZipInventory: old.validateZipInventory,
                dependencyStatus: () => ({ commit: "pin" }),
                startupChildEnv: () => ({ STARTUP_MODE: "env-602" }),
                execFileSync: () => Buffer.from("original build source"),
                git: () => "original src tree",
                captureText: () => {
                    throw Error("default capture must not be used");
                },
            },
        );
        const result = await restore(
            "output",
            new AbortController().signal,
            async (command: string, args: string[]) => {
                helpers.push([command, args]);
                return {
                    code: 0,
                    reason: null,
                    error: null,
                    dropped: { stdout: 0, stderr: 0 },
                };
            },
        );
        assert.deepEqual(
            helpers.map((h) => h[1][3]),
            ["inventory", "extract"],
        );
        assert.equal(
            result.binary,
            "output/retained/reference-stress/nona-http.exe",
        );
    }
    await restore();
    for (const mutate of [
        (v: any) => {
            v.artifact.id = "wrong";
        },
        (v: any) => {
            v.artifact.expired = true;
        },
        (v: any) => {
            v.artifact.workflow_run.id = "wrong";
        },
        (v: any) => {
            v.artifact.digest = "wrong";
        },
        (v: any) => {
            v.artifact.size_in_bytes = 33 * 1024 * 1024;
        },
        (v: any) => {
            v.run.head_sha = "wrong";
        },
        (v: any) => {
            v.run.conclusion = "success";
        },
        (v: any) => {
            v.zipHash = "wrong";
        },
        (v: any) => {
            v.origin.checkout.tree = "wrong";
        },
        (v: any) => {
            v.origin.checkout.head = "wrong";
        },
        (v: any) => {
            v.origin.verified = false;
        },
        (v: any) => {
            v.origin.dependency.isAncestor = false;
        },
        (v: any) => {
            v.build.code = 1;
        },
        (v: any) => {
            v.sourceHash = "wrong";
        },
        (v: any) => {
            v.imageHash = "wrong";
        },
        (v: any) => {
            v.assembly = false;
        },
        (v: any) => {
            v.inventory[0].path = "../unsafe";
        },
    ])
        await assert.rejects(restore(mutate));
});

test("actual driver retains six attempted outcomes after timeouts and operational errors, and reports all missing on abort", async () => {
    const old = await import(
        pathToFileURL(resolve("scripts/http-startup-plan.mjs")).href
    );
    const text = readFileSync("scripts/http-startup-env-boundary.mjs", "utf8");
    const body = text.slice(
        text.indexOf("async function main()"),
        text.lastIndexOf("\nif ("),
    );
    async function run(abort = false) {
        const storage: any = {};
        const attempted: string[] = [];
        let cleanups = 0;
        const listeners: Record<string, () => void> = {};
        const parent = { ...env, PATH: "safe" };
        const b = api.blockMetrics(api.baseEnvironment(parent));
        const p = {
            driver: { head, tree: "b".repeat(40) },
            workflow: { runId: "123", runAttempt: "1" },
            parentAggregate: { keys: b.keys + 5, units: b.units + 700 },
        };
        const processFake: any = {
            argv: ["node", "driver"],
            pid: 8,
            env: parent,
            execPath: "node.exe",
            once(event: string, fn: () => void) {
                listeners[event] = fn;
            },
            removeListener() {},
        };
        const main = runInNewContext(body + "\nmain", {
            ...api,
            process: processFake,
            verify: () => p,
            output: "output",
            join: (...parts: string[]) => parts.join("/"),
            retained: old.retained,
            save: (file: string, value: any) => {
                storage[file] = structuredClone(value);
            },
            read: (file: string) =>
                file.endsWith("retained-verification.json")
                    ? { verified: true, assemblyHash: "assembly" }
                    : [],
            restore: async (_o: any, signal: AbortSignal) => {
                if (abort) {
                    listeners.SIGTERM!();
                    assert.equal(signal.aborted, true);
                    throw Error("interrupted restore");
                }
                return { source: "source.mjs", binary: "nona-http.exe" };
            },
            hashFile: (file: string) =>
                file.endsWith(".asm")
                    ? "assembly"
                    : file === "source.mjs"
                      ? old.retained.sourceHash
                      : old.retained.imageHash,
            readFileSync: () => "pinned-source",
            serverSource: () => "pinned-source",
            captureText() {},
            startupChildEnv: () => ({}),
            existsSync: () => false,
            register() {},
            ownership() {
                cleanups++;
            },
            runTrial: async (spec: any) => {
                attempted.push(spec.id);
                if (attempted.length === 2) throw Error("fake spawn failure");
                return { verdict: "startup-timeout" };
            },
            trialEvidence: () => ({
                passed: false,
                errors: ["startup-timeout"],
            }),
            AbortController,
            Date,
            setTimeout: () => 0,
            clearTimeout() {},
            setInterval: () => 0,
            clearInterval() {},
        });
        await main();
        const report = storage["output/env-boundary.json"];
        assert.equal(cleanups, 1);
        assert.equal(report.productFix, false);
        assert.equal(report.full57Accepted, false);
        assert.equal(processFake.exitCode, 1);
        return { report, attempted };
    }
    const normal = await run();
    assert.deepEqual(
        normal.attempted,
        api.envPlan().map((p: any) => p.id),
    );
    assert.equal(normal.report.results.length, 6);
    assert.equal(normal.report.results[1].status, "operational-failure");
    const aborted = await run(true);
    assert.equal(aborted.attempted.length, 0);
    assert.equal(aborted.report.missing.length, 6);
    assert.equal(aborted.report.interruption, "SIGTERM");
});
test("env admission is distinct and rejects bad identities before work", () => {
    assert.equal(typeof api.envAllowed, "function");
    assert.equal(api.envAllowed(env, head, "win32", "x64", "v26.9.0"), true);
    for (const [key, value] of Object.entries({
        GITHUB_ACTIONS: "false",
        GITHUB_REPOSITORY: "foreign/nona",
        GITHUB_EVENT_NAME: "push",
        GITHUB_SHA: "b".repeat(40),
        GITHUB_WORKFLOW_SHA: "b".repeat(40),
        GITHUB_WORKFLOW_REF: "wrong",
        GITHUB_REF: "refs/heads/main",
        STARTUP_MODE: "startup-602",
        STARTUP_EXPECTED_SHA: "",
        GITHUB_RUN_ID: "",
        GITHUB_RUN_ATTEMPT: "0",
        RUNNER_ENVIRONMENT: "self-hosted",
        RUNNER_OS: "Linux",
    }))
        assert.equal(
            api.envAllowed(
                { ...env, [key]: value },
                head,
                "win32",
                "x64",
                "v26.9.0",
            ),
            false,
            key,
        );
    for (const args of [
        ["linux", "x64", "v26.9.0"],
        ["win32", "arm64", "v26.9.0"],
        ["win32", "x64", "v26.8.0"],
    ])
        assert.equal(api.envAllowed(env, head, ...args), false);
});
test("generated conditions preserve safe base exactly and isolate count at equal UTF16 volume", () => {
    assert.equal(typeof api.conditions, "function");
    const parent = {
        ...env,
        PATH: "safe",
        GH_TOKEN: "private",
        NODE_OPTIONS: "evil",
        DIAG_STATE: "evil",
        EXTRA: "x".repeat(800),
    };
    const base = api.baseEnvironment(parent);
    const b = api.blockMetrics(base);
    const target = { keys: b.keys + 8, units: b.units + 1000 };
    const c = api.conditions(parent, target);
    assert.deepEqual(
        c.map((x: any) => x.id),
        ["base", "many", "few"],
    );
    assert.deepEqual(c[1].metrics, target);
    assert.equal(c[2].metrics.units, target.units);
    assert.equal(c[2].metrics.keys, b.keys + 1);
    const capped = api.conditions(parent, { keys: b.keys + 256, units: 32767 });
    assert.deepEqual(capped[1].metrics, { keys: b.keys + 256, units: 32767 });
    assert.equal(capped[2].metrics.units, 32767);
    for (const condition of c) {
        for (const [key, value] of Object.entries(base))
            assert.equal(condition.env[key], value);
        assert.equal(condition.env.GH_TOKEN, undefined);
        assert.equal(condition.env.NODE_OPTIONS, undefined);
        assert.equal(condition.env.EXTRA, undefined);
        assert.equal(condition.env.DIAG_STATE, "keepalive");
    }
    assert.deepEqual(api.blockMetrics({ Path: "😀" }), { keys: 1, units: 9 });
    for (const target of [
        { keys: b.keys + 1, units: b.units + 1000 },
        { keys: b.keys + 257, units: b.units + 10000 },
        { keys: b.keys + 8, units: b.units + 1 },
        { keys: b.keys + 8, units: 32768 },
        { keys: NaN, units: 1000 },
        { keys: 1.5, units: 1000 },
        { keys: -1, units: 1000 },
        { keys: b.keys + 8, units: -1 },
        { keys: b.keys + 8, units: b.units + 0.5 },
        {},
        { keys: b.keys + 8, units: Infinity },
    ])
        assert.throws(() => api.conditions(parent, target));
    assert.throws(() =>
        api.conditions({ ...parent, NONA_ENV602_000: "collision" }, target),
    );
    for (const bad of [
        { Path: "a", PATH: "b" },
        { é: "x" },
        { "a=b": "x" },
        { "a\0": "x" },
    ])
        assert.throws(() => api.blockMetrics(bad));
});
