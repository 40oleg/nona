import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compile } from "../src/compiler.js";
import { runInNewContext } from "node:vm";
import { guiManagedSource } from "./helpers/gui-native.js";

test("GUI window fixture starts its lifecycle deadline after synchronous initialization", () => {
    const source = readFileSync("tests/fixtures/gui-window.mjs", "utf8")
        .replace(/^import .*;\r?\n/gm, "")
        .replace(/^import \{[\s\S]*?;\r?\n/gm, "");
    let now = 0;
    const deadlines: number[] = [];
    class Window {
        open() {
            now += 3000;
            return this;
        }
    }
    runInNewContext(source, {
        Window,
        define: () => () => 0,
        spawn: () => ({ stdout: { on() {} }, on() {} }),
        process: { on() {} },
        setTimeout(_callback: unknown, delay: number) {
            deadlines.push(now + delay);
        },
        setInterval() {},
    });
    assert.deepEqual(deadlines, [10000]);
});

test("GUI workflow limits issue-specific metadata requirements to the issue PR", async () => {
    const workflow = readFileSync(".github/workflows/gui-desktop.yml", "utf8");
    const script = workflow.match(
        /script: \|\r?\n([\s\S]*?)\r?\n    desktop:/,
    )![1]!;
    const execute = new Function(
        "github",
        "context",
        "core",
        "return (async () => {\n" + script + "\n})();",
    );
    for (const [head, body, labels, milestone, expected] of [
        ["issue-900-bug", "Closes #900", ["bug"], 99, false],
        [
            "nona/issue-664",
            "Closes #664",
            ["enhancement", "complex", "full-ci", "gc-stress"],
            32,
            false,
        ],
        [
            "nona/issue-664",
            "Closes #664",
            ["enhancement", "complex", "full-ci"],
            32,
            true,
        ],
        [
            "feature",
            "Part of #664",
            ["enhancement", "complex", "full-ci", "gc-stress"],
            99,
            true,
        ],
    ] as const) {
        const failures: string[] = [];
        const github = {
            rest: {
                pulls: {
                    get: async () => ({
                        data: {
                            head: { ref: head },
                            body,
                            labels: labels.map((name) => ({ name })),
                            milestone: { number: milestone },
                        },
                    }),
                },
                issues: {
                    get: async () => ({
                        data: { milestone: { number: 32, title: "v0.37.0" } },
                    }),
                },
            },
        };
        await execute(
            github,
            { repo: {}, issue: { number: 1 } },
            {
                info() {},
                setFailed: (message: string) => failures.push(message),
            },
        );
        assert.equal(
            failures.length > 0,
            expected,
            head + ": " + failures.join(", "),
        );
    }
});

test("GUI acceptance layout matches independent logical and device fixtures", () => {
    const sample = readFileSync("site/samples/gui.linux.mjs", "utf8").replace(
        /^import .*;\r?\n/gm,
        "",
    );
    const context: any = {
        TextEncoder,
        TextDecoder,
        performance: { now: () => 0 },
        process: { pid: 42, env: {}, execPath: "/app/desktop" },
        console: { log() {} },
        setTimeout() {},
        setInterval() {},
        spawn: () => ({ stdout: { on() {} }, on() {} }),
        __nonaIoLoop() {},
        __nonaGui(packet: Uint32Array) {
            if (packet[0] === 1) {
                packet[1] = 0;
                packet[2] = 1;
            }
            return 0;
        },
    };
    runInNewContext(
        guiManagedSource +
            "\n" +
            sample +
            "\nglobalThis.observed = {input:input.bounds,log:log.bounds,drawing:art.bounds};",
        context,
    );
    const fixture = JSON.parse(
        readFileSync("tests/fixtures/gui/desktop-layout.json", "utf8"),
    );
    for (const [name, expected] of Object.entries(fixture.logical)) {
        const actual = ["x", "y", "width", "height"].map(
            (k) => context.observed[name][k],
        );
        assert.deepEqual(actual, expected, name);
        for (const scale of [1, 2])
            assert.deepEqual(
                actual.map((v) => v * scale),
                fixture.device[scale][name],
            );
    }
});

for (const gcStress of [false, true]) {
    test(`GUI acceptance application and headless probe compile (GC ${gcStress})`, () => {
        for (const file of [
            "site/samples/gui.linux.mjs",
            "tests/fixtures/gui/no-display.mjs",
        ]) {
            const result = compile(readFileSync(file, "utf8"), {
                fileName: resolve(file),
                target: "linux-x64",
                gcStress,
            });
            assert.ok(result.ok, JSON.stringify(result));
            assert.equal(
                Buffer.from(result.image.subarray(0, 4)).toString("hex"),
                "7f454c46",
            );
        }
    });
}
