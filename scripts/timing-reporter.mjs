// A node:test reporter that writes the duration of every test file as JSON
// ({"seconds": {name: seconds}}), the sum of its top-level tests (#370).
// Used by scripts/run-shard.mjs --timings-out next to the spec reporter.
import { basename } from "node:path";

export default async function* timingReporter(source) {
    const seconds = {};
    for await (const event of source) {
        if (event.type !== "test:pass" && event.type !== "test:fail") continue;
        const { file, nesting, details } = event.data;
        if (!file || nesting !== 0 || !details?.duration_ms) continue;
        const name = basename(file).replace(/\.test\.(js|ts)$/, "");
        seconds[name] = (seconds[name] ?? 0) + details.duration_ms / 1000;
    }
    for (const name of Object.keys(seconds))
        seconds[name] = Math.round(seconds[name] * 10) / 10;
    yield JSON.stringify({ seconds }, null, 1) + "\n";
}
