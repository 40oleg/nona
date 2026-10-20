import { compile } from "./dist/src/compiler.js";
import { readFileSync } from "node:fs";
const r = compile(readFileSync(process.argv[2], "utf8"), { fileName: "/app.js", target: "linux-x64", printAsm: true });
if (!r.ok) { console.log(JSON.stringify(r.diagnostics)); process.exit(1); }
const fn = process.argv[3];
let on = !fn;
for (const line of r.assembly.split("\n")) {
  if (/^(js\.fn\.\d+|js\.main):$/.test(line)) on = !fn || line === fn + ":";
  if (on) console.log(line.replace(/^  [0-9a-f]{6}  (?:[0-9a-f]{2} )+ */, "    "));
}
