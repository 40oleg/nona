import { runtimeErrorStack } from "../lib/sources.generated.js";
// V8 stack trace API (Error.captureStackTrace, Error.stackTraceLimit,
// Error.prepareStackTrace) with placeholder call sites; linked when a source
// names one of them (see preludeTriggers).
export const errorStackPreludeSource = runtimeErrorStack;
