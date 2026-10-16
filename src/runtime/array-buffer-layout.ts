import { ObjectLayout as O } from "./object-layout.js";

/**
 * ArrayBuffer and SharedArrayBuffer objects: an ordinary object followed by the byte storage fields.
 * `maxByteLength` is -1 for a fixed-length buffer. A resizable buffer reserves
 * `maxByteLength` bytes of storage up front, so `bytes` never moves when it is
 * resized. A growable SharedArrayBuffer keeps its current length in the 8 bytes
 * at `bytes - 16`, which every agent's object aliases; `byteLength` is this
 * agent's last observation of it and never exceeds it.
 */
export const ArrayBufferKind = 11;
export const SharedArrayBufferKind = 14;
export const ArrayBufferLayout = {
    bytes: O.size,
    byteLength: O.size + 8,
    detached: O.size + 16,
    maxByteLength: O.size + 24,
    size: O.size + 32,
} as const;
/** Bytes between a growable SharedArrayBuffer's shared length word and its data. */
export const SharedLengthHeader = 16;
/** Typed arrays (typed-array.ts): an ordinary object followed by the view fields. */
export const TypedArrayLayout = {
    buffer: O.size,
    byteOffset: O.size + 8,
    byteLength: O.size + 16,
    length: O.size + 24,
    elementType: O.size + 32,
    size: O.size + 40,
} as const;
