import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// Source-size budget of the compiler (#169): large files and long lines make
// every change touch the same text, which is where parallel work conflicts.
// Generated tables (*-data.ts, *.generated.ts) are exempt. Files that were
// over the budget when it was introduced are listed in source-budget.json
// with their size and longest line at that time; they may shrink but not
// grow, and an entry must be removed once its file is within the budget.
const maxBytes = 60 * 1024,
    maxLine = 200;
const root = resolve("src");
const allowances = JSON.parse(
    readFileSync(resolve("tests/source-budget.json"), "utf8"),
).files as Record<string, { bytes: number; line: number }>;
function sources(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
            ? sources(join(directory, entry.name))
            : entry.name.endsWith(".ts")
              ? [join(directory, entry.name)]
              : [],
    );
}
const measured = new Map(
    sources(root)
        .filter((file) => !/(-data|\.generated)\.ts$/.test(file))
        .map((file) => {
            const text = readFileSync(file, "utf8");
            return [
                relative(root, file).replaceAll("\\", "/"),
                {
                    bytes: Buffer.byteLength(text),
                    line: Math.max(
                        ...text.split(/\r?\n/).map((line) => line.length),
                    ),
                },
            ];
        }),
);

test("source files stay within the size budget or their allowance", () => {
    assert.ok(measured.size > 100);
    const violations: string[] = [];
    for (const [file, { bytes, line }] of measured) {
        const allowance = allowances[file] ?? {
            bytes: maxBytes,
            line: maxLine,
        };
        if (bytes > Math.max(allowance.bytes, maxBytes))
            violations.push(
                `src/${file}: ${bytes} bytes (budget ${Math.max(allowance.bytes, maxBytes)})`,
            );
        if (line > Math.max(allowance.line, maxLine))
            violations.push(
                `src/${file}: a line of ${line} characters (budget ${Math.max(allowance.line, maxLine)})`,
            );
    }
    assert.deepEqual(violations, []);
});

test("the allow-list only names files that still exceed the budget", () => {
    const stale = Object.keys(allowances).filter((file) => {
        const m = measured.get(file);
        return !m || (m.bytes <= maxBytes && m.line <= maxLine);
    });
    assert.deepEqual(
        stale,
        [],
        "remove these entries from tests/source-budget.json",
    );
});
