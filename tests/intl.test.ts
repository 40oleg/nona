import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

// Intl.Segmenter splits strings into grapheme clusters as Node.js (ICU) does
// (src/lib/runtime/intl.js); string-width, cliui and yargs count columns with it.
function expectOracle(source: string): void {
    const native = runOnHost(source);
    assert.equal(native.status, 0, native.stderr);
    const oracle = runOracle(source);
    assert.equal(oracle.status, 0, oracle.stderr);
    assert.equal(native.stdout, oracle.stdout);
}

test("Intl.Segmenter splits grapheme clusters as Node.js does", () =>
    expectOracle(String.raw`
const segmenter = new Intl.Segmenter();
const samples = ["abc", "a\r\nb", "e\u0301x", "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}x", "\u{1F1FA}\u{1F1F8}\u{1F1EB}\u{1F1F7}\u{1F1E9}",
    "\u{1F44D}\u{1F3FD}!", "\uD55C\uAD6D\uC5B4", "\u1100\u1161\u11A8z", "\u0915\u094D\u0937\u093F", "\u0928\u092E\u0938\u094D\u0924\u0947",
    "\u0600a", "\u0E01\u0E49\u0E33", "\u200D\u200Dx", "a\u0000b", "\u{1F600}\uFE0F", "\uD800x", "", "ab\u200Dcd", "\u00A9\u200D\u00AE"];
for (const s of samples) console.log(JSON.stringify(Array.from(segmenter.segment(s), (x) => x.segment)));
const segments = segmenter.segment("a\u{1F44D}\u{1F3FD}b");
console.log(JSON.stringify(segments.containing(2)), segments.containing(9), JSON.stringify(segments.containing(-0.5)), JSON.stringify(segments.containing("1")));
const first = [...segments][1];
console.log(Object.keys(first).join(), first.input === "a\u{1F44D}\u{1F3FD}b", first.index);
`));

test("Intl.Segmenter objects, options and errors", () =>
    expectOracle(String.raw`
const segmenter = new Intl.Segmenter("en", { granularity: "grapheme", localeMatcher: "lookup" });
const segments = segmenter.segment(12);
const iterator = segments[Symbol.iterator]();
console.log(Object.prototype.toString.call(segmenter), Object.prototype.toString.call(Intl), Object.prototype.toString.call(iterator));
console.log(segmenter.resolvedOptions().granularity, Intl.Segmenter.length, Intl.Segmenter.name, Intl.Segmenter.prototype.segment.length, typeof Intl.Segmenter.supportedLocalesOf);
console.log(JSON.stringify(iterator.next()), JSON.stringify(iterator.next()), JSON.stringify(iterator.next()), iterator[Symbol.iterator]() === iterator);
console.log(Object.keys(globalThis).includes("Intl"), Object.getOwnPropertyDescriptor(Intl, "Segmenter").enumerable, Object.keys(Intl.Segmenter.prototype).length);
for (const f of [() => Intl.Segmenter(), () => new Intl.Segmenter("en", { granularity: "x" }), () => new Intl.Segmenter("en", 5),
    () => new Intl.Segmenter("en", { localeMatcher: "x" }), () => Intl.Segmenter.prototype.segment.call({}, "a"), () => segments.containing.call({}, 0)])
    try { f(); console.log("no error"); } catch (e) { console.log(e.constructor.name); }
`));
