// WeakRef (ES2021 26.1), linked only when a source names WeakRef. A WeakRef's
// [[WeakRefTarget]] is the only key of a private WeakSet, which the collector
// never marks and prunes once the key dies; __nonaWeakRefTarget reads it back.
// Cloned realms (Test262) have no host functions: their WeakRefs hold the
// target strongly, which only means it is never collected.
__nonaPromiseDrainJobs = (function (drain) {
    "use strict";
    var defineProperty = Object.defineProperty,
        objectCreate = Object.create,
        markNative = Function.prototype.__nonaMarkNativeInternal;
    var TypeErrorConstructor = TypeError,
        WeakSetConstructor = WeakSet,
        cells = new WeakMap(),
        getCell = WeakMap.prototype.get.bind(cells),
        setCell = WeakMap.prototype.set.bind(cells),
        weakSetAdd = WeakSet.prototype.add,
        call = Function.prototype.call.bind(Function.prototype.call);
    // [[KeptAlive]] (9.10.3): targets of the WeakRefs created or dereferenced
    // by the current job, strongly held until ClearKeptObjects.
    var kept = new Set(),
        keep = Set.prototype.add.bind(kept),
        clearKept = Set.prototype.clear.bind(kept);
    var hostTarget =
        typeof __nonaWeakRefTarget === "function" ? __nonaWeakRefTarget : null;
    delete globalThis.__nonaWeakRefTarget;
    // Absent when the prelude is evaluated by Node.js in source tests.
    var realmVm = Function.prototype.__nonaRealmVmInternal || function () {};
    function canBeHeldWeakly(value) {
        // Symbols are not accepted yet: weak collections key objects only.
        return (
            value !== null &&
            (typeof value === "object" || typeof value === "function")
        );
    }
    // WeakRef ( target ) (26.1.1.1).
    function WeakRef(target) {
        if (new.target === undefined)
            throw new TypeErrorConstructor(
                "Constructor WeakRef requires 'new'",
            );
        if (!canBeHeldWeakly(target))
            throw new TypeErrorConstructor("WeakRef: invalid target");
        var proto = new.target.prototype;
        // Not an object: %WeakRef.prototype% of new.target's realm.
        if (
            proto === null ||
            (typeof proto !== "object" && typeof proto !== "function")
        ) {
            var vm = realmVm(this);
            proto = vm && vm.WeakRef ? vm.WeakRef.prototype : WeakRefPrototype;
        }
        var weakRef = objectCreate(proto),
            cell;
        if (hostTarget) {
            cell = new WeakSetConstructor();
            call(weakSetAdd, cell, target);
        } else cell = { target: target };
        setCell(weakRef, cell);
        keep(target);
        return weakRef;
    }
    var WeakRefPrototype = objectCreate(Object.prototype);
    var deref = {
        // WeakRef.prototype.deref ( ) (26.1.3.2).
        deref() {
            var cell =
                this !== null &&
                (typeof this === "object" || typeof this === "function")
                    ? getCell(this)
                    : undefined;
            if (cell === undefined)
                throw new TypeErrorConstructor(
                    "WeakRef.prototype.deref called on an incompatible receiver",
                );
            var target = hostTarget ? hostTarget(cell) : cell.target;
            if (target !== undefined) keep(target);
            return target;
        },
    }.deref;
    defineProperty(deref, "name", { value: "deref", configurable: true });
    defineProperty(deref, "length", { value: 0, configurable: true });
    markNative(deref);
    defineProperty(WeakRefPrototype, "constructor", {
        value: WeakRef,
        writable: true,
        enumerable: false,
        configurable: true,
    });
    defineProperty(WeakRefPrototype, "deref", {
        value: deref,
        writable: true,
        enumerable: false,
        configurable: true,
    });
    defineProperty(WeakRefPrototype, Symbol.toStringTag, {
        value: "WeakRef",
        writable: false,
        enumerable: false,
        configurable: true,
    });
    defineProperty(WeakRef, "prototype", {
        value: WeakRefPrototype,
        writable: false,
        enumerable: false,
        configurable: false,
    });
    defineProperty(WeakRef, "name", { value: "WeakRef", configurable: true });
    defineProperty(WeakRef, "length", { value: 1, configurable: true });
    markNative(WeakRef);
    defineProperty(globalThis, "WeakRef", {
        value: WeakRef,
        writable: true,
        enumerable: false,
        configurable: true,
    });
    __nonaRegexpVm.WeakRef = WeakRef;
    // ClearKeptObjects (9.10.2) when a job ends: the main script or a timer
    // callback before the microtask checkpoint, and each checkpoint.
    return function () {
        clearKept();
        drain();
        clearKept();
    };
})(__nonaPromiseDrainJobs);
