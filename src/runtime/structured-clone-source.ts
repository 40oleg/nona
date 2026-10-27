import { runtimeStructuredClone } from "../lib/sources.generated.js";
// structuredClone over a memo of cloned objects (structured-clone.js). Runs
// after the events prelude, whose DOMException it throws.
export const structuredClonePreludeSource = runtimeStructuredClone;
