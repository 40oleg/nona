import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { Readable, Writable } from "node:stream";
import { EventEmitter } from "node:events";
import { setImmediate } from "node:timers/promises";
import { runModulesOnHost } from "./helpers/host.js";

test("child stdout data handlers yield to native timers before the producer exits", () => {
    const source = `import { spawn } from 'node:child_process';
const child = spawn(${JSON.stringify(process.execPath)}, ['-e',
    'setInterval(() => process.stdout.write("x"), 1); setTimeout(() => process.exit(), 1500);'
], {windowsHide:true});
let reads=0;
child.stdout.on('data', () => {
    if (++reads === 1) setTimeout(() => {
        console.log('fair', reads < 10);
        child.kill();
    }, 0);
    const until=performance.now()+30;
    while(performance.now()<until) {}
});`;
    const { native, oracle } = runModulesOnHost(
        { "main.mjs": source },
        "main.mjs",
        { gcStress: false },
    );
    assert.equal(native.error, undefined);
    assert.equal(native.status, 0, native.stderr);
    assert.equal(oracle, "fair true\n");
    assert.equal(native.stdout, oracle);
});

test("child stdout yields to other pollers while a producer stays readable", async () => {
    const source = readFileSync(
        "src/lib/modules/child-process-common.js",
        "utf8",
    )
        .replace(/^import .*;\r?\n/gm, "")
        .replace(/^export default /gm, "void ")
        .replace(/^export /gm, "");
    let remaining = 32;
    const context: any = {
        Readable,
        Writable,
        EventEmitter,
        Buffer,
        sys: {
            READ: 1,
            WRITE: 2,
            EXIT: 4,
            read(_handle: number, buffer: Uint8Array) {
                if (remaining === 0) return 0;
                remaining--;
                buffer[0] = 120;
                return 1;
            },
            close() {},
            poll: () => [0],
        },
        __nonaIoLoop() {},
    };
    runInNewContext(
        source +
            "\nglobalThis.pipe = pipeReadable(42); globalThis.loop = poller;",
        context,
    );
    let output = "";
    context.pipe.on("data", (chunk: Buffer) => {
        output += chunk.toString();
    });
    // Put the real stream into flowing mode before the native readiness turn.
    await setImmediate();
    assert.equal(context.loop.poll(0), 1);
    context.loop.run(0);
    assert.equal(
        output,
        "x",
        "a continuously readable pipe must yield after a chunk",
    );
    assert.equal(context.loop.total(), 1, "remaining input must stay watched");
    while (context.loop.total()) {
        context.loop.poll(0);
        context.loop.run(0);
    }
    assert.equal(
        output,
        "x".repeat(32),
        "yielding must preserve all output through EOF",
    );
});
