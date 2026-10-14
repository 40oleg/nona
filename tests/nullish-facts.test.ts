import { test } from "node:test";
import assert from "node:assert/strict";
import { compileToIR } from "../src/compiler.js";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// Path-sensitive "not nullish" facts (#237).
const nullishTests = (source: string, name: string) =>
    compileToIR(source)
        .functions.filter((fn) => fn.name === name)
        .flatMap((fn) => fn.blocks.flatMap((block) => block.operations))
        .filter((op) => op.kind === "unary" && op.operator === "isNullish")
        .length;

test("a tested value needs no second nullish test", () => {
    const cases: [string, number][] = [
        [
            "function f(x, d) { if (x === null || x === undefined) return d; return x?.value; }",
            0,
        ],
        // Only the ?? test of the property value is left.
        ["function f(x) { if (x == null) return 0; return x?.value ?? 1; }", 1],
        ["function f(x) { if (x != null) return x?.value; return 2; }", 0],
        [
            "function f(x) { if (typeof x === 'string') return x?.length; return -1; }",
            0,
        ],
        ["function f(x) { const o = { x }; return o?.x; }", 0],
        // Undefined is still possible, or the slot changed, or a property.
        ["function f(x) { if (x === null) return 0; return x?.y; }", 1],
        [
            "function f(x, y) { if (x == null) return 0; x = y; return x?.v; }",
            1,
        ],
        ["function f(x) { if (x != null) return x.foo?.(); }", 1],
        ["function f(x) { if (typeof x === 'object') return x?.k; }", 1],
    ];
    for (const [source, expected] of cases)
        assert.equal(
            nullishTests(source + "\nconsole.log(f);", "f"),
            expected,
            source,
        );
});

test("folded nullish tests keep their results", () => {
    const source = `const out = [];
function f(x, d) { if (x === null || x === undefined) return d; return x?.value; }
out.push(f(null, "d"), f(undefined, "d"), f({ value: 1 }, "d"), f(0, "d"), f("", "d"));
function reassigned(x, y) { if (x == null) return "early"; x = y; return x?.v ?? "nullish"; }
out.push(reassigned(1, null), reassigned(1, { v: 2 }), reassigned(null, 3));
function strictNull(x) { if (x === null) return "null"; return x?.y ?? "undef"; }
out.push(strictNull(null), strictNull(undefined), strictNull({ y: 4 }));
function closure(x) { const set = () => { x = null; }; if (x != null) { set(); return x?.k ?? "cleared"; } return "none"; }
out.push(closure({ k: 5 }), closure(null));
function viaEval(x) { if (x != null) { eval("x = undefined"); return x?.k ?? "eval cleared"; } return "none"; }
out.push(viaEval({ k: 6 }));
let reads = 0; const holder = { get p() { reads++; return reads > 1 ? null : { q: 7 }; } };
function getter(o) { if (o.p != null) return o.p?.q ?? "getter nullish"; return "none"; }
out.push(getter(holder), reads);
function args(x) { if (x != null) { arguments[0] = null; return x?.k ?? "arguments cleared"; } return "none"; }
out.push(args({ k: 8 }));
function typeofs(x) { if (typeof x === "function") return x?.name; if (typeof x !== "undefined") return x?.length ?? "has no length"; return x?.length ?? "undef"; }
out.push(typeofs(function named() {}), typeofs("abc"), typeofs(null), typeofs(undefined), typeofs(5));
console.log(out.map(String).join(","));`;
    const run = runOnHost(source);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
});
