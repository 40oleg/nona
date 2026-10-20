import { compileToIR } from "./dist/src/compiler.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const file = resolve(process.argv[2]);
const src = readFileSync(file, "utf8");
compileToIR(src, file); // warm-up
const t = performance.now();
const ir = compileToIR(src, file);
const ms = performance.now() - t;
let blocks = 0, guards = 0;
for (const fn of ir.functions) { blocks += fn.blocks.length; for (const b of fn.blocks) for (const op of b.operations) if (op.kind === "call" && op.target === "rt.typedLoopGuard") guards++; }
console.log(process.env.NONA_NO_BCE ? "off" : "on", ir.functions.length, "functions", blocks, "blocks", guards, "guards", ms.toFixed(0), "ms");
