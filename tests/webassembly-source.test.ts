import { test } from "node:test";
import assert from "node:assert/strict";
import { createContext, runInContext } from "node:vm";
import { readFileSync } from "node:fs";
import { wasmPreludeSource } from "../src/runtime/wasm-source.js";
import { collectSourceUsage, lex } from "../src/frontend/lexer.js";
import { parse } from "../src/frontend/parser.js";
import { linkedPreludes } from "../src/backend/x64/preludes.js";
import {
    functionModule,
    callbackModule,
    memoryModule,
    indirectModule,
    controlModule,
    bulkModule,
    accessModule,
    tableModule,
    i32,
    i64,
    f32,
    moduleBytes,
    section,
    vec,
    type,
    body,
    exported,
    name,
} from "./helpers/wasm.js";

function engine() {
    const context = createContext({
        __nonaRegexpVm: {
            arrayBufferDetach: (buffer: ArrayBuffer) =>
                structuredClone(buffer, { transfer: [buffer] }),
        },
        TextDecoder,
    });
    runInContext(wasmPreludeSource, context);
    return context;
}

test("WebAssembly links only when named, with binary data and encoding dependencies", () => {
    const collect = (s: string) =>
        collectSourceUsage(() => parse(lex(s))).usage;
    assert.equal(collect("console.log(1)").preludes.webAssembly, false);
    assert.equal(collect("WebAssembly.compile(b)").preludes.webAssembly, true);
    assert.equal(
        collect('globalThis["WebAssembly"]').preludes.webAssembly,
        true,
    );
    const linked = linkedPreludes(collect("WebAssembly.compile(b)"));
    for (const name of ["webAssembly", "binaryData", "encoding"])
        assert.ok(linked.includes(name as (typeof linked)[number]));
});

test("WebAssembly validator rejects truncated/overlong resources, wrong types, indices and control stacks", () => {
    const valid = functionModule([i32], [i32], [32, 0]);
    const malformed = [
        moduleBytes(section(5, [1, 128, 0, 0])),
        moduleBytes(section(4, [1, 112, 128, 0, 0])),
        moduleBytes(
            section(2, vec([[...name("e"), ...name("m"), 2, 128, 0, 0]])),
        ),
        moduleBytes(
            section(2, vec([[...name("e"), ...name("t"), 1, 112, 128, 0, 0]])),
        ),
        ...valid
            .map((_, i) => valid.slice(0, i))
            .filter((b) => !WebAssembly.validate(new Uint8Array(b))),
        [...moduleBytes(), 1, 128, 128, 128, 128, 16],
        [...moduleBytes(), 1, 128, 128, 128, 128, 128, 0],
        moduleBytes(section(0, [1, 255])), // non-UTF8 name
        moduleBytes(section(1, [0]), section(1, [0])),
        moduleBytes(section(5, [1, 1, 2, 1])),
        moduleBytes(section(7, vec([exported("x", 0, 0)]))),
        moduleBytes(section(8, [0])),
        functionModule([], [i32], [66, 0]),
        functionModule([], [], [2, 64, 65, 0, 11]),
        functionModule([], [], [5]),
        functionModule([], [], [65, 0, 4, 64, 5, 5, 11]),
        functionModule([], [], [0, 66, 0, 106, 26]),
        functionModule([], [i32], [65, 0, 4, i32, 65, 1, 11]),
        functionModule([], [], [65, 128, 128, 128, 128, 8, 26]),
        functionModule(
            [],
            [],
            [66, 128, 128, 128, 128, 128, 128, 128, 128, 128, 2, 26],
        ),
        functionModule([], [], [208, 112, 208, 112, 65, 0, 27, 26]),
        functionModule([], [], [252, 8, 0, 0]),
        moduleBytes(
            section(1, vec([type([], [])])),
            section(3, vec([[0]])),
            section(5, vec([[0, 1]])),
            section(10, vec([body([65, 0, 40, 3, 0, 26])])),
        ),
        moduleBytes(
            section(
                6,
                vec([
                    [i32, 1, 65, 0, 11],
                    [i32, 0, 35, 0, 11],
                ]),
            ),
        ),
        moduleBytes(
            section(1, vec([type([], [])])),
            section(3, vec([[0]])),
            section(7, vec([exported("same", 0, 0), exported("same", 0, 0)])),
            section(10, vec([body([])])),
        ),
    ];
    const context = engine();
    for (const b of malformed) {
        const input = new Uint8Array(b);
        assert.equal(WebAssembly.validate(input), false, JSON.stringify(b));
        context.bytes = input;
        assert.equal(
            runInContext("WebAssembly.validate(bytes)", context),
            false,
            JSON.stringify(b),
        );
        assert.equal(
            runInContext(
                'try {new WebAssembly.Module(bytes); "accepted"}catch(e){e.name}',
                context,
            ),
            "CompileError",
        );
    }
    for (const b of [
        valid,
        functionModule([], [i64], [0]),
        functionModule([], [], [0, 106, 26]),
        functionModule([f32, f32, i32], [f32], [32, 0, 32, 1, 32, 2, 27]),
    ]) {
        assert.equal(WebAssembly.validate(new Uint8Array(b)), true);
        context.bytes = new Uint8Array(b);
        assert.equal(
            runInContext("WebAssembly.validate(bytes)", context),
            true,
        );
    }
});

test("redistributable WASM files reproduce their source fixtures exactly", () => {
    const fixtures = {
        callback: callbackModule,
        memory: memoryModule,
        indirect: indirectModule,
        control: controlModule,
        bulk: bulkModule,
        access: accessModule,
        table: tableModule,
    };
    for (const [name, bytes] of Object.entries(fixtures)) {
        const file = readFileSync("tests/fixtures/wasm/" + name + ".wasm");
        assert.deepEqual(file, Buffer.from(bytes));
        assert.equal(WebAssembly.validate(file), true, name);
    }
});

test("unsupported proposals fail closed instead of accepting unchecked instructions", () => {
    const context = engine();
    for (const ops of [
        [253, 12, ...new Array(16).fill(0), 26],
        [254, 0, 0, 0],
        [18, 0],
        [6, 64, 11],
    ]) {
        context.bytes = new Uint8Array(functionModule([], [], ops));
        assert.equal(
            runInContext("WebAssembly.validate(bytes)", context),
            false,
        );
    }
});
