import { runtimeWeakref } from "../lib/sources.generated.js";
// WeakRef over a private WeakSet cell per target (weak-ref.ts), with the
// kept-alive list cleared around every microtask checkpoint. Runs after the
// Promise prelude, whose drain it wraps, and before the timers prelude.
export const weakRefPreludeSource = runtimeWeakref;
