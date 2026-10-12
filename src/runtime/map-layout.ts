import { ObjectLayout as O } from "./object-layout.js";

export const MapKind = 15;
/** index: raw-heap hash table from key to entry (map-index.ts), or 0.
 * weakNext: the next WeakMap or WeakSet on rt.weakList (gc.ts). */
export const MapLayout = {
    head: O.size,
    tail: O.size + 8,
    count: O.size + 16,
    index: O.size + 24,
    weakNext: O.size + 32,
    size: O.size + 40,
} as const;
/** hash: the key's rt.mapKeyHash, stored once at insertion. */
/** weak: 1 for a WeakSet entry, whose value is its key and must not keep it alive. */
export const MapEntryLayout = {
    next: 0,
    key: 8,
    value: 24,
    active: 40,
    hash: 48,
    weak: 56,
    size: 64,
} as const;
/** Lists at least this long get a hash index (map-index.ts) on their first lookup. */
export const mapIndexThreshold = 8;
