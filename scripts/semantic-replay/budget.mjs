// Consumes actual uploaded reports only. Never infers a budget from safety caps.
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { measuredBudget, saveReport } from "./report.mjs";
const directory = resolve(process.argv[2]);
const paths = readdirSync(directory, { recursive: true, encoding: "utf8" })
    .map(String)
    .filter((p) => p.replaceAll("\\", "/").endsWith("/pr/summary.json"));
const reports = paths.map((p) =>
    JSON.parse(readFileSync(join(directory, p), "utf8")),
);
saveReport(
    resolve(directory, "measured-pr-budget.json"),
    measuredBudget(reports),
);
