import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";
import { expectProgram } from "./helpers/program.js";
import { regexpVmSource } from "../src/runtime/regexp-vm-source.js";
import { lex, setRegExpValidator } from "../src/frontend/lexer.js";
import { validateRegExp } from "../src/regexp-validator.js";

// RegExp pattern modifiers (ES2025, #320): (?ims-ims:...) changes the i, m
// and s flags for the atoms inside the group only.
// Node.js 26 supports them; an older Node.js running the suite cannot be the
// oracle, so the expected output is also spelled out.
const oracleSupportsModifiers = (() => {
    try {
        new RegExp("(?i:a)");
        return true;
    } catch {
        return false;
    }
})();
function expectOracle(source: string, expected: string, gcStress: boolean) {
    const run = runOnHost(source, { gcStress });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(
        run.stdout,
        oracleSupportsModifiers ? runOracle(source).stdout : expected,
    );
}

const matchAll = String.raw`
for (const [p, f, s] of cases) {
  const all = [...s.matchAll(new RegExp(p, f + "g"))].map(m => m.index + ":" + m.join("|"));
  console.log(p, f, JSON.stringify(all));
}`;

test("modifier groups add and remove i, m and s for their atoms", () => {
    const source =
        String.raw`const cases = [
  ["(?i:a)b", "", "Ab AB ab aB"],
  ["(?-i:a)b", "i", "aB AB ab"],
  ["^(?m:^x$)", "", "x\nx"],
  ["(?m:^x$)", "", "a\nx\nb"],
  ["a(?m:$)", "", "a\nab a"],
  ["(?-m:^x)", "m", "x\nx"],
  ["(?s:.)x", "", "\nx ax"],
  ["(?-s:.)x", "s", "\nx ax"],
  ["(?i-s:a.)", "s", "A\n Ab"],
  ["(?ims:^a.$)", "", "b\nA\n"],
  ["(?i:a(?-i:b)c)", "", "ABC AbC abc"],
  ["(?-i:a(?i:b)c)", "i", "aBc ABC"],
  ["(?i:a)|b", "", "A B b"],
  ["(?i:[a-c]+)x", "", "ABCx abX"],
  ["(?i:[^a])", "", "Ab"],
  ["(?-i:\\w)", "i", "_a"],
  ["(?i:a)*?b", "", "AAb"],
  ["(?i:a*?)b", "", "AAAb"],
  ["x(?i:a+?)\\d", "", "xAA1"],
  ["(?i:a){2}", "", "aAAa"],
  ["(?=(?i:a))a", "", "Aa"],
  ["(?<=(?i:a))b", "", "Ab ab aB"],
  ["(?<!(?i:a))b", "", "Ab cb"],
  ["(?i:(?<=a)b)", "", "aB Ab"],
  ["(a)(?i:\\1)", "", "aA aa ab"],
  ["(?i:(a))\\1", "", "Aa AA"],
  ["(a)(?i:\\1)+?b", "", "aAaAb"],
  ["(?<=(?i:\\1)(a))b", "", "Aab"],
  ["(?i:(a))(b)", "", "Ab"],
  ["(?i:a)(?<n>b)\\k<n>", "", "Abb"],
  ["(?:(?i:a)|(?-i:b))+", "i", "AaBbb"],
  ["(?i:abc)", "", "xxABC"],
  ["^(?i:abc)", "", "ABC"],
  ["(?m:^)a", "", "b\na"],
  ["(?i:a)?b", "", "b Ab"],
  ["(?:(?i:a)|b)B", "", "aB bB bb Ab"],
  ["a(?-i:b*?)c", "i", "aBbc abbC ABBC"],
  ["(?i:a|b)c", "", "Ac bc bC"],
  ["(?<x>a)(?i:b)(?<y>c)", "", "aBc"],
];` + matchAll;
    expectOracle(
        source,
        String.raw`(?i:a)b  ["0:Ab","6:ab"]
(?-i:a)b i ["0:aB","6:ab"]
^(?m:^x$)  ["0:x"]
(?m:^x$)  ["2:x"]
a(?m:$)  ["0:a","5:a"]
(?-m:^x) m ["0:x"]
(?s:.)x  ["0:\nx","3:ax"]
(?-s:.)x s ["3:ax"]
(?i-s:a.) s ["3:Ab"]
(?ims:^a.$)  ["2:A\n"]
(?i:a(?-i:b)c)  ["4:AbC","8:abc"]
(?-i:a(?i:b)c) i ["0:aBc"]
(?i:a)|b  ["0:A","4:b"]
(?i:[a-c]+)x  ["0:ABCx"]
(?i:[^a])  ["1:b"]
(?-i:\w) i ["0:_","1:a"]
(?i:a)*?b  ["0:AAb"]
(?i:a*?)b  ["0:AAAb"]
x(?i:a+?)\d  ["0:xAA1"]
(?i:a){2}  ["0:aA","2:Aa"]
(?=(?i:a))a  ["1:a"]
(?<=(?i:a))b  ["1:b","4:b"]
(?<!(?i:a))b  ["4:b"]
(?i:(?<=a)b)  ["1:B","4:b"]
(a)(?i:\1)  ["0:aA|a","3:aa|a"]
(?i:(a))\1  ["3:AA|A"]
(a)(?i:\1)+?b  ["0:aAaAb|a"]
(?<=(?i:\1)(a))b  ["2:b|a"]
(?i:(a))(b)  ["0:Ab|A|b"]
(?i:a)(?<n>b)\k<n>  ["0:Abb|b"]
(?:(?i:a)|(?-i:b))+ i ["0:Aa","3:bb"]
(?i:abc)  ["2:ABC"]
^(?i:abc)  ["0:ABC"]
(?m:^)a  ["2:a"]
(?i:a)?b  ["0:b","2:Ab"]
(?:(?i:a)|b)B  ["0:aB","3:bB"]
a(?-i:b*?)c i ["5:abbC"]
(?i:a|b)c  ["0:Ac","3:bc"]
(?<x>a)(?i:b)(?<y>c)  ["0:aBc|a|c"]
`,
        true,
    );
});

