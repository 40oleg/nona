import { test } from "node:test";
import assert from "node:assert/strict";
import { compile, compileToIR } from "../src/compiler.js";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";
import { switchTable } from "../src/ir/lower/control.js";
import type { Literal } from "../src/frontend/ast.js";

// Dense integer switches dispatch through a jump table (#241).
const switches = (source: string) =>
    compileToIR(source).functions.flatMap((fn) =>
        fn.blocks
            .map((block) => block.terminator)
            .filter((t) => t.kind === "switch"),
    );

test("switch semantics with a jump table match Node.js", () => {
    const source = `function kind(c) {
  switch (c) {
    case 48: case 49: case 50: case 51: return "digit-low";
    case 52: return "four";
    case 53: case 54: return "five-six";
    case 55: let t = "seven"; return t;
    case "1": return "string one";
    case 57: return "nine";
    case 48: return "duplicate";
    default: return "other";
    case 60: return "after default";
  }
}
const inputs = [48, 49, 52, 53, 55, 56, 57, 58, 59, 60, 61, -0, 0, 1.5, 48.5, NaN, Infinity, -Infinity, "1", "48", 1n, 48n, null, undefined, true, { valueOf() { return 48; } }, 2 ** 31, -48, 2 ** 32 + 48];
console.log(inputs.map((v) => kind(v)).join(","));
function fall(n) { const out = []; switch (n) { case 1: out.push("a"); case 2: out.push("b"); break; case 3: out.push("c"); default: out.push("d"); case 4: out.push("e"); case 5: out.push("f"); } return out.join(""); }
console.log([0, 1, 2, 3, 4, 5, 6, 3.5, "3"].map(fall).join(","));
function neg(n) { switch (n) { case -2: return "m2"; case -1: return "m1"; case -0: return "z"; case 1: return "p1"; case +2: return "p2"; } return "x"; }
console.log([-2, -1, -0, 0, 1, 2, 3, -3].map(neg).join(","));
function tdz(n) { try { switch (n) { case 1: return x; case 2: let x = "two"; return x; case 3: return "3"; case 4: x = 4; return x; } } catch (e) { return e.constructor.name; } return "none"; }
console.log([1, 2, 3, 4, 5].map(tdz).join(","));
let s = 0; for (let i = 0; i < 64; i++) switch (i & 7) { case 0: s += 1; break; case 1: s += 2; break; case 2: s += 4; break; case 3: s += 8; break; case 7: s += 16; }
console.log(s);`;
    const run = runOnHost(source);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
    // kind, fall, neg, tdz and the loop: all dense integer switches.
    assert.equal(switches(source).length, 5);
});

test("only literal case tests and dense ranges use a table", () => {
    const effectful = `let log = ""; function k(v) { log += v; return v; }
function f(n) { switch (n) { case 1: return "a"; case k(2): return "b"; case 3: return "c"; case 4: return "d"; case 5: return "e"; } return "x"; }
console.log([1, 2, 3, 5, 9].map(f).join(","), log);`;
    assert.equal(switches(effectful).length, 0);
    const run = runOnHost(effectful);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(effectful).stdout);
    // Three cases, or a sparse range: the compare chain stays.
    assert.equal(
        switches("switch (Math.random()) { case 1: case 2: case 3: break; }")
            .length,
        0,
    );
    assert.equal(
        switches(
            "switch (Math.random()) { case 1: case 200: case 4000: case 60000: break; }",
        ).length,
        0,
    );
    assert.equal(
        switches(
            "switch (Math.random()) { case 1: case 2: case 3: case 4: case 'x': case null: case 2n: break; }",
        ).length,
        1,
    );
});

test("the table is an indirect jump in the assembly", () => {
    const result = compile(
        "function f(n) { switch (n) { case 0: return 'a'; case 1: return 'b'; case 2: return 'c'; case 3: return 'd'; } return 'e'; }\nconsole.log(f(2));\n",
        { fileName: "/app.js", target: "linux-x64", printAsm: true },
    );
    assert.ok(result.ok);
    assert.match(result.assembly!, /lea r11, \[rip\+js\.fn\.0\.switch\.\d+\]/);
    assert.match(result.assembly!, /jmp r11$/m);
});

// The same clauses exercise a selected table and an observable all-chain
// route. Runtime arguments retain the tag/conversion/equality/index guards.
const mixedCases = (first = "1", withDefault = true) => `
    case ${first}: return "one";
    case 1.5: return "half";
    ${withDefault ? 'default: return "default";' : ""}
    case 2: return "two";
    case 4: return "four";
    case 5: return "five";
    case 1.25: return "quarter";
    case 1.5000000000000002: return "adjacent";
    case -1.5: return "negative half";
    case 1.5: return "duplicate half";
    case 1: return "duplicate one";
    case -2147483648: return "int32 min";
    case 2147483648: return "above int32";
    case -2147483649: return "below int32";
    case -9223372036854775808: return "int64 min";
    case 9223372036854775808: return "int64 overflow";
    case -9223372036854777856: return "int64 underflow";
    case 1e999: return "positive infinity";
    case -1e999: return "negative infinity";
    case "1": return "string";
    case 1n: return "bigint";
    case null: return "null";
    case true: return "boolean";`;

