import { test } from "node:test";
import assert from "node:assert/strict";
import { compile } from "../src/compiler.js";
import { expectProgram } from "./helpers/program.js";

const line = "#!/usr/bin/env node\n";
const body = 'console.log("hi");\n';

test("a script starting with a hashbang compiles and runs", () => {
    expectProgram(line + body, "hi\n");
});

test("a module starting with a hashbang compiles", () => {
    const result = compile(line + body, {
        fileName: "/hb.mjs",
        target: "linux-x64",
        module: true,
    });
    assert.equal(result.ok, true);
});

test("a hashbang that is not at offset 0 is rejected", () => {
    for (const module of [false, true]) {
        const result = compile("\n" + line + body, {
            fileName: module ? "/hb.mjs" : "/hb.js",
            target: "linux-x64",
            module,
        });
        assert.equal(result.ok, false);
        if (result.ok) return;
        assert.match(result.diagnostics[0]!.message, /Unsupported character/);
        assert.equal(result.diagnostics[0]!.span.start, 1);
    }
});

test("a hashbang keeps the offsets of later diagnostics", () => {
    const source = "let x = 1;\nlet x = 2;\n";
    const plain = compile(source, { fileName: "/a.js", target: "linux-x64" });
    const withLine = compile(line + source, {
        fileName: "/a.js",
        target: "linux-x64",
    });
    assert.equal(plain.ok, false);
    assert.equal(withLine.ok, false);
    if (plain.ok || withLine.ok) return;
    assert.equal(
        withLine.diagnostics[0]!.span.start,
        plain.diagnostics[0]!.span.start + line.length,
    );
});
