import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { preludeHelpers } from "../src/runtime/async.js";

// The intrinsic namespace (__nonaRegexpVm, docs/intrinsics.md, #183): the
// JavaScript preludes and the native runtime share helpers through members
// of one prelude global. A member read under a name nothing defines is an
// undefined call at run time; these checks catch a renamed or removed helper
// at build time.
const sourceDirectories = [
    "src/lib/runtime",
    "src/runtime",
    "src/backend/x64",
    "src/frontend",
];
const name = "[A-Za-z_$][\\w$]*";
function intrinsicManifest() {
    const defined = new Map<string, Set<string>>(),
        read = new Map<string, Set<string>>();
    const add = (map: Map<string, Set<string>>, key: string, file: string) => {
        if (!map.has(key)) map.set(key, new Set());
        map.get(key)!.add(file);
    };
    for (const directory of sourceDirectories)
        for (const entry of readdirSync(directory)) {
            if (!/\.(js|ts)$/.test(entry) || entry.includes(".generated."))
                continue;
            const file = join(directory, entry),
                text = readFileSync(file, "utf8");
            // Prelude fragments spliced into a function that binds vm use it
            // without a binding of their own (stream-consumers.js).
            const fragment =
                directory === "src/lib/runtime" &&
                !text.includes("__nonaRegexpVm") &&
                /(?<![\w$.])vm\./.test(text);
            if (!text.includes("__nonaRegexpVm") && !fragment) continue;
            // Local names bound to the namespace: var vm = __nonaRegexpVm.
            const aliases = new Set(["__nonaRegexpVm"]);
            if (fragment) aliases.add("vm");
            for (const match of text.matchAll(
                new RegExp(
                    `\\b(${name})\\s*=\\s*__nonaRegexpVm\\b(?![.\\w$])`,
                    "g",
                ),
            ))
                aliases.add(match[1]!);
            for (const alias of aliases) {
                const escaped = alias.replaceAll("$", "\\$");
                for (const match of text.matchAll(
                    new RegExp(
                        `(?<![\\w$.])${escaped}\\.(${name})(\\s*=(?!=))?`,
                        "g",
                    ),
                ))
                    add(match[2] ? defined : read, match[1]!, file);
                for (const match of text.matchAll(
                    new RegExp(
                        `defineProperty\\(\\s*${escaped}\\s*,\\s*['"](${name})['"]`,
                        "g",
                    ),
                ))
                    add(defined, match[1]!, file);
            }
        }
    return { defined, read };
}

test("every intrinsic a prelude or the runtime reads is defined", () => {
    const { defined, read } = intrinsicManifest();
    assert.ok(defined.size > 100, `${defined.size} intrinsics found`);
    const missing = [...read.keys()]
        .filter((key) => !defined.has(key) && key !== "NAME")
        .map((key) => `${key} (${[...read.get(key)!].join(", ")})`);
    assert.deepEqual(missing, []);
});

test("every rt.prelude stub calls an intrinsic a prelude defines", () => {
    const { defined } = intrinsicManifest();
    assert.deepEqual(
        preludeHelpers.filter((helper) => !defined.has(helper)),
        [],
    );
});
