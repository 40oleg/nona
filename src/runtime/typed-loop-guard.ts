import type { RuntimeBuilder } from "./abi.js";
import { slot } from "./abi.js";
import {
    ObjectLayout as O,
    PropertyLayout as P,
    PropertyAttributes as A,
} from "./object-layout.js";
import {
    ArrayBufferKind,
    ArrayBufferLayout,
    TypedArrayKind,
    TypedArrayLayout,
} from "./array-buffer-layout.js";
import { typedArrayLengthGetter } from "./property-cache.js";

/**
 * rt.typedLoopGuard (#240): the entry test of a loop versioned by
 * src/ir/typed-loops.ts, called like a `call` operation (RCX result Value*,
 * RDX argument count, R8 the argument Values). The arguments are
 *
 *     header, start, bound, receivers..., primitives...
 *
 * with header = 16 * receivers + (1 when the bound is the first receiver's
 * length; the bound argument is then ignored). The result is true when
 *
 * - start is an integer Number >= 0 (-0 included);
 * - every receiver is a typed array over an ArrayBuffer (not shared) of
 *   fixed length that is not detached, and its `length` is the intrinsic
 *   %TypedArray%.prototype.length getter: no own `length`, the first one up
 *   its prototype chain that rt.namedGetFast finds is that accessor;
 * - the bound is a Number (NaN fails) no greater than every receiver's
 *   length;
 * - no primitive argument is an object.
 *
 * Nothing here calls user code or allocates on the collected heap.
 */
export function emitTypedLoopGuard(b: RuntimeBuilder): void {
    b.fn("rt.typedLoopGuard", 120, (a) => {
        const fail = a.unique("fail"),
            done = a.unique("done"),
            receivers = a.unique("receivers"),
            receiversDone = a.unique("receiversDone"),
            numberBound = a.unique("numberBound"),
            haveBound = a.unique("haveBound"),
            lengths = a.unique("lengths"),
            primitives = a.unique("primitives"),
            passed = a.unique("passed");
        // 40 result, 48 end of the arguments, 56 arguments, 64 bound (a
        // double), 72 cursor, 80 end of the receivers, 88 the key "length",
        // 104 the scratch result of rt.namedGetFast.
        a.store(slot(40), "rcx");
        a.shl("rdx", 4);
        a.add("rdx", "r8");
        a.store(slot(48), "rdx");
        a.store(slot(56), "r8");
        a.mov("rax", 4);
        a.store(slot(88), "rax");
        a.lea("rax", { rip: "rt.str.length" });
        a.store(slot(96), "rax");
        a.movsd("xmm0", { base: "r8", disp: 8 });
        a.cvttsd2si("rax", "xmm0");
        a.store(slot(64), "rax");
        a.and("rax", -16);
        a.add("rax", "r8");
        a.add("rax", 48);
        a.store(slot(80), "rax");
        // The start: an integer Number >= 0.
        a.load("rax", { base: "r8", disp: 16 });
        a.cmp("rax", 3);
        a.jcc("ne", fail);
        a.movsd("xmm0", { base: "r8", disp: 24 });
        a.cvttsd2si("rax", "xmm0");
        a.cvtsi2sd("xmm1", "rax");
        a.ucomisd("xmm0", "xmm1");
        a.jcc("ne", fail);
        a.jcc("p", fail);
        a.test("rax", "rax");
        a.jcc("s", fail);
        // The receivers.
        a.lea("rax", { base: "r8", disp: 48 });
        a.store(slot(72), "rax");
        a.label(receivers);
        a.load("rdx", slot(72));
        a.load("rax", slot(80));
        a.cmp("rdx", "rax");
        a.jcc("ae", receiversDone);
        a.load("rax", { base: "rdx" });
        a.cmp("rax", 5);
        a.jcc("ne", fail);
        a.load("r10", { base: "rdx", disp: 8 });
        a.load("rax", { base: "r10", disp: O.kind });
        a.cmp("rax", TypedArrayKind);
        a.jcc("ne", fail);
        a.load("r11", { base: "r10", disp: TypedArrayLayout.buffer });
        a.load("rax", { base: "r11", disp: O.kind });
        a.cmp("rax", ArrayBufferKind);
        a.jcc("ne", fail);
        a.load("rax", { base: "r11", disp: ArrayBufferLayout.maxByteLength });
        a.test("rax", "rax");
        a.jcc("ns", fail);
        a.load("rax", { base: "r11", disp: ArrayBufferLayout.detached });
        a.test("rax", "rax");
        a.jcc("ne", fail);
        // `length` is not answered as a data property, and the accessor found
        // is the intrinsic getter.
        a.lea("rcx", slot(104));
        a.lea("r8", slot(88));
        a.call("rt.namedGetFast");
        a.test("rax", "rax");
        a.jcc("ne", fail);
        a.load("rax", { rip: "rt.namedGetNode" });
        a.test("rax", "rax");
        a.jcc("e", fail);
        a.load("r11", { base: "rax", disp: P.attributes });
        a.and("r11", A.accessor);
        a.test("r11", "r11");
        a.jcc("e", fail);
        a.load("r11", { base: "rax", disp: P.getter });
        a.cmp("r11", 5);
        a.jcc("ne", fail);
        a.load("r11", { base: "rax", disp: P.getter + 8 });
        a.lea("r10", { rip: typedArrayLengthGetter });
        a.cmp("r11", "r10");
        a.jcc("ne", fail);
        a.load("rdx", slot(72));
        a.add("rdx", 16);
        a.store(slot(72), "rdx");
        a.jmp(receivers);
        a.label(receiversDone);
        // The bound, as a double in slot 64.
        a.load("r8", slot(56));
        a.load("rax", slot(64));
        a.and("rax", 1);
        a.test("rax", "rax");
        a.jcc("e", numberBound);
        a.load("r10", { base: "r8", disp: 56 });
        a.load("rax", { base: "r10", disp: TypedArrayLayout.length });
        a.cvtsi2sd("xmm0", "rax");
        a.jmp(haveBound);
        a.label(numberBound);
        a.load("rax", { base: "r8", disp: 32 });
        a.cmp("rax", 3);
        a.jcc("ne", fail);
        a.movsd("xmm0", { base: "r8", disp: 40 });
        a.label(haveBound);
        a.storesd(slot(64), "xmm0");
        // bound <= length of every receiver.
        a.lea("rdx", { base: "r8", disp: 48 });
        a.label(lengths);
        a.load("rax", slot(80));
        a.cmp("rdx", "rax");
        a.jcc("ae", primitives);
        a.load("r10", { base: "rdx", disp: 8 });
        a.load("rax", { base: "r10", disp: TypedArrayLayout.length });
        a.cvtsi2sd("xmm1", "rax");
        a.movsd("xmm0", slot(64));
        a.ucomisd("xmm0", "xmm1");
        a.jcc("p", fail);
        a.jcc("a", fail);
        a.add("rdx", 16);
        a.jmp(lengths);
        // The primitives: no object.
        a.label(primitives);
        a.load("rax", slot(48));
        a.cmp("rdx", "rax");
        a.jcc("ae", passed);
        a.load("rax", { base: "rdx" });
        a.cmp("rax", 5);
        a.jcc("e", fail);
        a.add("rdx", 16);
        a.jmp(primitives);
        a.label(passed);
        a.mov("rax", 1);
        a.jmp(done);
        a.label(fail);
        a.mov("rax", 0);
        a.label(done);
        a.load("rcx", slot(40));
        a.store({ base: "rcx", disp: 8 }, "rax");
        a.mov("rax", 2);
        a.store({ base: "rcx" }, "rax");
    });
}
