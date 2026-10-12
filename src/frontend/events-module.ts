import type { Target } from "../target.js";
import { modulesEvents } from "../lib/sources.generated.js";

/** Thin providers expose the same original constructor as process and streams. */
export function eventsModuleForTarget(_target: Target): string {
    return modulesEvents;
}
