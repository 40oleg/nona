export type Constant = undefined | null | boolean | number | bigint | string;
export type Operation =
    /** The closure of realm-local function `target` (compiled per realm) in the realm of `ctor`, when `ctor` is that realm's %Function%; otherwise undefined. */
    | {
          kind: "realmFunction";
          dest: number;
          ctor: number;
          target: string;
          /** Runtime symbol of the intrinsic ctor must be in its realm (default rt.Function); '*' accepts any function, whose realm's maker checks it. */ intrinsic?: string;
      }
    | {
          kind: "newFunction";
          strict?: boolean;
          dest: number;
          target: string;
          method?: boolean;
          classConstructor?: boolean;
          arrow?: boolean;
          generator?: boolean;
          async?: boolean;
          homeObject?: number;
          captures?: number[];
          name?: string;
          nameSlot?: number;
          parameterCount?: number;
          sourceText?: string;
          /** The function's text as a range of its module's source (instead of sourceText). */ sourceRange?: {
              source: string;
              start: number;
              end: number;
          };
      }
    | {
          kind: "defineDataProperty";
          object: number;
          key: number;
          source: number;
          attributes: number;
      }
    /** CreateDataPropertyOrThrow (class fields): key is a property key. */
    | { kind: "defineField"; object: number; key: number; source: number }
    /** A private field or method of object (name: the private name, a WeakMap); TypeError without it. */
    | { kind: "privateGet"; dest: number; object: number; name: number }
    /** Writes a private field of object; TypeError without it. */
    | { kind: "privateSet"; object: number; name: number; source: number }
    | { kind: "newCell"; dest: number; source: number }
    /**
     * function: the code label of the function declaration the cell holds for
     * its whole life (binder knownFunction, #239). Direct calls use it; later
     * passes (inlining) may rely on it as well.
     */
    | { kind: "readCell"; dest: number; cell: number; function?: string }
    | { kind: "writeCell"; cell: number; source: number }
    | { kind: "loadCapture"; dest: number; index: number }
    | { kind: "currentFunction"; dest: number }
    | {
          kind: "superConstructor";
          dest: number;
          /** Constructor whose [[Prototype]] is used; default: the running function. */ func?: number;
      }
    | { kind: "superReceiver"; dest: number }
    | { kind: "setFunctionHomeObject"; func: number; homeObject: number }
    | { kind: "setCurrentThis"; source: number }
    | { kind: "validateClassHeritage"; base: number }
    | { kind: "validateClassPrototype"; prototype: number }
    | {
          kind: "pushHandler";
          index: number;
          target: number;
          error: number;
          handlerKind?: "catch" | "finally";
      }
    | { kind: "popHandler" }
    | { kind: "newTarget"; dest: number }
    | { kind: "superBase"; dest: number }
    | {
          kind: "superGet";
          dest: number;
          object: number;
          key: number;
          receiver: number;
          /** `super.name`: the literal name */ keyName?: string;
      }
    | {
          kind: "superSet";
          strict?: boolean;
          object: number;
          key: number;
          receiver: number;
          source: number;
      }
    | { kind: "currentThis"; dest: number }
    | { kind: "globalObject"; dest: number }
    /**
     * The guard of an inlined call (src/ir/inline.ts): true when callee is a
     * function object whose code is label `target`, otherwise false. Runs no
     * user code and never throws.
     */
    | { kind: "isFunctionCode"; dest: number; callee: number; target: string }
    | {
          kind: "readGlobalProperty";
          dest: number;
          name: string;
          allowMissing: boolean;
      }
    | {
          kind: "invoke";
          dest: number;
          callee: number;
          arguments: number[];
          receiver?: number;
          construct?: boolean;
          newTarget?: number;
          tail?: boolean;
          /** Code label of the function the callee is expected to be (src/ir/calls.ts). */ direct?: string;
          /** That function is strict (receives this unchanged). */ directStrict?: boolean;
          /** That function reads neither this nor new.target (usesFrameThis): the call passes no receiver. */ directNoThis?: boolean;
          /** The call passes exactly that function's parameters: it enters at `<direct>.direct`. */ directEntry?: boolean;
          /** `object.name(...)` (src/ir/calls.ts): a plain function callee's code is called directly. */ method?: boolean;
          /**
           * `f.call(thisArg, ...args)` or `f.apply(thisArg, list)` (src/ir/calls.ts): when the callee is
           * %Function.prototype.call% / %Function.prototype.apply% and `f` a function object, `f` is called
           * without the builtin. "applyElements": `f.apply(thisArg, [elements])` with the array literal not
           * created, its elements are arguments[1..].
           */
          callApply?: "call" | "apply" | "applyElements";
          /** `object.hasOwnProperty(key)` ('method') or `f.call(object, key)` ('call'): when the callee is %Object.prototype.hasOwnProperty% (or `call` of it), a shaped object may be answered by a per-site cache (has-cache.ts). */ hasOwn?:
              "method" | "call";
          /** `Math.imul(a, b)`: when the callee is %Math.imul% and both arguments are Numbers, computed inline (#426). */ intrinsic?: "imul";
          /**
           * `string.charCodeAt(position)` or `string.charAt(position)` with at most one argument:
           * when the callee is the intrinsic %String.prototype.charCodeAt% / %String.prototype.charAt%,
           * the receiver a primitive string and the position missing or a Number, the code unit is
           * read inline (#425, string-index-site.ts).
           */
          stringIndex?: "charCodeAt" | "charAt";
          /** The TypeError message when the callee is not callable, from its source text (`o.foo is not a function`, #504); not set on construct or tail calls. */
          notCallableMessage?: string;
      }
    | {
          kind: "invokeArray";
          dest: number;
          callee: number;
          array: number;
          receiver?: number;
          construct?: boolean;
          newTarget?: number;
      }
    /** Constructs callee with the current function's own arguments (a default derived constructor's super(...args)). */
    | {
          kind: "constructForward";
          dest: number;
          callee: number;
          receiver: number;
          newTarget: number;
      }
    | { kind: "yield"; dest: number; source: number }
    | { kind: "await"; dest: number; source: number }
    | {
          kind: "yieldDelegated";
          dest: number;
          mode: number;
          source: number;
          value?: boolean;
      }
    | { kind: "generatorInitialSuspend" }
    | { kind: "requireObject"; source: number }
    | {
          kind: "newInstance";
          dest: number;
          callee: number;
          firstArgument?: number;
          argumentArray?: number;
          /** The TypeError message when the callee is not a constructor (`f is not a constructor`, #504); not set with argumentArray. */
          notConstructorMessage?: string;
      }
    | {
          kind: "constructorResult";
          dest: number;
          result: number;
          instance: number;
      }
    | { kind: "derivedReturn"; dest: number; source: number }
    | {
          kind: "newArguments";
          dest: number;
          parameters: number[];
          /** Non-simple parameter list: unmapped, callee is %ThrowTypeError%. */ unmapped?: boolean;
      } // -1: earlier duplicate, no mapping
    | { kind: "newRestArray"; dest: number; start: number }
    | {
          kind: "newObject";
          dest: number;
          array: boolean;
          length: number;
          slots?: number;
          /** An object literal whose keys are all known (#194): its distinct keys in order. The final shape is resolved once per site. */ keys?: string[];
          /** An array literal of `length` elements without holes or spread (#48): created with its element table, every element undefined until its definition stores it. */ elements?: boolean;
          /** An object literal with `keys` whose values were evaluated before it (#48): the slots of the key constants and of each key's last value; newObject defines every property. */ literal?: {
              keys: number[];
              values: number[];
              strict: boolean;
          };
          /** An array literal with `elements` of at most inlineElementCapacity elements, evaluated before it (#48): created with these values. */ elementValues?: number[];
      }
    | { kind: "forInKeys"; dest: number; object: number }
    | { kind: "forInHas"; dest: number; object: number; key: number }
    | { kind: "getIterator"; iterator: number; next: number; object: number }
    | {
          kind: "iteratorStep";
          dest: number;
          done: number;
          iterator: number;
          next: number;
      }
    | { kind: "iteratorClose"; iterator: number }
    | { kind: "requireIterable"; object: number }
    | { kind: "forOfValue"; dest: number; iterable: number; index: number }
    | {
          kind: "property";
          strict?: boolean;
          operation: "get" | "delete" | "has";
          dest: number;
          object: number;
          key: number;
          /** The key is this literal name (`object.name`): the read may use an inline cache. */ keyName?: string;
          /** The read is the callee of a method call `object.name(...)` (src/ir/calls.ts): its cache record has method entries (MethodCacheLayout). */ method?: boolean;
          /** The key is a Number (src/ir/numbers.ts): a typed array element may be read inline. */ numericKey?: boolean;
          /** In a loop versioned by src/ir/typed-loops.ts: object is a typed array over a fixed-length attached buffer and key an integer index below its length. */ unchecked?: boolean;
          /** In a loop versioned by src/ir/typed-loops.ts: `object.length` of such a typed array, read from the view (the getter is the intrinsic one). */ typedLength?: boolean;
      }
    | {
          kind: "setProperty";
          strict?: boolean;
          object: number;
          key: number;
          source: number;
          define: boolean;
          /** `object.name = value`: the write may use an inline cache. */ keyName?: string;
          /** The initial definition of key `keys[literalSlot]` of the object literal `object` (a newObject with keys). */ literalSlot?: number;
          /** The initial definition of element `literalElement` of the array literal `object` (a newObject with elements). */ literalElement?: number;
          /** The key is a Number (src/ir/numbers.ts): a typed array element may be written inline. */ numericKey?: boolean;
          /** As for property: the element is known to exist (src/ir/typed-loops.ts); the value is a primitive. */ unchecked?: boolean;
      }
    | {
          kind: "defineAccessor";
          object: number;
          key: number;
          source: number;
          setter: boolean;
          nonEnumerable?: boolean;
      }
    | { kind: "setPrototype"; object: number; prototype: number }
    | { kind: "uninitialized"; dest: number }
    | { kind: "checkInitialized"; slot: number; name?: string }
    | { kind: "checkResolvable"; slot: number; name?: string }
    | {
          kind: "immutableWrite";
          error?: "ReferenceError";
          message?: string;
      }
    | { kind: "nullishDestructure"; source: number; key?: number }
    | { kind: "constant"; dest: number; value: Constant }
    | { kind: "copy"; dest: number; source: number }
    | { kind: "loadGlobal"; dest: number; index: number; prelude?: boolean }
    | {
          kind: "storeGlobal";
          strict?: boolean;
          source: number;
          index: number;
          prelude?: boolean;
      }
    | {
          kind: "unary";
          dest: number;
          operator: string;
          argument: number;
          /** The argument is a Number (src/ir/numbers.ts). */ numeric?: boolean;
          /** The result is an int32 Number when the operation completes (src/ir/representations.ts): `~` of a Number, or the update of an int32 induction variable. */ int32?: boolean;
      }
    | {
          kind: "binary";
          dest: number;
          operator: string;
          left: number;
          right: number;
          /** Both operands are Numbers (src/ir/numbers.ts). */ numeric?: boolean;
          /** The result is an int32 Number when the operation completes (src/ir/representations.ts): `& | ^ << >>` with a Number operand, or the update of an int32 induction variable. */ int32?: boolean;
          /** The result is a uint32 Number when the operation completes (`>>>`, src/ir/representations.ts). */ uint32?: boolean;
      }
    | { kind: "call"; dest: number; target: string; arguments: number[] };
