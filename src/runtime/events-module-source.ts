import { runtimeEventsModule } from "../lib/sources.generated.js";
/**
 * The original node:events algorithms (EventEmitter, once, on, …) as module
 * source. The runtime installs them once (event-emitter-source.ts); the
 * node:events provider (src/frontend/events-module.ts) re-exports that
 * constructor.
 */
export const eventsModuleSource = runtimeEventsModule;
