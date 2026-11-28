// Opt-in decoder coverage of the pinned main module and all bundled side
// modules. This runs Nona's original source in Node, not native database boot.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { wasmPreludeSource } from "../../../dist/src/runtime/wasm-source.js";
import {
    packageDir,
    resources,
    verifiedFile,
    verifyPackage,
} from "./local-assets.mjs";

verifyPackage();
const context = createContext({ __nonaRegexpVm: {}, TextDecoder });
runInContext(wasmPreludeSource, context, { timeout: 1000 });
function check(bytes, name) {
    context.bytes = bytes;
    const expected = new WebAssembly.Module(bytes);
    const actual = JSON.parse(
        runInContext(
            `
        var mod=new WebAssembly.Module(bytes);
        JSON.stringify({imports:WebAssembly.Module.imports(mod),exports:WebAssembly.Module.exports(mod),
            dylink:WebAssembly.Module.customSections(mod,'dylink.0').map(function(b){return Array.from(new Uint8Array(b))})})
    `,
            context,
            { timeout: 30000 },
        ),
    );
    assert.deepEqual(
        actual,
        {
            imports: WebAssembly.Module.imports(expected),
            exports: WebAssembly.Module.exports(expected),
            dylink: WebAssembly.Module.customSections(expected, "dylink.0").map(
                (b) => Array.from(new Uint8Array(b)),
            ),
        },
        name,
    );
}
check(
    verifiedFile(
        join(packageDir, "dist/pglite.wasm"),
        resources.files["dist/pglite.wasm"],
    ),
    "pglite.wasm",
);
const data = verifiedFile(
    join(packageDir, "dist/pglite.data"),
    resources.files["dist/pglite.data"],
);
const glue = readFileSync(join(packageDir, "dist/pglite.js"), "utf8");
let count = 1;
for (const [, name, start, end] of glue.matchAll(
    /\{filename:"([^"]+)",start:(\d+),end:(\d+)\}/g,
)) {
    const bytes = data.subarray(Number(start), Number(end));
    if (!bytes.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109]))) continue;
    check(bytes, name);
    count++;
}
assert.equal(count, 29);
console.log(
    "Nona source decoder validated all 29 pinned WASM modules and matched Node metadata",
);
