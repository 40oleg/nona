import { CompileError } from "../diagnostics.js";
import {
    modulesGui,
    modulesGuiElements,
    modulesGuiLayout,
    modulesGuiScene,
} from "../lib/sources.generated.js";

export const guiElementsSource = modulesGuiElements;
export const guiLayoutSource = modulesGuiLayout;
export const guiSceneSource = modulesGuiScene;

export function guiModuleSource(target: string): string {
    if (target !== "linux-x64")
        throw new CompileError([
            {
                code: "E_HOST_MODULE",
                message: "nona:gui requires Ubuntu Linux x64 (linux-x64)",
                file: "nona:gui",
                span: { start: 0, end: 0 },
            },
        ]);
    return modulesGui;
}