// Without gcStress: unicode case folding allocates thousands of objects.
test("modifier groups apply unicode case folding to classes, \\w and \\b", () => {
    const source =
        String.raw`const cases = [
  ["(?i:\\w)", "u", "\u017f\u212a"],
  ["(?i:\\W)", "u", "\u017f!"],
  ["(?-i:\\w)", "iu", "\u017fa"],
  ["(?i:\\b)", "u", "\u017f"],
  ["(?-i:\\b)", "iu", "\u017f"],
  ["(?i:\\B)", "u", "\u017f"],
  ["(?i:k)", "u", "\u212aK"],
  ["(?i:[a-z])", "u", "\u212a"],
  ["(?i:\\p{Lu})", "u", "a"],
  ["(?-i:\\p{Lu})", "iu", "aA"],
  ["(?i:\u{1F600}|x)", "u", "X\u{1F600}"],
];` + matchAll;
    expectOracle(
        source,
        `(?i:\\w) u ["0:\u017f","1:\u212a"]
(?i:\\W) u ["1:!"]
(?-i:\\w) iu ["1:a"]
(?i:\\b) u ["0:","1:"]
(?-i:\\b) iu []
(?i:\\B) u []
(?i:k) u ["0:\u212a","1:K"]
(?i:[a-z]) u ["0:\u212a"]
(?i:\\p{Lu}) u ["0:a"]
(?-i:\\p{Lu}) iu ["1:A"]
(?i:\u{1F600}|x) u ["0:X","1:\u{1F600}"]
`,
        false,
    );
});

const invalid = [
    "(?ii:a)",
    "(?-ss:a)",
    "(?i-i:a)",
    "(?m-im:a)",
    "(?-:a)",
    "(?x:a)",
    "(?I:a)",
    "(?u:a)",
    "(?g-i:a)",
    "(?i-s-m:a)",
    "(?i)",
    "(?i-m)",
    "(?i",
    "(?-",
];

test("invalid modifier groups throw SyntaxError like Node.js", () => {
    const source = `const patterns = ${JSON.stringify([...invalid, "(?i-:a)", "(?-i:a)", "(?ims:a)", "(?:a)"])};
for (const p of patterns) {
  for (const f of ["", "u"]) {
    try { new RegExp(p, f); console.log(p, f, "ok"); }
    catch (error) { console.log(p, f, error.constructor.name); }
  }
}`;
    const expected = [...invalid, "(?i-:a)", "(?-i:a)", "(?ims:a)", "(?:a)"]
        .flatMap((p, i) =>
            ["", "u"].map(
                (f) => `${p} ${f} ${i < invalid.length ? "SyntaxError" : "ok"}`,
            ),
        )
        .join("\n");
    expectOracle(source, expected + "\n", true);
});

test("invalid modifier groups are early errors in RegExp literals", () => {
    setRegExpValidator(validateRegExp);
    for (const pattern of invalid)
        assert.throws(
            () => lex(`/${pattern}/`),
            /Invalid regular expression pattern/,
        );
    for (const pattern of ["/(?i:a)/", "/(?i-:a)/", "/(?-ms:a)/s"])
        assert.equal(lex(pattern)[0]?.kind, "regexp");
});

// Modifier groups are not counted as capturing groups when \N is read.
test("modifier groups do not capture", () =>
    expectProgram(
        String.raw`
  console.log(/(?i:x)(a)\1/.exec('Xaa').length, /(?i:a)\1/.test('a\x01'), /(?i:(a))(b)/.exec('Ab').join());
`,
        "2 true Ab,A,b\n",
    ));

// Past the backtracking budget the matcher keeps backtracking (the Pike VM
// does not take patterns with modifiers) and finds the same match.
test("modifier groups match the same past the backtracking budget", () => {
    const cases: [string, string, string, string][] = [
        ["(?i:a|ab)(c|bcd)(d*)", "", "ABcd", "0:ABcd|c|d"],
        ["(?i:(a+)+)b", "", "AaAb", "0:AaAb|AaA"],
        ["(?:(?i:a)|b)*?c", "", "AbAc", "0:AbAc"],
        ["(?i:a+?)b", "", "AAb", "0:AAb"],
        ["(?-i:a)+?b", "i", "aaB", "0:aaB"],
        ["(?m:^x)|y", "", "a\nx", "2:x"],
        ["(?s:.+?)x", "", "\n\nx", "0:\n\nx"],
        ["(a)(?i:\\1)+", "", "aAA", "0:aAA|a"],
    ];
    expectProgram(
        `let vm=${regexpVmSource};vm.setBacktrackBudget(0);
  for(const [p,f,s] of ${JSON.stringify(cases)}){const c=vm.compile(p,f),r=vm.execute(c,s,0,false);
   if(r===null){console.log('null');continue}
   const parts=[s.slice(r.start,r.end)];for(let g=1;g<=c.groups;g++){const b=r.captures[g*2];parts.push(b===4294967295?'-':s.slice(b,r.captures[g*2+1]))}
   console.log(JSON.stringify(r.start+':'+parts.join('|')))}`,
        cases.map((c) => JSON.stringify(c[3])).join("\n") + "\n",
    );
});
