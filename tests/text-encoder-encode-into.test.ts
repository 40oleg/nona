import { test } from "node:test";
import assert from "node:assert/strict";
import { runOnHost } from "./helpers/host.js";
import { runOracle } from "./helpers/oracle.js";

const source = `
const enc = new TextEncoder();
const out = [];
function run(text, size) {
    const u = new Uint8Array(size);
    const r = enc.encodeInto(text, u);
    out.push(JSON.stringify(r) + " " + Array.from(u).join(","));
}
run("é!😀", 4);
run("a€", 2);
run("a€", 4);
run("😀", 4);
run("😀", 3);
run("a\\uD800b", 5);
run("a\\uDC00b", 5);
run("x\\uD800", 4);
run("", 3);
run("abc", 0);
let err;
try { enc.encodeInto("a", []); } catch (e) { err = e.constructor.name; }
out.push(err);
console.log(out.join("\\n"));
`;

test("TextEncoder.prototype.encodeInto writes whole sequences and counts code units", () => {
    const { stdout } = runOnHost(source);
    assert.equal(stdout, runOracle(source).stdout);
    assert.match(stdout, /^\{"read":2,"written":3\} 195,169,33,0\n/);
});
