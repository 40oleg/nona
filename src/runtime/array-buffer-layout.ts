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
/** Typed arrays (typed-array.ts): an ordinary object followed by the view fields. */
export const TypedArrayLayout = {
    buffer: O.size,
    byteOffset: O.size + 8,
    byteLength: O.size + 16,
    length: O.size + 24,
    elementType: O.size + 32,
    size: O.size + 40,
} as const;
