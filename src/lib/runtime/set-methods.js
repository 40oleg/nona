(function () {
    "use strict";
    var defineProperty = Object.defineProperty,
        getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor,
        getPrototypeOf = Object.getPrototypeOf,
        markNative = Function.prototype.__nonaMarkNativeInternal;
    var call = Function.prototype.call.bind(Function.prototype.call);
    var SetConstructor = Set,
        SetPrototype = Set.prototype,
        StringConstructor = String,
        TypeErrorConstructor = TypeError,
        RangeErrorConstructor = RangeError;
    var setHas = SetPrototype.has,
        setAdd = SetPrototype.add,
        setDelete = SetPrototype["delete"],
        setValues = SetPrototype.values,
        setSize = getOwnPropertyDescriptor(SetPrototype, "size").get,
        setIteratorNext = getPrototypeOf(
            call(setValues, new SetConstructor()),
        ).next;
    var mathFloor = Math.floor;
    function install(name, fn) {
        defineProperty(fn, "name", { value: name, configurable: true });
        defineProperty(fn, "length", { value: 1, configurable: true });
        markNative(fn);
        defineProperty(SetPrototype, name, {
            value: fn,
            writable: true,
            enumerable: false,
            configurable: true,
        });
    }
    function isObject(value) {
        return (
            value !== null &&
            (typeof value === "object" || typeof value === "function")
        );
    }
    // RequireInternalSlot(O, [[SetData]]): the size getter throws a TypeError
    // for any receiver that is not a Set. Returns SetDataSize(O.[[SetData]]).
    function thisSize(set) {
        return call(setSize, set);
    }
    // GetSetRecord ( obj ) (ES2025 24.2.1.2).
    function getSetRecord(obj) {
        if (!isObject(obj))
            throw new TypeErrorConstructor(
                "The argument must be a set-like object",
            );
        var rawSize = obj.size;
        var numSize = +rawSize;
        if (numSize !== numSize)
            throw new TypeErrorConstructor(
                "The 'size' property of a set-like object must be a number",
            );
        var intSize =
            numSize === 1 / 0 || numSize === -1 / 0
                ? numSize
                : numSize < 0
                  ? -mathFloor(-numSize)
                  : mathFloor(numSize);
        if (intSize < 0)
            throw new RangeErrorConstructor(
                "The 'size' property of a set-like object must not be negative",
            );
        var has = obj.has;
        if (typeof has !== "function")
            throw new TypeErrorConstructor(
                "The 'has' property of a set-like object must be a function",
            );
        var keys = obj.keys;
        if (typeof keys !== "function")
            throw new TypeErrorConstructor(
                "The 'keys' property of a set-like object must be a function",
            );
        return { set: obj, size: intSize, has: has, keys: keys };
    }
    function otherHas(record, value) {
        return !!call(record.has, record.set, value);
    }
    // GetIteratorFromMethod ( obj, keys ) over the keys of a set record.
    function keysIterator(record) {
        var iterator = call(record.keys, record.set);
        if (!isObject(iterator))
            throw new TypeErrorConstructor(
                "The 'keys' method of a set-like object must return an object",
            );
        var next = iterator.next;
        if (typeof next !== "function")
            throw new TypeErrorConstructor(
                "The iterator of a set-like object has no 'next' method",
            );
        return { iterator: iterator, next: next };
    }
    var done = {};
    // IteratorStepValue ( iteratorRecord ), with CanonicalizeKeyedCollectionKey.
    function stepValue(record) {
        var result = call(record.next, record.iterator);
        if (!isObject(result))
            throw new TypeErrorConstructor(
                "Iterator result " +
                    StringConstructor(result) +
                    " is not an object",
            );
        if (result.done) return done;
        var value = result.value;
        return value === 0 ? 0 : value;
    }
    // IteratorClose ( iteratorRecord, NormalCompletion(...) ).
    function closeIterator(record) {
        var returnMethod = record.iterator["return"];
        if (returnMethod === undefined || returnMethod === null) return;
        if (typeof returnMethod !== "function")
            throw new TypeErrorConstructor(
                "The iterator's 'return' method is not a function",
            );
        if (!isObject(call(returnMethod, record.iterator)))
            throw new TypeErrorConstructor(
                "The iterator's 'return' method returned a non-object",
            );
    }
    // Iterates O.[[SetData]] live: elements appended during the walk are
    // visited, deleted ones skipped, as the spec's index-based loops do.
    function setIterator(set) {
        return call(setValues, set);
    }
    function copySet(set) {
        var result = new SetConstructor(),
            iterator = setIterator(set),
            step;
        while (!(step = call(setIteratorNext, iterator)).done)
            call(setAdd, result, step.value);
        return result;
    }
    install(
        "union",
        {
            union(other) {
                thisSize(this);
                var record = getSetRecord(other);
                var keys = keysIterator(record);
                var result = copySet(this),
                    next;
                while ((next = stepValue(keys)) !== done)
                    call(setAdd, result, next);
                return result;
            },
        }.union,
    );
    install(
        "intersection",
        {
            intersection(other) {
                thisSize(this);
                var record = getSetRecord(other);
                var result = new SetConstructor(),
                    next;
                if (thisSize(this) <= record.size) {
                    var iterator = setIterator(this),
                        step;
                    while (!(step = call(setIteratorNext, iterator)).done) {
                        next = step.value;
                        if (otherHas(record, next)) call(setAdd, result, next);
                    }
                } else {
                    var keys = keysIterator(record);
                    while ((next = stepValue(keys)) !== done)
                        if (call(setHas, this, next))
                            call(setAdd, result, next);
                }
                return result;
            },
        }.intersection,
    );
    install(
        "difference",
        {
            difference(other) {
                thisSize(this);
                var record = getSetRecord(other);
                var result = copySet(this),
                    next;
                if (thisSize(this) <= record.size) {
                    // Walks the copy, which only this loop changes.
                    var iterator = setIterator(result),
                        step;
                    while (!(step = call(setIteratorNext, iterator)).done) {
                        next = step.value;
                        if (otherHas(record, next))
                            call(setDelete, result, next);
                    }
                } else {
                    var keys = keysIterator(record);
                    while ((next = stepValue(keys)) !== done)
                        call(setDelete, result, next);
                }
                return result;
            },
        }.difference,
    );
    install(
        "symmetricDifference",
        {
            symmetricDifference(other) {
                thisSize(this);
                var record = getSetRecord(other);
                var keys = keysIterator(record);
                var result = copySet(this),
                    next;
                while ((next = stepValue(keys)) !== done) {
                    if (call(setHas, this, next)) call(setDelete, result, next);
                    else call(setAdd, result, next);
                }
                return result;
            },
        }.symmetricDifference,
    );
    install(
        "isSubsetOf",
        {
            isSubsetOf(other) {
                thisSize(this);
                var record = getSetRecord(other);
                if (thisSize(this) > record.size) return false;
                var iterator = setIterator(this),
                    step;
                while (!(step = call(setIteratorNext, iterator)).done)
                    if (!otherHas(record, step.value)) return false;
                return true;
            },
        }.isSubsetOf,
    );
    install(
        "isSupersetOf",
        {
            isSupersetOf(other) {
                thisSize(this);
                var record = getSetRecord(other);
                if (thisSize(this) < record.size) return false;
                var keys = keysIterator(record),
                    next;
                while ((next = stepValue(keys)) !== done)
                    if (!call(setHas, this, next)) {
                        closeIterator(keys);
                        return false;
                    }
                return true;
            },
        }.isSupersetOf,
    );
    install(
        "isDisjointFrom",
        {
            isDisjointFrom(other) {
                thisSize(this);
                var record = getSetRecord(other);
                if (thisSize(this) <= record.size) {
                    var iterator = setIterator(this),
                        step;
                    while (!(step = call(setIteratorNext, iterator)).done)
                        if (otherHas(record, step.value)) return false;
                } else {
                    var keys = keysIterator(record),
                        next;
                    while ((next = stepValue(keys)) !== done)
                        if (call(setHas, this, next)) {
                            closeIterator(keys);
                            return false;
                        }
                }
                return true;
            },
        }.isDisjointFrom,
    );
})();
