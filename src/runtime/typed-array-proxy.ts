import { RuntimeBuilder } from "./abi.js";
import { ObjectLayout as O, ProxyKind } from "./object-layout.js";
import { prependFunctionBuiltin } from "./function-builtin.js";

export const typedArrayProxyRoots = ["rt.typedArrayIsProxy.fn"];
export const typedArrayProxyPropertyRoots = [
    "rt.TypedArray.__nonaIsProxyInternal",
    "rt.typedArrayIsProxy.fn.name",
    "rt.typedArrayIsProxy.fn.length",
];

/** util.types.isProxy support: whether the argument is a Proxy object. */
export function emitTypedArrayIsProxy(b: RuntimeBuilder): void {
    prependFunctionBuiltin(
        b,
        "rt.typedArrayIsProxy.fn",
        "__nonaIsProxyInternal",
        1,
        "rt.TypedArray",
    );
    b.fn("rt.typedArrayIsProxy.fn.code", 40, (a) => {
        const done = a.unique("done");
        a.mov("rax", 0);
        a.test("rdx", "rdx");
        a.jcc("e", done);
        a.load("r10", { base: "r8" });
        a.cmp("r10", 5);
        a.jcc("ne", done);
        a.load("r10", { base: "r8", disp: 8 });
        a.load("r11", { base: "r10", disp: O.kind });
        a.cmp("r11", ProxyKind);
        a.jcc("ne", done);
        a.mov("rax", 1);
        a.label(done);
        a.mov("r10", 2);
        a.store({ base: "rcx" }, "r10");
        a.store({ base: "rcx", disp: 8 }, "rax");
    });
}
