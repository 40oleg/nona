import { ObjectLayout as O } from "./object-layout.js";

/** ArrayBuffer and SharedArrayBuffer objects: an ordinary object followed by the byte storage fields. */
export const ArrayBufferKind = 11;
export const SharedArrayBufferKind = 14;
export const ArrayBufferLayout = {
    bytes: O.size,
    byteLength: O.size + 8,
    detached: O.size + 16,
    size: O.size + 24,
} as const;
