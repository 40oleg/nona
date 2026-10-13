import { runtimeBinaryData } from "../lib/sources.generated.js";
// The JavaScript parts of ArrayBuffer, SharedArrayBuffer, DataView and the
// typed arrays (slice, subarray, sort, the BigInt accessors, ...). Linked when
// a source can reach a binary data type (see preludeTriggers.binaryData).
export const binaryDataPreludeSource = runtimeBinaryData;
