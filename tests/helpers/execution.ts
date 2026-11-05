import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** Include non-enumerable Error fields and nested causes, without losing buffers. */
export function serializeExecution(
    value: unknown,
    seen = new Set<unknown>(),
): unknown {
    if (value === undefined) return null;
    if (typeof value === "bigint") return value.toString();
    if (value === null || typeof value !== "object") return value;
    if (Buffer.isBuffer(value))
        return { encoding: "base64", data: value.toString("base64") };
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const result = Array.isArray(value)
        ? value.map((item) => serializeExecution(item, seen))
        : Object.fromEntries(
              [
                  ...new Set([
                      ...(value instanceof Error
                          ? ["name", "message", "stack"]
                          : []),
                      ...Object.getOwnPropertyNames(value),
                  ]),
              ].map((key) => [
                  key,
                  serializeExecution(Reflect.get(value, key), seen),
              ]),
          );
    seen.delete(value);
    return result;
}

export function executionFailure(result: unknown): string {
    return JSON.stringify(serializeExecution(result), null, 2);
}

/** Opt-in evidence only; write inputs before compilation or execution can fail. */
export function executionEvidence(kind: string, input: unknown) {
    const root = process.env.NONA_EXECUTION_EVIDENCE;
    if (!root) return undefined;
    mkdirSync(root, { recursive: true });
    const directory = mkdtempSync(join(resolve(root), kind + "-"));
    const json = (name: string, value: unknown) =>
        writeFileSync(join(directory, name), executionFailure(value) + "\n");
    json("input.json", {
        input,
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        source: process.env.NONA_DIAGNOSTIC_SOURCE,
        gcSelection: process.env.NONA_GC_STRESS,
        started: new Date().toISOString(),
    });
    return {
        directory,
        json,
        bytes(name: string, bytes: Uint8Array | string) {
            writeFileSync(join(directory, name), bytes);
            json(name + ".sha256.json", {
                sha256: createHash("sha256").update(bytes).digest("hex"),
            });
        },
    };
}

export function retainExecution(
    evidence: ReturnType<typeof executionEvidence>,
    result: {
        status: number | null;
        signal: NodeJS.Signals | null;
        stdout?: Buffer | string | null;
        stderr?: Buffer | string | null;
        error?: Error;
    },
    started: number,
) {
    if (!evidence) return;
    evidence.bytes("stdout.bin", result.stdout ?? Buffer.alloc(0));
    evidence.bytes("stderr.bin", result.stderr ?? Buffer.alloc(0));
    evidence.json("result.json", {
        ...result,
        elapsedMs: performance.now() - started,
        finished: new Date().toISOString(),
    });
}
