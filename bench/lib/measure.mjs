// Process measurement shared by bench/run.mjs-style scripts and
// bench/report.mjs: running a command with wall time and peak RSS, building a
// script with Nona (build time and executable size), the commands of each
// runtime and the description of the machine and runtime versions.

import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { cpus, totalmem, release, platform, arch } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
);
export const target = process.platform === "win32" ? "win32-x64" : "linux-x64";
export const exe = process.platform === "win32" ? ".exe" : "";

// GNU time, when installed, reports the peak RSS of the child in KB.
const gnuTime =
    process.platform === "linux" && existsSync("/usr/bin/time")
        ? "/usr/bin/time"
        : null;

export function has(cmd, args = ["--version"]) {
    try {
        return spawnSync(cmd, args, { stdio: "ignore" }).status === 0;
    } catch {
        return false;
    }
}

export function availableRuntimes() {
    return { node: true, deno: has("deno"), bun: has("bun"), nona: true };
}

// Command line that runs `script` on a runtime; `binary` is the Nona build.
export function command(rt, script, binary) {
    switch (rt) {
        case "node":
            return ["node", [script]];
        case "deno":
            return ["deno", ["run", "-A", script]];
        case "bun":
            return ["bun", [script]];
        case "nona":
            return [binary, []];
        default:
            throw new Error("unknown runtime " + rt);
    }
}

// Runs a command once: wall time in seconds, peak RSS in MB (Linux with GNU
// time), exit code, stdout and the tail of stderr.
export function measure(cmd, args, { cwd, env, timeout = 600000, stdin } = {}) {
    const marker = "__rss_kb=";
    const wrapped = gnuTime
        ? [gnuTime, ["-f", marker + "%M", cmd, ...args]]
        : [cmd, args];
    const t0 = performance.now();
    const r = spawnSync(wrapped[0], wrapped[1], {
        encoding: "utf8",
        maxBuffer: 1 << 30,
        timeout,
        cwd,
        env: { ...process.env, ...env },
        input: stdin,
    });
    const wall = (performance.now() - t0) / 1000;
    let stderr = r.stderr || "";
    let rss = NaN;
    const at = stderr.lastIndexOf(marker);
    if (at >= 0) {
        rss =
            Number(
                stderr
                    .slice(at + marker.length)
                    .trim()
                    .split("\n")[0],
            ) / 1024;
        stderr = stderr.slice(0, at);
    }
    return {
        rc: r.status,
        signal: r.signal,
        timedOut: r.signal === "SIGTERM" && wall * 1000 >= timeout,
        wall: +wall.toFixed(4),
        rss: Number.isFinite(rss) ? +rss.toFixed(2) : NaN,
        stdout: r.stdout || "",
        stderr: stderr
            .replace(/\x1b\[[\d;]*m/g, "")
            .trim()
            .slice(-400),
    };
}

// Builds `script` with the compiler in dist/ and returns the build time in
// seconds and the executable's size in bytes, or the compiler's error.
export function buildNona(script, out, { module = false, extra = [] } = {}) {
    const args = [
        resolve(root, "dist", "cli.js"),
        "build",
        script,
        "-o",
        out,
        "--target",
        target,
        ...(module ? ["--module"] : []),
        ...extra,
    ];
    const t0 = performance.now();
    const r = spawnSync("node", args, { encoding: "utf8", maxBuffer: 1 << 26 });
    const seconds = (performance.now() - t0) / 1000;
    if (r.status !== 0)
        return {
            ok: false,
            seconds: +seconds.toFixed(2),
            error: (r.stderr || r.stdout || "").trim().slice(-600),
        };
    return {
        ok: true,
        seconds: +seconds.toFixed(2),
        bytes: statSync(out).size,
        out,
    };
}

function version(cmd, args, pattern) {
    try {
        const text = execFileSync(cmd, args, { encoding: "utf8" });
        const m = pattern ? text.match(pattern) : null;
        return (m ? m[1] : text).trim().split("\n")[0];
    } catch {
        return null;
    }
}

export function versions() {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
    let commit = null;
    try {
        commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
            cwd: root,
            encoding: "utf8",
        }).trim();
    } catch {}
    return {
        nona: pkg.version,
        commit,
        node: version("node", ["--version"]),
        deno: version("deno", ["--version"], /deno (\S+)/),
        bun: version("bun", ["--version"]),
        hyperfine: version("hyperfine", ["--version"], /hyperfine (\S+)/),
        valgrind: version("valgrind", ["--version"], /valgrind-(\S+)/),
    };
}

export function machine() {
    let governor = null;
    try {
        governor = readFileSync(
            "/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor",
            "utf8",
        ).trim();
    } catch {}
    const cpu = cpus();
    return {
        platform: `${platform()} ${release()} ${arch()}`,
        cpu: cpu[0]?.model.replace(/\s+/g, " ").trim() ?? "unknown",
        cpus: cpu.length,
        memoryGB: +(totalmem() / 2 ** 30).toFixed(1),
        governor,
    };
}
