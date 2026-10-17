import { runtimeFinalizationRegistry } from "../lib/sources.generated.js";
// FinalizationRegistry over the WeakRef cells of weak-ref.ts, scanned after a
// microtask checkpoint that follows a collection. Runs after the WeakRef
// prelude and before the timers prelude, whose loop calls the drain it wraps.
export const finalizationRegistryPreludeSource = runtimeFinalizationRegistry;