test("dispatch proof boundaries execute both table and chain against Node.js", (t) => {
    t.diagnostic(
        `dispatch native target=${process.platform}-${process.arch}, ` +
            `node=${process.version}, revision=${process.env.GITHUB_SHA ?? "local working tree"}`,
    );
    const source = `let calls = 0;
function mark(x) { calls++; return x; }
function dense(x) { switch (x) { ${mixedCases()} } return "end"; }
function chained(x) { switch (x) { ${mixedCases("mark(1)")} } return "end"; }
function absent(x) { switch (x) { ${mixedCases("1", false)} } return "end"; }
function small(x) { switch (x) { case 1.5: return "half"; case 1.25: return "quarter";
  case NaN: return "nan"; case -0: return "zero"; case 0: return "duplicate zero";
  case Infinity: return "infinity"; case -Infinity: return "negative infinity";
  default: return "default"; } }
function fall(x) { let out = ""; switch(x) {
  case 1: out += "a"; case 1.5: out += "h";
  default: out += "d"; case 2: out += "b"; break;
  case 4: out += "c"; case 5: out += "e";
} return out; }
const inputs = [1, 2, 3, 4, 5, 6, 0, -0, -1, 1.5, 3 / 2, 1.25, 5 / 4, 2.5,
  -1.5, -3 / 2, 1.5 + 2 ** -52, 1.5 - 2 ** -52, 1.5 + 2 ** -51,
  NaN, Infinity, -Infinity, 2147483647, -2147483648, 2147483648, -2147483649,
  2147483647.5, -2147483648.5, 2 ** 63 - 1024, 2 ** 63, -(2 ** 63),
  -(2 ** 63) - 2048, Number.MAX_VALUE, Number.MIN_VALUE,
  "1", "1.5", 1n, 3n, null, undefined, true, false,
  { valueOf() { throw new Error("switch must not coerce"); } }];
for (const x of inputs) {
  calls = 0;
  console.log(dense(x), chained(x), absent(x), small(x), fall(x), calls);
}`;
    const ir = compileToIR(source);
    for (const name of ["dense", "absent", "fall"]) {
        const fn = ir.functions.find((f) => f.name === name)!;
        const tables = fn.blocks
            .map((b) => b.terminator)
            .filter((v) => v.kind === "switch");
        assert.equal(tables.length, 1, name);
        assert.equal(tables[0]!.low, 1, name);
        assert.equal(tables[0]!.targets.length, 5, name);
    }
    for (const name of ["chained", "small"]) {
        const fn = ir.functions.find((f) => f.name === name)!;
        assert.ok(
            fn.blocks.every((b) => b.terminator.kind !== "switch"),
            name,
        );
    }
    const native = runOnHost(source);
    const oracle = runOracle(source);
    assert.equal(native.status, 0, native.stderr);
    assert.equal(native.stdout, oracle.stdout);
    const rows = native.stdout.trim().split(/\r?\n/);
    assert.equal(rows[2], "default default end default db 1"); // Integer hole.
    assert.equal(rows[9], "half half half half hdb 1"); // Fractional fallback.
    assert.equal(rows[13], "default default end default db 1"); // Unequal fraction.
});

test("mixed table IR keeps holes, first duplicates and the complete fallback chain", () => {
    for (const withDefault of [true, false]) {
        const source = `function f(n) { switch (n) {
          case 1: return 11; case 1.5: return 15;
          ${withDefault ? "default: return 9;" : ""}
          case 2: return 22; case 4: return 44; case 5: return 55;
          case 1: return 111; case 1.5: return 115;
        } return 99; } console.log(f(3));`;
        const fn = compileToIR(source).functions.find((f) => f.name === "f")!;
        const table = fn.blocks
            .map((b) => b.terminator)
            .find((v) => v.kind === "switch")!;
        const returning = (value: number) =>
            fn.blocks.find(
                (b) =>
                    b.terminator.kind === "return" &&
                    b.operations.some(
                        (op) =>
                            op.kind === "constant" &&
                            op.value === value &&
                            b.terminator.kind === "return" &&
                            op.dest === b.terminator.value,
                    ),
            )!.id;
        assert.equal(table.low, 1);
        assert.deepEqual(table.targets, [
            returning(11),
            returning(22),
            returning(withDefault ? 9 : 99),
            returning(44),
            returning(55),
        ]);
        assert.ok(!table.targets.includes(table.otherwise));
        let next = table.otherwise;
        const matches: number[] = [];
        for (;;) {
            const block = fn.blocks.find((b) => b.id === next)!;
            const term = block.terminator;
            if (term.kind !== "branch") break;
            assert.ok(
                block.operations.some(
                    (op) => op.kind === "binary" && op.operator === "===",
                ),
            );
            matches.push(term.yes);
            next = term.no;
        }
        assert.deepEqual(
            matches,
            [11, 15, 22, 44, 55, 111, 115].map(returning),
        );
        assert.equal(next, returning(withDefault ? 9 : 99));
    }
});

