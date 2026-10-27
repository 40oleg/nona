import { RuntimeBuilder, slot, failIf } from "./abi.js";
import { selectNativeConstructPrototype } from "./constructor-prototype.js";
import { rootedFn } from "./root-scope.js";
import {
    ObjectLayout as O,
    PropertyLayout as P,
    PropertyAttributes as A,
} from "./object-layout.js";
import { errorConstructorNames } from "../global-builtins.js";
import {
    prependFunctionBuiltin,
    builtinPropertyRoots,
} from "./function-builtin.js";
import { stringLiteral } from "./value.js";
import type { Fixup } from "../backend/machine/model.js";
import type { Assembler } from "../backend/machine/context.js";
import { ProxyKind } from "./object-layout.js";
import { ProxyLayout } from "./proxy.js";

export const ErrorKind = 5;
export const errorRoots = [
    ...errorConstructorNames.map((n) => "rt." + n.toLowerCase() + "Prototype"),
    "rt.errorToString",
];
export const errorPropertyRoots = [
    "rt.Error.__nonaIsRejectionErrorInternal",
    "rt.Error.__nonaExitInternal",
    ...errorConstructorNames.flatMap((n) =>
        ["name", "message"].map(
            (k) => "rt." + n.toLowerCase() + "Prototype." + k,
        ),
    ),
    ...builtinPropertyRoots(
        "rt.errorToString",
        "toString",
        "rt.errorPrototype",
    ),
];
const pointer = (offset: number, target: string): Fixup => ({
    offset,
    kind: "va64",
    target,
    addend: 0,
});

export function emitErrorBrand(b: RuntimeBuilder): void {
    // The exit of an uncaught exception the prelude reported without the
    // process prelude (#501): exit code 1 after the hooks rt.fail runs.
    prependFunctionBuiltin(
        b,
        "rt.errorExit.fn",
        "__nonaExitInternal",
        0,
        "rt.Error",
    );
    b.fn("rt.errorExit.fn.code", 40, (a) => {
        const exit = a.unique("exit");
        a.mov("rax", 1);
        a.atomicExchange({ rip: "rt.fatalActive" }, "rax", 64);
        a.test("rax", "rax");
        a.jcc("ne", exit);
        a.call("rt.runExitHook");
        a.call("rt.callStatsReport");
        a.label(exit);
        a.mov("rcx", 1);
        a.callImport("ExitProcess");
    });
    prependFunctionBuiltin(
        b,
        "rt.errorIsNative.fn",
        "__nonaIsRejectionErrorInternal",
        1,
        "rt.Error",
    );
    b.fn("rt.errorIsNative.fn.code", 40, (a) => {
        const done = a.unique("done");
        a.mov("rax", 0);
        a.test("rdx", "rdx");
        a.jcc("e", done);
        a.load("r10", { base: "r8" });
        a.cmp("r10", 5);
        a.jcc("ne", done);
        a.load("r10", { base: "r8", disp: 8 });
        const inspect = a.unique("inspect"),
            brand = a.unique("brand");
        a.label(inspect);
        a.load("r11", { base: "r10", disp: O.kind });
        a.cmp("r11", ProxyKind);
        a.jcc("ne", brand);
        a.load("r11", { base: "r10", disp: ProxyLayout.revoked });
        a.test("r11", "r11");
        failIf(a, "ne", "rt.throwTypeError");
        a.load("r10", { base: "r10", disp: ProxyLayout.target + 8 });
        a.jmp(inspect);
        a.label(brand);
        a.cmp("r11", ErrorKind);
        a.jcc("ne", done);
        a.mov("rax", 1);
        a.label(done);
        a.mov("r10", 2);
        a.store({ base: "rcx" }, "r10");
        a.store({ base: "rcx", disp: 8 }, "rax");
    });
}
type ArgumentRegister = "rcx" | "rdx" | "r8" | "r9";
/** Like failIf(..., "rt.throwTypeError") for a get or set on an undefined or
 * null base: on condition c, call rt.throwNullishGet/Set with the base and key
 * Value pointers held in the given registers.
 */