export type Terminator =
    | { kind: "throw"; value: number }
    | { kind: "jump"; target: number }
    | { kind: "branch"; condition: number; yes: number; no: number }
    /**
     * A dense switch on integer Numbers (#241): `value` an int32 Number v
     * with low <= v < low + targets.length jumps to targets[v - low]; any
     * other value (another type, a fraction, out of range) to `otherwise`.
     */
    | {
          kind: "switch";
          value: number;
          low: number;
          targets: number[];
          otherwise: number;
      }
    | { kind: "return"; value: number };
/** The blocks a terminator can continue in, in order (duplicates possible). */
export function terminatorTargets(t: Terminator): number[] {
    switch (t.kind) {
        case "jump":
            return [t.target];
        case "branch":
            return [t.yes, t.no];
        case "switch":
            return [...t.targets, t.otherwise];
        default:
            return [];
    }
}
/** The slot a terminator reads, or -1. */
export function terminatorUse(t: Terminator): number {
    return t.kind === "branch"
        ? t.condition
        : t.kind === "switch"
          ? t.value
          : t.kind === "return" || t.kind === "throw"
            ? t.value
            : -1;
}
/**
 * A loop induction variable `i` (src/ir/representations.ts): the header
 * ends in `i <op> bound` into the loop, i is changed in the loop only by
 * int32 constant steps of one direction, and the loop does not change bound.
 */
