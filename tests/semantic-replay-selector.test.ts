// Source/AST selection only: no compile(), IR lowering or native emission.
import { test } from "node:test";
import assert from "node:assert/strict";
import { collectSourceUsage, lex } from "../src/frontend/lexer.js";
import { parse } from "../src/frontend/parser.js";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const { loadInventory, selectorContracts } = await import(
    pathToFileURL(resolve("scripts/semantic-replay/inventory.mjs")).href
);
function selected(source: string, goal: string, part: string) {
    const module = goal === "module";
    const { usage } = collectSourceUsage(() =>
        parse(lex(source, { module }), { module }),
    );
    return part === "regexp" ? usage.regexp : usage.preludes.proxy;
}
test("replay retains every original T01 numeric AST assertion and T02 parameter selection", () => {
    assert.equal(selectorContracts.length, 44);
    for (const c of selectorContracts)
        assert.equal(selected(c.source, c.goal, c.part), c.present, c.id);
    for (const c of loadInventory("pr"))
        if (c.selector)
            assert.equal(
                selected(c.files[c.entry], c.goal, c.selector.part),
                c.selector.present,
                c.id,
            );
});

test("every finite AST peer preserves the original selector result", () => {
    const cases = loadInventory("pr");
    for (const c of selectorContracts) {
        const peer = cases.find(
            (item: { id: string }) => item.id === c.semanticId,
        );
        assert.equal(
            selected(peer.files[peer.entry], peer.goal, c.part),
            c.present,
            c.id,
        );
    }
});

test("builtin selection in real module graphs comes from the imported source", () => {
    for (const c of loadInventory("pr").filter(
        (c: { family: string }) => c.family === "graph",
    )) {
        assert.equal(
            selected(c.files[c.entry], c.goal, c.link[0]),
            false,
            `${c.id}: entry`,
        );
        assert.equal(
            selected(c.files["scope.mjs"], c.goal, c.link[0]),
            true,
            `${c.id}: dependency`,
        );
    }
});
