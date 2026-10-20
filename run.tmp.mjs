import { runOnHost } from "./dist/tests/helpers/host.js";
import { runOracle } from "./dist/tests/helpers/oracle.js";
import { readFileSync } from "node:fs";
const src = readFileSync(process.argv[2], "utf8");
const n = runOnHost(src, { gcStress: process.argv[3] === "gc" });
const o = runOracle(src);
console.log("status", n.status, n.error ?? "", n.stderr);
if (n.stdout === o.stdout) console.log("MATCH\n" + n.stdout.slice(0, 2000));
else { console.log("NATIVE:\n" + n.stdout + "\nORACLE:\n" + o.stdout); }