export interface InductionVariableIR {
    slot: number;
    /** The comparison as `slot <op> bound` (operands swapped if needed). */
    operator: "<" | "<=" | ">" | ">=";
    /** The bound's slot. */
    bound: number;
    /** The bound's value where it is a known constant. */
    boundValue?: number;
    /** The largest step magnitude; positive steps count up, negative down. */
    step: number;
    /** i holds an int32 everywhere in the loop and after it, without any check. */
    int32: boolean;
    /**
     * Without `int32`: i holds an int32 in the loop and after it when, on
     * entry to the loop, bound is a Number no greater than `max` (counting
     * up) or no less than `min` (counting down). NaN fails the check.
     */
    entryCheck?: { max: number } | { min: number };
}
/** Where an unboxed slot's value is read as a Value or must be in its stack slot (src/ir/representations.ts). */
export interface UnboxedEscapeIR {
    slot: number;
    /**
     * call: an operand of a call or construction; cell: written to a cell or
     * captured; store: stored to a property, element, binding or literal;
     * copy: copied to a slot that is not unboxed; return / throw: the
     * terminator's value; generic: an operand of any other operation;
     * suspend: live across yield or await; handler: live into the handler
     * of a block that may throw; exit: live on an edge leaving the loop.
     * key: the Number key of an element access; convert: the operand of
     * a bit operation (ToInt32 of a Number); branch: a branch condition.
     * These read the Number as it is (no boxing).
     */
    kind:
        | "call"
        | "cell"
        | "store"
        | "copy"
        | "return"
        | "throw"
        | "generic"
        | "suspend"
        | "handler"
        | "exit"
        | "key"
        | "convert"
        | "branch";
    block: number;
    /** The operation's index in the block; -1 for the terminator, an exit edge or a handler. */
    index: number;
    /** The exit edge's target (exit) or the handler block (handler). */
    target?: number;
    /** The value must be a boxed Value (tag and payload) there. */
    box: boolean;
}
/** A slot that may be kept unboxed (a raw double, or an int32) inside a loop. */
export interface UnboxedSlotIR {
    slot: number;
    read: boolean;
    written: boolean;
    /** Live into the header: a Number there on every entry. */
    liveIn: boolean;
    /** An int32 induction variable proven without a check. */
    int32?: boolean;
}
/** Representation facts of one natural loop (src/ir/representations.ts). */
export interface LoopRepresentationIR {
    header: number;
    /** The loop's blocks (the header first). */
    blocks: number[];
    induction: InductionVariableIR[];
    unboxed: UnboxedSlotIR[];
    escapes: UnboxedEscapeIR[];
}
export interface BlockIR {
    id: number;
    exceptionTarget?: number;
    operations: Operation[];
    terminator: Terminator;
}
export interface FunctionIR {
    id: string;
    name: string;
    /** Where the function starts: its module's path ("" for the program) and source offset, for profiling tools (NONA_FN_NAMES). */ origin?: {
        script: string;
        start: number;
    };
    /** Where the function is in its script (coverage): script index into ModuleIR.scripts, V8 function name, UTF-16 offsets. */ source?: {
        script: number;
        name: string;
        start: number;
        end: number;
    };
    parameterCount: number;
    /**
     * Every parameter is a plain identifier without a default and the rest
     * parameter (if any) is not destructured: the parameter slots hold their
     * arguments (or undefined) from entry and never start in their dead zone.
     */
    simpleParameters?: boolean;
    localCount: number;
    slotCount: number;
    maxArguments: number;
    handlerCount?: number;
    derivedConstructor?: boolean;
    generator?: boolean;
    /** Some direct call enters at `<id>.direct` (src/ir/calls.ts). */ directEntry?: boolean;
    /**
     * Loop representation facts (src/ir/representations.ts), for the IR as
     * optimizeFunction returns it: a pass that removes or reorders
     * operations afterwards drops them.
     */
    representations?: LoopRepresentationIR[];
    blocks: BlockIR[];
}
export interface FfiDeclarationIR {
    /** The library (see ffi.ts); for a portable declaration, the key of `libraries`. */
    dll: string;
    /** Libraries by operating system (`define({win32, linux, darwin}, ...)`); the compiler selects the target's. */
    libraries?: Partial<Record<"win32" | "linux" | "darwin", string>>;
    name: string;
    signature: string;
    span: { start: number; end: number };
}
export interface ModuleIR {
    /** Script paths by index: 0 is the program (named by the compiler), i+1 module record i. */ scripts?: string[];
    /** Native foreign functions declared with nona:ffi define(); index = declaration id. */ ffi?: FfiDeclarationIR[];
    globalCount: number;
    functions: FunctionIR[];
    globalProperties?: { name: string; index: number }[];
    runtimePrelude?: boolean;
}
