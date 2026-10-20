import { compileToIR } from "./dist/src/compiler.js";
import { readFileSync } from "node:fs";
const src = readFileSync(process.argv[2], "utf8");
const ir = compileToIR(src);
for (const fn of ir.functions) {
  if (!fn.id.startsWith("js.fn") && fn.id !== "js.main") continue;
  if (process.argv[3] && fn.id !== process.argv[3]) continue;
  console.log("==", fn.id, fn.name, "locals", fn.localCount, "slots", fn.slotCount, "params", fn.parameterCount);
  for (const b of fn.blocks) {
    console.log(" B" + b.id + (b.exceptionTarget !== undefined ? " exc=" + b.exceptionTarget : ""));
    for (const op of b.operations) console.log("   ", JSON.stringify(op));
    console.log("   ->", JSON.stringify(b.terminator));
  }
}
