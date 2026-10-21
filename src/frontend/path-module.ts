import type { Target } from "../target.js";
import { modulesPathCore } from "../lib/sources.generated.js";
import { pathHostSource } from "./path-host.js";
import { pathOriginalSource } from "./path-original-source.js";
import { pathGlobOriginalSource } from "./path-glob-original-source.js";

/**
 * `nona:internal/path-core`: resolve, join and dirname for node:fs, and the
 * helpers node:path builds on. Its source names none of the optional runtime
 * parts, so node:fs does not link globbing, RegExp or Unicode tables (#439).
 */
export const pathCoreSource = modulesPathCore;
export function pathCoreSourceForTarget(target: Target): string {
    return pathHostSource(target) + pathCoreSource;
}

/**
 * `node:path`: original Nona-owned implementation; Node.js is a behavioral
 * oracle only. It imports its core (and the target's pathHost adapter) from
 * nona:internal/path-core, so a program using node:path and node:fs links
 * the shared primitives once.
 */
const implementation = pathGlobOriginalSource + pathOriginalSource;
export const pathModuleSource = implementation;

/** The import and export statements of a module source. */
const moduleStatements = /^(?:import|export)\b[\s\S]*?;$/gm;
/**
 * node:path with its core as one script without imports or exports, for
 * tests that evaluate the source outside of the compiler: `pathHost` is
 * `globalThis.process` or, with a target, its native adapter (which still
 * calls `define` of nona:ffi).
 */
export function pathScriptSource(target?: Target): string {
    return (
        (target
            ? pathCoreSourceForTarget(target)
            : "const pathHost=globalThis.process;\n" + pathCoreSource
        ).replace(moduleStatements, "") +
        implementation.replace(moduleStatements, "") +
        "\nreturn path;"
    );
}
