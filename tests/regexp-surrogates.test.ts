import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// Unicode-mode patterns read the input as code points (#277): a lone
// surrogate in the pattern never matches half of a surrogate pair.
test("lone surrogates in unicode patterns match Node.js", () => {
    const source = String.raw`const text = "ab 😀 c \ud83d end \ude00 x😀\ud83d";
const pats = [/\ud83d/u, /\ud83d/gu, /\ude00/gu, /😀/gu, /[\ud83d]/gu, /[\ude00]/gu, /\ud83d/g, /\ude00/g, /\ud83d+/gu, /(?<=\ud83d)./gu, /./gu, /\ud83d|x/gu, /[^a]/gu, /\ud83d\ude00/gu, /(x)\1?/gu, /\1(a)/g, /(?<n>\ud83d)\k<n>?/gu];
for (const p of pats) {
  const all = [...text.matchAll(new RegExp(p.source, p.flags.includes("g") ? p.flags : p.flags + "g"))].map(m => m.index + ":" + m[0].length);
  const first = new RegExp(p.source, p.flags.replace("g", "")).exec(text);
  console.log(String(p), text.search(p), all.join(" "), text.split(p).length, text.replace(p, "#").length, first ? first.index : -1);
}`;
    // Without gcStress: unicode case folding and tables allocate thousands of
    // objects, which a collection per allocation made exceed 60 s on CI.
    const run = runOnHost(source, { gcStress: false });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, runOracle(source).stdout);
});
