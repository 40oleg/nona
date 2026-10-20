import type { Assembler } from "../backend/machine/context.js";
import { HeapLayout as H, HeapKind } from "./heap-layout.js";
import { ObjectLayout as O } from "./object-layout.js";

/**
 * Writes the header of a plain shaped object into the cell RAX (from
 * rt.allocRaw, not cleared): its heap kind, every object field, the shape in
 * SHAPE and Object.prototype. Its inline slots are left to the caller.
 * Clobbers R10.
 */
export function emitShapedObjectHeader(
    a: Assembler,
    shape: "rdx" | "r11",
): void {
    a.mov("r10", HeapKind.object);
    a.store({ base: "rax", disp: H.kind - H.size }, "r10");
    a.mov("r10", 0);
    for (const field of [
        O.kind,
        O.properties,
        O.length,
        O.flags,
        O.index,
        O.elements,
        O.keys,
    ])
        a.store({ base: "rax", disp: field }, "r10");
    a.store({ base: "rax", disp: O.shape }, shape);
    a.lea("r10", { rip: "rt.objectPrototype" });
    a.store({ base: "rax", disp: O.prototype }, "r10");
}
