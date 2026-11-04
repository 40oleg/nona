// Recovered from 1619e503d9c65f9eeab845a177e92a870dc61428.
// Only supervise() and its byte/error helpers; no historical campaign imports.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
    appendFileSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
} from "node:fs";
import { join } from "node:path";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const blob = (path) => {
    const bytes = readFileSync(path);
    return { path, bytes: bytes.length, sha256: sha(bytes) };
};
const json = (path, value) =>
    writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
const errorRecord = (error) =>
    error
        ? {
              ...Object.fromEntries(
                  Object.getOwnPropertyNames(error).map((name) => [
                      name,
                      error[name],
                  ]),
              ),
              name: error.name,
              message: error.message,
              stack: error.stack,
          }
        : null;

export function supervise(command, args, cwd, id, boundMs, env = process.env) {
    assert.ok(Number.isInteger(boundMs) && boundMs > 0 && boundMs <= 180000);
    mkdirSync(cwd, { recursive: true });
    const prefix = join(cwd, id);
    const stdoutPath = prefix + ".stdout.bin",
        stderrPath = prefix + ".stderr.bin";
    writeFileSync(stdoutPath, Buffer.alloc(0));
    writeFileSync(stderrPath, Buffer.alloc(0));
    const start = process.hrtime.bigint();
    const elapsed = () => Number(process.hrtime.bigint() - start) / 1e6;
    const receipt = {
        id,
        command,
        args,
        cwd,
        boundMs,
        startedAt: new Date().toISOString(),
        status: null,
        signal: null,
        error: null,
        deadlineExceeded: false,
        exitSeen: false,
        closeSeen: false,
        forcedPipeCleanup: false,
        pipes: {
            stdoutEnded: false,
            stderrEnded: false,
            stdoutClosed: false,
            stderrClosed: false,
        },
        chunks: [],
        events: [],
    };
    return new Promise((resolveRun) => {
        let child,
            deadline,
            cleanup,
            finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            clearTimeout(deadline);
            clearTimeout(cleanup);
            receipt.finishedAt = new Date().toISOString();
            receipt.durationMs = elapsed();
            receipt.stdout = blob(stdoutPath);
            receipt.stderr = blob(stderrPath);
            json(prefix + ".receipt.json", receipt);
            resolveRun(receipt);
        };
        const kill = () => {
            receipt.deadlineExceeded = true;
            receipt.events.push({
                event: "deadline",
                ms: elapsed(),
                signal: "SIGKILL",
            });
            child.kill("SIGKILL");
            cleanup = setTimeout(() => {
                receipt.forcedPipeCleanup = true;
                child.stdout.destroy();
                child.stderr.destroy();
                finish();
            }, 2000);
        };
        try {
            child = spawn(command, args, {
                cwd,
                env,
                windowsHide: true,
                stdio: ["ignore", "pipe", "pipe"],
                shell: false,
            });
        } catch (error) {
            receipt.error = errorRecord(error);
            receipt.events.push({
                event: "spawn-throw",
                ms: elapsed(),
                error: errorRecord(error),
            });
            finish();
            return;
        }
        for (const [name, path] of [
            ["stdout", stdoutPath],
            ["stderr", stderrPath],
        ]) {
            let offset = 0;
            child[name].on("data", (bytes) => {
                receipt.chunks.push({
                    stream: name,
                    ms: elapsed(),
                    offset,
                    bytes: bytes.length,
                });
                appendFileSync(path, bytes);
                offset += bytes.length;
            });
            child[name].on("end", () => {
                receipt.pipes[name + "Ended"] = true;
                receipt.events.push({ event: name + "-end", ms: elapsed() });
            });
            child[name].on("close", () => {
                receipt.pipes[name + "Closed"] = true;
                receipt.events.push({ event: name + "-close", ms: elapsed() });
            });
            child[name].on("error", (error) => {
                receipt.error = errorRecord(error);
                receipt.events.push({
                    event: name + "-error",
                    ms: elapsed(),
                    error: errorRecord(error),
                });
            });
        }
        child.on("error", (error) => {
            receipt.error = errorRecord(error);
            receipt.events.push({
                event: "error",
                ms: elapsed(),
                error: errorRecord(error),
            });
        });
        child.on("exit", (status, signal) => {
            receipt.status = status;
            receipt.signal = signal;
            receipt.exitSeen = true;
            receipt.events.push({
                event: "exit",
                status,
                signal,
                ms: elapsed(),
            });
        });
        child.on("close", (status, signal) => {
            receipt.status = status;
            receipt.signal = signal;
            receipt.closeSeen = true;
            receipt.events.push({
                event: "close",
                status,
                signal,
                ms: elapsed(),
            });
            finish();
        });
        deadline = setTimeout(kill, boundMs);
    });
}
