import { RuntimeBuilder } from "./abi.js";
import { ObjectLayout as O } from "./object-layout.js";
import { MapLayout, MapEntryLayout } from "./map-layout.js";
import { WeakSetKind } from "./weak-collections.js";

/**
 * The native part of WeakRef (src/lib/runtime/weakref.js), linked only with
 * the weakRef prelude. A WeakRef keeps its target as the only key of a
 * private WeakSet: the collector never marks a WeakSet key and unlinks the
 * entry once the key dies (rt.gcPruneWeakEntries), so no collector code is
 * specific to WeakRef.
 *
 * __nonaWeakRefTarget(cell): the first live key of the WeakSet cell, or
 * undefined once the collector has removed it. Allocation-free.
 */
export function weakRefNativeHelpers(): RuntimeBuilder {
    const b = new RuntimeBuilder();
    b.fn("rt.weakRefTarget.code", 40, (a) => {
        const loop = a.unique("loop"),
            found = a.unique("found"),
            done = a.unique("done");
        a.mov("rax", 0);
        a.store({ base: "rcx" }, "rax");
        a.store({ base: "rcx", disp: 8 }, "rax");
        a.test("rdx", "rdx");
        a.jcc("e", done);
        a.load("rax", { base: "r8" });
        a.cmp("rax", 5);
        a.jcc("ne", done);
        a.load("r10", { base: "r8", disp: 8 });
        a.load("rax", { base: "r10", disp: O.kind });
        a.cmp("rax", WeakSetKind);
        a.jcc("ne", done);
        a.load("r10", { base: "r10", disp: MapLayout.head });
        a.label(loop);
        a.test("r10", "r10");
        a.jcc("e", done);
        a.load("rax", { base: "r10", disp: MapEntryLayout.active });
        a.test("rax", "rax");
        a.jcc("ne", found);
        a.load("r10", { base: "r10", disp: MapEntryLayout.next });
        a.jmp(loop);
        a.label(found);
        for (const n of [0, 8]) {
            a.load("rax", { base: "r10", disp: MapEntryLayout.key + n });
            a.store({ base: "rcx", disp: n }, "rax");
        }
        a.label(done);
    });
    return b;
}
