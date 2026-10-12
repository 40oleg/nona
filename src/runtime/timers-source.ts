import { runtimeTimers } from "../lib/sources.generated.js";
// Timers and the host event loop (setTimeout/setInterval/queueMicrotask).
// The prelude replaces the Promise drain function with the event loop: the
// entry calls it once after the top-level program. It adds no prelude globals.
export const timersPreludeSource = runtimeTimers;