test("switch construction uses the actual symmetric key and density guards", () => {
    const literal = (value: Literal["value"]): { test: Literal } => ({
        test: { kind: "Literal", value, span: { start: 0, end: 0 } },
    });
    const table = (values: Literal["value"][]) =>
        switchTable(values.map(literal));
    assert.deepEqual(table([1, 1.5, 2, 4, 5, 1, "1", null, 1n]), {
        low: 1,
        cases: [0, 2, -1, 3, 4],
    });
    assert.equal(table([0, -0, 1, 2]), undefined); // Only three distinct keys.
    assert.deepEqual(table([-0, 1, 2, 3, 0]), { low: 0, cases: [0, 1, 2, 3] });
    assert.equal(
        table([-2147483648, -2147483647, -2147483646, -2147483645]),
        undefined,
    );
    assert.equal(
        table([2147483645, 2147483646, 2147483647, 2147483648]),
        undefined,
    );
    assert.equal(table([0, 1, 2, 15])!.cases.length, 16);
    assert.equal(table([0, 1, 2, 16]), undefined);
    assert.equal(table([0, 1, 2, 3, 19])!.cases.length, 20);
    assert.equal(table([0, 1, 2, 3, 20]), undefined);
    const keys = Array.from({ length: 256 }, (_, i) => i);
    assert.equal(table([...keys, 1023])!.cases.length, 1024);
    assert.equal(table([...keys, 1024]), undefined); // Density passes; cap fails.
    assert.equal(table([1, 2, 3, NaN, Infinity, 1.5]), undefined);
});

test("signed zero and both int32 endpoint neighborhoods match Node.js", () => {
    const source = `function zero(x) { switch(x) {
  case -0: return "first zero"; case 0: return "duplicate zero";
  case -2: return "minus two"; case -1: return "minus one"; case +1: return "one";
} return "end"; }
function lower(x) { switch(x) {
  case -2147483648: return "min"; case -2147483647: return "min+1";
  case -2147483646: return "min+2"; case -2147483644: return "min+4";
  case -2147483643: return "min+5";
} return "end"; }
function upper(x) { switch(x) {
  case 2147483644: return "max-3"; case 2147483645: return "max-2";
  case 2147483646: return "max-1"; case 2147483647: return "max";
  case 2147483648: return "max+1"; case 2147483649: return "max+2";
} return "end"; }
for (const x of [0, -0, -2, -1, 1, 2, NaN, -2147483649, -2147483648,
  -2147483647, -2147483646, -2147483645, -2147483644, -2147483643,
  2147483643, 2147483644, 2147483645, 2147483646, 2147483647,
  2147483648, 2147483649, 2147483647.5, -2147483648.5]) {
  console.log(zero(x), lower(x), upper(x));
}`;
    const ir = compileToIR(source);
    const tables = ["zero", "lower", "upper"].map((name) => {
        const fn = ir.functions.find((f) => f.name === name)!;
        const term = fn.blocks
            .map((b) => b.terminator)
            .find((v) => v.kind === "switch")!;
        return [term.low, term.targets.length];
    });
    assert.deepEqual(tables, [
        [-2, 4],
        [-2147483647, 5],
        [2147483644, 4],
    ]);
    const native = runOnHost(source);
    assert.equal(native.status, 0, native.stderr);
    assert.equal(native.stdout, runOracle(source).stdout);
});

test("switch emission round-trips int64 and rejects unordered, unequal and unsigned out-of-bounds", () => {
    const source = `function f(n) { switch(n) {
      case 1: return 1; case 2: return 2; case 4: return 4; case 5: return 5;
      case 1.5: return 15;
    } return 9; } console.log(f(3));`;
    const result = compile(source, {
        fileName: "/app.js",
        target: "linux-x64",
        printAsm: true,
    });
    assert.ok(result.ok);
    const assembly = result.assembly!;
    const body = assembly.slice(
        assembly.indexOf("js.fn.0:"),
        assembly.indexOf("js.fn.0.end:"),
    );
    const table = body.slice(0, body.indexOf("jmp r11") + "jmp r11".length);
    const fallback = /jne (js\.fn\.0\.block\.\d+)/.exec(table)![1]!;
    const escaped = fallback.replaceAll(".", "\\.");
    assert.match(table, new RegExp(`cmp rax, 3[\\s\\S]*?jne ${escaped}`));
    assert.match(
        table,
        new RegExp(
            `cvttsd2si rax, xmm0[\\s\\S]*?cvtsi2sd xmm1, rax` +
                `[\\s\\S]*?ucomisd xmm1, xmm0[\\s\\S]*?jp ${escaped}[\\s\\S]*?jne ${escaped}` +
                `[\\s\\S]*?sub rax, 1[\\s\\S]*?mov r11d, 5[\\s\\S]*?cmp rax, r11[\\s\\S]*?jae ${escaped}`,
        ),
    );
    assert.doesNotMatch(table, /sar |movsxd |\b(?:jl|jle|jg|jge) /);
    assert.match(
        table,
        /shl rax, 3[\s\S]*?lea r11, \[rip\+js\.fn\.0\.switch\.\d+\][\s\S]*?jmp r11/,
    );
});
