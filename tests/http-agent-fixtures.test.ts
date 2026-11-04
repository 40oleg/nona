// Small Node/source checks only: importing these fixtures never compiles Nona.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { agentCases } from "./helpers/http-agent-cases.js";
import { agentProgram, effectiveAgentGC } from "./helpers/http-agent-policy.js";

test("Agent cleanup survives the measured 42250ms forced-GC startup and respects GC selection", () => {
    // Execute the generator's actual selection prefix without compiling a
    // program or loading the compiler/runtime. A selection-rule change must
    // agree with the fixture policy, including explicit normal controls.
    const codegen = readFileSync("src/backend/x64/codegen.ts", "utf8");
    const disabled = codegen.slice(
        codegen.indexOf("const gcStressDisabled ="),
        codegen.indexOf(";", codegen.indexOf("const gcStressDisabled =")) + 1,
    );
    const start = codegen.indexOf(
        "    if (options.gcStress && gcStressDisabled)",
    );
    const selection = codegen.slice(
        start,
        codegen.indexOf("    if (!options.callStats", start),
    );
    assert.ok(disabled && selection);
    for (const [setting, requested, want] of [
        [undefined, true, true],
        ["on", true, true],
        ["off", true, false],
        ["OFF", true, true],
        [undefined, false, false],
        ["on", false, false],
        ["off", false, false],
    ] as const) {
        const generatedGC = runInNewContext(
            `${disabled}\nlet options = { gcStress: ${requested} };\n${selection}\noptions.gcStress`,
            { process: { env: { NONA_GC_STRESS: setting } } },
        );
        assert.equal(generatedGC, want);
        assert.equal(effectiveAgentGC(requested, setting), want);
        const timers: { callback: () => void; delay: number }[] = [];
        let cleaned = false;
        let observed = "";
        const program = agentProgram(
            {
                source: "fixture('normal'); cleanupWatchdog(cleanup);",
                stressSource: "fixture('staged'); cleanupWatchdog(cleanup);",
            },
            requested,
            setting,
        );
        assert.equal(program.options.gcStress, requested);
        runInNewContext(program.source, {
            fixture: (mode: string) => {
                observed = mode;
            },
            cleanup: () => {
                cleaned = true;
            },
            setTimeout: (callback: () => void, delay: number) =>
                timers.push({ callback, delay }),
        });
        // Replay the hosted startup clock: no queued request exists yet.
        for (const timer of timers) if (timer.delay <= 42_250) timer.callback();
        assert.equal(
            cleaned,
            !want,
            `requested=${requested}, selection=${setting}`,
        );
        assert.equal(observed, want ? "staged" : "normal");
        assert.deepEqual(
            timers.map((timer) => timer.delay),
            want ? [] : [6000],
        );
        timers.length = 0;
        cleaned = false;
        observed = "";
        runInNewContext(program.options.oracleSource, {
            fixture: (mode: string) => {
                observed = mode;
            },
            cleanup: () => {
                cleaned = true;
            },
            setTimeout: (callback: () => void, delay: number) =>
                timers.push({ callback, delay }),
        });
        assert.equal(
            observed,
            "normal",
            "The oracle keeps the original API fixture",
        );
        assert.deepEqual(
            timers.map((timer) => timer.delay),
            [6000],
        );
        timers[0]!.callback();
        assert.equal(cleaned, true);
    }
});

test("Agent witnesses cover each original parameter tuple in its own program", () => {
    const wanted = ["creation-failure"];
    for (const phase of ["connecting", "connected"])
        for (const action of [
            "destroy",
            "error",
            "abort",
            "socket-destroy",
            "socket-error",
            "agent-destroy",
        ])
            wanted.push(`assigned/${phase}/${action}`);
    wanted.push("origins/1", "origins/2");
    for (const mode of ["pending", "deferred", "socket"])
        for (const action of ["error", "destroy", "abort"])
            wanted.push(`cancel/${mode}/${action}`);
    wanted.push(
        "retained-contexts",
        "release/peer-close",
        "release/refused",
        "release/destroy",
        "detach/connect",
        "detach/upgrade",
        "idle-timeout",
        "idle-unref",
    );
    assert.deepEqual(
        agentCases.map((witness) => witness.id),
        wanted,
    );
    assert.equal(
        new Set(agentCases.map((witness) => witness.name)).size,
        wanted.length,
    );
    assert.deepEqual(
        agentCases
            .filter((witness) => witness.control)
            .map((witness) => witness.id),
        ["origins/1", "origins/2", "idle-timeout", "idle-unref"],
    );
});

for (const witness of agentCases)
    for (const staged of witness.stressSource ? [false, true] : [false])
        test(`Agent Node 26 control: ${witness.id}${staged ? " (staged idle deadline)" : ""}`, () => {
            // Run both idle fixture variants with normal cleanup guards in Node;
            // the staged variant is still compiled with stress by the native test.
            const program = agentProgram(
                { source: staged ? witness.stressSource! : witness.source },
                false,
                undefined,
            );
            const run = spawnSync(
                process.execPath,
                ["--input-type=module", "-e", program.source],
                {
                    encoding: "utf8",
                    timeout: 60_000,
                    windowsHide: true,
                },
            );
            assert.ifError(run.error);
            assert.equal(run.status, 0, run.stderr + run.stdout);
            assert.equal(run.signal, null);
            assert.equal(run.stderr, "");
            // Missing invocations, accidental batches and dropped observations all
            // change this exact per-case transcript, not just a coverage counter.
            assert.equal(run.stdout, witness.expected.join("\n") + "\n");
        });

test("staged idle-unref witness still detects a referenced real client socket", () => {
    const witness = agentCases.find((witness) => witness.id === "idle-unref")!;
    // Inject only the public keepSocketAlive decision, retaining real loopback
    // I/O. If staging accidentally unreferences the client itself, this loses
    // its original 2000ms watchdog and exits successfully instead of failing.
    const source =
        `import controlHttp from 'node:http';
class ReferencedAgent extends controlHttp.Agent {
    keepSocketAlive(socket) {
        const keep = super.keepSocketAlive(socket);
        socket.ref();
        return keep;
    }
}
` + witness.stressSource!.replaceAll("http.Agent", "ReferencedAgent");
    const program = agentProgram({ source }, false, undefined);
    const run = spawnSync(
        process.execPath,
        ["--input-type=module", "-e", program.source],
        {
            encoding: "utf8",
            timeout: 60_000,
            windowsHide: true,
        },
    );
    assert.ifError(run.error);
    assert.equal(run.signal, null);
    assert.equal(run.status, 1, run.stderr + run.stdout);
    assert.equal(run.stderr, "");
    assert.equal(
        run.stdout,
        "body unref\nidle unref ready 1\nwatchdog idle unref 1 0 1 1\n",
    );
});
