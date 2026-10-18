import { RuntimeBuilder, slot, failIf } from "./abi.js";
import { rootedFn } from "./root-scope.js";
import { ObjectLayout as O } from "./object-layout.js";
import { prependFunctionBuiltin } from "./function-builtin.js";
import { TypedArrayKind, TypedArrayLayout } from "./array-buffer-layout.js";
import { emitViewCheck } from "./view-bounds.js";
import { emitTypedSearch } from "./typed-array-kernels.js";

/**
 * %TypedArray%.prototype.includes / indexOf / lastIndexOf (ES2024
 * 23.2.3.16, 23.2.3.17, 23.2.3.20). The fromIndex coercion may shrink a
 * resizable buffer, so the search is re-bounded to the current length.
 */
export function emitTypedArraySearch(b: RuntimeBuilder): void {
    for (const name of ["includes", "indexOf", "lastIndexOf"] as const) {
        const symbol =
            "rt.typedArray" + name[0]!.toUpperCase() + name.slice(1) + ".fn";
        prependFunctionBuiltin(b, symbol, name, 1, "rt.typedArrayPrototype");
        rootedFn(
            b,
            symbol + ".code",
            216,
            [
                { kind: "output", register: "rcx" },
                { kind: "range", register: "r8", count: "rdx" },
                { kind: "locals", offset: 64, count: 5 },
            ],
            (a, frame) => {
                a.store(slot(40), "rcx");
                a.store(slot(48), "rdx");
                a.store(slot(56), "r8");
                a.load("rdx", slot(frame + 40));
                for (const n of [0, 8]) {
                    a.load("rax", { base: "rdx", disp: n });
                    a.store(slot(64 + n), "rax");
                }
                a.load("rax", slot(64));
                a.cmp("rax", 5);
                failIf(a, "ne", "rt.throwTypeError");
                a.load("r10", slot(72));
                a.load("rax", { base: "r10", disp: O.kind });
                a.cmp("rax", TypedArrayKind);
                failIf(a, "ne", "rt.throwTypeError");
                emitViewCheck(a, "r10");
                a.test("r11", "r11");
                failIf(a, "ne", "rt.throwTypeError");
                a.load("rax", { base: "r10", disp: TypedArrayLayout.length });
                a.store(slot(168), "rax");
                const notFound = a.unique("notFound"),
                    found = a.unique("found"),
                    result = a.unique("result");
                a.test("rax", "rax");
                a.jcc("e", notFound);
                a.load("rax", slot(48));
                const noSearch = a.unique("noSearch"),
                    searchReady = a.unique("searchReady");
                a.test("rax", "rax");
                a.jcc("e", noSearch);
                a.load("rdx", slot(56));
                for (const n of [0, 8]) {
                    a.load("rax", { base: "rdx", disp: n });
                    a.store(slot(80 + n), "rax");
                }
                a.jmp(searchReady);
                a.label(noSearch);
                a.mov("rax", 0);
                a.store(slot(80), "rax");
                a.store(slot(88), "rax");
                a.label(searchReady);
                if (name === "lastIndexOf") {
                    a.load("rax", slot(168));
                    a.sub("rax", 1);
                } else a.mov("rax", 0);
                a.store(slot(160), "rax");
                const startReady = a.unique("startReady"),
                    startZero = a.unique("startZero"),
                    negative = a.unique("negative"),
                    atEnd = a.unique("atEnd");
                a.load("rax", slot(48));
                a.cmp("rax", 2);
                a.jcc("b", startReady);
                a.load("rdx", slot(56));
                a.add("rdx", 16);
                a.lea("rcx", slot(144));
                a.call("rt.toNumber");
                a.movsd("xmm0", slot(152));
                a.ucomisd("xmm0", "xmm0");
                a.jcc("p", startZero);
                a.mov("rax", 0);
                a.cvtsi2sd("xmm1", "rax");
                a.ucomisd("xmm0", "xmm1");
                a.jcc("b", negative);
                a.load("rax", slot(168));
                a.cvtsi2sd("xmm1", "rax");
                a.ucomisd("xmm0", "xmm1");
                a.jcc("ae", name === "lastIndexOf" ? atEnd : notFound);
                a.cvttsd2si("rax", "xmm0");
                a.store(slot(160), "rax");
                a.jmp(startReady);
                a.label(negative);
                // lastIndexOf finds nothing below -length (its integer part
                // -length still starts at index 0); the others start at 0.
                a.load("rax", slot(168));
                if (name === "lastIndexOf") a.add("rax", 1);
                a.neg("rax");
                a.cvtsi2sd("xmm1", "rax");
                a.ucomisd("xmm0", "xmm1");
                a.jcc("be", name === "lastIndexOf" ? notFound : startZero);
                a.cvttsd2si("rax", "xmm0");
                a.test("rax", "rax");
                a.jcc("e", startZero);
                a.load("r10", slot(168));
                a.add("rax", "r10");
                a.store(slot(160), "rax");
                a.jmp(startReady);
                a.label(startZero);
                a.mov("rax", 0);
                a.store(slot(160), "rax");
                a.jmp(startReady);
                a.label(atEnd);
                a.load("rax", slot(168));
                a.sub("rax", 1);
                a.store(slot(160), "rax");
                a.label(startReady);
                if (name !== "includes") {
                    // Only elements below the current length are present.
                    const bounded = a.unique("bounded");
                    a.load("r10", slot(72));
                    emitViewCheck(a, "r10");
                    a.test("r11", "r11");
                    a.jcc("ne", notFound);
                    a.load("rax", {
                        base: "r10",
                        disp: TypedArrayLayout.length,
                    });
                    a.load("r11", slot(168));
                    a.cmp("r11", "rax");
                    a.jcc("le", bounded);
                    a.store(slot(168), "rax");
                    if (name === "lastIndexOf") {
                        a.test("rax", "rax");
                        a.jcc("e", notFound);
                        a.load("r11", slot(160));
                        a.cmp("r11", "rax");
                        a.jcc("b", bounded);
                        a.sub("rax", 1);
                        a.store(slot(160), "rax");
                    }
                    a.label(bounded);
                }
                const loop = a.unique("loop"),
                    next = a.unique("next"),
                    generic = a.unique("generic");
                emitTypedSearch(
                    a,
                    name,
                    { receiver: 64, search: 80, start: 160, length: 168 },
                    { generic, found, notFound },
                );
                a.label(generic);
                a.label(loop);
                if (name !== "lastIndexOf") {
                    a.load("rax", slot(160));
                    a.load("r10", slot(168));
                    a.cmp("rax", "r10");
                    a.jcc("ae", notFound);
                }
                a.lea("rcx", slot(96));
                a.load("rdx", slot(160));
                a.call("rt.arrayIndexKey");
                a.lea("rcx", slot(112));
                a.lea("rdx", slot(64));
                a.lea("r8", slot(96));
                a.call("rt.getProperty");
                a.lea("rcx", slot(128));
                a.lea("rdx", slot(112));
                a.lea("r8", slot(80));
                a.call("rt.strictEq");
                a.load("rax", slot(136));
                a.test("rax", "rax");
                a.jcc("ne", found);
                if (name === "includes") {
                    a.load("rax", slot(112));
                    a.cmp("rax", 3);
                    a.jcc("ne", next);
                    a.load("rax", slot(80));
                    a.cmp("rax", 3);
                    a.jcc("ne", next);
                    a.movsd("xmm0", slot(120));
                    a.ucomisd("xmm0", "xmm0");
                    a.jcc("np", next);
                    a.movsd("xmm0", slot(88));
                    a.ucomisd("xmm0", "xmm0");
                    a.jcc("p", found);
                }
                a.label(next);
                a.load("rax", slot(160));
                if (name === "lastIndexOf") {
                    a.test("rax", "rax");
                    a.jcc("e", notFound);
                    a.sub("rax", 1);
                } else a.add("rax", 1);
                a.store(slot(160), "rax");
                a.jmp(loop);
                a.label(found);
                if (name === "includes") a.mov("rax", 1);
                else a.load("rax", slot(160));
                a.jmp(result);
                a.label(notFound);
                a.mov("rax", name === "includes" ? 0 : -1);
                a.label(result);
                a.load("rcx", slot(40));
                if (name === "includes") {
                    a.mov("r10", 2);
                    a.store({ base: "rcx" }, "r10");
                    a.store({ base: "rcx", disp: 8 }, "rax");
                } else {
                    a.cvtsi2sd("xmm0", "rax");
                    a.mov("rax", 3);
                    a.store({ base: "rcx" }, "rax");
                    a.storesd({ base: "rcx", disp: 8 }, "xmm0");
                }
            },
        );
    }
}
