/**
 * Object model limits shared by IR lowering (static literal shapes, small
 * array literals) and the runtime (src/runtime/shapes.ts,
 * src/runtime/array-elements.ts), and the names its inline caches serve
 * (src/runtime/property-cache.ts, src/ir/calls.ts).
 */
/** Most inline slots an object gets. */
export const maxInlineCapacity = 64;
/**
 * Array literals of up to this many table slots keep the table inside the
 * array's own cell, right after the header (rt.newArrayLiteral): the table
 * of an object whose `elements` is its payload + ObjectLayout.size is never
 * released on its own. Growing it moves the elements to a raw-heap table.
 */
export const inlineElementCapacity = 8;
/** Names the inline caches may serve: plain names that are not indices, "length" or "__proto__". */
export function cacheableName(name: string): boolean {
    return (
        name.length > 0 &&
        !(name.charCodeAt(0) >= 48 && name.charCodeAt(0) <= 57) &&
        name !== "length" &&
        name !== "__proto__"
    );
}
