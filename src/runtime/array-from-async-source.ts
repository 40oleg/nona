import { runtimeArrayFromAsync } from "../lib/sources.generated.js";
// Array.fromAsync (ES2026): an async function over for-await, so the awaiting
// order and the iterator closing are those of the async iteration protocol.
export const arrayFromAsyncPreludeSource = runtimeArrayFromAsync;
