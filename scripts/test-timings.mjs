// Merges timing reports of scripts/run-shard.mjs --timings-out into
// tests/timings.json and prints the slowest test files (#370).
//
//   node scripts/test-timings.mjs report.json...          print the slowest 20
//   node scripts/test-timings.mjs --write report.json...  also update tests/timings.json
//
// CI uploads one report per Windows shard (artifact windows-test-timings-*);
// refresh tests/timings.json from them when the shards drift apart.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2),
    write = args.includes("--write"),
    files = args.filter((arg) => arg !== "--write");
const merged = {};
for (const file of files.filter((file) => existsSync(file)))
    Object.assign(merged, JSON.parse(readFileSync(file, "utf8")).seconds);
const sorted = Object.entries(merged).sort((a, b) => b[1] - a[1]);
const total = sorted.reduce((sum, [, seconds]) => sum + seconds, 0);
console.log(
    `${sorted.length} files, ${(total / 60).toFixed(1)} min in total; slowest:`,
);
for (const [name, seconds] of sorted.slice(0, 20))
    console.log(`${seconds.toFixed(1).padStart(8)} s  ${name}`);
if (write) {
    const target = join(root, "tests", "timings.json");
    const previous = JSON.parse(readFileSync(target, "utf8"));
    const seconds = { ...previous.seconds, ...merged };
    writeFileSync(
        target,
        JSON.stringify(
            {
                $comment: previous.$comment,
                seconds: Object.fromEntries(
                    Object.entries(seconds).sort(([a], [b]) =>
                        a < b ? -1 : 1,
                    ),
                ),
            },
            null,
            4,
        ) + "\n",
    );
    console.log("Updated tests/timings.json");
}
