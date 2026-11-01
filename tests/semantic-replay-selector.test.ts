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
