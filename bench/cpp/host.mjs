// Running Linux tools and binaries from bench/cpp/ scripts: directly on a
// Linux host, through `wsl -e` on Windows (the binaries and the C++ compiler
// then run in WSL2; the scripts record that).

import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const here = dirname(fileURLToPath(import.meta.url));
export const root = resolve(here, "..", "..");
export const buildDir = resolve(here, "build");
export const isWindows = process.platform === "win32";

// Runs `command` (a list) on the Linux side.
export function linux(command, options = {}) {
    const [cmd, ...args] = command;
    return isWindows
        ? spawnSync("wsl", ["-e", cmd, ...args], {
              encoding: "utf8",
              maxBuffer: 1 << 28,
              ...options,
          })
        : spawnSync(cmd, args, {
              encoding: "utf8",
              maxBuffer: 1 << 28,
              ...options,
          });
}

// Runs a shell script on the Linux side; returns trimmed stdout ("" on error).
export function linuxSh(script) {
    const r = linux(["sh", "-c", script]);
    return r.status === 0 ? r.stdout.trim() : "";
}

let wslRoot;
// The Linux path of a local path (/mnt/c/... under WSL).
export function toLinux(path) {
    if (!isWindows) return path;
    wslRoot ??= (() => {
        const r = spawnSync("wsl", ["-e", "wslpath", "-a", root], {
            encoding: "utf8",
        });
        if (r.status !== 0)
            throw new Error("wslpath failed (is WSL installed?): " + r.stderr);
        return r.stdout.trim();
    })();
    const relative = resolve(path).slice(root.length).split("\\").join("/");
    return wslRoot + relative;
}

// Is a Linux environment with the given command available?
export function hasLinux(cmd) {
    const r = linux(["sh", "-c", `command -v ${cmd}`]);
    return r.status === 0 && r.stdout.trim() !== "";
}
