import { createAssembler } from "../machine/context.js";
import {
    HandlerLayout as H,
    preservedGp,
    preservedXmm,
} from "../../runtime/exception-layout.js";
import {
    ObjectLayout as O,
    ProxyKind,
    ProxyCallable,
} from "../../runtime/object-layout.js";
import {
    maxInlineCapacity,
    emptyLiteralCapacity,
    LiteralSiteLayout,
} from "../../runtime/shapes.js";
import {
    emitLiteralStore,
    emitTypedElementGet,
    emitTypedElementSet,
    emitTypedLength,
    typedElementSite,
    type SiteEmitter,
} from "./element-sites.js";
import { planRegisterLoops, type RegisterLoop } from "./register-loops.js";
import { emitNewObject } from "./literals.js";
import { ElementsLayout } from "../../runtime/array-elements.js";
import {
    integerRemainder,
    maskableDivisor,
    toInt32Operand,
} from "./integer-ops.js";
import { emitSwitchTable } from "./switch-table.js";
import { emitFastSite, type SiteFrame } from "./method-sites.js";
import { emitStringIndexSite } from "./string-index-site.js";
import type { Assembler, Mem, Condition, Reg, Xmm } from "./assembler.js";
import type { NamedFragment, UnwindFunction } from "../machine/model.js";
import {
    terminatorUse,
    type ModuleIR,
    type FunctionIR,
    type BlockIR,
    type Operation,
} from "../../ir/model.js";
import { failIf } from "../../runtime/abi.js";
import {
    analyzeLiveness,
    isLive,
    liveFloor,
    operationUses,
} from "../../ir/liveness.js";
import { assignLocations, destinations } from "../../ir/locations.js";
import { RootLayout as R } from "../../runtime/heap-layout.js";
import { ropeTag } from "../../runtime/strings.js";
import {
    JsFrame as JF,
    FrameDescriptor as FD,
} from "../../runtime/frame-layout.js";
import {
    stackMapFragment,
    type StackMapEntry,
} from "../../runtime/stack-maps.js";
import {
    enterFrameStub,
    directEntryFits,
    emitDirectEntry,
    type DirectFrame,
} from "../../runtime/prologue.js";
import { usesFrameThis } from "../../ir/calls.js";
import {
    FunctionLayout,
    FunctionKind,
    NewCacheLayout,
} from "../../runtime/functions.js";
import { TailCallTag, ConstructErrorTag } from "../../runtime/tail-calls.js";
import type { CoverageOptions } from "./coverage.js";
import {
    CellTag,
    EnvironmentLayout as E,
} from "../../runtime/environment-layout.js";
import {
    PropertyCacheLayout,
    MethodCacheLayout,
    SetCacheLayout,
    cacheableName,
} from "../../runtime/property-cache.js";
import { HasCacheLayout } from "../../runtime/has-cache.js";
import {
    ClosureDescriptor as CD,
    ClosureFlags as CF,
    CallSiteDescriptor as SD,
    SiteNone,
    callSiteStub,
    closureStub,
    writeSiteEntry,
} from "../../runtime/call-sites.js";

const binary: Record<string, string> = {
    "+": "add",
    "-": "sub",
    "*": "mul",
    "/": "div",
    "%": "rem",
    "**": "pow",
    "==": "eq",
    "!=": "eq",
    "===": "strictEq",
    "!==": "strictEq",
    "<": "lt",
    "<=": "le",
    ">": "gt",
    ">=": "ge",
    "&": "bitAnd",
    "|": "bitOr",
    "^": "bitXor",
    "<<": "shiftLeft",
    ">>": "shiftRight",
    ">>>": "shiftUnsigned",
    instanceof: "instanceOf",
};
const unary: Record<string, string> = {
    "+": "pos",
    "-": "neg",
    "!": "not",
    "~": "bitNot",
    typeof: "typeof",
    isNullish: "isNullish",
    propertyKey: "toPropertyKey",
    propertyKeyIndex: "toPropertyKeyIndex",
    string: "toString",
    numeric: "toNumeric",
    increment: "increment",
    decrement: "decrement",
};
const alignedFrame = (n: number) => Math.ceil((n + 8) / 16) * 16 - 8;
/** Operations that only move values: no runtime call, no collection, no user code. */
const movesOnly = new Set<string>([
    "constant",
    "copy",
    "uninitialized",
    "loadGlobal",
    "constructorResult",
    "readCell",
    "writeCell",
    "loadCapture",
    "isFunctionCode",
]);
/** Moves with no effect besides their destination: not emitted when the destination is dead. */
const deadMoves = new Set<string>([
    "constant",
    "copy",
    "isFunctionCode",
    "loadGlobal",
    "readCell",
    "loadCapture",
]);

/** What a function's code needs from the image being generated (generateImage in codegen.ts). */
export interface EmitContext {
    fragments: NamedFragment[];
    /** The .rdata string record of a literal. */
    literal: (value: string) => string;
    /** The .rdata Value of a constant. */
    constantValue: (value: unknown) => string;
    /** The static source descriptor of a function's text. */
    sourceRange: (range: {
        source: string;
        start: number;
        end: number;
    }) => string;
    /** Ends a function's fragment and records its unwind information. */
    finish: (
        a: Assembler,
        name: string,
        size: number,
        prologSize: number,
        allocationCodeOffset?: number,
        savedRegisters?: UnwindFunction["savedRegisters"],
    ) => void;
    options: { gcStress?: boolean; coverage?: CoverageOptions };
    globalProperties: NonNullable<ModuleIR["globalProperties"]>;
    /** Symbols whose per-realm addresses realmFunction reads. */
    realmCodeTables: Set<string>;
}

