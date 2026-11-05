// External observation; never edits a fixture, executable or its environment.
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
const [parent, output] = process.argv.slice(2);
const deadline = Date.now() + 480000;
while (Date.now() < deadline) {
    try {
        process.kill(Number(parent), 0);
    } catch {
        break;
    }
    const started = Date.now();
    const result =
        process.platform === "win32"
            ? spawnSync(
                  "pwsh",
                  [
                      "-NoProfile",
                      "-NonInteractive",
                      "-Command",
                      "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,UserModeTime,KernelModeTime,WorkingSetSize,CommandLine | ConvertTo-Json -Compress",
                  ],
                  { encoding: "utf8", timeout: 5000, windowsHide: true },
              )
            : spawnSync(
                  "ps",
                  ["-axo", "pid,ppid,time,rss,pcpu,state,command"],
                  { encoding: "utf8", timeout: 5000 },
              );
    appendFileSync(
        output,
        JSON.stringify({
            started,
            finished: Date.now(),
            parent: Number(parent),
            observer: process.pid,
            status: result.status,
            signal: result.signal,
            error: result.error && {
                message: result.error.message,
                code: result.error.code,
            },
            stdout: result.stdout,
            stderr: result.stderr,
        }) + "\n",
    );
    await setTimeout(2000);
}
