import { runtimeWellFormed } from "../lib/sources.generated.js";
// ES2024 String.prototype.isWellFormed and toWellFormed. Linked only when a
// program mentions them (preludeTriggers in src/link.ts).
export const wellFormedPreludeSource = runtimeWellFormed;