/** The x86-64 code of one IR function: prologue, operations, terminators, cold paths and its stack maps. */
export function emitFunction(context: EmitContext, fn: FunctionIR): void {
    const {
        fragments,
        literal,
        constantValue,
        sourceRange,
        finish,
        options,
        globalProperties,
        realmCodeTables,
    } = context;
    // Object literal sites with known keys (#194), by the slot of the object
    // they create (defined only by its newObject): {shape, count, capacity,
    // keys...} (LiteralSiteLayout).
    const literalSites = new Map<number, string>();
    for (const block of fn.blocks)
        for (const op of block.operations)
            if (op.kind === "newObject" && op.keys && !op.array) {
                const site = "ls." + fragments.length,
                    L = LiteralSiteLayout,
                    bytes = new Uint8Array(L.keys + 8 * op.keys.length),
                    view = new DataView(bytes.buffer);
                view.setBigUint64(L.count, BigInt(op.keys.length), true);
                view.setBigUint64(
                    L.capacity,
                    BigInt(
                        Math.min(
                            Math.max(op.slots ?? 0, emptyLiteralCapacity),
                            maxInlineCapacity,
                        ),
                    ),
                    true,
                );
                fragments.push({
                    name: site,
                    section: ".data",
                    alignment: 8,
                    bytes,
                    symbols: {},
                    fixups: op.keys.map((key, i) => ({
                        offset: L.keys + 8 * i,
                        kind: "va64" as const,
                        target: literal(key),
                        addend: 0,
                    })),
                });
                literalSites.set(op.dest, site);
            }
    // Array literals created with their element table (#48), by the slot of
    // the array (defined only by its newObject).
    const arrayLiterals = new Set<number>();
    for (const block of fn.blocks)
        for (const op of block.operations)
            if (op.kind === "newObject" && op.array && op.elements)
                arrayLiterals.add(op.dest);
    // Stack +32 belongs to the outgoing fifth argument; never keep saved state there.
    const liveness = analyzeLiveness(fn),
        locations = assignLocations(fn, liveness);
    const a = createAssembler(fn.id),
        rootBase = JF.roots,
        valueBase = JF.values,
        thisBase = valueBase + 16 * locations.count,
        newTargetBase = thisBase + 16,
        superReceiverBase = newTargetBase + 16,
        argsBase = superReceiverBase + 16;
    let argumentsObjectCount = 0;
    for (const block of fn.blocks)
        for (const op of block.operations) {
            if (op.kind === "newArguments")
                argumentsObjectCount = Math.max(
                    argumentsObjectCount,
                    op.parameters.length + 1,
                );
        }
    const handlerBase =
        argsBase + 16 * Math.max(fn.maxArguments, argumentsObjectCount);
    const savedFrameBase = JF.savedFrame,
        frameBias = JF.bias;
    if (savedFrameBase !== rootBase + R.size || frameBias !== valueBase + 128)
        throw new Error("Frame layout mismatch");
    const stack = (disp: number): Mem => ({
        base: "rbp",
        disp: disp - frameBias,
    });
    // Coverage: one call count per function of the program (not the preludes).
    if (options.coverage && fn.source && !fn.id.startsWith("js.regexpVm."))
        a.incrementMemory({ rip: "cov." + fn.id });
    // The frame is built by rt.enterFrame (src/runtime/prologue.ts) from a
    // static descriptor: the stack-limit check, the page probes of a large
    // frame, the saved RBP, the argument registers, the cleared value slots,
    // this, new.target, the parameters and the root record. RBP addresses the
    // frame from the first value slot + 128, so that the first sixteen value
    // slots (most of a function's traffic) are reached with 8-bit
    // displacements; RSP-relative 32-bit ones made every load and store of
    // the generated code three bytes longer. RBP is preserved: it is saved in
    // the frame (stack+104, below the value slots) and restored before
    // returning; handlers and coroutines save it with the other preserved
    // registers.
    const location = (n: number): number => {
        if (n < 0 || n >= fn.slotCount) throw new RangeError("Invalid IR slot");
        return locations.location[n]!;
    };
    // A temporary whose only definition is a constant needs no frame
    // location: its Value lives once in .rdata (constantValue) and operations
    // read it from there, so the constant is never stored at run time.
    // Temporaries (slots past the declared locals) are always written before
    // they are read; a variable can be read before its one assignment
    // (hoisted `var`), so variables keep their slots.
    const definitions = new Map<number, number>(),
        constants = new Map<number, unknown>();
    for (const block of fn.blocks)
        for (const op of block.operations) {
            for (const d of destinations(op))
                definitions.set(d, (definitions.get(d) ?? 0) + 1);
            if (op.kind === "constant") constants.set(op.dest, op.value);
        }
    const staticConstant = (n: number): string | undefined =>
        definitions.get(n) === 1 && constants.has(n) && n >= fn.localCount
            ? constantValue(constants.get(n))
            : undefined;
    // Loops that keep Numbers in registers (register-loops.ts); the GPRs
    // they use are saved above the handler records.
    const registerLoops = planRegisterLoops(fn, liveness, liveFloor(fn), (n) =>
        definitions.get(n) === 1 && constants.has(n) && n >= fn.localCount
            ? { value: constants.get(n) }
            : undefined,
    );
    const saveBase = handlerBase + H.size * (fn.handlerCount ?? 0),
        saveSlots = Math.max(0, ...registerLoops.map((p) => p.saved.length));
    const allocation = alignedFrame(saveBase + 8 * saveSlots);
    if (!Number.isSafeInteger(allocation) || allocation > 0x7ffffff0)
        throw new RangeError("Function stack frame exceeds supported range");
    // Only the slots of locations live at entry (variables read before they
    // are assigned), the always live ones (stack-maps.ts) and the parameters
    // start as undefined: any other location is written before a stack map
    // lists it (frame-layout.ts).
    let clear = Math.max(
        Math.min(liveFloor(fn), locations.count),
        Math.min(fn.parameterCount, locations.count),
    );
    for (const n of liveness.get(fn.blocks[0]!.id)!.liveIn)
        if (!staticConstant(n)) clear = Math.max(clear, location(n) + 1);
    // Direct calls that pass exactly the parameters enter at `<id>.direct`
    // (src/ir/calls.ts): an inline prologue at the end of the function when
    // the frame is small (emitDirectEntry), else the ordinary entry.
    const copyThis = usesFrameThis(fn),
        directFrame: DirectFrame = {
            allocation,
            parameters: fn.parameterCount,
            clear,
            slots: locations.count,
            copyThis,
            maps: fn.id + ".maps",
        },
        directEntry = fn.directEntry && directEntryFits(directFrame);
    if (fn.directEntry && !directEntry) a.label(fn.id + ".direct");
    a.lea("r10", { rip: fn.id + ".frame" });
    a.call(enterFrameStub(fn.parameterCount, clear, allocation, copyThis));
    const entered = fn.id + ".entered";
    a.label(entered);
    // For the unwind information the frame exists once the stub has returned.
    const allocated = a.offset,
        prologSize = a.offset;
    const stringConstant = (n: number): boolean =>
        definitions.get(n) === 1 && typeof constants.get(n) === "string";
    const value = (n: number): Mem => {
        const c = staticConstant(n);
        return c ? { rip: c } : stack(valueBase + 16 * location(n));
    };
    const pointer = (reg: "rcx" | "rdx" | "r8" | "r9", n: number) =>
        a.lea(reg, value(n));
    const copy = (to: Mem, from: Mem) => {
        a.load("rax", from);
        a.store(to, "rax");
        const add = (m: Mem): Mem =>
            "base" in m
                ? { base: m.base, disp: (m.disp ?? 0) + 8 }
                : { rip: m.rip, addend: (m.addend ?? 0) + 8 };
        a.load("rax", add(from));
        a.store(add(to), "rax");
    };
    const payload = (n: number): Mem => {
        const c = staticConstant(n);
        return c
            ? { rip: c, addend: 8 }
            : stack(valueBase + 16 * location(n) + 8);
    };
    // A rope (strings.ts) in a frame slot becomes its flat string before an
    // operation that may read its units: the tag test is inline, the heap
    // kind test and the call out of line. Constants are flat; proven Number
    // operations never see a string.
    const ropeTransparent = (op: Operation): boolean => {
        switch (op.kind) {
            case "copy":
            case "storeGlobal":
            case "constant":
            case "loadGlobal":
            case "uninitialized":
            case "checkInitialized":
            case "checkResolvable":
            case "pushHandler":
            case "popHandler":
            case "immutableWrite":
            case "generatorInitialSuspend":
            case "isFunctionCode":
                return true;
            case "binary":
                return (
                    op.operator === "+" || !!op.numeric || constantEquality(op)
                );
            case "unary":
                return (
                    !!op.numeric ||
                    op.operator === "typeof" ||
                    op.operator.startsWith("typeofIs:") ||
                    op.operator.startsWith("typeofNot:") ||
                    op.operator === "!" ||
                    op.operator === "isNullish" ||
                    op.operator === "string"
                );
            case "property":
                return op.operation === "get" && op.keyName === "length";
            default:
                return false;
        }
    };
    // The slots that may hold a rope: results of a string `+` and of a
    // global read, and whatever a rope-transparent operation passes on from
    // such a slot (copies, template string conversion). Every other result
    // comes from the runtime or a call, which never return a rope, so only
    // these slots need a test (flow-insensitive, to a fixed point).
    const ropeSlots = new Set<number>();
    const passesString = (op: Operation): boolean => {
        if (
            op.kind === "binary" ||
            op.kind === "property" ||
            op.kind === "constant" ||
            op.kind === "uninitialized"
        )
            return false;
        if (op.kind === "unary") return op.operator === "string" && !op.numeric;
        return ropeTransparent(op);
    };
    for (let changed = true; changed;) {
        changed = false;
        for (const block of fn.blocks)
            for (const op of block.operations) {
                const may =
                    (op.kind === "binary" &&
                        op.operator === "+" &&
                        !op.numeric) ||
                    op.kind === "loadGlobal" ||
                    (passesString(op) &&
                        operationUses(op).some((n) => ropeSlots.has(n)));
                if (may)
                    for (const d of destinations(op))
                        if (!ropeSlots.has(d)) {
                            ropeSlots.add(d);
                            changed = true;
                        }
            }
    }
    const flattenSlot = (n: number) => {
        // (A slot held in a register loop's register is a Number.)
        if (staticConstant(n) || !ropeSlots.has(n) || held(n)) return;
        const flat = a.unique("flat"),
            check = a.unique("ropeCheck");
        a.load("rax", value(n));
        a.cmp("rax", 4);
        a.jcc("e", check);
        a.label(flat);
        pushCold(() => {
            a.label(check);
            a.load("r10", payload(n));
            a.load("rax", { base: "r10" });
            a.mov("r11", ropeTag);
            a.test("rax", "r11");
            a.jcc("e", flat);
            pointer("rcx", n);
            a.call("rt.flattenValue");
            a.jmp(flat);
        });
    };
    const setNumber = (dest: number) => {
        a.storesd(payload(dest), "xmm0");
        a.mov("rax", 3);
        a.store(value(dest), "rax");
    };
    const setBoolean = (dest: number) => {
        a.store(payload(dest), "rax");
        a.mov("rax", 2);
        a.store(value(dest), "rax");
    };
    // Number operands are the common case of every arithmetic and relational
    // operator, and the runtime's generic path (ToPrimitive, ToNumeric,
    // BigInt dispatch, string comparison) costs a call plus several hundred
    // instructions to reach the same addsd. Test both tags inline and run
    // the SSE instruction in place; anything else falls through to the call.
    // Returns the label the caller places after the generic call, or undefined
    // when the operator has no inline form.
    const emitNumberBinary = (
        dest: number,
        operator: string,
        left: number,
        right: number,
    ): { slow: string; done: string } | undefined => {
        // As for proven Numbers (below).
        const arithmetic = knownArithmetic,
            relation = knownRelation;
        const bitwise = ["&", "|", "^", "<<", ">>", ">>>"];
        if (
            !(operator in arithmetic) &&
            !(operator in relation) &&
            !bitwise.includes(operator) &&
            operator !== "%"
        )
            return undefined;
        const slow = a.unique("generic"),
            done = a.unique("fastDone");
        a.load("rax", value(left));
        a.cmp("rax", 3);
        a.jcc("ne", slow);
        a.load("rax", value(right));
        a.cmp("rax", 3);
        a.jcc("ne", slow);
        if (operator in arithmetic) {
            a.movsd("xmm0", payload(left));
            a[arithmetic[operator]!]("xmm0", payload(right));
            setNumber(dest);
        } else if (operator in relation) {
            // ucomisd sets the parity flag for unordered (NaN) operands, where
            // every relation but != is false.
            const negated = operator === "!=" || operator === "!==",
                holds = a.unique("holds"),
                store = a.unique("store");
            a.movsd("xmm0", payload(left));
            a.ucomisd("xmm0", payload(right));
            a.mov("rax", 0);
            a.jcc("p", store);
            a.jcc(relation[operator]!, holds);
            a.jmp(store);
            a.label(holds);
            a.mov("rax", 1);
            a.label(store);
            if (negated) a.xor("rax", 1);
            setBoolean(dest);
        } else if (operator === "%") {
            const mask =
                staticConstant(right) !== undefined
                    ? maskableDivisor(constants.get(right))
                    : undefined;
            integerRemainder(a, payload(left), mask ?? payload(right), slow);
            setNumber(dest);
        } else {
            // ToInt32 inline for integral operands in the int64 range (#402);
            // fractions, NaN, ±Infinity and larger values take the runtime.
            toInt32Operand(a, payload(left), "r10", slow);
            toInt32Operand(a, payload(right), "rcx", slow);
            switch (operator) {
                case "&":
                    a.and("r10", "rcx");
                    break;
                case "|":
                    a.or("r10", "rcx");
                    break;
                case "^":
                    a.xor("r10", "rcx");
                    break;
                case "<<":
                    a.and("rcx", 31);
                    a.shl("r10", "cl");
                    break;
                case ">>":
                    a.movsxd("r10", "r10");
                    a.and("rcx", 31);
                    a.sar("r10", "cl");
                    break;
                case ">>>":
                    a.and("rcx", 31);
                    a.mov("r11", 0xffffffff);
                    a.and("r10", "r11");
                    a.shr("r10", "cl");
                    break;
            }
            // The result is the low 32 bits as an int32; for >>> it is the
            // zero-extended uint32.
            if (operator === ">>>") a.cvtsi2sd("xmm0", "r10");
            else a.cvtsi2sd32("xmm0", "r10");
            setNumber(dest);
        }
        a.jmp(done);
        return { slow, done };
    };
    // x === c where c is a static undefined, null, Boolean or Number constant
    // (#146): a tag test (and a payload test for Booleans, ucomisd for
    // Numbers: NaN equals nothing, -0 equals 0) instead of rt.strictEquals.
    // testConstant jumps to `differ` unless the value equals the constant.
    const comparand = (
        left: number,
        right: number,
    ): { other: number; k: number } | undefined => {
        const known = (n: number) =>
            staticConstant(n) !== undefined &&
            (constants.get(n) === null ||
                ["undefined", "boolean", "number"].includes(
                    typeof constants.get(n),
                ));
        return known(right)
            ? { other: left, k: right }
            : known(left)
              ? { other: right, k: left }
              : undefined;
    };
    // Calls nothing and reads only the tag of a string (so a rope stays one).
    const constantEquality = (op: Operation) =>
        op.kind === "binary" &&
        (op.operator === "===" || op.operator === "!==") &&
        !!comparand(op.left, op.right);
    const testConstant = (
        { other, k }: { other: number; k: number },
        differ: string,
    ) => {
        const v = constants.get(k),
            tag =
                v === undefined
                    ? 0
                    : v === null
                      ? 1
                      : typeof v === "boolean"
                        ? 2
                        : 3;
        a.load("r10", value(other));
        a.cmp("r10", tag);
        a.jcc("ne", differ);
        if (tag === 2) {
            a.load("r10", payload(other));
            a.test("r10", "r10");
            a.jcc(v ? "e" : "ne", differ);
        }
        if (tag === 3) {
            a.movsd("xmm0", payload(other));
            a.ucomisd("xmm0", payload(k));
            a.jcc("p", differ);
            a.jcc("ne", differ);
        }
    };
    // Jumps to differ unless callee is a function object running code
    // `target` (the test of a direct call); keeps R11.
    const testFunctionCode = (
        op: Extract<Operation, { kind: "isFunctionCode" }>,
        differ: string,
    ) => {
        a.load("rax", value(op.callee));
        a.cmp("rax", 5);
        a.jcc("ne", differ);
        a.load("r10", payload(op.callee));
        a.load("rax", { base: "r10", disp: O.kind });
        a.cmp("rax", FunctionKind);
        a.jcc("ne", differ);
        a.load("rax", { base: "r10", disp: FunctionLayout.code });
        a.lea("r10", { rip: op.target });
        a.cmp("rax", "r10");
        a.jcc("ne", differ);
    };
    // Operands proven Numbers by src/ir/numbers.ts: no tag checks, no runtime fallback.
    const knownArithmetic: Record<
        string,
        "addsd" | "subsd" | "mulsd" | "divsd"
    > = { "+": "addsd", "-": "subsd", "*": "mulsd", "/": "divsd" };
    const knownRelation: Record<string, Condition> = {
        "<": "b",
        "<=": "be",
        ">": "a",
        ">=": "ae",
        "==": "e",
        "===": "e",
        "!=": "e",
        "!==": "e",
    };
    const inverse: Partial<Record<Condition, Condition>> = {
        b: "ae",
        be: "a",
        a: "be",
        ae: "b",
        e: "ne",
    };
    // A proven Number operand: its frame slot, or in a register loop's
    // register copy (`view`) its register (an integer converted exactly).
    const numberInto = (x: Xmm, n: number) => {
        const integer = intReg(n),
            double = xmmReg(n);
        if (integer) a.cvtsi2sd(x, integer);
        else if (double) {
            if (double !== x) a.movsd(x, double);
        } else a.movsd(x, payload(n));
    };
    const numberOperand = (n: number, scratch: Xmm): Xmm | Mem => {
        const integer = intReg(n),
            double = xmmReg(n);
        if (integer) {
            a.cvtsi2sd(scratch, integer);
            return scratch;
        }
        return double ?? payload(n);
    };
    // dest <- the Number in XMM0.
    const setNumberDest = (dest: number) => {
        const integer = intReg(dest),
            double = xmmReg(dest);
        if (integer) a.cvttsd2si(integer, "xmm0");
        else if (double) a.movsd(double, "xmm0");
        else setNumber(dest);
    };
    const emitKnownNumberBinary = (
        dest: number,
        operator: string,
        left: number,
        right: number,
    ): boolean => {
        if (operator in knownArithmetic) {
            // Into a double register directly unless it is the right operand.
            const target = xmmReg(dest);
            if (target && target !== xmmReg(right)) {
                numberInto(target, left);
                a[knownArithmetic[operator]!](
                    target,
                    numberOperand(right, "xmm1"),
                );
                return true;
            }
            numberInto("xmm0", left);
            a[knownArithmetic[operator]!]("xmm0", numberOperand(right, "xmm1"));
            setNumberDest(dest);
            return true;
        }
        if (!(operator in knownRelation)) return false;
        const negated = operator === "!=" || operator === "!==",
            holds = a.unique("holds"),
            store = a.unique("store");
        numberInto("xmm0", left);
        a.ucomisd("xmm0", numberOperand(right, "xmm1"));
        a.mov("rax", 0);
        a.jcc("p", store);
        a.jcc(knownRelation[operator]!, holds);
        a.jmp(store);
        a.label(holds);
        a.mov("rax", 1);
        a.label(store);
        if (negated) a.xor("rax", 1);
        setBoolean(dest);
        return true;
    };
    const emitKnownNumberUnary = (
        dest: number,
        operator: string,
        argument: number,
    ): boolean => {
        if (!["numeric", "increment", "decrement", "-", "+"].includes(operator))
            return false;
        numberInto("xmm0", argument);
        if (operator === "increment" || operator === "decrement") {
            a.mov("rax", 1);
            a.cvtsi2sd("xmm1", "rax");
            if (operator === "increment") a.addsd("xmm0", "xmm1");
            else a.subsd("xmm0", "xmm1");
        } else if (operator === "-") {
            a.mov("rax", 1n << 63n);
            a.movqToXmm("xmm1", "rax");
            a.movqFromXmm("r10", "xmm0");
            a.xor("r10", "rax");
            a.movqToXmm("xmm0", "r10");
        }
        setNumberDest(dest);
        return true;
    };
    const emitNumberUnary = (
        dest: number,
        operator: string,
        argument: number,
    ): boolean => {
        if (
            !["numeric", "increment", "decrement", "-", "+", "!"].includes(
                operator,
            )
        )
            return false;
        const slow = a.unique("generic"),
            done = a.unique("fastDone");
        a.load("rax", value(argument));
        if (operator === "!") {
            a.cmp("rax", 2);
            a.jcc("ne", slow);
            a.load("rax", payload(argument));
            a.xor("rax", 1);
            setBoolean(dest);
        } else {
            a.cmp("rax", 3);
            a.jcc("ne", slow);
            a.movsd("xmm0", payload(argument));
            if (operator === "increment" || operator === "decrement") {
                a.mov("rax", 1);
                a.cvtsi2sd("xmm1", "rax");
                if (operator === "increment") a.addsd("xmm0", "xmm1");
                else a.subsd("xmm0", "xmm1");
            } else if (operator === "-") {
                a.mov("rax", 1n << 63n);
                a.movqToXmm("xmm1", "rax");
                a.movqFromXmm("r10", "xmm0");
                a.xor("r10", "rax");
                a.movqToXmm("xmm0", "r10");
            }
            setNumber(dest);
        }
        a.jmp(done);
        pushCold(() => {
            a.label(slow);
            pointer("rcx", dest);
            pointer("rdx", argument);
            a.call("rt." + unary[operator]);
            a.jmp(done);
        });
        a.label(done);
        return true;
    };
    // Stack maps (src/runtime/stack-maps.ts): for every call this function
    // makes, the locations live at that point, so that the collector scans
    // only those. Slots below the live floor (locals of a function with very
    // many) are live everywhere. A slot kept as a static constant has no
    // frame storage: its location belongs to other slots.
    const floor = liveFloor(fn);
    // A map is keyed and stored by its locations at or above the floor (sorted),
    // so that its cost is the size of the live set, not of the frame.
    const alwaysLive = Math.min(floor, locations.count);
    // The frame descriptor (frame-layout.ts).
    {
        const descriptor = new Uint8Array(FD.size),
            view = new DataView(descriptor.buffer);
        view.setBigUint64(FD.allocation, BigInt(allocation), true);
        view.setBigUint64(FD.slots, BigInt(locations.count), true);
        view.setBigUint64(FD.parameters, BigInt(fn.parameterCount), true);
        view.setBigUint64(FD.clear, BigInt(clear), true);
        view.setBigInt64(
            FD.thisSlot,
            BigInt(JF.values - JF.bias + 16 * locations.count),
            true,
        );
        view.setBigInt64(FD.rootCount, BigInt(-(locations.count + 3)), true);
        fragments.push({
            name: fn.id + ".frame",
            section: ".rdata",
            alignment: 8,
            bytes: descriptor,
            fixups: [
                {
                    offset: FD.maps,
                    kind: "va64",
                    target: fn.id + ".maps",
                    addend: 0,
                },
            ],
            symbols: {},
        });
    }
    const mapIndex = new Map<string, number>(),
        maps: number[][] = [],
        entries: StackMapEntry[] = [];
    const mapOf = (slots: Iterable<number>): number => {
        const above = new Set<number>();
        for (const n of slots)
            if (n >= floor && !staticConstant(n)) {
                const l = location(n);
                if (l >= alwaysLive) above.add(l);
            }
        const list = [...above].sort((x, y) => x - y),
            key = list.join(",");
        let index = mapIndex.get(key);
        if (index === undefined) {
            index = maps.length;
            maps.push(list);
            mapIndex.set(key, index);
        }
        return index;
    };
    // The map in force while code is emitted: every call records its return
    // address under it, and an entry covers the calls that follow it under
    // the same map. Cold code runs later under the map of its origin.
    let currentMap = mapOf(liveness.get(fn.blocks[0]!.id)!.liveIn);
    const record = () => {
        const last = entries[entries.length - 1];
        if (last && (last.map === currentMap || last.offset === a.offset))
            return;
        entries.push({ offset: a.offset, map: currentMap });
    };
    // Register loops (register-loops.ts). `region` is the loop whose
    // register copy is being emitted, `spill` the slots held in its
    // registers that are live at the operation being emitted: they are
    // written back as boxed Numbers before each call, and the doubles among
    // them (in volatile XMM registers) are reloaded after it. `view` is set
    // while an operation is emitted in its register form: the Number
    // helpers below then read and write the registers instead of the slots.
    let region: RegisterLoop | undefined,
        spill: number[] = [],
        view = false;
    // The first 8 bytes of a Number constant: tag 3, stored without a GPR.
    const numberTag: Mem = { rip: constantValue(0) };
    const intReg = (n: number): Reg | undefined =>
        view ? region?.integers.get(n)?.reg : undefined;
    const xmmReg = (n: number): Xmm | undefined =>
        view ? region?.doubles.get(n) : undefined;
    const held = (n: number): boolean =>
        !!region && (region.integers.has(n) || region.doubles.has(n));
    const liveHeld = (live: ReadonlySet<number>): number[] =>
        region
            ? [...region.integers.keys(), ...region.doubles.keys()].filter(
                  (n) => isLive(live, n, floor),
              )
            : [];
    // Writes slot n's register to its frame slot as a boxed Number (XMM5 is
    // the scratch: the generated code passes no argument in it).
    const writeBack = (slots: Iterable<number>) => {
        const list = [...slots].filter(held);
        if (!list.length) return;
        a.movsd("xmm5", numberTag);
        for (const n of list) a.storesd(value(n), "xmm5");
        for (const n of list) {
            const integer = region!.integers.get(n);
            if (integer) {
                a.cvtsi2sd("xmm5", integer.reg);
                a.storesd(payload(n), "xmm5");
            } else a.storesd(payload(n), region!.doubles.get(n)!);
        }
    };
    // Loads slot n's register from its frame slot (a Number; an integer
    // slot's double is integral and in range, so the truncation is exact).
    const reloadSlot = (n: number) => {
        const integer = region?.integers.get(n);
        if (integer) {
            a.movsd("xmm5", payload(n));
            a.cvttsd2si(integer.reg, "xmm5");
        } else if (region?.doubles.has(n))
            a.movsd(region.doubles.get(n)!, payload(n));
    };
    const saveRegisters = (loop: RegisterLoop) =>
        loop.saved.forEach((reg, i) => a.store(stack(saveBase + 8 * i), reg));
    const restoreRegisters = (loop: RegisterLoop) =>
        loop.saved.forEach((reg, i) => a.load(reg, stack(saveBase + 8 * i)));
    const callUnderMap = (emit: () => void) => {
        const written = spill;
        writeBack(written);
        emit();
        record();
        for (const n of written) if (region?.doubles.has(n)) reloadSlot(n);
    };
    const assembler = a as {
        call(s: string): void;
        callRegister(r: Reg): void;
        callUnless(c: Condition, s: string): void;
    };
    const originalCall = assembler.call.bind(a),
        originalCallRegister = assembler.callRegister.bind(a),
        originalCallUnless = assembler.callUnless.bind(a);
    assembler.call = (s: string) => callUnderMap(() => originalCall(s));
    assembler.callRegister = (r: Reg) =>
        callUnderMap(() => originalCallRegister(r));
    assembler.callUnless = (c: Condition, s: string) => {
        if (!spill.length) {
            callUnderMap(() => originalCallUnless(c, s));
            return;
        }
        // The write-backs run only when the call does.
        const skip = a.unique("noCall");
        a.jcc(c, skip);
        callUnderMap(() => originalCall(s));
        a.label(skip);
    };
    // Slow paths emitted after the blocks, so that the common paths stay
    // dense; grouped by map, so that their calls share entries. They run
    // under the register state of their origin.
    const cold: {
        map: number;
        emit: () => void;
        region: RegisterLoop | undefined;
        spill: number[];
    }[] = [];
    const pushCold = (emit: () => void) => {
        cold.push({ map: currentMap, emit, region, spill });
    };
    const sites: SiteEmitter = {
        a,
        value,
        payload,
        pointer,
        pushCold,
        integerKey: (n) => region?.integers.get(n)?.reg,
    };
    const frame = { a, value, payload, pointer, pushCold };
    // A derived constructor's this starts uninitialized, in a cell that its
    // arrow functions may share (the stub copied the receiver to the super
    // receiver slot already).
    if (fn.derivedConstructor) {
        a.mov("rax", 255);
        a.store(stack(thisBase), "rax");
        a.mov("rax", 0);
        a.store(stack(thisBase + 8), "rax");
        a.lea("rcx", stack(thisBase));
        a.lea("rdx", stack(thisBase));
        a.call("rt.newCell");
    }
    // Operations that only move values between slots and globals, and
    // arithmetic, comparisons and updates on proven Numbers, cannot run a
    // collection or user code.
    const inline = (op: Operation): boolean => {
        if (movesOnly.has(op.kind) || constantEquality(op)) return true;
        if (op.kind === "property" && op.typedLength) return true;
        if (
            op.kind === "binary" &&
            op.numeric &&
            [
                "+",
                "-",
                "*",
                "/",
                "<",
                "<=",
                ">",
                ">=",
                "==",
                "===",
                "!=",
                "!==",
            ].includes(op.operator)
        )
            return true;
        return (
            op.kind === "unary" &&
            !!op.numeric &&
            ["numeric", "increment", "decrement", "-", "+"].includes(
                op.operator,
            )
        );
    };
    // A block of inline operations allocates nothing: it needs no safepoint.
    // In a register copy the steps and the fused comparisons of its
    // induction variables are inline too.
    const inlineHere = (op: Operation): boolean =>
        inline(op) ||
        (!!region && (region.compares.has(op) || region.steps.has(op)));
    const needsSafepoint = (block: BlockIR): boolean =>
        !block.operations.every(inlineHere);
    // The blocks in emission order. A register loop is emitted at its
    // header's place: the entry stub (labelled as the header, so that every
    // entry edge reaches it), the register copy of its blocks (`.r` labels)
    // and, when the stub tests a bound, the unchanged copy (`.generic`) that a
    // failed test runs.
    type Emission =
        | { block: BlockIR; copy: "plain" }
        | { block: BlockIR; copy: "register" | "generic"; loop: RegisterLoop }
        | { stub: RegisterLoop };
    const emissions: Emission[] = [];
    {
        const byId = new Map(fn.blocks.map((b) => [b.id, b])),
            planOf = new Map<number, RegisterLoop>();
        for (const loop of registerLoops)
            for (const id of loop.members) planOf.set(id, loop);
        for (const block of fn.blocks) {
            const loop = planOf.get(block.id);
            if (!loop) emissions.push({ block, copy: "plain" });
            else if (block.id === loop.header) {
                emissions.push({ stub: loop });
                for (const id of loop.blocks)
                    emissions.push({
                        block: byId.get(id)!,
                        copy: "register",
                        loop,
                    });
                if (loop.checks.length)
                    for (const id of loop.blocks)
                        emissions.push({
                            block: byId.get(id)!,
                            copy: "generic",
                            loop,
                        });
            }
        }
    }
    const startLabel = (e: Emission): string =>
        "stub" in e
            ? fn.id + ".block." + e.stub.header
            : fn.id +
              ".block." +
              e.block.id +
              (e.copy === "register"
                  ? ".r"
                  : e.copy === "generic"
                    ? ".generic"
                    : "");
    // The copy being emitted, for its jump targets: inside a loop's copy the
    // copy's own blocks, out of the register copy the exit stub that writes
    // back the registers live there and restores the saved GPRs.
    let emitting: Exclude<Emission, { stub: RegisterLoop }> | undefined;
    const exitStubs = new Map<string, string>();
    const exitLabel = (from: number, to: number): string => {
        const key = from + ":" + to,
            known = exitStubs.get(key);
        if (known) return known;
        const label = a.unique("loopExit"),
            loop = region!,
            into = liveness.get(to)!.liveIn;
        exitStubs.set(key, label);
        cold.push({
            map: currentMap,
            region: loop,
            spill: [],
            emit: () => {
                a.label(label);
                writeBack(
                    [...loop.integers.keys(), ...loop.doubles.keys()].filter(
                        (n) => isLive(into, n, floor),
                    ),
                );
                restoreRegisters(loop);
                a.jmp(fn.id + ".block." + to);
            },
        });
        return label;
    };
    const blockLabel = (id: number): string => {
        const plain = fn.id + ".block." + id;
        if (!emitting || emitting.copy === "plain") return plain;
        if (!emitting.loop.members.has(id))
            return emitting.copy === "register"
                ? exitLabel(emitting.block.id, id)
                : plain;
        return plain + (emitting.copy === "register" ? ".r" : ".generic");
    };
    // The entry stub: the bound tests (an integral Number within the limit,
    // so that the induction variables stay int32 and compare as integers),
    // then the saved GPRs and the registers of the slots live into the header.
    const emitEntryStub = (loop: RegisterLoop) => {
        const generic = fn.id + ".block." + loop.header + ".generic",
            into = liveness.get(loop.header)!.liveIn;
        a.label(fn.id + ".block." + loop.header);
        for (const c of loop.checks) {
            a.load("rax", value(c.slot));
            a.cmp("rax", 3);
            a.jcc("ne", generic);
            a.movsd("xmm0", payload(c.slot));
            a.cvttsd2si("rax", "xmm0");
            a.cvtsi2sd("xmm1", "rax");
            a.ucomisd("xmm0", "xmm1");
            a.jcc("p", generic);
            a.jcc("ne", generic);
            if (c.max !== undefined) {
                a.cmp("rax", c.max);
                a.jcc("g", generic);
            } else {
                a.cmp("rax", c.min!);
                a.jcc("l", generic);
            }
        }
        saveRegisters(loop);
        for (const [n, reg] of loop.bounds) {
            a.movsd("xmm0", payload(n));
            a.cvttsd2si(reg, "xmm0");
        }
        for (const [n, { reg }] of loop.integers)
            if (isLive(into, n, floor)) {
                a.movsd("xmm0", payload(n));
                a.cvttsd2si(reg, "xmm0");
            }
        for (const [n, x] of loop.doubles)
            if (isLive(into, n, floor)) a.movsd(x, payload(n));
    };
    // The register forms of the register copy's operations (view is set).
    const signed: Record<string, Condition> = {
        "<": "l",
        "<=": "le",
        ">": "g",
        ">=": "ge",
    };
    const swapped: Record<string, string> = {
        "<": ">",
        "<=": ">=",
        ">": "<",
        ">=": "<=",
    };
    const invertSigned: Partial<Record<Condition, Condition>> = {
        l: "ge",
        ge: "l",
        le: "g",
        g: "le",
    };
    const staticInt32 = (n: number): number | undefined => {
        const c = staticConstant(n) ? constants.get(n) : undefined;
        return typeof c === "number" &&
            Number.isInteger(c) &&
            c >= -(2 ** 31) &&
            c < 2 ** 31 &&
            !Object.is(c, -0)
            ? c
            : undefined;
    };
    // An integer comparand: a register, the bound converted on entry or a constant.
    const integerComparand = (n: number): Reg | number | undefined =>
        intReg(n) ?? region!.bounds.get(n) ?? staticInt32(n);
    // dest <- the integer in reg (exact as a double).
    const integerResult = (dest: number, reg: Reg) => {
        const target = intReg(dest);
        if (target) {
            if (target !== reg) a.mov(target, reg);
            return;
        }
        a.cvtsi2sd("xmm0", reg);
        setNumberDest(dest);
    };
    // & | ^ << >> >>> with an integer operand or destination: the low 32
    // bits of each operand are its ToInt32 (an integer register as it is, a
    // double through the exact truncation, other values through the
    // runtime), the result an int32 sign-extended (a uint32 zero-extended).
    const emitIntegerBitwise = (op: Extract<Operation, { kind: "binary" }>) => {
        const slow = a.unique("generic"),
            done = a.unique("fastDone");
        let slowUsed = false;
        const operand = (n: number, scratch: "r10" | "rcx"): Reg | number => {
            const integer = intReg(n);
            if (integer) return integer;
            const c = staticConstant(n) ? constants.get(n) : undefined;
            if (typeof c === "number") return c | 0;
            slowUsed = true;
            const double = xmmReg(n);
            if (double) {
                a.cvttsd2si(scratch, double);
                a.cvtsi2sd("xmm1", scratch);
                a.ucomisd("xmm1", double);
                a.jcc("p", slow);
                a.jcc("ne", slow);
                return scratch;
            }
            if (!op.numeric) {
                a.load("rax", value(n));
                a.cmp("rax", 3);
                a.jcc("ne", slow);
            }
            toInt32Operand(a, payload(n), scratch, slow);
            return scratch;
        };
        const left = operand(op.left, "r10"),
            right = operand(op.right, "rcx");
        if (left !== "r10") a.mov("r10", left);
        const shift = (emit: (count: number | "cl") => void) => {
            if (typeof right === "number") emit(right & 31);
            else {
                if (right !== "rcx") a.mov("rcx", right);
                a.and("rcx", 31);
                emit("cl");
            }
        };
        switch (op.operator) {
            case "&":
                a.and("r10", right);
                break;
            case "|":
                a.or("r10", right);
                break;
            case "^":
                a.xor("r10", right);
                break;
            case "<<":
                shift((c) => a.shl("r10", c));
                break;
            case ">>":
                a.movsxd("r10", "r10");
                shift((c) => a.sar("r10", c));
                break;
            case ">>>":
                a.mov("r11", 0xffffffff);
                a.and("r10", "r11");
                shift((c) => a.shr("r10", c));
                break;
        }
        if (op.operator !== ">>" && op.operator !== ">>>")
            a.movsxd("r10", "r10");
        integerResult(op.dest, "r10");
        if (!slowUsed) return;
        a.jmp(done);
        pushCold(() => {
            a.label(slow);
            pointer("rcx", op.dest);
            pointer("rdx", op.left);
            pointer("r8", op.right);
            a.call("rt." + binary[op.operator]);
            reloadSlot(op.dest);
            a.jmp(done);
        });
        a.label(done);
    };
    type IntegerFusion = {
        left: Reg;
        right: Reg | number;
        condition: Condition;
    };
    type RegisterForm =
        | "done"
        | { fuse: Extract<Operation, { kind: "binary" }> }
        | { fuseInteger: IntegerFusion };
    // The register form of op in the register copy of region, or undefined:
    // then op runs on the frame slots (written back first, reloaded after).
    const registerForm = (
        op: Operation,
        block: BlockIR,
        index: number,
    ): RegisterForm | undefined => {
        const loop = region!;
        switch (op.kind) {
            case "copy": {
                const si = intReg(op.source),
                    sd = xmmReg(op.source),
                    di = intReg(op.dest),
                    dd = xmmReg(op.dest);
                if (di) {
                    if (!si) return undefined;
                    if (di !== si) a.mov(di, si);
                    return "done";
                }
                // (The source of a double slot's copy holds a Number.)
                if (dd) {
                    numberInto(dd, op.source);
                    return "done";
                }
                if (!si && !sd) return undefined;
                numberInto("xmm0", op.source);
                setNumber(op.dest);
                return "done";
            }
            case "constant": {
                const dd = xmmReg(op.dest);
                if (!dd || typeof op.value !== "number") return undefined;
                a.movsd(dd, { rip: constantValue(op.value), addend: 8 });
                return "done";
            }
            case "unary": {
                const di = intReg(op.dest),
                    ai = intReg(op.argument);
                if (
                    di &&
                    ai &&
                    (loop.steps.has(op) || op.int32) &&
                    (op.operator === "increment" || op.operator === "decrement")
                ) {
                    if (di !== ai) a.mov(di, ai);
                    a.add(di, op.operator === "increment" ? 1 : -1);
                    return "done";
                }
                if (op.operator === "~" && op.int32 && ai) {
                    a.mov("r10", ai);
                    a.not("r10");
                    a.movsxd("r10", "r10");
                    integerResult(op.dest, "r10");
                    return "done";
                }
                if (
                    op.numeric &&
                    !di &&
                    (held(op.dest) || held(op.argument)) &&
                    emitKnownNumberUnary(op.dest, op.operator, op.argument)
                )
                    return "done";
                return undefined;
            }
            case "binary": {
                const di = intReg(op.dest);
                // An integer plus or minus an int32 constant (steps, int53 temporaries).
                if (di && (op.operator === "+" || op.operator === "-")) {
                    const li = intReg(op.left),
                        ri = intReg(op.right),
                        lc = staticInt32(op.left),
                        rc = staticInt32(op.right);
                    let source: Reg | undefined, delta: number | undefined;
                    if (li && rc !== undefined) {
                        source = li;
                        delta = op.operator === "+" ? rc : -rc;
                    } else if (op.operator === "+" && ri && lc !== undefined) {
                        source = ri;
                        delta = lc;
                    }
                    if (
                        source &&
                        delta !== undefined &&
                        delta >= -(2 ** 31) &&
                        delta < 2 ** 31
                    ) {
                        if (di !== source) a.mov(di, source);
                        if (delta) a.add(di, delta);
                        return "done";
                    }
                }
                if (
                    ["&", "|", "^", "<<", ">>", ">>>"].includes(op.operator) &&
                    (op.int32 || op.uint32) &&
                    (di || intReg(op.left) || intReg(op.right))
                ) {
                    emitIntegerBitwise(op);
                    return "done";
                }
                const decides =
                    index === block.operations.length - 1 &&
                    block.terminator.kind === "branch" &&
                    block.terminator.condition === op.dest &&
                    !isLive(liveness.get(block.id)!.liveOut, op.dest, floor);
                if (
                    decides &&
                    op.operator in signed &&
                    (loop.compares.has(op) || op.numeric)
                ) {
                    const l = integerComparand(op.left),
                        r = integerComparand(op.right);
                    if (typeof l === "string" && r !== undefined)
                        return {
                            fuseInteger: {
                                left: l,
                                right: r,
                                condition: signed[op.operator]!,
                            },
                        };
                    if (typeof r === "string" && l !== undefined)
                        return {
                            fuseInteger: {
                                left: r,
                                right: l,
                                condition: signed[swapped[op.operator]!]!,
                            },
                        };
                    return { fuse: op };
                }
                if (
                    decides &&
                    op.numeric &&
                    op.operator in knownRelation &&
                    (held(op.left) || held(op.right))
                )
                    return { fuse: op };
                if (
                    op.numeric &&
                    !di &&
                    (held(op.dest) || held(op.left) || held(op.right)) &&
                    emitKnownNumberBinary(
                        op.dest,
                        op.operator,
                        op.left,
                        op.right,
                    )
                )
                    return "done";
                return undefined;
            }
        }
        return undefined;
    };
    for (const [emissionIndex, emission] of emissions.entries()) {
        if ("stub" in emission) {
            emitting = undefined;
            region = undefined;
            emitEntryStub(emission.stub);
            continue;
        }
        const block = emission.block,
            following = emissions[emissionIndex + 1];
        const nextLabel = following ? startLabel(following) : undefined;
        emitting = emission;
        region = emission.copy === "register" ? emission.loop : undefined;
        spill = [];
        view = false;
        a.label(startLabel(emission));
        let fusedInteger: IntegerFusion | undefined;
        let fused: Extract<Operation, { kind: "binary" }> | undefined;
        let fusedEquality:
            { other: number; k: number; negate: boolean } | undefined;
        let fusedGuard:
            Extract<Operation, { kind: "isFunctionCode" }> | undefined;
        for (const [index, op] of block.operations.entries()) {
            const live = liveness.get(block.id)!.before[index]!,
                dests = destinations(op).filter(
                    (d) => d >= floor && !staticConstant(d),
                );
            // Safepoint at the start of every block (every loop iteration passes
            // one): one flag test (rt.gcNeeded, set by the allocator when the
            // threshold is passed), so that only a collection costs a call. Every
            // live slot is rooted at every operation boundary, so any boundary is
            // a valid safepoint; one per block bounds the garbage a block can
            // accumulate by its length. GC stress collects before every operation
            // to catch rooting errors.
            currentMap = mapOf(live);
            spill = liveHeld(live);
            view = false;
            if (options.gcStress) a.call("rt.collect");
            else if (index === 0 && needsSafepoint(block)) {
                a.cmpByte({ rip: "rt.gcNeeded" }, 0);
                a.callUnless("e", "rt.collect");
            }
            if (!inlineHere(op)) {
                // The map of this operation's calls: the live slots and the
                // destinations, which the runtime may keep its result in across a
                // nested call (construction keeps the instance there). A destination
                // whose location is dead before the operation may hold a stale
                // pointer: its tag becomes undefined first (tags are below 256, so
                // one byte does it).
                const liveLocations = new Set([...live].map(location));
                for (const l of new Set(dests.map(location)))
                    if (!liveLocations.has(l))
                        a.storeByte(stack(valueBase + 16 * l), 0);
                currentMap = mapOf([...live, ...dests]);
            }
            // Ropes (strings.ts) may only reach `+`, copies, globals and the few
            // operations that read a string's length or tag; every other
            // operation first flattens the slots it reads.
            if (!ropeTransparent(op))
                for (const n of operationUses(op)) flattenSlot(n);
            // A move whose result nothing reads (the value of an assignment
            // expression used as a statement, for one) is not emitted.
            if (
                deadMoves.has(op.kind) &&
                "dest" in op &&
                !isLive(
                    index + 1 < block.operations.length
                        ? liveness.get(block.id)!.before[index + 1]!
                        : liveness.get(block.id)!.beforeTerminator,
                    op.dest,
                    floor,
                )
            )
                continue;
            // In the register copy: the register form, or the operation on
            // the frame slots (its register operands written back, except an
            // element key the inline path reads from its register).
            let reloads: number[] = [];
            if (region) {
                view = true;
                const form = registerForm(op, block, index);
                view = false;
                if (form) {
                    if (form !== "done") {
                        if ("fuse" in form) fused = form.fuse;
                        else fusedInteger = form.fuseInteger;
                    }
                    continue;
                }
                const key =
                    typedElementSite(fn.id, op) && region.integers.has(op.key)
                        ? op.key
                        : -1;
                writeBack(operationUses(op).filter((n) => n !== key));
                reloads = destinations(op).filter(held);
            }
            switch (op.kind) {
                case "globalObject":
                    copy(value(op.dest), { rip: "rt.globalValue" });
                    break;
                case "isFunctionCode": {
                    // The guard of an inlined call (src/ir/inline.ts): the test of
                    // a direct call, fused into this block's branch when only that
                    // reads it.
                    if (
                        index === block.operations.length - 1 &&
                        block.terminator.kind === "branch" &&
                        block.terminator.condition === op.dest &&
                        !isLive(liveness.get(block.id)!.liveOut, op.dest, floor)
                    ) {
                        fusedGuard = op;
                        break;
                    }
                    const store = a.unique("functionCode");
                    a.mov("r11", 0);
                    testFunctionCode(op, store);
                    a.mov("r11", 1);
                    a.label(store);
                    a.mov("rax", "r11");
                    setBoolean(op.dest);
                    break;
                }
                case "readGlobalProperty": {
                    // Prelude code is shared by every program and cannot know which
                    // names a script declares, so only user code gets the fast path.
                    const prelude = fn.id.startsWith("js.regexpVm."),
                        notBinding =
                            !prelude &&
                            !globalProperties.some((p) => p.name === op.name);
                    pointer("rcx", op.dest);
                    a.lea("rdx", { rip: literal(op.name) });
                    a.mov(
                        "r8",
                        (op.allowMissing ? 1 : 0) | (notBinding ? 2 : 0),
                    );
                    if (notBinding) {
                        const cache = "gc." + fragments.length;
                        fragments.push({
                            name: cache,
                            section: ".data",
                            alignment: 8,
                            bytes: new Uint8Array(16),
                            fixups: [],
                            symbols: {},
                        });
                        a.lea("r9", { rip: cache });
                        a.call("rt.readGlobalCached");
                    } else a.call("rt.readGlobalProperty");
                    break;
                }
                case "realmFunction": {
                    // ctor is a %Function% (or op.intrinsic) intrinsic: its realm's copy of the realm-local
                    // maker (cloned with that realm's runtime) becomes a closure there.
                    const no = a.unique("realmFunctionNo"),
                        done = a.unique("realmFunctionDone");
                    const table = (symbol: string) => {
                        realmCodeTables.add(symbol);
                        return "realm.code." + symbol;
                    };
                    a.mov("rax", 0);
                    a.store(value(op.dest), "rax");
                    a.load("rax", value(op.ctor));
                    a.cmp("rax", 5);
                    a.jcc("ne", no);
                    a.load("rcx", payload(op.ctor));
                    a.load("rax", { base: "rcx", disp: O.kind });
                    a.cmp("rax", FunctionKind);
                    a.jcc("ne", no);
                    a.load("rax", { base: "rcx", disp: FunctionLayout.realm });
                    a.and("rax", 255);
                    a.shl("rax", 3);
                    a.store(payload(op.dest), "rax");
                    // '*': any function; the maker itself checks ctor in its realm.
                    if (op.intrinsic !== "*") {
                        a.lea("r11", {
                            rip: table(op.intrinsic ?? "rt.Function"),
                        });
                        a.add("r11", "rax");
                        a.load("r11", { base: "r11" });
                        a.cmp("r11", "rcx");
                        a.jcc("ne", no);
                    }
                    a.lea("r11", { rip: table(op.target) });
                    a.add("r11", "rax");
                    a.load("rdx", { base: "r11" });
                    a.lea("r11", { rip: table("rt.newFunction") });
                    a.add("r11", "rax");
                    a.load("r11", { base: "r11" });
                    pointer("rcx", op.dest);
                    a.mov("r8", 0);
                    a.lea("r9", stack(argsBase));
                    a.callRegister("r11");
                    a.jmp(done);
                    a.label(no);
                    a.mov("rax", 0);
                    a.store(payload(op.dest), "rax");
                    a.label(done);
                    break;
                }
                case "newFunction": {
                    // One static descriptor per site (call-sites.ts) and one call:
                    // rt.newClosure reads the captures, the home object and a computed
                    // name from this frame through RBP, sets the flags, the lexical
                    // this/new.target of an arrow and the source text, and installs
                    // length and name.
                    const bare =
                        (op.method && !op.classConstructor && !op.generator) ||
                        op.arrow ||
                        (op.async && !op.generator);
                    const flags =
                        (bare ? CF.bare : 0) |
                        (op.classConstructor ? CF.classConstructor : 0) |
                        (op.arrow ? CF.arrow : 0) |
                        (op.generator ? CF.generator : 0) |
                        (op.async ? CF.async : 0) |
                        (op.strict ? CF.strict : 0) |
                        (op.arrow && fn.id !== "js.main"
                            ? CF.inheritHomeObject
                            : 0) |
                        (op.sourceText !== undefined
                            ? CF.sourceText
                            : op.sourceRange !== undefined
                              ? CF.sourceRange
                              : 0) |
                        (op.homeObject !== undefined ? CF.homeObject : 0) |
                        (op.nameSlot !== undefined ? CF.computedName : 0);
                    const captures = op.captures ?? [],
                        bytes = new Uint8Array(
                            CD.entries + 4 * captures.length,
                        ),
                        view = new DataView(bytes.buffer),
                        fixups: NamedFragment["fixups"] = [
                            {
                                offset: CD.code,
                                kind: "va64",
                                target: op.target,
                                addend: 0,
                            },
                        ];
                    view.setUint32(CD.flags, flags, true);
                    view.setUint32(CD.parameters, op.parameterCount ?? 0, true);
                    view.setUint32(CD.captures, captures.length, true);
                    writeSiteEntry(
                        view,
                        fixups,
                        CD.name,
                        op.nameSlot === undefined
                            ? { rip: literal(op.name ?? "") }
                            : value(op.nameSlot),
                    );
                    if (op.sourceText !== undefined)
                        writeSiteEntry(view, fixups, CD.sourceText, {
                            rip: literal(op.sourceText),
                        });
                    else if (op.sourceRange !== undefined)
                        writeSiteEntry(view, fixups, CD.sourceText, {
                            rip: sourceRange(op.sourceRange),
                        });
                    if (op.homeObject !== undefined)
                        writeSiteEntry(
                            view,
                            fixups,
                            CD.homeObject,
                            value(op.homeObject),
                        );
                    view.setInt32(CD.thisSlot, thisBase - frameBias, true);
                    view.setInt32(
                        CD.newTargetSlot,
                        newTargetBase - frameBias,
                        true,
                    );
                    view.setInt32(CD.functionSlot, JF.callee - frameBias, true);
                    captures.forEach((n, i) =>
                        writeSiteEntry(
                            view,
                            fixups,
                            CD.entries + 4 * i,
                            value(n),
                        ),
                    );
                    const descriptor = "closure." + fragments.length;
                    fragments.push({
                        name: descriptor,
                        section: ".rdata",
                        alignment: 8,
                        bytes,
                        fixups,
                        symbols: {},
                    });
                    pointer("rcx", op.dest);
                    a.lea("rdx", { rip: descriptor });
                    a.call(closureStub(flags));
                    break;
                }
                case "defineAccessor":
                    pointer("rcx", op.object);
                    pointer("rdx", op.key);
                    pointer("r8", op.source);
                    a.mov(
                        "r9",
                        (op.setter ? 1 : 0) | (op.nonEnumerable ? 2 : 0),
                    );
                    a.call("rt.defineLiteralAccessor");
                    break;
                case "newCell":
                    pointer("rcx", op.dest);
                    pointer("rdx", op.source);
                    a.call("rt.newCell");
                    break;
                // Cells are internal: the tag check guards the compiler's own
                // bookkeeping and fails to rt.fail.
                case "readCell":
                    a.load("rax", value(op.cell));
                    a.cmp("rax", CellTag);
                    failIf(a, "ne");
                    a.load("r10", payload(op.cell));
                    copy(value(op.dest), { base: "r10" });
                    break;
                case "writeCell":
                    a.load("rax", value(op.cell));
                    a.cmp("rax", CellTag);
                    failIf(a, "ne");
                    a.load("r10", payload(op.cell));
                    copy({ base: "r10" }, value(op.source));
                    break;
                case "loadCapture":
                    a.load("r10", stack(64));
                    a.load("r10", {
                        base: "r10",
                        disp: FunctionLayout.environment,
                    });
                    copy(value(op.dest), {
                        base: "r10",
                        disp: E.cells + E.entry * op.index,
                    });
                    break;
                case "pushHandler": {
                    const offset = handlerBase + H.size * op.index;
                    a.load("rax", { rip: "rt.exceptionHandler" });
                    a.store(stack(offset + H.next), "rax");
                    a.mov("rax", "rsp");
                    a.store(stack(offset + H.stack), "rax");
                    a.lea("rax", { rip: fn.id + ".block." + op.target });
                    a.store(stack(offset + H.target), "rax");
                    a.load("rax", { rip: "rt.gcRoots" });
                    a.store(stack(offset + H.roots), "rax");
                    a.lea("rax", value(op.error));
                    a.store(stack(offset + H.value), "rax");
                    a.load("rax", { rip: "rt.cleanupHead" });
                    a.store(stack(offset + H.cleanup), "rax");
                    preservedGp.forEach((reg, i) =>
                        a.store(stack(offset + H.gp + 8 * i), reg),
                    );
                    preservedXmm.forEach((reg, i) =>
                        a.storeXmm128(stack(offset + H.xmm + 16 * i), reg),
                    );
                    a.mov("rax", op.handlerKind === "finally" ? 1 : 0);
                    a.store(stack(offset + H.kind), "rax");
                    a.lea("rax", stack(offset));
                    a.store({ rip: "rt.exceptionHandler" }, "rax");
                    break;
                }
                case "popHandler":
                    a.load("rax", { rip: "rt.exceptionHandler" });
                    a.load("rax", { base: "rax", disp: H.next });
                    a.store({ rip: "rt.exceptionHandler" }, "rax");
                    break;
                case "newTarget":
                    copy(value(op.dest), stack(newTargetBase));
                    break;
                case "superBase":
                    a.load("rax", stack(64));
                    a.load("rax", {
                        base: "rax",
                        disp: FunctionLayout.homeObject,
                    });
                    a.load("rax", { base: "rax", disp: O.prototype });
                    a.store(payload(op.dest), "rax");
                    {
                        const nonnull = a.unique("superBaseObject"),
                            done = a.unique("superBaseDone");
                        a.test("rax", "rax");
                        a.jcc("ne", nonnull);
                        a.mov("rax", 1);
                        a.jmp(done);
                        a.label(nonnull);
                        a.mov("rax", 5);
                        a.label(done);
                        a.store(value(op.dest), "rax");
                    }
                    break;
                case "superConstructor":
                    if (op.func !== undefined) a.load("rax", payload(op.func));
                    else a.load("rax", stack(64));
                    a.load("rax", { base: "rax", disp: O.prototype });
                    a.store(payload(op.dest), "rax");
                    {
                        const nonnull = a.unique("superConstructorObject"),
                            done = a.unique("superConstructorDone");
                        a.test("rax", "rax");
                        a.jcc("ne", nonnull);
                        a.mov("rax", 1);
                        a.jmp(done);
                        a.label(nonnull);
                        a.mov("rax", 5);
                        a.label(done);
                        a.store(value(op.dest), "rax");
                    }
                    break;
                case "superReceiver":
                    copy(value(op.dest), stack(superReceiverBase));
                    break;
                case "setFunctionHomeObject":
                    a.load("r10", payload(op.func));
                    a.load("rax", payload(op.homeObject));
                    a.store(
                        { base: "r10", disp: FunctionLayout.homeObject },
                        "rax",
                    );
                    break;
                case "setCurrentThis":
                    if (!fn.derivedConstructor) {
                        // An arrow's lexical this may be its derived constructor's this cell.
                        const direct = a.unique("directSetThis"),
                            done = a.unique("setThisDone");
                        a.load("rax", stack(thisBase));
                        a.cmp("rax", CellTag);
                        a.jcc("ne", direct);
                        a.load("r10", stack(thisBase + 8));
                        a.load("rax", { base: "r10" });
                        a.cmp("rax", 255);
                        failIf(a, "ne", "rt.throwReferenceError");
                        a.lea("rcx", stack(thisBase));
                        pointer("rdx", op.source);
                        a.call("rt.writeCell");
                        a.jmp(done);
                        a.label(direct);
                        copy(stack(thisBase), value(op.source));
                        a.label(done);
                    } else if (fn.derivedConstructor) {
                        a.load("r10", stack(thisBase + 8));
                        a.load("rax", { base: "r10" });
                        a.cmp("rax", 255);
                        failIf(a, "ne", "rt.throwReferenceError");
                        a.lea("rcx", stack(thisBase));
                        pointer("rdx", op.source);
                        a.call("rt.writeCell");
                    } else copy(stack(thisBase), value(op.source));
                    break;
                case "validateClassHeritage": {
                    const done = a.unique("classHeritageDone");
                    a.load("rax", value(op.base));
                    a.cmp("rax", 1);
                    a.jcc("e", done);
                    a.cmp("rax", 5);
                    failIf(a, "ne", "rt.throwTypeError");
                    a.load("r10", payload(op.base));
                    a.load("rax", { base: "r10", disp: O.kind });
                    a.cmp("rax", FunctionKind);
                    failIf(a, "ne", "rt.throwTypeError");
                    a.load("rax", {
                        base: "r10",
                        disp: FunctionLayout.constructable,
                    });
                    a.test("rax", "rax");
                    failIf(a, "e", "rt.throwTypeError");
                    a.label(done);
                    break;
                }
                case "validateClassPrototype": {
                    const done = a.unique("classPrototypeDone");
                    a.load("rax", value(op.prototype));
                    a.cmp("rax", 1);
                    a.jcc("e", done);
                    a.cmp("rax", 5);
                    failIf(a, "ne", "rt.throwTypeError");
                    a.label(done);
                    break;
                }
                case "superGet":
                    // `super.name` with a literal name: a per-site inline cache like `object.name`.
                    if (op.keyName !== undefined && cacheableName(op.keyName)) {
                        const cache = "ic." + fragments.length;
                        fragments.push({
                            name: cache,
                            section: ".data",
                            alignment: 8,
                            bytes: new Uint8Array(PropertyCacheLayout.size),
                            fixups: [],
                            symbols: {},
                        });
                        a.lea("rax", value(op.receiver));
                        a.store(stack(32), "rax");
                        pointer("rcx", op.dest);
                        pointer("rdx", op.object);
                        pointer("r8", op.key);
                        a.lea("r9", { rip: cache });
                        a.call("rt.superGetCached");
                        break;
                    }
                    pointer("rcx", op.dest);
                    pointer("rdx", op.object);
                    pointer("r8", op.key);
                    pointer("r9", op.receiver);
                    a.call("rt.superGet");
                    break;
                case "superSet":
                    pointer("rcx", op.object);
                    pointer("rdx", op.key);
                    pointer("r8", op.receiver);
                    pointer("r9", op.source);
                    a.call("rt.superSet");
                    if (op.strict) {
                        a.test("rax", "rax");
                        failIf(a, "e", "rt.throwTypeError");
                    }
                    break;
                case "currentFunction":
                    a.load("rax", stack(64));
                    a.store(payload(op.dest), "rax");
                    a.mov("rax", 5);
                    a.store(value(op.dest), "rax");
                    break;
                case "currentThis": {
                    // `this` is a cell when an arrow function captured it (read out of
                    // line); only a derived constructor's own `this`, or a captured
                    // one, can still be uninitialized.
                    const cell = a.unique("cellThis"),
                        done = a.unique("thisReady");
                    a.load("rax", stack(thisBase));
                    a.cmp("rax", CellTag);
                    a.jcc("e", cell);
                    copy(value(op.dest), stack(thisBase));
                    if (fn.derivedConstructor) {
                        a.load("rax", value(op.dest));
                        a.cmp("rax", 255);
                        failIf(a, "e", "rt.throwReferenceError");
                    }
                    a.label(done);
                    {
                        const dest = op.dest;
                        pushCold(() => {
                            a.label(cell);
                            pointer("rcx", dest);
                            a.lea("rdx", stack(thisBase));
                            a.call("rt.readCell");
                            a.load("rax", value(dest));
                            a.cmp("rax", 255);
                            failIf(a, "e", "rt.throwReferenceError");
                            a.jmp(done);
                        });
                    }
                    break;
                }
                case "newInstance":
                    if (op.argumentArray !== undefined) {
                        pointer("rcx", op.callee);
                        pointer("rdx", op.argumentArray);
                        a.call("rt.validatePromiseExecutorArray");
                        pointer("rcx", op.dest);
                        pointer("rdx", op.callee);
                        a.call("rt.newInstance");
                        break;
                    }
                    // A per-site record remembers the constructor and its `prototype` node (functions.ts).
                    {
                        const cache = "nc." + fragments.length;
                        fragments.push({
                            name: cache,
                            section: ".data",
                            alignment: 8,
                            bytes: new Uint8Array(NewCacheLayout.size),
                            fixups: [],
                            symbols: {},
                        });
                        pointer("rcx", op.dest);
                        pointer("rdx", op.callee);
                        a.lea("r8", { rip: cache });
                        if (op.firstArgument !== undefined)
                            pointer("r9", op.firstArgument);
                        else a.mov("r9", 0);
                        a.call("rt.newInstanceCached");
                    }
                    break;
                case "newArguments":
                    // Bit 62 of the formal count marks an unmapped (non-simple parameter list) object.
                    a.mov(
                        "rax",
                        BigInt(op.parameters.length) |
                            (op.unmapped ? 1n << 62n : 0n),
                    );
                    a.store(stack(argsBase), "rax");
                    a.load("rax", stack(64));
                    a.store(stack(argsBase + 8), "rax");
                    op.parameters.forEach((n, i) =>
                        copy(
                            stack(argsBase + 16 + 16 * i),
                            n < 0 ? { rip: "rt.undefinedValue" } : value(n),
                        ),
                    );
                    pointer("rcx", op.dest);
                    a.load("rdx", stack(48));
                    a.load("r8", stack(56));
                    a.lea("r9", stack(argsBase));
                    a.call("rt.newArguments");
                    break;
                case "newRestArray":
                    pointer("rcx", op.dest);
                    a.load("rdx", stack(48));
                    a.load("r8", stack(56));
                    a.mov("r9", op.start);
                    a.call("rt.newRestArray");
                    break;
                case "constructorResult": {
                    // The constructor's result when it returned an object, else the instance.
                    const instance = a.unique("instanceResult"),
                        done = a.unique("constructorResultDone");
                    a.load("rax", value(op.result));
                    a.cmp("rax", 5);
                    a.jcc("ne", instance);
                    copy(value(op.dest), value(op.result));
                    a.jmp(done);
                    a.label(instance);
                    copy(value(op.dest), value(op.instance));
                    a.label(done);
                    break;
                }
                case "derivedReturn": {
                    const object = a.unique("derivedReturnObject"),
                        receiver = a.unique("derivedReturnReceiver"),
                        done = a.unique("derivedReturnDone");
                    // The TypeError (result not an object) and ReferenceError (this
                    // never initialized) belong to the caller's realm: the constructor
                    // returns a ConstructErrorTag marker and the calling runtime's
                    // rt.invokeSourceConstruct throws them.
                    const marker = a.unique("derivedReturnMarker");
                    a.load("rax", value(op.source));
                    a.cmp("rax", 5);
                    a.jcc("e", object);
                    a.cmp("rax", 0);
                    a.jcc("e", receiver);
                    a.mov("rax", 0);
                    a.jmp(marker);
                    a.label(object);
                    copy(value(op.dest), value(op.source));
                    a.jmp(done);
                    a.label(receiver);
                    pointer("rcx", op.dest);
                    a.lea("rdx", stack(thisBase));
                    a.call("rt.readCell");
                    a.load("rax", value(op.dest));
                    a.cmp("rax", 255);
                    a.jcc("ne", done);
                    a.mov("rax", 1);
                    a.label(marker);
                    a.store(payload(op.dest), "rax");
                    a.mov("rax", ConstructErrorTag);
                    a.store(value(op.dest), "rax");
                    a.label(done);
                    break;
                }
                case "invoke": {
                    // A general call is one static descriptor (call-sites.ts) and a
                    // stub that copies the arguments into this frame's argument area
                    // and calls rt.invoke with the callee, receiver and new.target it
                    // names.
                    const callSite = (
                        op: Extract<Operation, { kind: "invoke" }>,
                    ) => {
                        // rt.invoke and rt.prepareTailCall take no new.target; a construct
                        // site ends with its new.target entry (SiteNone: the callee).
                        const construct = !!op.construct && !op.tail;
                        const operands = [
                            value(op.callee),
                            op.receiver === undefined
                                ? { rip: "rt.undefinedValue" }
                                : value(op.receiver),
                            ...op.arguments.map((n) => value(n)),
                        ];
                        const bytes = new Uint8Array(
                                SD.callee +
                                    4 * operands.length +
                                    (construct ? 4 : 0),
                            ),
                            view = new DataView(bytes.buffer),
                            fixups: NamedFragment["fixups"] = [];
                        view.setUint32(SD.argc, op.arguments.length, true);
                        view.setInt32(SD.area, argsBase - frameBias, true);
                        operands.forEach((mem, i) =>
                            writeSiteEntry(
                                view,
                                fixups,
                                SD.callee + 4 * i,
                                mem,
                            ),
                        );
                        if (construct) {
                            const at = SD.callee + 4 * operands.length;
                            if (op.newTarget === undefined)
                                view.setInt32(at, SiteNone, true);
                            else
                                writeSiteEntry(
                                    view,
                                    fixups,
                                    at,
                                    value(op.newTarget),
                                );
                        }
                        const site = "site." + fragments.length;
                        fragments.push({
                            name: site,
                            section: ".rdata",
                            alignment: 8,
                            bytes,
                            fixups,
                            symbols: {},
                        });
                        pointer("rcx", op.dest);
                        a.lea("rdx", { rip: site });
                        a.call(
                            callSiteStub(
                                op.tail
                                    ? "tail"
                                    : construct
                                      ? "construct"
                                      : "invoke",
                                op.arguments.length,
                            ),
                        );
                    };
                    if (
                        op.intrinsic === "imul" &&
                        op.arguments.length === 2 &&
                        !op.direct &&
                        !op.construct &&
                        !op.tail
                    ) {
                        // %Math.imul% with two Numbers whose truncations fit in
                        // 64 bits: ToInt32 of each and a 32-bit product inline
                        // (#426). The callee is checked at every call; anything
                        // else (NaN, Infinity, huge values, non-Numbers, another
                        // function) is the call, out of line.
                        const general = a.unique("generalCall"),
                            called = a.unique("called"),
                            call = op;
                        a.load("rax", value(op.callee));
                        a.cmp("rax", 5);
                        a.jcc("ne", general);
                        a.load("rax", payload(op.callee));
                        a.lea("r10", { rip: "rt.Math.imul.fn" });
                        a.cmp("rax", "r10");
                        a.jcc("ne", general);
                        for (const n of op.arguments) {
                            a.load("rax", value(n));
                            a.cmp("rax", 3);
                            a.jcc("ne", general);
                        }
                        const [x, y] = op.arguments;
                        toInt32Operand(a, payload(x!), "rcx", general);
                        toInt32Operand(a, payload(y!), "r10", general);
                        a.imul("rcx", "r10");
                        a.shl("rcx", 32);
                        a.sar("rcx", 32);
                        a.cvtsi2sd("xmm0", "rcx");
                        setNumber(op.dest);
                        pushCold(() => {
                            a.label(general);
                            callSite(call);
                            a.jmp(called);
                        });
                        a.label(called);
                        break;
                    }
                    const frame: SiteFrame = {
                        a,
                        value,
                        payload,
                        stack,
                        copy,
                        pointer,
                        pushCold,
                        argsBase,
                        callSite,
                        fragments,
                    };
                    if (emitStringIndexSite(frame, op)) break;
                    if (emitFastSite(frame, op)) break;
                    if (!op.direct) {
                        callSite(op);
                        break;
                    }
                    // A callee known at compile time (src/ir/calls.ts): if it is a
                    // function running that code, call the code directly with the
                    // calling convention rt.invoke uses (RCX result, RDX argc, R8 argv,
                    // R9 function, then this and new.target Value pointers).
                    op.arguments.forEach((n, i) =>
                        copy(stack(argsBase + 16 * i), value(n)),
                    );
                    const general = a.unique("generalCall"),
                        called = a.unique("called");
                    a.load("rax", value(op.callee));
                    a.cmp("rax", 5);
                    a.jcc("ne", general);
                    a.load("r9", payload(op.callee));
                    a.load("rax", { base: "r9", disp: O.kind });
                    a.cmp("rax", FunctionKind);
                    a.jcc("ne", general);
                    a.load("rax", { base: "r9", disp: FunctionLayout.code });
                    a.lea("r10", { rip: op.direct });
                    a.cmp("rax", "r10");
                    a.jcc("ne", general);
                    // this: unchanged for strict code; sloppy code gets the global
                    // object for undefined/null and an object receiver as is
                    // (primitives, which need boxing, take the general path). A
                    // callee that reads neither this nor new.target gets neither
                    // (its prologue does not read the pointers).
                    if (op.directNoThis) {
                        // No receiver.
                    } else if (op.receiver === undefined)
                        a.lea("rax", {
                            rip: op.directStrict
                                ? "rt.undefinedValue"
                                : "rt.globalValue",
                        });
                    else if (op.directStrict) a.lea("rax", value(op.receiver));
                    else {
                        const object = a.unique("objectThis"),
                            ready = a.unique("thisReady");
                        a.load("rax", value(op.receiver));
                        a.cmp("rax", 5);
                        a.jcc("e", object);
                        a.cmp("rax", 1);
                        a.jcc("a", general);
                        a.lea("rax", { rip: "rt.globalValue" });
                        a.jmp(ready);
                        a.label(object);
                        a.lea("rax", value(op.receiver));
                        a.label(ready);
                    }
                    if (!op.directNoThis) {
                        a.store(stack(32), "rax");
                        a.lea("rax", { rip: "rt.undefinedValue" });
                        a.store(stack(40), "rax");
                    }
                    pointer("rcx", op.dest);
                    a.mov("rdx", op.arguments.length);
                    a.lea("r8", stack(argsBase));
                    a.call(op.directEntry ? op.direct + ".direct" : op.direct);
                    // A tail call made by the callee comes back as a marker (rt.invoke
                    // does the same); it and the general call are out of line.
                    const tail = a.unique("tailMarker"),
                        call = op;
                    a.load("rax", value(op.dest));
                    a.cmp("rax", TailCallTag);
                    a.jcc("e", tail);
                    pushCold(() => {
                        a.label(tail);
                        pointer("rcx", call.dest);
                        a.call("rt.tailDispatch");
                        a.jmp(called);
                    });
                    pushCold(() => {
                        a.label(general);
                        callSite(call);
                        a.jmp(called);
                    });
                    a.label(called);
                    break;
                }
                case "constructForward":
                    a.lea("rax", value(op.receiver));
                    a.store(stack(32), "rax");
                    a.lea("rax", value(op.newTarget));
                    a.store(stack(40), "rax");
                    pointer("rcx", op.dest);
                    pointer("rdx", op.callee);
                    a.load("r8", stack(48));
                    a.load("r9", stack(56));
                    a.call("rt.invokeConstruct");
                    break;
                case "invokeArray":
                    a.mov("rax", op.construct ? 1 : 0);
                    a.store(stack(32), "rax");
                    if (op.newTarget === undefined) a.mov("rax", 0);
                    else a.lea("rax", value(op.newTarget));
                    a.store(stack(40), "rax");
                    pointer("rcx", op.dest);
                    pointer("rdx", op.callee);
                    pointer("r8", op.array);
                    if (op.receiver === undefined)
                        a.lea("r9", { rip: "rt.undefinedValue" });
                    else pointer("r9", op.receiver);
                    a.call("rt.invokeArray");
                    break;
                case "yield":
                    pointer("rcx", op.dest);
                    pointer("rdx", op.source);
                    a.call("rt.generatorYield");
                    break;
                case "await":
                    pointer("rcx", op.dest);
                    pointer("rdx", op.source);
                    a.call("rt.generatorAwait");
                    break;
                case "yieldDelegated":
                    pointer("rcx", op.dest);
                    pointer("rdx", op.source);
                    pointer("r8", op.mode);
                    a.call(
                        op.value
                            ? "rt.generatorYieldDelegatedValue"
                            : "rt.generatorYieldDelegated",
                    );
                    break;
                case "generatorInitialSuspend":
                    a.call("rt.generatorInitialSuspend");
                    break;
                case "requireObject":
                    a.load("rax", value(op.source));
                    a.cmp("rax", 5);
                    failIf(a, "ne", "rt.throwTypeError");
                    break;
                case "newObject":
                    emitNewObject(frame, op, literalSites.get(op.dest));
                    break;
                case "forInKeys":
                    pointer("rcx", op.dest);
                    pointer("rdx", op.object);
                    a.call("rt.forInKeys");
                    break;
                case "forInHas":
                    pointer("rcx", op.dest);
                    pointer("rdx", op.object);
                    pointer("r8", op.key);
                    a.call("rt.forInHas");
                    break;
                case "getIterator":
                    pointer("rcx", op.iterator);
                    pointer("rdx", op.next);
                    pointer("r8", op.object);
                    a.call("rt.getIterator");
                    break;
                case "iteratorStep":
                    pointer("rcx", op.dest);
                    pointer("rdx", op.done);
                    pointer("r8", op.iterator);
                    pointer("r9", op.next);
                    a.call("rt.iteratorStep");
                    break;
                case "iteratorClose":
                    pointer("rcx", op.iterator);
                    a.call("rt.iteratorClose");
                    break;
                case "requireIterable":
                    pointer("rcx", op.object);
                    a.call("rt.requireIterable");
                    break;
                case "forOfValue":
                    pointer("rcx", op.dest);
                    pointer("rdx", op.iterable);
                    pointer("r8", op.index);
                    a.call("rt.forOfValue");
                    break;
                case "property":
                    if (
                        emitTypedLength(sites, op) ||
                        emitTypedElementGet(sites, fn.id, op)
                    )
                        break;
                    pointer("rcx", op.dest);
                    pointer("rdx", op.object);
                    pointer("r8", op.key);
                    // `object.name` reads go through a per-site inline cache (see
                    // property-cache.ts) when the name can only be a named property.
                    if (
                        op.operation === "get" &&
                        op.keyName !== undefined &&
                        cacheableName(op.keyName)
                    ) {
                        // The callee of a method call gets a record with method entries.
                        const cache = "ic." + fragments.length;
                        fragments.push({
                            name: cache,
                            section: ".data",
                            alignment: 8,
                            bytes: new Uint8Array(
                                op.method
                                    ? MethodCacheLayout.size
                                    : PropertyCacheLayout.size,
                            ),
                            fixups: [],
                            symbols: {},
                        });
                        a.lea("r9", { rip: cache });
                        a.call(op.method ? "rt.icMethod" : "rt.icGet");
                        break;
                    }
                    // `'name' in object`: a per-site cache for shaped receivers (has-cache.ts).
                    if (
                        op.operation === "has" &&
                        op.keyName !== undefined &&
                        cacheableName(op.keyName)
                    ) {
                        const cache = "hc." + fragments.length;
                        fragments.push({
                            name: cache,
                            section: ".data",
                            alignment: 8,
                            bytes: new Uint8Array(HasCacheLayout.size),
                            fixups: [],
                            symbols: {},
                        });
                        a.lea("r9", { rip: cache });
                        a.call("rt.icHas");
                        break;
                    }
                    if (op.operation === "get" && op.keyName === "length") {
                        const cache = "ic." + fragments.length;
                        fragments.push({
                            name: cache,
                            section: ".data",
                            alignment: 8,
                            bytes: new Uint8Array(PropertyCacheLayout.size),
                            fixups: [],
                            symbols: {},
                        });
                        a.lea("r9", { rip: cache });
                        a.call("rt.getLengthCached");
                        break;
                    }
                    // `object[key]`: integer indices of dense arrays, typed arrays and
                    // strings are read by a shared stub (array-elements.ts).
                    if (
                        op.operation === "get" &&
                        op.keyName === undefined &&
                        !stringConstant(op.key)
                    ) {
                        a.call("rt.elementGet");
                        break;
                    }
                    a.call("rt." + op.operation + "Property");
                    if (op.strict && op.operation === "delete") {
                        a.load("rax", payload(op.dest));
                        a.test("rax", "rax");
                        failIf(a, "e", "rt.throwTypeError");
                    }
                    break;
                case "setProperty":
                    if (
                        emitLiteralStore(
                            sites,
                            op,
                            arrayLiterals.has(op.object),
                            literalSites.get(op.object),
                        ) ||
                        emitTypedElementSet(sites, fn.id, op)
                    )
                        break;
                    pointer("rcx", op.object);
                    pointer("rdx", op.key);
                    pointer("r8", op.source);
                    a.mov("r9", (op.define ? 1 : 0) | (op.strict ? 2 : 0));
                    // `object.name = value` writes go through a per-site record that
                    // remembers the inline node holding the property (property-cache.ts).
                    if (
                        !op.define &&
                        op.keyName !== undefined &&
                        cacheableName(op.keyName)
                    ) {
                        const cache = "sc." + fragments.length;
                        fragments.push({
                            name: cache,
                            section: ".data",
                            alignment: 8,
                            bytes: new Uint8Array(SetCacheLayout.size),
                            fixups: [],
                            symbols: {},
                        });
                        a.lea("r10", { rip: cache });
                        a.call("rt.icSet");
                        break;
                    }
                    // `object[key] = value`: dense and typed array elements (array-elements.ts).
                    a.call(
                        !op.define &&
                            op.keyName === undefined &&
                            !stringConstant(op.key)
                            ? "rt.elementSet"
                            : "rt.setProperty",
                    );
                    break;
                case "privateGet":
                    pointer("rcx", op.dest);
                    pointer("rdx", op.object);
                    pointer("r8", op.name);
                    a.call("rt.privateGet");
                    break;
                case "privateSet":
                    pointer("rcx", op.object);
                    pointer("rdx", op.name);
                    pointer("r8", op.source);
                    a.call("rt.privateSet");
                    break;
                case "defineField":
                    pointer("rcx", op.object);
                    pointer("rdx", op.key);
                    pointer("r8", op.source);
                    a.call("rt.defineField");
                    break;
                case "defineDataProperty":
                    pointer("rcx", op.object);
                    pointer("rdx", op.key);
                    pointer("r8", op.source);
                    a.mov("r9", op.attributes);
                    a.call("rt.initFunctionProperty");
                    break;
                case "setPrototype":
                    pointer("rcx", op.object);
                    pointer("rdx", op.prototype);
                    a.call("rt.setPrototype");
                    break;
                case "uninitialized":
                    a.mov("rax", 255);
                    a.store(value(op.dest), "rax");
                    a.mov("rax", 0);
                    a.store(payload(op.dest), "rax");
                    break;
                case "checkInitialized":
                    a.load("rax", value(op.slot));
                    a.cmp("rax", 255);
                    failIf(a, "e", "rt.throwReferenceError");
                    break;
                case "checkResolvable":
                    a.load("rax", payload(op.slot));
                    a.test("rax", "rax");
                    failIf(a, "e", "rt.throwReferenceError");
                    break;
                case "immutableWrite":
                    if (op.message !== undefined) {
                        a.lea("rcx", { rip: literal(op.message) });
                        a.call("rt.throwTypeErrorMessage");
                    } else a.call("rt.throw" + (op.error ?? "TypeError"));
                    break;
                case "constant": {
                    if (staticConstant(op.dest)) break;
                    const v = op.value,
                        tag =
                            v === undefined
                                ? 0
                                : v === null
                                  ? 1
                                  : typeof v === "boolean"
                                    ? 2
                                    : typeof v === "number"
                                      ? 3
                                      : typeof v === "bigint"
                                        ? 7
                                        : 4;
                    a.mov("rax", tag);
                    a.store(value(op.dest), "rax");
                    if (typeof v === "string" || typeof v === "bigint")
                        a.lea("rax", { rip: literal(String(v)) });
                    else if (typeof v === "number") {
                        const bytes = new DataView(new ArrayBuffer(8));
                        bytes.setFloat64(0, v, true);
                        a.mov("rax", bytes.getBigUint64(0, true));
                    } else a.mov("rax", v === true ? 1 : 0);
                    a.store(payload(op.dest), "rax");
                    break;
                }
                case "copy":
                    copy(value(op.dest), value(op.source));
                    break;
                case "loadGlobal":
                    copy(value(op.dest), {
                        rip: op.prelude ? "rt.preludeGlobals" : "js.globals",
                        addend: 16 * op.index,
                    });
                    break;
                case "storeGlobal": {
                    if (op.prelude) {
                        copy(
                            { rip: "rt.preludeGlobals", addend: 16 * op.index },
                            value(op.source),
                        );
                        break;
                    }
                    const alias = globalProperties.findIndex(
                            (p) => p.index === op.index,
                        ),
                        done = a.unique("globalStoreDone");
                    if (alias >= 0) {
                        a.load("rax", {
                            rip: "js.globalBindings",
                            addend: alias * 24 + 16,
                        });
                        a.and("rax", 1);
                        a.test("rax", "rax");
                        if (op.strict) failIf(a, "e", "rt.throwTypeError");
                        else a.jcc("e", done);
                    }
                    copy(
                        { rip: "js.globals", addend: 16 * op.index },
                        value(op.source),
                    );
                    a.label(done);
                    break;
                }
                case "unary":
                    if (op.operator === "isReturnMarker") {
                        // generator.return() unwinds with a CellTag marker value (rt.generatorYield).
                        a.load("rax", value(op.argument));
                        a.cmp("rax", 254);
                        a.setCondition("e"); // sete al; movzx rax,al
                        a.store(payload(op.dest), "rax");
                        a.mov("r10", 2);
                        a.store(value(op.dest), "r10");
                        break;
                    }
                    if (
                        op.operator.startsWith("typeofIs:") ||
                        op.operator.startsWith("typeofNot:")
                    ) {
                        // typeof x === 'name' (lower.ts): the tags rt.typeof maps to
                        // each name; an object is a function when it is a function
                        // object or a callable proxy.
                        const negate = op.operator.startsWith("typeofNot:"),
                            name = op.operator.slice(
                                op.operator.indexOf(":") + 1,
                            );
                        const tags: Record<string, number> = {
                            undefined: 0,
                            boolean: 2,
                            number: 3,
                            string: 4,
                            symbol: 6,
                            bigint: 7,
                        };
                        const match = a.unique("typeofMatch"),
                            differ = a.unique("typeofDiffer"),
                            store = a.unique("typeofStore");
                        a.load("rax", value(op.argument));
                        if (Object.hasOwn(tags, name)) {
                            a.cmp("rax", tags[name]!);
                            a.jcc("e", match);
                            a.jmp(differ);
                        } else if (name === "object" || name === "function") {
                            const fn = name === "function";
                            if (!fn) {
                                a.cmp("rax", 1);
                                a.jcc("e", match);
                            }
                            a.cmp("rax", 5);
                            a.jcc("ne", differ);
                            a.load("r11", payload(op.argument));
                            a.load("r10", { base: "r11", disp: O.kind });
                            a.cmp("r10", FunctionKind);
                            a.jcc("e", fn ? match : differ);
                            a.cmp("r10", ProxyKind);
                            a.jcc("ne", fn ? differ : match);
                            a.load("r10", { base: "r11", disp: O.flags });
                            a.and("r10", ProxyCallable);
                            a.test("r10", "r10");
                            a.jcc("ne", fn ? match : differ);
                            a.jmp(fn ? differ : match);
                        } else a.jmp(differ);
                        a.label(differ);
                        a.mov("rax", negate ? 1 : 0);
                        a.jmp(store);
                        a.label(match);
                        a.mov("rax", negate ? 0 : 1);
                        a.label(store);
                        a.store(payload(op.dest), "rax");
                        a.mov("r10", 2);
                        a.store(value(op.dest), "r10");
                        break;
                    }
                    if (
                        op.numeric &&
                        emitKnownNumberUnary(op.dest, op.operator, op.argument)
                    )
                        break;
                    if (emitNumberUnary(op.dest, op.operator, op.argument))
                        break;
                    pointer("rcx", op.dest);
                    pointer("rdx", op.argument);
                    a.call("rt." + unary[op.operator]);
                    break;
                case "binary": {
                    // A comparison of Numbers that only decides this block's branch is
                    // fused into it: no boolean is materialized.
                    const decides =
                        index === block.operations.length - 1 &&
                        block.terminator.kind === "branch" &&
                        block.terminator.condition === op.dest &&
                        !isLive(
                            liveness.get(block.id)!.liveOut,
                            op.dest,
                            floor,
                        );
                    if (op.numeric && op.operator in knownRelation && decides) {
                        fused = op;
                        break;
                    }
                    if (
                        op.numeric &&
                        emitKnownNumberBinary(
                            op.dest,
                            op.operator,
                            op.left,
                            op.right,
                        )
                    )
                        break;
                    // Strict equality of values whose types are not known is one call
                    // to rt.strictEquals: inline tag dispatch made each site several
                    // hundred bytes, and code size costs more than the call.
                    if (op.operator === "===" || op.operator === "!==") {
                        const c = comparand(op.left, op.right),
                            negate = op.operator === "!==";
                        if (c && decides) {
                            fusedEquality = { ...c, negate };
                            break;
                        }
                        if (c) {
                            const store = a.unique("constantEqual");
                            a.mov("rax", 0);
                            testConstant(c, store);
                            a.mov("rax", 1);
                            a.label(store);
                            if (negate) a.xor("rax", 1);
                            setBoolean(op.dest);
                            break;
                        }
                        pointer("rcx", op.dest);
                        pointer("rdx", op.left);
                        pointer("r8", op.right);
                        a.call("rt.strictEquals");
                        if (op.operator === "!==") {
                            a.load("rax", payload(op.dest));
                            a.xor("rax", 1);
                            a.store(payload(op.dest), "rax");
                        }
                        break;
                    }
                    const fast = emitNumberBinary(
                        op.dest,
                        op.operator,
                        op.left,
                        op.right,
                    );
                    const generic = () => {
                        pointer("rcx", op.dest);
                        pointer("rdx", op.left);
                        pointer("r8", op.right);
                        a.call("rt." + binary[op.operator]);
                        if (op.operator === "!=" || op.operator === "!==") {
                            a.load("rax", payload(op.dest));
                            a.xor("rax", 1);
                            a.store(payload(op.dest), "rax");
                        }
                    };
                    // The generic call is placed after the function's blocks, out of the
                    // path that Numbers take.
                    if (fast) {
                        pushCold(() => {
                            a.label(fast.slow);
                            generic();
                            a.jmp(fast.done);
                        });
                        a.label(fast.done);
                    } else generic();
                    break;
                }
                case "call":
                    op.arguments.forEach((n, i) =>
                        copy(stack(argsBase + 16 * i), value(n)),
                    );
                    pointer("rcx", op.dest);
                    a.mov("rdx", op.arguments.length);
                    a.lea("r8", stack(argsBase));
                    a.call(op.target);
                    break;
            }
            for (const n of reloads) reloadSlot(n);
        }
        const term = block.terminator;
        currentMap = mapOf(liveness.get(block.id)!.beforeTerminator);
        // In the register copy the terminator reads its operand from the
        // frame slot unless a comparison was fused into it; a return restores
        // the saved GPRs (a throw leaves that to the handler record).
        if (region) {
            spill = liveHeld(liveness.get(block.id)!.beforeTerminator);
            const use = terminatorUse(term);
            if (
                use >= 0 &&
                !(term.kind === "branch" && (fused || fusedInteger))
            )
                writeBack([use]);
            if (term.kind === "return") {
                restoreRegisters(region);
                spill = [];
            }
            view = true;
        }
        // A jump to the block emitted next falls through (#146).
        const goto = (target: number) => {
            const label = blockLabel(target);
            if (label !== nextLabel) a.jmp(label);
        };
        switch (term.kind) {
            case "jump":
                goto(term.target);
                break;
            case "switch":
                emitSwitchTable(a, fragments, fn.id, block.id, term, {
                    tag: value(term.value),
                    payload: payload(term.value),
                });
                break;
            case "branch": {
                if (fusedGuard) {
                    testFunctionCode(fusedGuard, blockLabel(term.no));
                    goto(term.yes);
                    break;
                }
                if (fusedEquality) {
                    const equal = fusedEquality.negate ? term.no : term.yes,
                        differ = fusedEquality.negate ? term.yes : term.no;
                    testConstant(fusedEquality, blockLabel(differ));
                    goto(equal);
                    break;
                }
                if (fusedInteger) {
                    const { left, right, condition } = fusedInteger,
                        yes = blockLabel(term.yes),
                        no = blockLabel(term.no);
                    a.cmp(left, right);
                    if (yes === nextLabel) a.jcc(invertSigned[condition]!, no);
                    else {
                        a.jcc(condition, yes);
                        goto(term.no);
                    }
                    break;
                }
                if (fused) {
                    // ucomisd: unordered (NaN) sets parity; only != holds then.
                    const yes = blockLabel(term.yes),
                        no = blockLabel(term.no),
                        negated =
                            fused.operator === "!=" || fused.operator === "!==";
                    numberInto("xmm0", fused.left);
                    a.ucomisd("xmm0", numberOperand(fused.right, "xmm1"));
                    if (negated) {
                        a.jcc("p", yes);
                        if (blockLabel(term.no) === nextLabel) a.jcc("ne", yes);
                        else {
                            a.jcc("e", no);
                            goto(term.yes);
                        }
                    } else {
                        a.jcc("p", no);
                        const c = knownRelation[fused.operator]!;
                        if (blockLabel(term.yes) === nextLabel)
                            a.jcc(inverse[c]!, no);
                        else {
                            a.jcc(c, yes);
                            goto(term.no);
                        }
                    }
                    break;
                }
                // Booleans (the result of every comparison) and numbers decide inline;
                // the other tags go through rt.toBoolean.
                const slow = a.unique("branchSlow"),
                    test = a.unique("branchTest"),
                    yes = blockLabel(term.yes),
                    no = blockLabel(term.no);
                a.load("rax", value(term.condition));
                a.load("r10", payload(term.condition));
                a.cmp("rax", 2);
                a.jcc("e", test);
                a.cmp("rax", 3);
                a.jcc("ne", slow);
                a.movqToXmm("xmm0", "r10");
                a.xor("rax", "rax");
                a.movqToXmm("xmm1", "rax");
                a.ucomisd("xmm0", "xmm1");
                a.jcc("p", no);
                a.jcc("e", no);
                a.jmp(yes);
                {
                    const condition = term.condition;
                    pushCold(() => {
                        a.label(slow);
                        pointer("rcx", condition);
                        a.call("rt.toBoolean");
                        a.mov("r10", "rax");
                        a.jmp(test);
                    });
                }
                a.label(test);
                a.test("r10", "r10");
                if (blockLabel(term.yes) === nextLabel) a.jcc("e", no);
                else {
                    a.jcc("ne", yes);
                    goto(term.no);
                }
                break;
            }
            case "throw":
                flattenSlot(term.value);
                pointer("rcx", term.value);
                a.call("rt.throw");
                break;
            case "return":
                if (term.value >= 0) flattenSlot(term.value);
                a.load("r10", stack(72));
                if (term.value < 0) {
                    a.mov("rax", 0);
                    a.store({ base: "r10" }, "rax");
                    a.store({ base: "r10", disp: 8 }, "rax");
                } else copy({ base: "r10" }, value(term.value));
                a.load("rax", stack(rootBase + R.next));
                a.store({ rip: "rt.gcRoots" }, "rax");
                a.load("rbp", { base: "rsp", disp: savedFrameBase });
                a.add("rsp", allocation);
                a.ret();
                break;
        }
    }
    for (const c of cold.sort((x, y) => x.map - y.map)) {
        currentMap = c.map;
        region = c.region;
        spill = c.spill;
        view = false;
        c.emit();
    }
    region = undefined;
    spill = [];
    if (directEntry) {
        a.label(fn.id + ".direct");
        if (options.coverage && fn.source && !fn.id.startsWith("js.regexpVm."))
            a.incrementMemory({ rip: "cov." + fn.id });
        emitDirectEntry(a, directFrame, fn.id);
        a.jmp(entered);
    }
    fragments.push(
        stackMapFragment(
            fn.id + ".maps",
            fn.id,
            entries,
            maps,
            locations.count,
            alwaysLive,
        ),
    );
    finish(a, fn.id, allocation, prologSize, allocated, [
        { register: 5, codeOffset: prologSize, stackOffset: savedFrameBase },
    ]);
}
