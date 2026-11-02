// Startup diagnostics can retain full child dumps. Never inherit arbitrary
// driver variables (including credentials or Node/PowerShell injection options).
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const allowed = [
    "SystemRoot",
    "WINDIR",
    "SystemDrive",
    "ComSpec",
    "PATH",
    "PATHEXT",
    "TEMP",
    "TMP",
    "ProgramFiles",
    "ProgramFiles(x86)",
    "ProgramW6432",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "ProgramData",
    "WindowsSdkDir",
    "WindowsSdkBinPath",
    "WindowsSDKVersion",
    "GITHUB_ACTIONS",
    "GITHUB_REPOSITORY",
    "GITHUB_EVENT_NAME",
    "GITHUB_EVENT_PATH",
    "GITHUB_SHA",
    "GITHUB_WORKFLOW_SHA",
    "GITHUB_WORKFLOW_REF",
    "GITHUB_REF",
    "GITHUB_WORKSPACE",
    "GITHUB_RUN_ID",
    "GITHUB_RUN_ATTEMPT",
    "RUNNER_ENVIRONMENT",
    "RUNNER_OS",
    "RUNNER_NAME",
    "ImageOS",
    "ImageVersion",
    "STARTUP_MODE",
    "STARTUP_EXPECTED_SHA",
    "PORT",
    "DIAG_LISTENERS",
    "DIAG_STATE",
    "DIAG_CHUNK_BYTES",
    "DIAG_CHUNKS",
    "NONA_GC_STRESS",
    "NONA_CACHE",
];

export function startupChildEnv(source = process.env, overrides = {}) {
    // Canonicalize Windows key casing, emitting one spelling per allowed name.
    // Overrides also go through the allowlist; this is never a token-name denylist.
    const values = new Map(
        [...Object.entries(source), ...Object.entries(overrides)].map(
            ([key, value]) => [key.toUpperCase(), value],
        ),
    );
    const env = {};
    for (const key of allowed) {
        const value = values.get(key.toUpperCase());
        if (typeof value === "string") env[key] = value;
    }
    // No inherited symbol-server paths or debugger initialization commands.
    env._NT_SYMBOL_PATH = "";
    env._NT_ALT_SYMBOL_PATH = "";
    return env;
}

// Hosted workflow PowerShell/SDK/collector helpers use the same boundary as
// driver children. Their children inherit this explicit environment in turn.
if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
    const [command, ...args] = process.argv.slice(2);
    if (!command) throw Error("Expected startup helper command");
    const child = spawn(command, args, {
        env: startupChildEnv(),
        windowsHide: true,
        stdio: "inherit",
    });
    child.once("error", () => {
        process.exitCode = 1;
    });
    child.once("close", (code) => {
        process.exitCode = code ?? 1;
    });
}
