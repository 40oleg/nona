import type * as A from "../../frontend/ast.js";
import type {
    Binding,
    StorageBinding,
    BoundProgram,
    BoundFunction,
} from "../../frontend/bound.js";
import type { BlockIR, Operation, Terminator } from "../model.js";
import { internalError } from "../../diagnostics.js";
import type { FfiDeclarationIR } from "../model.js";
export type WithReference = { found: number; object: number };
export type Reference =
    | { id: A.Identifier; resolvable?: number; withRef?: WithReference }
    | {
          object: number;
          key: number;
          receiver?: number;
          /** super base already read into object */ baseReady?: boolean;
          /** `object.name`: the literal key */ keyName?: string;
          /** `object.#name`: key holds the private name record */ privateName?: boolean;
          privateKind?: A.PrivateName["privateKind"];
      };
export type ChainState =
    | { kind: "value"; slot: number; receiver?: number }
    | { kind: "reference"; reference: Reference };
export type Control = {
    stop: number;
    next?: number;
    labels: string[];
    unlabelledBreak: boolean;
    handlerDepth: number;
    finalizerDepth: number;
    iterator?: number;
};
export type Finalizer = {
    body: A.Block;
    handlerDepth: number;
    controls: Control[];
};

/** The state of one function being lowered and the operations every part shares: blocks, slots, constants, closures, bindings, scopes and references. */
export abstract class LowererBase {
    // Implemented by the later parts of the class chain (lower/*.ts, lower.ts).
    protected abstract expression(
        e: A.Expression,
        inferredName?: string | number,
    ): number;
    protected abstract privateName(e: A.PrivateName): number;
    protected abstract invokeWithArguments(
        dest: number,
        callee: number,
        args: { fixed: number[] } | { array: number },
        receiver?: number,
        construct?: boolean,
        newTarget?: number,
        tail?: boolean,
        hasOwn?: "method" | "call",
        intrinsic?: "imul",
        stringIndex?: "charCodeAt" | "charAt",
        /** The callee expression, for the TypeError message of a callee that is not callable. */
        calleeNode?: A.Expression,
    ): void;
    protected abstract preludeCall(name: string, args: number[]): number;
    protected blocks: BlockIR[] = [];
    protected handlers: number[] = [];
    protected handlerCount = 0;
    protected current: BlockIR;
    protected terminated = false;
    protected slots: number;
    protected maxArguments = 0;
    protected captureSlots = new Map<StorageBinding, number>();
    protected controls: Control[] = [];
    protected finalizers: Finalizer[] = [];
    protected asyncIterators = new Set<number>();
    /** Done flags of destructuring iterators; a return completion closes them only while not done. */
    protected iteratorDoneFlags = new Map<number, number>();
    protected tailCalls = new Set<A.Expression>();
    constructor(
        protected bound: BoundProgram,
        protected fn: BoundFunction | null,
        protected templateCaches: { next: number; ffi: FfiDeclarationIR[] },
        protected moduleIndex?: number,
    ) {
        this.slots = fn?.locals.length ?? bound.mainLocals.length;
        this.current = this.block();
    }
    protected get strict(): boolean {
        return (
            this.fn?.strict ??
            ((this.moduleIndex !== undefined && this.moduleIndex >= 0) ||
                !!this.bound.ast.strict)
        );
    }
    protected slot(): number {
        return this.slots++;
    }
    protected block(): BlockIR {
        const b: BlockIR = {
            id: this.blocks.length,
            ...(this.handlers.length
                ? { exceptionTarget: this.handlers[this.handlers.length - 1] }
                : {}),
            operations: [],
            terminator: { kind: "return", value: -1 },
        };
        this.blocks.push(b);
        return b;
    }
    protected select(b: BlockIR): void {
        this.current = b;
        this.terminated = false;
    }
    protected emit(op: Operation): void {
        this.current.operations.push(op);
    }
    protected end(t: Terminator): void {
        this.current.terminator = t;
        this.terminated = true;
    }
    protected constant(
        value: undefined | null | boolean | number | bigint | string,
    ): number {
        const dest = this.slot();
        this.emit({ kind: "constant", dest, value });
        return dest;
    }
    protected binding(id: A.Identifier): Binding {
        const b = this.bound.bindings.get(id);
        if (!b)
            throw internalError(
                "lower",
                `Missing binding: ${id.name}`,
                id.span,
            );
        return b;
    }
    protected cellSlot(binding: StorageBinding): number {
        if (binding.owner === (this.fn?.index ?? -1)) return binding.index;
        const slot = this.captureSlots.get(binding);
        if (slot === undefined)
            throw new Error(`Missing capture ${binding.name}`);
        return slot;
    }
    /** A captured parameter that is never written after the call binds it is
     * captured by value: closures copy the Value itself instead of sharing a
     * heap cell. Parameters of a function with defaults, patterns or a rest
     * element are initialized one by one (a closure in a default may see a
     * later parameter in its TDZ), so they keep their cells. */
    protected capturedByValue(b: StorageBinding): boolean {
        if (b.kind !== "parameter" || !b.captured || b.assigned) return false;
        const owner = this.bound.functions[b.owner];
        if (!owner) return false;
        const d = owner.declaration;
        return !(
            d.defaults?.some(Boolean) ||
            d.parameters.some((p) => p.kind !== "Identifier") ||
            !!d.rest
        );
    }
    protected closure(
        fn: BoundFunction,
        inferredName?: string | number,
        homeObject?: number,
    ): number {
        const dest = this.slot(),
            captures = fn.captures.map((binding) => this.cellSlot(binding));
        const declared = fn.declaration.id?.name;
        const override =
            fn.declaration.kind === "FunctionExpression"
                ? fn.declaration
                : undefined;
        const name =
            override?.nameOverride ??
            (declared === "*default*"
                ? "default"
                : (declared ?? inferredName ?? ""));
        const sourceText =
            fn.module !== undefined
                ? this.bound.modules![fn.module]!.record.ast.source
                : this.bound.ast.source;
        const sourceSpan =
            fn.declaration.kind === "FunctionExpression"
                ? (fn.declaration.sourceSpan ?? fn.declaration.span)
                : fn.declaration.span;
        this.emit({
            kind: "newFunction",
            strict: fn.strict,
            dest,
            ...(homeObject === undefined ? {} : { homeObject }),
            method:
                fn.declaration.kind === "FunctionExpression" &&
                fn.declaration.method === true,
            classConstructor:
                fn.declaration.kind === "FunctionExpression" &&
                fn.declaration.classConstructor === true,
            arrow:
                fn.declaration.kind === "FunctionExpression" &&
                fn.declaration.arrow === true,
            generator: fn.declaration.generator === true,
            ...(fn.declaration.async ? { async: true } : {}),
            target: `${fn.realmLocal ? "js.rfn" : "js.fn"}.${fn.index}`,
            captures,
            parameterCount:
                (fn.declaration.defaults?.findIndex((init) => init !== null) ??
                    -1) < 0
                    ? fn.parameters.length
                    : fn.declaration.defaults!.findIndex(
                          (init) => init !== null,
                      ),
            ...(() => {
                const text =
                    override?.sourceText ??
                    (fn.declaration.kind === "Function"
                        ? fn.declaration.sourceText
                        : undefined);
                if (text !== undefined) return { sourceText: text };
                // Nested functions share their module's text: each keeps a range of it.
                return sourceText === undefined
                    ? {}
                    : {
                          sourceRange: {
                              source: sourceText,
                              start: sourceSpan.start,
                              end: sourceSpan.end,
                          },
                      };
            })(),
            ...(typeof name === "number" ? { nameSlot: name } : { name }),
        });
        return dest;
    }
    protected globalObject(): number {
        const dest = this.slot();
        this.emit({ kind: "globalObject", dest });
        return dest;
    }
    protected currentThis(): number {
        const dest = this.slot();
        this.emit({ kind: "currentThis", dest });
        return dest;
    }
    protected methodName(key: number, prefix?: string): number {
        const result = this.slot(),
            type = this.slot(),
            symbolType = this.constant("symbol"),
            isSymbol = this.slot(),
            symbol = this.block(),
            plain = this.block(),
            join = this.block();
        this.emit({
            kind: "unary",
            dest: type,
            operator: "typeof",
            argument: key,
        });
        this.emit({
            kind: "binary",
            dest: isSymbol,
            operator: "===",
            left: type,
            right: symbolType,
        });
        this.end({
            kind: "branch",
            condition: isSymbol,
            yes: symbol.id,
            no: plain.id,
        });
        this.select(plain);
        this.emit({ kind: "copy", dest: result, source: key });
        this.end({ kind: "jump", target: join.id });
        this.select(symbol);
        const descriptionKey = this.constant("description"),
            description = this.slot(),
            undefinedValue = this.constant(undefined),
            missing = this.slot();
        this.emit({
            kind: "property",
            operation: "get",
            dest: description,
            object: key,
            key: descriptionKey,
        });
        this.emit({
            kind: "binary",
            dest: missing,
            operator: "===",
            left: description,
            right: undefinedValue,
        });
        const empty = this.block(),
            named = this.block();
        this.end({
            kind: "branch",
            condition: missing,
            yes: empty.id,
            no: named.id,
        });
        this.select(empty);
        this.emit({ kind: "copy", dest: result, source: this.constant("") });
        this.end({ kind: "jump", target: join.id });
        this.select(named);
        const open = this.constant("["),
            left = this.slot(),
            close = this.constant("]"),
            full = this.slot();
        this.emit({
            kind: "binary",
            dest: left,
            operator: "+",
            left: open,
            right: description,
        });
        this.emit({
            kind: "binary",
            dest: full,
            operator: "+",
            left,
            right: close,
        });
        this.emit({ kind: "copy", dest: result, source: full });
        this.end({ kind: "jump", target: join.id });
        this.select(join);
        if (!prefix) return result;
        const prefixed = this.slot();
        this.emit({
            kind: "binary",
            dest: prefixed,
            operator: "+",
            left: this.constant(prefix),
            right: result,
        });
        return prefixed;
    }
    /** Read the cell of a captured binding; a known function is recorded on the read. */
    protected readCell(b: StorageBinding, dest: number): void {
        const fn = b.knownFunction;
        this.emit({
            kind: "readCell",
            dest,
            cell: this.cellSlot(b),
            ...(fn
                ? {
                      function: `${fn.realmLocal ? "js.rfn" : "js.fn"}.${fn.index}`,
                  }
                : {}),
        });
    }
    /** Read a hidden storage binding (a with statement's object). */
    protected readStorage(b: StorageBinding): number {
        const dest = this.slot();
        if (b.kind === "global") {
            this.emit({ kind: "loadGlobal", dest, index: b.index });
            return dest;
        }
        if (b.captured && !this.capturedByValue(b)) this.readCell(b, dest);
        else this.emit({ kind: "copy", dest, source: this.cellSlot(b) });
        return dest;
    }
    /** HasBinding through enclosing with object environments, innermost first. */
    protected withResolution(id: A.Identifier): WithReference | undefined {
        const chain = this.bound.withChains.get(id);
        if (!chain) return undefined;
        const found = this.slot(),
            object = this.slot(),
            join = this.block(),
            name = this.constant(id.name);
        for (const binding of chain) {
            const candidate = this.readStorage(binding),
                has = this.preludeCall("withHasBinding", [candidate, name]);
            this.emit({ kind: "copy", dest: found, source: has });
            this.emit({ kind: "copy", dest: object, source: candidate });
            const next = this.block();
            this.end({
                kind: "branch",
                condition: has,
                yes: join.id,
                no: next.id,
            });
            this.select(next);
        }
        this.end({ kind: "jump", target: join.id });
        this.select(join);
        return { found, object };
    }
    /** Branch on a with resolution: object environment or the static binding. */
    protected withBranch(
        ref: WithReference,
        dynamic: () => number | void,
        fallback: () => number | void,
    ): number {
        const dest = this.slot(),
            yes = this.block(),
            no = this.block(),
            join = this.block();
        this.end({
            kind: "branch",
            condition: ref.found,
            yes: yes.id,
            no: no.id,
        });
        this.select(yes);
        const a = dynamic();
        if (a !== undefined) this.emit({ kind: "copy", dest, source: a });
        this.end({ kind: "jump", target: join.id });
        this.select(no);
        const b = fallback();
        if (b !== undefined) this.emit({ kind: "copy", dest, source: b });
        this.end({ kind: "jump", target: join.id });
        this.select(join);
        return dest;
    }
    protected withGet(ref: WithReference, id: A.Identifier): number {
        return this.preludeCall("withGetBindingValue", [
            ref.object,
            this.constant(id.name),
            this.constant(this.strict),
        ]);
    }
    protected withSet(
        ref: WithReference,
        id: A.Identifier,
        source: number,
    ): void {
        this.preludeCall("withSetMutableBinding", [
            ref.object,
            this.constant(id.name),
            source,
            this.constant(this.strict),
        ]);
    }
    protected read(
        id: A.Identifier,
        allowMissing = false,
        withRef: WithReference | undefined = this.withResolution(id),
    ): number {
        if (withRef)
            return this.withBranch(
                withRef,
                () => this.withGet(withRef, id),
                () => this.readStatic(id, allowMissing),
            );
        return this.readStatic(id, allowMissing);
    }
    protected readStatic(id: A.Identifier, allowMissing = false): number {
        const b = this.binding(id),
            dest = this.slot();
        switch (b.kind) {
            case "parameter":
            case "local":
                if (b.captured && !this.capturedByValue(b))
                    this.readCell(b, dest);
                else
                    this.emit({ kind: "copy", dest, source: this.cellSlot(b) });
                break;
            case "global":
                this.emit({ kind: "loadGlobal", dest, index: b.index });
                break;
            case "globalProperty":
                // undefined, NaN and Infinity are non-writable, non-configurable
                // properties of the global object that no declaration may shadow
                // (the binder rejects such declarations), so a reference that
                // resolves to the global property is the constant.
                if (b.name === "undefined")
                    this.emit({ kind: "constant", dest, value: undefined });
                else if (b.name === "NaN")
                    this.emit({ kind: "constant", dest, value: NaN });
                else if (b.name === "Infinity")
                    this.emit({ kind: "constant", dest, value: Infinity });
                else
                    this.emit({
                        kind: "readGlobalProperty",
                        dest,
                        name: b.name,
                        allowMissing,
                    });
                break;
            default:
                throw new Error("Unsupported binding");
        }
        if (
            ("lexical" in b && b.lexical) ||
            (b.kind === "parameter" &&
                (this.fn?.declaration.defaults?.some(Boolean) ||
                    this.fn?.declaration.parameters.some(
                        (p) => p.kind !== "Identifier",
                    )))
        )
            this.emit({ kind: "checkInitialized", slot: dest });
        return dest;
    }
    protected write(
        id: A.Identifier,
        source: number,
        initializing = false,
        withRef: WithReference | undefined = initializing
            ? undefined
            : this.withResolution(id),
    ): void {
        if (withRef) {
            this.withBranch(
                withRef,
                () => this.withSet(withRef, id, source),
                () => this.writeStatic(id, source, initializing),
            );
            return;
        }
        this.writeStatic(id, source, initializing);
    }
    protected writeStatic(
        id: A.Identifier,
        source: number,
        initializing = false,
    ): void {
        const b = this.binding(id);
        if (!initializing && "silentImmutable" in b) {
            if (b.silentImmutable) return;
            if (b.mutable === false) {
                this.emit({ kind: "immutableWrite" });
                return;
            }
        }
        if (!initializing && "lexical" in b && b.lexical) {
            this.read(id);
            if (!b.mutable) this.emit({ kind: "immutableWrite" });
        }
        this.store(b, source);
    }
    protected store(b: Binding, source: number): void {
        if (b.kind === "global")
            this.emit({
                kind: "storeGlobal",
                strict: this.strict,
                source,
                index: b.index,
            });
        else if (b.kind === "globalProperty")
            this.emit({
                kind: "setProperty",
                strict: this.strict,
                object: this.globalObject(),
                key: this.constant(b.name),
                source,
                define: false,
            });
        else if (b.kind === "local" || b.kind === "parameter") {
            if (b.captured && this.capturedByValue(b))
                throw new Error(`Write to the by-value capture ${b.name}`);
            if (b.captured)
                this.emit({
                    kind: "writeCell",
                    cell: this.cellSlot(b),
                    source,
                });
            else this.emit({ kind: "copy", dest: b.index, source });
        } else throw new Error("Invalid assignment binding");
    }
    protected enterScope(owner: A.Node): void {
        for (const b of this.bound.lexicalScopes.get(owner) ?? []) {
            if (this.moduleIndex === -1 && b.module) continue;
            const dest = this.slot();
            this.emit({ kind: "uninitialized", dest });
            if (b.kind === "local" && b.captured)
                this.emit({ kind: "newCell", dest: b.index, source: dest });
            else this.store(b, dest);
        }
        for (const fn of this.bound.scopeFunctions.get(owner) ?? [])
            this.store(this.binding(fn.declaration.id!), this.closure(fn));
    }
    protected cloneIteration(owner: A.For): void {
        for (const b of this.bound.lexicalScopes.get(owner) ?? [])
            if (b.kind === "local" && b.captured && b.mutable) {
                const value = this.slot();
                this.emit({ kind: "readCell", dest: value, cell: b.index });
                this.emit({ kind: "newCell", dest: b.index, source: value });
            }
    }
    protected reference(
        e: A.Assignable,
        preserveGlobalResolution = false,
    ): Reference {
        if (e.kind === "Identifier") {
            const binding = this.binding(e);
            const withRef = this.withResolution(e);
            const resolvable =
                preserveGlobalResolution &&
                this.strict &&
                binding.kind === "globalProperty"
                    ? this.globalExists(binding.name)
                    : undefined;
            return {
                id: e,
                ...(resolvable === undefined ? {} : { resolvable }),
                ...(withRef ? { withRef } : {}),
            };
        }
        if (e.object.kind === "Super") {
            const receiver = this.slot();
            this.emit({ kind: "currentThis", dest: receiver });
            const key = this.expression(e.property),
                object = this.slot();
            return {
                object,
                key,
                receiver,
                ...(e.property.kind === "Literal" &&
                typeof e.property.value === "string"
                    ? { keyName: e.property.value }
                    : {}),
            };
        }
        if (e.property.kind === "PrivateName") {
            const object = this.expression(e.object);
            return {
                object,
                key: this.privateName(e.property),
                privateName: true,
                privateKind: e.property.privateKind,
            };
        }
        // Keep the raw key: RHS effects may mutate an object used as a key.
        const object = this.expression(e.object),
            key = this.expression(e.property);
        if (
            e.property.kind === "Literal" &&
            typeof e.property.value === "string"
        )
            return { object, key, keyName: e.property.value };
        return { object, key };
    }
    /** Read-modify-write references convert the key once (ToPropertyKey before GetValue). */
    protected settledReference(ref: Reference): Reference {
        if ("id" in ref || ref.privateName) return ref;
        // Super references read their base (GetSuperBase) before the key is converted.
        if (ref.receiver !== undefined) {
            this.emit({ kind: "superBase", dest: ref.object });
            const key = this.slot();
            this.emit({
                kind: "unary",
                dest: key,
                operator: "propertyKey",
                argument: ref.key,
            });
            return { ...ref, key, baseReady: true };
        }
        // GetValue: ToObject(base) (TypeError for null/undefined) precedes ToPropertyKey.
        const nullish = this.slot(),
            fail = this.block(),
            ok = this.block();
        this.emit({
            kind: "unary",
            dest: nullish,
            operator: "isNullish",
            argument: ref.object,
        });
        this.end({
            kind: "branch",
            condition: nullish,
            yes: fail.id,
            no: ok.id,
        });
        this.select(fail);
        this.emit({ kind: "immutableWrite" });
        this.end({ kind: "jump", target: ok.id });
        this.select(ok);
        // Numbers stay Numbers: their ToPropertyKey has no side effects, so the
        // property operations convert them later (typed arrays use them directly).
        const key = this.slot();
        this.emit({
            kind: "unary",
            dest: key,
            operator: "propertyKeyIndex",
            argument: ref.key,
        });
        return { ...ref, key };
    }
    protected globalExists(name: string): number {
        const object = this.globalObject(),
            key = this.constant(name),
            dest = this.slot();
        this.emit({ kind: "property", operation: "has", dest, object, key });
        return dest;
    }
    protected getReference(ref: Reference): number {
        if ("id" in ref) return this.read(ref.id, false, ref.withRef);
        // Fields and methods are read natively (their name is a WeakMap from
        // object to value or method); accessors call their getter in the prelude.
        if (ref.privateName && ref.privateKind !== "accessor") {
            const dest = this.slot();
            this.emit({
                kind: "privateGet",
                dest,
                object: ref.object,
                name: ref.key,
            });
            return dest;
        }
        if (ref.privateName)
            return this.preludeCall("privateGet", [ref.object, ref.key]);
        const dest = this.slot();
        if (ref.receiver !== undefined) {
            if (!ref.baseReady)
                this.emit({ kind: "superBase", dest: ref.object });
            const key = this.slot();
            this.emit({
                kind: "unary",
                dest: key,
                operator: "propertyKey",
                argument: ref.key,
            });
            this.emit({
                kind: "superGet",
                dest,
                object: ref.object,
                key,
                receiver: ref.receiver,
                ...(ref.keyName !== undefined ? { keyName: ref.keyName } : {}),
            });
        } else this.emit({ kind: "property", operation: "get", dest, ...ref });
        return dest;
    }
    protected putReference(ref: Reference, source: number): void {
        if ("id" in ref && ref.withRef) {
            const withRef = ref.withRef,
                id = ref.id;
            this.withBranch(
                withRef,
                () => this.withSet(withRef, id, source),
                () =>
                    this.putReference(
                        {
                            id,
                            ...(ref.resolvable === undefined
                                ? {}
                                : { resolvable: ref.resolvable }),
                        },
                        source,
                    ),
            );
        } else if ("id" in ref) {
            const binding = this.binding(ref.id);
            if (this.strict && binding.kind === "globalProperty") {
                if (ref.resolvable !== undefined)
                    this.emit({
                        kind: "checkResolvable",
                        slot: ref.resolvable,
                    });
                this.emit({
                    kind: "checkResolvable",
                    slot: this.globalExists(binding.name),
                });
            }
            // The reference was already resolved (with objects included) by reference().
            this.writeStatic(ref.id, source);
        } else if (ref.privateName && ref.privateKind === "field")
            this.emit({
                kind: "privateSet",
                object: ref.object,
                name: ref.key,
                source,
            });
        else if (ref.privateName)
            this.preludeCall("privateSet", [ref.object, ref.key, source]);
        else if (ref.receiver !== undefined) {
            if (!ref.baseReady)
                this.emit({ kind: "superBase", dest: ref.object });
            const key = this.slot();
            this.emit({
                kind: "unary",
                dest: key,
                operator: "propertyKey",
                argument: ref.key,
            });
            this.emit({
                kind: "superSet",
                strict: this.strict,
                object: ref.object,
                key,
                receiver: ref.receiver,
                source,
            });
        } else
            this.emit({
                kind: "setProperty",
                strict: this.strict,
                object: ref.object,
                key: ref.key,
                source,
                define: false,
                ...(ref.keyName !== undefined ? { keyName: ref.keyName } : {}),
            });
    }
}
