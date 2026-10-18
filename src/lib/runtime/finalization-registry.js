// FinalizationRegistry (ES2021 26.2), linked only when a source names
// FinalizationRegistry. Each cell keeps its target as the only key of a
// private WeakSet, like a WeakRef (weakref.js); __nonaWeakRefTarget reads it
// back. After a microtask checkpoint that follows a collection
// (__nonaGcCount changed), the cells whose target is gone move to their
// registry's pending list, and an unreferenced timer runs the cleanup
// callbacks from a later event-loop turn: never inside the collector or a
// checkpoint, and pending cleanup does not keep the process alive.
// Cloned realms (Test262) have no host functions: their registries hold the
// targets strongly and never run cleanup.
__nonaPromiseDrainJobs = (function (drain) {
    "use strict";
    var defineProperty = Object.defineProperty,
        objectCreate = Object.create,
        markNative = Function.prototype.__nonaMarkNativeInternal;
    var TypeErrorConstructor = TypeError,
        WeakSetConstructor = WeakSet,
        WeakMapConstructor = WeakMap,
        states = new WeakMap(),
        getState = WeakMap.prototype.get.bind(states),
        setState = WeakMap.prototype.set.bind(states),
        weakSetAdd = WeakSet.prototype.add,
        weakMapGet = WeakMap.prototype.get,
        weakMapSet = WeakMap.prototype.set,
        weakMapDelete = WeakMap.prototype["delete"],
        call = Function.prototype.call.bind(Function.prototype.call);
    var hostTarget =
        typeof __nonaWeakRefTarget === "function"
            ? __nonaWeakRefTarget
            : __nonaRegexpVm.weakRefTarget || null;
    var gcCount = typeof __nonaGcCount === "function" ? __nonaGcCount : null;
    delete globalThis.__nonaWeakRefTarget;
    delete globalThis.__nonaGcCount;
    if (!gcCount) hostTarget = null;
    // Absent when the prelude is evaluated by Node.js in source tests.
    var realmVm = Function.prototype.__nonaRealmVmInternal || function () {};
    // Registries with live cells, and the collection count of the last scan.
    var live = [],
        lastCount = -1;
    function append(array, value) {
        defineProperty(array, array.length, {
            value: value,
            writable: true,
            enumerable: true,
            configurable: true,
        });
    }
    function canBeHeldWeakly(value) {
        // Symbols are not accepted yet: weak collections key objects only.
        return (
            value !== null &&
            (typeof value === "object" || typeof value === "function")
        );
    }
    function thisState(receiver, method) {
        var state =
            receiver !== null &&
            (typeof receiver === "object" || typeof receiver === "function")
                ? getState(receiver)
                : undefined;
        if (state === undefined)
            throw new TypeErrorConstructor(
                "FinalizationRegistry.prototype." +
                    method +
                    " called on an incompatible receiver",
            );
        return state;
    }
    // HostEnqueueFinalizationRegistryCleanupJob (9.13): a timer job, so it
    // runs in its own event-loop turn and is reported like a timer callback.
    function schedule(state) {
        var later = __nonaRegexpVm.scheduleUnreferencedTimeout;
        if (state.scheduled || typeof later !== "function") return;
        state.scheduled = true;
        later(function () {
            cleanup(state);
        }, 0);
    }
    // CleanupFinalizationRegistry (9.10.4.1). A throwing callback leaves the
    // remaining cells to a later job.
    function cleanup(state) {
        state.scheduled = false;
        var pending = state.pending;
        try {
            while (state.pendingHead < pending.length) {
                var cell = pending[state.pendingHead++];
                if (cell.done) continue;
                cell.done = true;
                var held = cell.held;
                cell.held = undefined;
                call(state.callback, undefined, held);
            }
        } finally {
            if (state.pendingHead < pending.length) schedule(state);
            else {
                state.pending = [];
                state.pendingHead = 0;
            }
        }
    }
    // Moves the cells whose target the collector has removed to the pending
    // list of their registry.
    function scan() {
        var count = gcCount();
        if (count === lastCount) return;
        lastCount = count;
        var registries = live;
        live = [];
        for (var i = 0; i < registries.length; i++) {
            var state = registries[i],
                cells = state.cells,
                remaining = [];
            for (var j = 0; j < cells.length; j++) {
                var cell = cells[j];
                if (cell.done) continue;
                if (hostTarget(cell.weak) === undefined) {
                    cell.weak = null;
                    append(state.pending, cell);
                } else append(remaining, cell);
            }
            state.cells = remaining;
            if (remaining.length > 0) append(live, state);
            else state.listed = false;
            if (state.pendingHead < state.pending.length) schedule(state);
        }
    }
    // FinalizationRegistry ( cleanupCallback ) (26.2.1.1).
    function FinalizationRegistry(cleanupCallback) {
        if (new.target === undefined)
            throw new TypeErrorConstructor(
                "Constructor FinalizationRegistry requires 'new'",
            );
        if (typeof cleanupCallback !== "function")
            throw new TypeErrorConstructor(
                "FinalizationRegistry: cleanup must be callable",
            );
        var proto = new.target.prototype;
        // Not an object: %FinalizationRegistry.prototype% of new.target's realm.
        if (
            proto === null ||
            (typeof proto !== "object" && typeof proto !== "function")
        ) {
            var vm = realmVm(this);
            proto =
                vm && vm.FinalizationRegistry
                    ? vm.FinalizationRegistry.prototype
                    : FinalizationRegistryPrototype;
        }
        var registry = objectCreate(proto);
        setState(registry, {
            callback: cleanupCallback,
            cells: [],
            tokens: new WeakMapConstructor(),
            pending: [],
            pendingHead: 0,
            listed: false,
            scheduled: false,
        });
        return registry;
    }
    var FinalizationRegistryPrototype = objectCreate(Object.prototype);
    var methods = {
        // FinalizationRegistry.prototype.register ( target, heldValue [ , unregisterToken ] ) (26.2.3.2).
        register(target, heldValue, unregisterToken) {
            var state = thisState(this, "register");
            if (!canBeHeldWeakly(target))
                throw new TypeErrorConstructor(
                    "FinalizationRegistry.prototype.register: invalid target",
                );
            if (target === heldValue)
                throw new TypeErrorConstructor(
                    "FinalizationRegistry.prototype.register: target and holdings must not be same",
                );
            var hasToken = canBeHeldWeakly(unregisterToken);
            if (!hasToken && unregisterToken !== undefined)
                throw new TypeErrorConstructor(
                    "FinalizationRegistry.prototype.register: invalid unregister token",
                );
            var cell = { weak: null, held: heldValue, done: false };
            if (hostTarget) {
                cell.weak = new WeakSetConstructor();
                call(weakSetAdd, cell.weak, target);
                append(state.cells, cell);
                if (!state.listed) {
                    state.listed = true;
                    append(live, state);
                }
            } else cell.target = target;
            if (hasToken) {
                var list = call(weakMapGet, state.tokens, unregisterToken),
                    kept = [];
                // Drop the cells that were cleaned up or unregistered already.
                if (list !== undefined)
                    for (var i = 0; i < list.length; i++)
                        if (!list[i].done) append(kept, list[i]);
                append(kept, cell);
                call(weakMapSet, state.tokens, unregisterToken, kept);
            }
            return undefined;
        },
        // FinalizationRegistry.prototype.unregister ( unregisterToken ) (26.2.3.3).
        unregister(unregisterToken) {
            var state = thisState(this, "unregister");
            if (!canBeHeldWeakly(unregisterToken))
                throw new TypeErrorConstructor(
                    "FinalizationRegistry.prototype.unregister: invalid unregister token",
                );
            var list = call(weakMapGet, state.tokens, unregisterToken),
                removed = false;
            if (list === undefined) return false;
            call(weakMapDelete, state.tokens, unregisterToken);
            for (var i = 0; i < list.length; i++) {
                var cell = list[i];
                if (cell.done) continue;
                cell.done = true;
                cell.held = undefined;
                cell.target = undefined;
                removed = true;
            }
            return removed;
        },
    };
    function method(name, length) {
        var fn = methods[name];
        defineProperty(fn, "name", { value: name, configurable: true });
        defineProperty(fn, "length", { value: length, configurable: true });
        markNative(fn);
        defineProperty(FinalizationRegistryPrototype, name, {
            value: fn,
            writable: true,
            enumerable: false,
            configurable: true,
        });
    }
    defineProperty(FinalizationRegistryPrototype, "constructor", {
        value: FinalizationRegistry,
        writable: true,
        enumerable: false,
        configurable: true,
    });
    method("register", 2);
    method("unregister", 1);
    defineProperty(FinalizationRegistryPrototype, Symbol.toStringTag, {
        value: "FinalizationRegistry",
        writable: false,
        enumerable: false,
        configurable: true,
    });
    defineProperty(FinalizationRegistry, "prototype", {
        value: FinalizationRegistryPrototype,
        writable: false,
        enumerable: false,
        configurable: false,
    });
    defineProperty(FinalizationRegistry, "name", {
        value: "FinalizationRegistry",
        configurable: true,
    });
    defineProperty(FinalizationRegistry, "length", {
        value: 1,
        configurable: true,
    });
    markNative(FinalizationRegistry);
    defineProperty(globalThis, "FinalizationRegistry", {
        value: FinalizationRegistry,
        writable: true,
        enumerable: false,
        configurable: true,
    });
    __nonaRegexpVm.FinalizationRegistry = FinalizationRegistry;
    if (!hostTarget) return drain;
    // Look for collected targets once each checkpoint has finished.
    return function () {
        drain();
        if (live.length > 0) scan();
    };
})(__nonaPromiseDrainJobs);
