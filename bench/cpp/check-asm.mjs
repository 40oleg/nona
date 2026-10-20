// Checks that the optimized C++ kernels still do the measured work (#401).
//
//   node bench/cpp/check-asm.mjs [--builds o3,noinline,native]
//
// Reads build/asm/<program>-cpp-<build>.objdump.txt and .nm.txt (written by
// build.mjs) and, for every kernel of kernels.mjs, finds its function and its
// loops (a branch back to an earlier address of the function). It fails
// (exit 1) when a kernel has no loop, or when neither the loop nor the
// function it calls contains the expected arithmetic instruction: such a
// kernel was folded away or replaced by a closed form and must not be timed.
// For call kernels it reports the dispatch the compiler emitted (inlined,
// direct call, or an indirect call through a register/memory operand, i.e.
// not devirtualized), and for every kernel whether the loop uses packed SIMD
// arithmetic and whether identical code folding merged it with another
// kernel. String kernels (kind "string") must instead keep the string
// routine in the iteration loop: a call of find/compare/operator new/to_chars
// (kernels.mjs `work`) inside a loop, or an inner loop when the routine is
// inlined, so a call hoisted out of the loop fails. The result is also
// written to build/asm/check.json.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { BUILDS, EXPECT, KERNELS, PROGRAMS } from "./kernels.mjs";
import { buildDir } from "./host.mjs";

const args = process.argv.slice(2);
const opt = (name, def) => {
    const i = args.indexOf("--" + name);
    return i < 0 ? def : args[i + 1];
};
const builds = opt("builds", Object.keys(BUILDS).join(",")).split(",");
const asmDir = resolve(buildDir, "asm");

// objdump -d --no-show-raw-insn -C output: the instructions of every function
// by name, and the function starting at every address.
function parse(text) {
    const functions = new Map(),
        starts = new Map();
    let current = null;
    for (const line of text.split("\n")) {
        const header = /^([0-9a-f]+) <(.+)>:$/.exec(line);
        if (header) {
            current = [];
            functions.set(header[2], current);
            starts.set(parseInt(header[1], 16), header[2]);
            continue;
        }
        const insn = /^\s+([0-9a-f]+):\t(.*)$/.exec(line);
        if (!insn || !current) continue;
        // Drop prefixes that objdump prints as separate words.
        const words = insn[2]
            .trim()
            .replace(
                /^((notrack|bnd|rep|repz|repnz|lock|data16|cs|ds)\s+)+/,
                "",
            )
            .split(/\s+/);
        current.push({
            addr: parseInt(insn[1], 16),
            mnemonic: words[0],
            operands: words.slice(1).join(" "),
        });
    }
    return { functions, starts, aliases: new Map() };
}

// Adds the symbols of nm -C output that objdump does not print because
// another symbol has the same address (identical code folding).
function addAliases(dump, text) {
    for (const line of text.split("\n")) {
        const m = /^([0-9a-f]+) [tTwW] (.+)$/.exec(line.trim());
        if (!m || dump.functions.has(m[2])) continue;
        const at = dump.starts.get(parseInt(m[1], 16));
        if (at) dump.aliases.set(m[2], at);
    }
}

// The instructions of `symbol` and of its compiler-made parts
// (symbol.constprop.0, symbol.cold, ...), or of the function it was folded
// into.
function functionOf(dump, symbol) {
    const parts = [...dump.functions].filter(
        ([name]) => name === symbol || name.startsWith(symbol + "."),
    );
    if (parts.length) return parts.flatMap(([, code]) => code);
    const alias = dump.aliases.get(symbol);
    return alias ? dump.functions.get(alias) : null;
}

// Loop bodies: for every branch to an earlier address of the same function,
// the instructions from the target to the branch.
function loops(code) {
    const result = [];
    for (const insn of code) {
        if (!/^j/.test(insn.mnemonic)) continue;
        const target = /^([0-9a-f]+) </.exec(insn.operands);
        if (!target) continue;
        const to = parseInt(target[1], 16);
        if (to > insn.addr || !code.some((i) => i.addr === to)) continue;
        result.push(code.filter((i) => i.addr >= to && i.addr <= insn.addr));
    }
    return result;
}

const sameOperands = (operands) => {
    const [a, b] = operands.split(",");
    return a === b;
};
const MATCH = {
    f64add: (i) => /^v?add[sp]d$/.test(i.mnemonic),
    f64mul: (i) => /^v?mul[sp]d$/.test(i.mnemonic),
    u32add: (i) =>
        /^v?paddd$/.test(i.mnemonic) ||
        (/^addl?$/.test(i.mnemonic) &&
            !i.operands.startsWith("$") &&
            /,%(e[a-z]+|r\d+d)$/.test(i.operands)) ||
        (i.mnemonic === "lea" &&
            /\(%\w+,%\w+(,1)?\),%(e[a-z]+|r\d+d)$/.test(i.operands)),
    u32mul: (i) => /^(imul|v?pmulld|v?pmuludq)$/.test(i.mnemonic),
    xor: (i) =>
        /^(xor|v?pxor|v?xorps)$/.test(i.mnemonic) && !sameOperands(i.operands),
};