export function failIfNullish(
    a: Assembler,
    c: import("../backend/machine/context.js").Condition,
    mode: "get" | "set",
    base: ArgumentRegister,
    key: ArgumentRegister,
): void {
    const skip = a.unique("notNullish"),
        fail = a.unique("nullish");
    a.jcc(c, fail);
    a.jmp(skip);
    a.label(fail);
    a.mov("r10", key);
    a.mov("rcx", base);
    a.mov("rdx", "r10");
    a.call(mode === "get" ? "rt.throwNullishGet" : "rt.throwNullishSet");
    a.label(skip);
}
// rt.throwNullishGet/Set(RCX base Value*, RDX key Value*): throw the TypeError
// of Node.js, "Cannot read properties of undefined (reading 'x')". The key part
// is formatted only for primitives, so that no user code runs; object keys
// (not yet converted by ToPropertyKey) give the message without it.
function emitNullishErrors(b: RuntimeBuilder): void {
    b.bundle.fragments.push(
        stringLiteral("rt.error.nullish.get", "Cannot read properties of "),
        stringLiteral("rt.error.nullish.set", "Cannot set properties of "),
        stringLiteral("rt.error.nullish.undefined", "undefined"),
        stringLiteral("rt.error.nullish.null", "null"),
        stringLiteral("rt.error.nullish.reading", " (reading '"),
        stringLiteral("rt.error.nullish.setting", " (setting '"),
        stringLiteral("rt.error.nullish.close", "')"),
    );
    for (const mode of ["get", "set"] as const)
        rootedFn(
            b,
            mode === "get" ? "rt.throwNullishGet" : "rt.throwNullishSet",
            136,
            [
                { kind: "value", register: "rdx" },
                { kind: "locals", offset: 64, count: 4 },
            ],
            (a) => {
                const text = (offset: number, name: string) => {
                    a.mov("rax", 4);
                    a.store(slot(offset), "rax");
                    a.lea("rax", { rip: "rt.error.nullish." + name });
                    a.store(slot(offset + 8), "rax");
                };
                const isNull = a.unique("isNull"),
                    based = a.unique("based"),
                    convert = a.unique("convert"),
                    symbol = a.unique("symbol"),
                    keyed = a.unique("keyed"),
                    build = a.unique("build");
                a.load("rax", { base: "rcx" });
                a.store(slot(40), "rax");
                a.store(slot(48), "rdx");
                text(64, mode);
                a.load("rax", slot(40));
                a.cmp("rax", 1);
                a.jcc("e", isNull);
                text(80, "undefined");
                a.jmp(based);
                a.label(isNull);
                text(80, "null");
                a.label(based);
                a.lea("rcx", slot(64));
                a.lea("rdx", slot(64));
                a.lea("r8", slot(80));
                a.call("rt.concat");
                // The key: a string as is, a symbol as Symbol(description),
                // other primitives through ToString.
                a.load("rdx", slot(48));
                a.load("rax", { base: "rdx" });
                a.cmp("rax", 4);
                a.jcc("ne", convert);
                for (const n of [0, 8]) {
                    a.load("rax", { base: "rdx", disp: n });
                    a.store(slot(80 + n), "rax");
                }
                a.jmp(keyed);
                a.label(convert);
                a.cmp("rax", 6);
                a.jcc("e", symbol);
                a.cmp("rax", 5);
                a.jcc("e", build);
                a.cmp("rax", 7);
                a.jcc("a", build);
                a.lea("rcx", slot(80));
                a.call("rt.toString");
                a.jmp(keyed);
                a.label(symbol);
                a.lea("rcx", slot(80));
                a.call("rt.symbolDescriptiveString");
                a.label(keyed);
                text(96, mode === "get" ? "reading" : "setting");
                a.lea("rcx", slot(64));
                a.lea("rdx", slot(64));
                a.lea("r8", slot(96));
                a.call("rt.concat");
                a.lea("rcx", slot(64));
                a.lea("rdx", slot(64));
                a.lea("r8", slot(80));
                a.call("rt.concat");
                text(96, "close");
                a.lea("rcx", slot(64));
                a.lea("rdx", slot(64));
                a.lea("r8", slot(96));
                a.call("rt.concat");
                a.label(build);
                a.lea("rcx", slot(112));
                a.mov("rdx", 1);
                a.lea("r8", slot(64));
                a.call("rt.TypeError.code");
                a.lea("rcx", slot(112));
                a.call("rt.throw");
            },
        );
}
// rt.throwNullishDestructure(RCX source Value*, RDX key Value* (a string, read
// only when R8 is 1), R8 hasKey): throw the TypeError of Node.js for a
// destructuring pattern applied to undefined or null, "Cannot destructure
// property 'a' of 'null' as it is null." or, without a key (an empty pattern or
// a computed first key), "Cannot destructure 'null' as it is null."
function emitNullishDestructureError(b: RuntimeBuilder): void {
    b.bundle.fragments.push(
        stringLiteral(
            "rt.error.destructure.property",
            "Cannot destructure property '",
        ),
        stringLiteral("rt.error.destructure.plain", "Cannot destructure '"),
        stringLiteral("rt.error.destructure.of", "' of '"),
        stringLiteral("rt.error.destructure.as", "' as it is "),
        stringLiteral("rt.error.destructure.dot", "."),
    );
    rootedFn(
        b,
        "rt.throwNullishDestructure",
        136,
        [
            { kind: "value", register: "rdx" },
            { kind: "locals", offset: 64, count: 4 },
        ],
        (a) => {
            const text = (offset: number, name: string) => {
                a.mov("rax", 4);
                a.store(slot(offset), "rax");
                a.lea("rax", { rip: "rt.error.nullish." + name });
                a.store(slot(offset + 8), "rax");
            };
            const destructure = (offset: number, name: string) => {
                a.mov("rax", 4);
                a.store(slot(offset), "rax");
                a.lea("rax", { rip: "rt.error.destructure." + name });
                a.store(slot(offset + 8), "rax");
            };
            const concat = (right: number) => {
                a.lea("rcx", slot(64));
                a.lea("rdx", slot(64));
                a.lea("r8", slot(right));
                a.call("rt.concat");
            };
            const isNull = a.unique("isNull"),
                based = a.unique("based"),
                plain = a.unique("plain"),
                named = a.unique("named");
            a.load("rax", { base: "rcx" });
            a.store(slot(40), "rax");
            a.store(slot(48), "rdx");
            a.store(slot(56), "r8");
            for (const n of [0, 8]) {
                a.load("rax", { base: "rdx", disp: n });
                a.store(slot(96 + n), "rax");
            }
            a.load("rax", slot(40));
            a.cmp("rax", 1);
            a.jcc("e", isNull);
            text(80, "undefined");
            a.jmp(based);
            a.label(isNull);
            text(80, "null");
            a.label(based);
            a.load("rax", slot(56));
            a.cmp("rax", 1);
            a.jcc("ne", plain);
            destructure(64, "property");
            concat(96);
            destructure(112, "of");
            concat(112);
            a.jmp(named);
            a.label(plain);
            destructure(64, "plain");
            a.label(named);
            concat(80);
            destructure(112, "as");
            concat(112);
            concat(80);
            destructure(112, "dot");
            concat(112);
            a.lea("rcx", slot(112));
            a.mov("rdx", 1);
            a.lea("r8", slot(64));
            a.call("rt.TypeError.code");
            a.lea("rcx", slot(112));
            a.call("rt.throw");
        },
    );
}
export function emitErrors(b: RuntimeBuilder): void {
    b.bundle.fragments.push(
        stringLiteral("rt.error.runtimeMessage", "Invalid operation"),
    );
    const runtimeMessage = new Uint8Array(16);
    runtimeMessage[0] = 4;
    b.bundle.fragments.push({
        name: "rt.error.runtimeMessageValue",
        section: ".rdata",
        alignment: 8,
        bytes: runtimeMessage,
        symbols: {},
        fixups: [pointer(8, "rt.error.runtimeMessage")],
    });
    // Intrinsic construction with a static string has no callbacks or safepoints.
    // The thrown object is copied into the catch root before collection can run.
    // Run-time source text (eval, Function with computed strings) is the documented
    // exception of the ahead-of-time contract (docs/es2020-contract.md).
    b.bundle.fragments.push(
        stringLiteral(
            "rt.error.dynamicCodeMessage",
            "Nona compiles ahead of time: eval and Function need source text known at compile time",
        ),
    );
    {
        const message = new Uint8Array(16);
        message[0] = 4;
        b.bundle.fragments.push({
            name: "rt.error.dynamicCodeMessageValue",
            section: ".rdata",
            alignment: 8,
            bytes: message,
            symbols: {},
            fixups: [pointer(8, "rt.error.dynamicCodeMessage")],
        });
    }
    b.bundle.fragments.push(
        stringLiteral(
            "rt.error.stackMessage",
            "Maximum call stack size exceeded",
        ),
    );
    {
        const message = new Uint8Array(16);
        message[0] = 4;
        b.bundle.fragments.push({
            name: "rt.error.stackMessageValue",
            section: ".rdata",
            alignment: 8,
            bytes: message,
            symbols: {},
            fixups: [pointer(8, "rt.error.stackMessage")],
        });
    }
    // Called from a JS prologue below rt.stackLimit; creating the error runs only
    // native code, which the margin below the limit accommodates.
    b.fn("rt.throwStackOverflow", 72, (a) => {
        a.lea("rcx", slot(48));
        a.mov("rdx", 1);
        a.lea("r8", { rip: "rt.error.stackMessageValue" });
        a.call("rt.RangeError.code");
        a.lea("rcx", slot(48));
        a.call("rt.throw");
    });
    b.fn("rt.throwDynamicCode", 72, (a) => {
        a.lea("rcx", slot(48));
        a.mov("rdx", 1);
        a.lea("r8", { rip: "rt.error.dynamicCodeMessageValue" });
        a.call("rt.EvalError.code");
        a.lea("rcx", slot(48));
        a.call("rt.throw");
    });
    for (const name of [
        "TypeError",
        "ReferenceError",
        "RangeError",
        "SyntaxError",
        "URIError",
        "EvalError",
    ])
        b.fn("rt.throw" + name, 72, (a) => {
            a.lea("rcx", slot(48));
            a.mov("rdx", 1);
            a.lea("r8", { rip: "rt.error.runtimeMessageValue" });
            a.call("rt." + name + ".code");
            a.lea("rcx", slot(48));
            a.call("rt.throw");
        });
    // Callability errors (#504). The *Message helpers take RCX = message Value*
    // (a static string, so building the error has no safepoint before the
    // throw); for rt.throwNotCallableMessage and rt.throwNotConstructorMessage
    // RCX = 0 selects the generic text.
    for (const [key, text] of [
        ["notCallable", "value is not a function"],
        ["notConstructor", "value is not a constructor"],
        ["classCallPrefix", "Class constructor "],
        ["classCallSuffix", " cannot be invoked without 'new'"],
    ] as const) {
        b.bundle.fragments.push(stringLiteral("rt.error." + key, text));
        const message = new Uint8Array(16);
        message[0] = 4;
        b.bundle.fragments.push({
            name: "rt.error." + key + "Value",
            section: ".rdata",
            alignment: 8,
            bytes: message,
            symbols: {},
            fixups: [pointer(8, "rt.error." + key)],
        });
    }
    b.fn("rt.throwTypeErrorMessage", 72, (a) => {
        a.mov("r8", "rcx");
        a.lea("rcx", slot(48));
        a.mov("rdx", 1);
        a.call("rt.TypeError.code");
        a.lea("rcx", slot(48));
        a.call("rt.throw");
    });
    for (const key of ["notCallable", "notConstructor"]) {
        const name =
            "rt.throw" + key[0]!.toUpperCase() + key.slice(1) + "Message";
        b.fn(name, 40, (a) => {
            const ready = a.unique("ready");
            a.test("rcx", "rcx");
            a.jcc("ne", ready);
            a.lea("rcx", { rip: "rt.error." + key + "Value" });
            a.label(ready);
            a.call("rt.throwTypeErrorMessage");
        });
        b.fn(name.slice(0, -"Message".length), 40, (a) => {
            a.lea("rcx", { rip: "rt.error." + key + "Value" });
            a.call("rt.throwTypeErrorMessage");
        });
    }
    // RCX: Value* of a class constructor called without new. The message names
    // it by its own `name` data property when that is a string (no getter runs),
    // else by the empty string, as V8 does. Reached through the realm table of
    // the callee, so the TypeError belongs to the callee's realm.
    rootedFn(
        b,
        "rt.throwClassConstructorCall",
        104,
        [{ kind: "locals", offset: 48, count: 3 }],
        (a) => {
            for (const offset of [0, 8]) {
                a.load("rax", { rip: "rt.error.key.empty", addend: offset });
                a.store(slot(48 + offset), "rax");
            }
            const ready = a.unique("ready");
            a.load("rcx", { base: "rcx", disp: 8 });
            a.lea("rdx", { rip: "rt.str.name" });
            a.call("rt.findOwnProperty");
            a.test("rax", "rax");
            a.jcc("e", ready);
            a.load("r10", { base: "rax", disp: P.attributes });
            a.and("r10", A.accessor);
            a.test("r10", "r10");
            a.jcc("ne", ready);
            a.load("r10", { base: "rax", disp: P.value });
            a.cmp("r10", 4);
            a.jcc("ne", ready);
            for (const offset of [0, 8]) {
                a.load("r10", { base: "rax", disp: P.value + offset });
                a.store(slot(48 + offset), "r10");
            }
            a.label(ready);
            a.lea("rcx", slot(64));
            a.lea("rdx", { rip: "rt.error.classCallPrefixValue" });
            a.lea("r8", slot(48));
            a.call("rt.concat");
            a.lea("rcx", slot(80));
            a.lea("rdx", slot(64));
            a.lea("r8", { rip: "rt.error.classCallSuffixValue" });
            a.call("rt.concat");
            a.lea("rcx", slot(64));
            a.mov("rdx", 1);
            a.lea("r8", slot(80));
            a.call("rt.TypeError.code");
            a.lea("rcx", slot(64));
            a.call("rt.throw");
        },
    );
    emitNullishErrors(b);
    emitNullishDestructureError(b);
    b.bundle.fragments.push(
        stringLiteral("rt.error.messageText", "message"),
        stringLiteral("rt.error.separator", ": "),
        stringLiteral("rt.error.tag", "[object Error]"),
    );
    b.bundle.fragments.push(stringLiteral("rt.error.causeText", "cause"));
    for (const [key, text] of [
        ["cause", "rt.error.causeText"],
        ["message", "rt.error.messageText"],
        ["name", "rt.str.name"],
        ["defaultName", "rt.Error.text"],
        ["empty", "rt.str.empty"],
        ["separator", "rt.error.separator"],
    ] as const) {
        const bytes = new Uint8Array(16);
        bytes[0] = 4;
        b.bundle.fragments.push({
            name: "rt.error.key." + key,
            section: ".rdata",
            alignment: 8,
            bytes,
            symbols: {},
            fixups: [pointer(8, text)],
        });
    }
    for (const name of errorConstructorNames) {
        const prototype = "rt." + name.toLowerCase() + "Prototype";
        b.bundle.fragments.push({
            name: prototype,
            section: ".data",
            alignment: 8,
            bytes: new Uint8Array(O.size),
            symbols: {},
            fixups: [
                pointer(
                    O.prototype,
                    name === "Error"
                        ? "rt.objectPrototype"
                        : "rt.errorPrototype",
                ),
                pointer(O.properties, prototype + ".name"),
            ],
        });
        for (const key of ["name", "message"]) {
            const bytes = new Uint8Array(P.size);
            bytes[P.value] = 4;
            bytes[P.attributes] = A.writable | A.configurable;
            b.bundle.fragments.push({
                name: prototype + "." + key,
                section: ".data",
                alignment: 8,
                bytes,
                symbols: {},
                fixups: [
                    pointer(
                        P.key,
                        key === "name" ? "rt.str.name" : "rt.error.messageText",
                    ),
                    pointer(
                        P.value + 8,
                        key === "name"
                            ? "rt." + name + ".text"
                            : "rt.str.empty",
                    ),
                    ...(key === "name"
                        ? [pointer(P.next, prototype + ".message")]
                        : []),
                ],
            });
        }
        for (const construct of [false, true])
            rootedFn(
                b,
                "rt." + name + (construct ? ".construct" : ".code"),
                136,
                [
                    { kind: "output", register: "rcx" },
                    { kind: "range", register: "r8", count: "rdx" },
                    { kind: "locals", offset: 80, count: 3 },
                ],
                (a, frame) => {
                    a.store(slot(40), "rcx");
                    a.store(slot(48), "rdx");
                    a.store(slot(56), "r8");
                    a.lea("rcx", slot(80));
                    a.mov("rdx", 0);
                    a.mov("r8", 0);
                    a.call("rt.newObject");
                    a.load("r10", slot(88));
                    a.mov("rax", ErrorKind);
                    a.store({ base: "r10", disp: O.kind }, "rax");
                    if (construct) {
                        selectNativeConstructPrototype(a, frame, prototype);
                        a.mov("rax", "r10");
                    } else a.lea("rax", { rip: prototype });
                    a.load("r10", slot(88));
                    a.store({ base: "r10", disp: O.prototype }, "rax");
                    const done = a.unique("done");
                    a.load("rax", slot(48));
                    a.test("rax", "rax");
                    a.jcc("e", done);
                    a.load("rdx", slot(56));
                    a.load("rax", { base: "rdx" });
                    a.test("rax", "rax");
                    a.jcc("e", done);
                    a.lea("rcx", slot(96));
                    a.call("rt.toString");
                    a.lea("rcx", slot(80));
                    a.lea("rdx", { rip: "rt.error.key.message" });
                    a.lea("r8", slot(96));
                    a.mov("r9", 1);
                    a.call("rt.setProperty");
                    a.load("rcx", slot(88));
                    a.lea("rdx", { rip: "rt.error.messageText" });
                    a.call("rt.findOwnProperty");
                    a.mov("r10", A.writable | A.configurable);
                    a.store({ base: "rax", disp: P.attributes }, "r10");
                    a.label(done);
                    // ES2022 InstallErrorCause: options.cause becomes an own non-enumerable property.
                    {
                        const noCause = a.unique("noCause");
                        a.load("rax", slot(48));
                        a.cmp("rax", 2);
                        a.jcc("b", noCause);
                        a.load("rdx", slot(56));
                        a.load("rax", { base: "rdx", disp: 16 });
                        a.cmp("rax", 5);
                        a.jcc("ne", noCause);
                        a.lea("rcx", slot(112));
                        a.load("rdx", slot(56));
                        a.add("rdx", 16);
                        a.lea("r8", { rip: "rt.error.key.cause" });
                        a.call("rt.hasProperty");
                        a.load("rax", slot(120));
                        a.test("rax", "rax");
                        a.jcc("e", noCause);
                        a.lea("rcx", slot(96));
                        a.load("rdx", slot(56));
                        a.add("rdx", 16);
                        a.lea("r8", { rip: "rt.error.key.cause" });
                        a.call("rt.getProperty");
                        a.lea("rcx", slot(80));
                        a.lea("rdx", { rip: "rt.error.key.cause" });
                        a.lea("r8", slot(96));
                        a.mov("r9", 1);
                        a.call("rt.setProperty");
                        a.load("rcx", slot(88));
                        a.lea("rdx", { rip: "rt.error.causeText" });
                        a.call("rt.findOwnProperty");
                        a.mov("r10", A.writable | A.configurable);
                        a.store({ base: "rax", disp: P.attributes }, "r10");
                        a.label(noCause);
                    }
                    a.load("rcx", slot(40));
                    for (const offset of [0, 8]) {
                        a.load("rax", slot(80 + offset));
                        a.store({ base: "rcx", disp: offset }, "rax");
                    }
                },
            );
    }
    prependFunctionBuiltin(
        b,
        "rt.errorToString",
        "toString",
        0,
        "rt.errorPrototype",
    );
    rootedFn(
        b,
        "rt.errorToString.code",
        168,
        [
            { kind: "output", register: "rcx" },
            { kind: "locals", offset: 64, count: 6 },
        ],
        (a, frame) => {
            a.store(slot(40), "rcx");
            a.load("rdx", slot(frame + 40));
            a.load("rax", { base: "rdx" });
            a.cmp("rax", 5);
            failIf(a, "ne", "rt.throwTypeError");
            for (const offset of [0, 8]) {
                a.load("rax", { base: "rdx", disp: offset });
                a.store(slot(64 + offset), "rax");
            }
            for (const [key, offset, fallback] of [
                ["name", 96, "defaultName"],
                ["message", 112, "empty"],
            ] as const) {
                a.lea("rcx", slot(80));
                a.lea("rdx", slot(64));
                a.lea("r8", { rip: "rt.error.key." + key });
                a.call("rt.getProperty");
                const convert = a.unique("convert"),
                    ready = a.unique("ready");
                a.load("rax", slot(80));
                a.test("rax", "rax");
                a.jcc("ne", convert);
                for (const n of [0, 8]) {
                    a.load("rax", {
                        rip: "rt.error.key." + fallback,
                        addend: n,
                    });
                    a.store(slot(offset + n), "rax");
                }
                a.jmp(ready);
                a.label(convert);
                a.lea("rcx", slot(offset));
                a.lea("rdx", slot(80));
                a.call("rt.toString");
                a.label(ready);
            }
            const nameEmpty = a.unique("nameEmpty"),
                messageEmpty = a.unique("messageEmpty"),
                done = a.unique("done");
            a.load("rax", slot(104));
            a.load("rax", { base: "rax" });
            a.test("rax", "rax");
            a.jcc("e", nameEmpty);
            a.load("rax", slot(120));
            a.load("rax", { base: "rax" });
            a.test("rax", "rax");
            a.jcc("e", messageEmpty);
            a.lea("rcx", slot(128));
            a.lea("rdx", slot(96));
            a.lea("r8", { rip: "rt.error.key.separator" });
            a.call("rt.concat");
            a.load("rcx", slot(40));
            a.lea("rdx", slot(128));
            a.lea("r8", slot(112));
            a.call("rt.concat");
            a.jmp(done);
            for (const [label, offset] of [
                [nameEmpty, 112],
                [messageEmpty, 96],
            ] as const) {
                a.label(label);
                a.load("rcx", slot(40));
                for (const n of [0, 8]) {
                    a.load("rax", slot(offset + n));
                    a.store({ base: "rcx", disp: n }, "rax");
                }
                a.jmp(done);
            }
            a.label(done);
        },
    );
}
