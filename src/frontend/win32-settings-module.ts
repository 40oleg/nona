import { CompileError } from "../diagnostics.js";
import { modulesWin32Settings } from "../lib/sources.generated.js";

export function win32SettingsModuleSource(target: string): string {
    if (target !== "win32-x64")
        throw new CompileError([
            {
                code: "E_HOST_MODULE",
                message: "nona:win32/settings requires Windows x64 (win32-x64)",
                file: "nona:win32/settings",
                span: { start: 0, end: 0 },
            },
        ]);
    return modulesWin32Settings;
}
