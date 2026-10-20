/**
 * Object model limits shared by IR lowering (static literal shapes) and the
 * runtime's shapes (src/runtime/shapes.ts), and the names its inline caches
 * serve (src/runtime/property-cache.ts, src/ir/calls.ts).
 */
/** Most inline slots an object gets. */
export const maxInlineCapacity = 64;
/** Names the inline caches may serve: plain names that are not indices, "length" or "__proto__". */
export function cacheableName(name: string): boolean {
    return (
        name.length > 0 &&
        !(name.charCodeAt(0) >= 48 && name.charCodeAt(0) <= 57) &&
        name !== "length" &&
        name !== "__proto__"
    );
}