function has(code, expect) {
    if (!code) return false;
    if (expect === "f64muladd")
        return has(code, "f64mul") && has(code, "f64add");
    return code.some(MATCH[expect]);
}
const isSimd = (i) =>
    (/^v?(add|mul|sub)p[sd]$/.test(i.mnemonic) ||
        /^v?p(add|sub|mul)\w*$/.test(i.mnemonic) ||
        (/^v?pxor$/.test(i.mnemonic) && !sameOperands(i.operands))) &&
    /%[xy]mm/.test(i.operands);
const isIndirect = (i) =>
    /^(call|jmp)/.test(i.mnemonic) && i.operands.startsWith("*");

// Packed integer compares/moves of string scans count as SIMD too.
const isStringSimd = (i) =>
    isSimd(i) ||
    (/^v?(pcmpeq|pcmpgt|pmovmsk|pminu|pmaxu|punpck|pmovzx|pand|por|pshuf)/.test(
        i.mnemonic,
    ) &&
        /%[xy]mm/.test(i.operands));
const span = (body) => [body[0].addr, body[body.length - 1].addr];
// A demangled callee without the standard-library noise.
const shortName = (name) =>
    name
        .replace(
            /std::__cxx11::basic_string<(char16_t|char), std::char_traits<\1>, std::allocator<\1> >/g,
            (_, c) => (c === "char" ? "std::string" : "std::u16string"),
        )
        .replace(/\(.*$/, "");

// A string kernel: the iteration loop must still do the string work per
// iteration. Accepted evidence (row.work): a call in a loop of the kernel to
// a routine matching `calls` (find, compare, memcmp, operator new, to_chars,
// ...); or, when the routine is inlined (`nested`), an inner loop inside the
// iteration loop; or (`load16`, the non-owning view) a 16-bit load in the
// loop. A routine hoisted out of the loop leaves the call or the inner loop
// outside every loop body and fails the check.
function checkString(dump, row) {
    const code = functionOf(dump, row.cppSymbol);
    if (!code) return { status: "FAIL", reason: "function not found" };
    const result = { status: "ok" };
    if (dump.aliases.has(row.cppSymbol))
        result.foldedInto = dump.aliases.get(row.cppSymbol);
    const bodies = loops(code);
    if (bodies.length === 0)
        return {
            ...result,
            status: "FAIL",
            reason: "no loop: folded away or hoisted",
        };
    const inLoops = bodies.flat();
    result.loops = bodies.length;
    result.simd = inLoops.some(isStringSimd);
    const callees = [
        ...new Set(
            inLoops
                .filter((i) => /^call/.test(i.mnemonic))
                .map((i) =>
                    isIndirect(i)
                        ? "*indirect"
                        : /<(.+?)(\+0x[0-9a-f]+)?>$/.exec(i.operands)?.[1],
                )
                .filter(Boolean),
        ),
    ];
    const work = row.work ?? {};
    const evidence = [];
    if (work.calls) {
        const pattern = new RegExp(work.calls);
        const matched = callees.filter((name) => pattern.test(name));
        if (matched.length)
            evidence.push("calls " + matched.map(shortName).join(", "));
    }
    if (work.nested) {
        const nested = bodies.some((inner) => {
            const [a, b] = span(inner);
            return bodies.some((outer) => {
                const [c, d] = span(outer);
                return outer !== inner && c <= a && b <= d && d - c > b - a;
            });
        });
        if (nested) evidence.push("inner loop in the iteration loop");
    }
    if (work.load16 && inLoops.some((i) => /^movzw/.test(i.mnemonic)))
        evidence.push("16-bit load in the loop");
    result.dispatch = evidence.join("; ");
    result.callees = callees.map(shortName);
    if (evidence.length === 0)
        return {
            ...result,
            status: "FAIL",
            reason: `no ${[work.calls && `call of /${work.calls}/`, work.nested && "inner loop", work.load16 && "16-bit load"].filter(Boolean).join(" or ")} in the iteration loop`,
        };
    return result;
}

function check(dump, row) {
    if (row.kind === "string") return checkString(dump, row);
    const code = functionOf(dump, row.cppSymbol);
    if (!code) return { status: "FAIL", reason: "function not found" };
    const result = { status: "ok" };
    if (dump.aliases.has(row.cppSymbol))
        result.foldedInto = dump.aliases.get(row.cppSymbol);
    const bodies = loops(code);
    if (bodies.length === 0)
        return {
            ...result,
            status: "FAIL",
            reason: "no loop: folded away or replaced by a closed form",
        };
    const inLoops = bodies.flat();
    result.loops = bodies.length;
    result.simd = inLoops.some(isSimd);
    const calls = inLoops.filter((i) => /^call/.test(i.mnemonic));
    if (calls.length === 0) {
        result.dispatch = row.kind === "call" ? "inlined" : "none";
        if (!has(inLoops, row.expect))
            return {
                ...result,
                status: "FAIL",
                reason: `no ${EXPECT[row.expect]} in the loop`,
            };
        return result;
    }
    // Direct callees, and the ones that make an indirect call themselves
    // (std::function's operator() is out of line in the -fno-inline build).
    const indirect = calls.filter(isIndirect);
    const direct = [
        ...new Set(
            calls
                .map((i) => /<(.+?)(\+0x[0-9a-f]+)?>$/.exec(i.operands)?.[1])
                .filter(Boolean),
        ),
    ];
    const through = direct.filter((name) =>
        (functionOf(dump, name) || []).some(isIndirect),
    );
    const doing = (names) =>
        names.filter((name) => has(functionOf(dump, name), row.expect));
    if (indirect.length || through.length) {
        result.dispatch = indirect.length
            ? `indirect call (${indirect[0].operands})`
            : `direct call of ${through.join(", ")}, then indirect call`;
        // The callee is not known statically: check the candidates, the
        // functions a pointer can name and the std::function invokers and
        // lambdas (out of line under -fno-inline).
        const type = row.id.slice(0, 3);
        result.callees = doing([
            `${type}_add`,
            `${type}_mul`,
            ...(/_indirect$/.test(row.cppSymbol)
                ? []
                : [...dump.functions.keys()].filter(
                      (name) =>
                          name.includes("_M_invoke") ||
                          name.includes("{lambda("),
                  )),
        ]);
        if (result.callees.length === 0)
            return {
                ...result,
                status: "FAIL",
                reason: `no candidate callee contains ${EXPECT[row.expect]}`,
            };
    } else {
        result.dispatch = `direct call (${direct.join(", ")})`;
        result.callees = doing(direct);
        if (result.callees.length === 0 && !has(inLoops, row.expect))
            return {
                ...result,
                status: "FAIL",
                reason: `neither the loop nor ${direct.join(", ")} contains ${EXPECT[row.expect]}`,
            };
    }
    if (row.kind === "call" && row.call !== "direct")
        result.devirtualized = indirect.length === 0 && through.length === 0;
    return result;
}

const report = {};
let failed = false,
    checked = 0;
for (const build of builds) {
    report[build] = {};
    for (const program of PROGRAMS) {
        const filter = BUILDS[build]?.rows;
        if (filter && !KERNELS.some((k) => k.program === program && filter(k)))
            continue; // build.mjs does not build it
        const file = resolve(asmDir, `${program}-cpp-${build}.objdump.txt`);
        if (!existsSync(file)) {
            console.log(`${build}/${program}: no disassembly (${file})`);
            report[build][program] = { status: "unavailable" };
            continue;
        }
        const dump = parse(readFileSync(file, "utf8"));
        const nm = resolve(asmDir, `${program}-cpp-${build}.nm.txt`);
        if (existsSync(nm)) addAliases(dump, readFileSync(nm, "utf8"));
        console.log(`\n${build}: ${BUILDS[build]?.label ?? ""}`);
        const programRows = KERNELS.filter((k) => k.program === program);
        const width = (key) =>
            Math.max(20, ...programRows.map((k) => k[key].length + 2));
        const idWidth = width("id"),
            symbolWidth = width("cppSymbol");
        console.log(
            "kernel".padEnd(idWidth) +
                "symbol".padEnd(symbolWidth) +
                "status".padEnd(8) +
                "simd".padEnd(6) +
                "dispatch",
        );
        for (const row of programRows) {
            const r = check(dump, row);
            checked++;
            report[build][row.id] = { symbol: row.cppSymbol, ...r };
            if (r.status !== "ok") failed = true;
            const devirtualized =
                r.devirtualized === undefined
                    ? ""
                    : r.devirtualized
                      ? " [devirtualized]"
                      : " [not devirtualized]";
            console.log(
                row.id.padEnd(idWidth) +
                    row.cppSymbol.padEnd(symbolWidth) +
                    r.status.padEnd(8) +
                    (r.simd ? "yes" : "no").padEnd(6) +
                    (r.dispatch ?? "") +
                    devirtualized +
                    (r.foldedInto ? ` [same code as ${r.foldedInto}]` : "") +
                    (r.reason ? " — " + r.reason : ""),
            );
        }
    }
}
writeFileSync(resolve(asmDir, "check.json"), JSON.stringify(report, null, 2));
if (checked === 0) {
    console.error("no disassembly found; run node bench/cpp/build.mjs first");
    process.exit(1);
}
if (failed) {
    console.error(
        "\nFAIL: some kernels lost their measured work; do not time them",
    );
    process.exit(1);
}
console.log("\nall kernels keep a loop with the measured operation");
