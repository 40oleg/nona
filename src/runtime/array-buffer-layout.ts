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
/**
 * Typed arrays (typed-array.ts): an ordinary object followed by the view fields.
 * `fixedByteLength` is the byte length the view was created with, or -1 for a
 * length-tracking view of a resizable or growable buffer. `byteLength` and
 * `length` hold the current lengths: for a view of a resizable buffer they are
 * refreshed by rt.typedArrayBounds (view-bounds.ts), which every reader calls
 * first, and are 0 while the view is out of bounds.
 */
export const TypedArrayLayout = {
    buffer: O.size,
    byteOffset: O.size + 8,
    byteLength: O.size + 16,
    length: O.size + 24,
    elementType: O.size + 32,
    fixedByteLength: O.size + 40,
    size: O.size + 48,
} as const;
/**
 * DataView objects (data-view.ts): the view fields at the offsets of the typed
 * array ones, refreshed by rt.dataViewBounds; `fixedByteLength` as above.
 */
export const DataViewLayout = {
    buffer: O.size,
    byteOffset: O.size + 8,
    byteLength: O.size + 16,
    fixedByteLength: O.size + 24,
    size: O.size + 32,
} as const;
