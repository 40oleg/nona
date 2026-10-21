import { readFileSync, writeFileSync, statSync } from "node:fs";
writeFileSync("size-probe.tmp", "x");
console.log(
    readFileSync("size-probe.tmp", "utf8"),
    statSync("size-probe.tmp").size,
);
