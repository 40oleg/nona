(function () {
    "use strict";
    var defineProperty = Object.defineProperty,
        getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor,
        getPrototypeOf = Object.getPrototypeOf,
        objectCreate = Object.create,
        setPrototypeOf = Object.setPrototypeOf,
        markNative = Function.prototype.__nonaMarkNativeInternal;
    var call = Function.prototype.call.bind(Function.prototype.call),
        isPrototypeOf = Object.prototype.isPrototypeOf;
    var TypeErrorConstructor = TypeError,
        RangeErrorConstructor = RangeError,
        StringConstructor = String;
    var mathFloor = Math.floor,
        iteratorSymbol = Symbol.iterator,
        toStringTagSymbol = Symbol.toStringTag;
    // Internal slots of Iterator Helper and wrapper objects (#322).
    var slots = new WeakMap();
    var getSlot = WeakMap.prototype.get.bind(slots),
        setSlot = WeakMap.prototype.set.bind(slots);
    // %IteratorPrototype%, which generator, array, string, Map and Set
    // iterators already inherit from.
    var IteratorPrototype = getPrototypeOf(
        getPrototypeOf([][iteratorSymbol]()),
    );
    // Marks the end of the underlying iterator in the algorithms below.
    var DONE = {};
    var START = 0,
        YIELD = 1,
        RUNNING = 2,
        COMPLETED = 3;
    function install(object, name, length, fn) {
        defineProperty(fn, "name", { value: name, configurable: true });
        defineProperty(fn, "length", { value: length, configurable: true });
        markNative(fn);
        defineProperty(object, name, {
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
    function result(value, done) {
        return { value: value, done: done };
    }
    function requireObject(value, name) {
        if (!isObject(value))
            throw new TypeErrorConstructor(
                "Iterator.prototype." + name + " called on non-object",
            );
    }
    // GetIteratorDirect ( obj ): next is read exactly once.
    function getIteratorDirect(obj) {
        return { iterator: obj, next: obj.next, done: false };
    }
    // GetIteratorFlattenable ( obj, primitiveHandling ).
    function getIteratorFlattenable(obj, iterateStrings) {
        if (!isObject(obj) && !(iterateStrings && typeof obj === "string"))
            throw new TypeErrorConstructor(
                typeof obj === "string"
                    ? "Iterator.prototype.flatMap does not flatten strings"
                    : StringConstructor(obj) + " is not an object",
            );
        var method = obj[iteratorSymbol];
        var iterator;
        if (method === undefined || method === null) iterator = obj;
        else {
            if (typeof method !== "function")
                throw new TypeErrorConstructor(
                    "Symbol.iterator is not a function",
                );
            iterator = call(method, obj);
        }
        if (!isObject(iterator))
            throw new TypeErrorConstructor(
                "Result of the iterator is not an object",
            );
        return getIteratorDirect(iterator);
    }
    // IteratorStep ( iteratorRecord ): the result object, or DONE.
    function iteratorStep(record) {
        var next;
        try {
            next = call(record.next, record.iterator);
        } catch (error) {
            record.done = true;
            throw error;
        }
        if (!isObject(next)) {
            record.done = true;
            throw new TypeErrorConstructor(
                "Iterator result " +
                    StringConstructor(next) +
                    " is not an object",
            );
        }
        var done;
        try {
            done = !!next.done;
        } catch (error) {
            record.done = true;
            throw error;
        }
        if (done) {
            record.done = true;
            return DONE;
        }
        return next;
    }
    // IteratorStepValue ( iteratorRecord ): the value, or DONE.
    function iteratorStepValue(record) {
        var next = iteratorStep(record);
        if (next === DONE) return DONE;
        try {
            return next.value;
        } catch (error) {
            record.done = true;
            throw error;
        }
    }
    // IteratorClose ( iterator, completion ) for a normal or return completion.
    function closeIterator(iterator) {
        var method = iterator["return"];
        if (method === undefined || method === null) return;
        if (typeof method !== "function")
            throw new TypeErrorConstructor("return is not a function");
        var inner = call(method, iterator);
        if (!isObject(inner))
            throw new TypeErrorConstructor(
                "Iterator result " +
                    StringConstructor(inner) +
                    " is not an object",
            );
    }
    // IteratorClose ( iterator, completion ) for a throw completion: errors of
    // the return method are ignored and the original error is rethrown.
    function closeIteratorWithError(iterator, error) {
        try {
            var method = iterator["return"];
            if (method !== undefined && method !== null) call(method, iterator);
        } catch (ignored) {}
        throw error;
    }
    function requireCallable(O, fn, name) {
        if (typeof fn !== "function")
            closeIteratorWithError(
                O,
                new TypeErrorConstructor(
                    "Iterator.prototype." +
                        name +
                        ": " +
                        typeof fn +
                        " is not a function",
                ),
            );
    }
    // The limit of take and drop: ToNumber, NaN check, finite limit above
    // 2**53 - 1, ToIntegerOrInfinity, negative check, closing O on every failure.
    function toLimit(O, limit, name) {
        var number;
        try {
            number = +limit;
        } catch (error) {
            closeIteratorWithError(O, error);
        }
        if (number !== number)
            closeIteratorWithError(
                O,
                new RangeErrorConstructor(
                    "Iterator.prototype." + name + ": limit is NaN",
                ),
            );
        if (number !== 1 / 0 && number > 9007199254740991)
            closeIteratorWithError(
                O,
                new RangeErrorConstructor(
                    "Iterator.prototype." + name + ": limit is too large",
                ),
            );
        var integer =
            number === 1 / 0 || number === -1 / 0
                ? number
                : number < 0
                  ? -mathFloor(-number)
                  : mathFloor(number);
        if (integer < 0)
            closeIteratorWithError(
                O,
                new RangeErrorConstructor(
                    "Iterator.prototype." + name + ": limit is negative",
                ),
            );
        return integer === 0 ? 0 : integer;
    }

    // Absent when the prelude is evaluated by Node.js in source tests.
    var realmVm = Function.prototype.__nonaRealmVmInternal || function () {};
    // Iterator ( ) (ES2025 27.1.3.1): an abstract base for subclasses.
    function Iterator() {
        if (new.target === undefined || new.target === Iterator)
            throw new TypeErrorConstructor(
                "Abstract class Iterator not directly constructable",
            );
        // new.target.prototype was not an object: %Iterator.prototype% of
        // new.target's realm (GetPrototypeFromConstructor).
        var vm = realmVm(this);
        if (vm && vm.Iterator) setPrototypeOf(this, vm.Iterator.prototype);
    }
    defineProperty(Iterator, "prototype", {
        value: IteratorPrototype,
        writable: false,
        enumerable: false,
        configurable: false,
    });
    install(globalThis, "Iterator", 0, Iterator);
    __nonaRegexpVm.Iterator = Iterator;

    // %WrapForValidIteratorPrototype% (27.1.3.2.1.1).
    var WrapForValidIteratorPrototype = objectCreate(IteratorPrototype);
    function wrapped(O, name) {
        var slot = isObject(O) ? getSlot(O) : undefined;
        if (slot === undefined || slot.helper)
            throw new TypeErrorConstructor(
                "%WrapForValidIteratorPrototype%." +
                    name +
                    " called on an incompatible receiver",
            );
        return slot.record;
    }
    install(
        WrapForValidIteratorPrototype,
        "next",
        0,
        {
            next() {
                var record = wrapped(this, "next");
                return call(record.next, record.iterator);
            },
        }.next,
    );
    install(
        WrapForValidIteratorPrototype,
        "return",
        0,
        {
            return() {
                var iterator = wrapped(this, "return").iterator;
                var method = iterator["return"];
                if (method === undefined || method === null)
                    return result(undefined, true);
                if (typeof method !== "function")
                    throw new TypeErrorConstructor("return is not a function");
                return call(method, iterator);
            },
        }.return,
    );

    // Iterator.from ( O ) (27.1.3.2.1).
    install(
        Iterator,
        "from",
        1,
        {
            from(O) {
                var record = getIteratorFlattenable(O, true);
                if (call(isPrototypeOf, IteratorPrototype, record.iterator))
                    return record.iterator;
                var wrapper = objectCreate(WrapForValidIteratorPrototype);
                setSlot(wrapper, { helper: false, record: record });
                return wrapper;
            },
        }.from,
    );

    // %IteratorHelperPrototype% (27.1.2.1): a hand-written state machine in
    // place of the spec's abstract closure. step runs the closure up to its
    // next Yield and returns the yielded value, or DONE when it returns.
    var IteratorHelperPrototype = objectCreate(IteratorPrototype);
    function createHelper(record, step) {
        var helper = objectCreate(IteratorHelperPrototype);
        setSlot(helper, {
            helper: true,
            record: record,
            step: step,
            state: START,
            counter: 0,
            remaining: 0,
            inner: null,
        });
        return helper;
    }
    function helperSlot(O, name) {
        var slot = isObject(O) ? getSlot(O) : undefined;
        if (slot === undefined || !slot.helper)
            throw new TypeErrorConstructor(
                "Iterator Helper." +
                    name +
                    " called on an incompatible receiver",
            );
        if (slot.state === RUNNING)
            throw new TypeErrorConstructor("Generator is already running");
        return slot;
    }
    install(
        IteratorHelperPrototype,
        "next",
        0,
        {
            next() {
                var slot = helperSlot(this, "next");
                if (slot.state === COMPLETED) return result(undefined, true);
                slot.state = RUNNING;
                var value;
                try {
                    value = slot.step(slot);
                } catch (error) {
                    slot.state = COMPLETED;
                    throw error;
                }
                if (value === DONE) {
                    slot.state = COMPLETED;
                    return result(undefined, true);
                }
                slot.state = YIELD;
                return result(value, false);
            },
        }.next,
    );
    install(
        IteratorHelperPrototype,
        "return",
        0,
        {
            return() {
                var slot = helperSlot(this, "return");
                var iterator = slot.record.iterator;
                if (slot.state === START) {
                    slot.state = COMPLETED;
                    closeIterator(iterator);
                    return result(undefined, true);
                }
                if (slot.state === COMPLETED) return result(undefined, true);
                // Resume the closure with a return completion at its Yield.
                slot.state = RUNNING;
                try {
                    var inner = slot.inner;
                    if (inner !== null) {
                        slot.inner = null;
                        try {
                            closeIterator(inner.iterator);
                        } catch (error) {
                            closeIteratorWithError(iterator, error);
                        }
                    }
                    closeIterator(iterator);
                } finally {
                    slot.state = COMPLETED;
                }
                return result(undefined, true);
            },
        }.return,
    );
    defineProperty(IteratorHelperPrototype, toStringTagSymbol, {
        value: "Iterator Helper",
        writable: false,
        enumerable: false,
        configurable: true,
    });

    // The lazy methods of %Iterator.prototype% (27.1.4).
    function mapStep(mapper) {
        return function (slot) {
            var record = slot.record;
            var value = iteratorStepValue(record);
            if (value === DONE) return DONE;
            var mapped;
            try {
                mapped = mapper(value, slot.counter);
            } catch (error) {
                closeIteratorWithError(record.iterator, error);
            }
            slot.counter++;
            return mapped;
        };
    }
    function filterStep(predicate) {
        return function (slot) {
            var record = slot.record;
            for (;;) {
                var value = iteratorStepValue(record);
                if (value === DONE) return DONE;
                var selected;
                try {
                    selected = predicate(value, slot.counter);
                } catch (error) {
                    closeIteratorWithError(record.iterator, error);
                }
                slot.counter++;
                if (selected) return value;
            }
        };
    }
    function takeStep(slot) {
        var record = slot.record;
        if (slot.remaining === 0) {
            closeIterator(record.iterator);
            return DONE;
        }
        if (slot.remaining !== 1 / 0) slot.remaining--;
        return iteratorStepValue(record);
    }
    function dropStep(slot) {
        var record = slot.record;
        while (slot.remaining > 0) {
            if (slot.remaining !== 1 / 0) slot.remaining--;
            if (iteratorStep(record) === DONE) return DONE;
        }
        return iteratorStepValue(record);
    }
    function flatMapStep(mapper) {
        return function (slot) {
            var record = slot.record;
            for (;;) {
                var inner = slot.inner;
                if (inner !== null) {
                    var innerValue;
                    try {
                        innerValue = iteratorStepValue(inner);
                    } catch (error) {
                        slot.inner = null;
                        closeIteratorWithError(record.iterator, error);
                    }
                    if (innerValue !== DONE) return innerValue;
                    slot.inner = null;
                }
                var value = iteratorStepValue(record);
                if (value === DONE) return DONE;
                try {
                    slot.inner = getIteratorFlattenable(
                        mapper(value, slot.counter),
                        false,
                    );
                } catch (error) {
                    closeIteratorWithError(record.iterator, error);
                }
                slot.counter++;
            }
        };
    }
    // Calls fn with undefined as this, the way the spec calls callbacks.
    function callback(fn) {
        return function (value, counter) {
            return call(fn, undefined, value, counter);
        };
    }
    install(
        IteratorPrototype,
        "map",
        1,
        {
            map(mapper) {
                requireObject(this, "map");
                requireCallable(this, mapper, "map");
                return createHelper(
                    getIteratorDirect(this),
                    mapStep(callback(mapper)),
                );
            },
        }.map,
    );
    install(
        IteratorPrototype,
        "filter",
        1,
        {
            filter(predicate) {
                requireObject(this, "filter");
                requireCallable(this, predicate, "filter");
                return createHelper(
                    getIteratorDirect(this),
                    filterStep(callback(predicate)),
                );
            },
        }.filter,
    );
    install(
        IteratorPrototype,
        "take",
        1,
        {
            take(limit) {
                requireObject(this, "take");
                var remaining = toLimit(this, limit, "take");
                var helper = createHelper(getIteratorDirect(this), takeStep);
                getSlot(helper).remaining = remaining;
                return helper;
            },
        }.take,
    );
    install(
        IteratorPrototype,
        "drop",
        1,
        {
            drop(limit) {
                requireObject(this, "drop");
                var remaining = toLimit(this, limit, "drop");
                var helper = createHelper(getIteratorDirect(this), dropStep);
                getSlot(helper).remaining = remaining;
                return helper;
            },
        }.drop,
    );
    install(
        IteratorPrototype,
        "flatMap",
        1,
        {
            flatMap(mapper) {
                requireObject(this, "flatMap");
                requireCallable(this, mapper, "flatMap");
                return createHelper(
                    getIteratorDirect(this),
                    flatMapStep(callback(mapper)),
                );
            },
        }.flatMap,
    );

    // The eager methods of %Iterator.prototype% (27.1.4).
    install(
        IteratorPrototype,
        "reduce",
        1,
        {
            reduce(reducer) {
                requireObject(this, "reduce");
                requireCallable(this, reducer, "reduce");
                var record = getIteratorDirect(this);
                var accumulator, counter;
                if (arguments.length < 2) {
                    accumulator = iteratorStepValue(record);
                    if (accumulator === DONE)
                        throw new TypeErrorConstructor(
                            "Reduce of empty iterator with no initial value",
                        );
                    counter = 1;
                } else {
                    accumulator = arguments[1];
                    counter = 0;
                }
                for (;;) {
                    var value = iteratorStepValue(record);
                    if (value === DONE) return accumulator;
                    try {
                        accumulator = call(
                            reducer,
                            undefined,
                            accumulator,
                            value,
                            counter,
                        );
                    } catch (error) {
                        closeIteratorWithError(record.iterator, error);
                    }
                    counter++;
                }
            },
        }.reduce,
    );
    install(
        IteratorPrototype,
        "toArray",
        0,
        {
            toArray() {
                requireObject(this, "toArray");
                var record = getIteratorDirect(this);
                var items = [];
                for (var index = 0; ; index++) {
                    var value = iteratorStepValue(record);
                    if (value === DONE) return items;
                    defineProperty(items, index, {
                        value: value,
                        writable: true,
                        enumerable: true,
                        configurable: true,
                    });
                }
            },
        }.toArray,
    );
    // forEach, some, every and find: test maps each callback result to
    // DONE (keep going) or to the method's result after closing the iterator.
    function consume(O, fn, name, test, last) {
        requireObject(O, name);
        requireCallable(O, fn, name);
        var record = getIteratorDirect(O);
        for (var counter = 0; ; counter++) {
            var value = iteratorStepValue(record);
            if (value === DONE) return last;
            var outcome;
            try {
                outcome = test(call(fn, undefined, value, counter), value);
            } catch (error) {
                closeIteratorWithError(record.iterator, error);
            }
            if (outcome !== DONE) {
                closeIterator(record.iterator);
                return outcome;
            }
        }
    }
    function keepGoing() {
        return DONE;
    }
    function someTest(selected) {
        return selected ? true : DONE;
    }
    function everyTest(selected) {
        return selected ? DONE : false;
    }
    function findTest(selected, value) {
        return selected ? value : DONE;
    }
    install(
        IteratorPrototype,
        "forEach",
        1,
        {
            forEach(fn) {
                consume(this, fn, "forEach", keepGoing, undefined);
            },
        }.forEach,
    );
    install(
        IteratorPrototype,
        "some",
        1,
        {
            some(predicate) {
                return consume(this, predicate, "some", someTest, false);
            },
        }.some,
    );
    install(
        IteratorPrototype,
        "every",
        1,
        {
            every(predicate) {
                return consume(this, predicate, "every", everyTest, true);
            },
        }.every,
    );
    install(
        IteratorPrototype,
        "find",
        1,
        {
            find(predicate) {
                return consume(this, predicate, "find", findTest, undefined);
            },
        }.find,
    );

    // %Iterator.prototype%.constructor and [Symbol.toStringTag] are accessors
    // whose setters ignore %Iterator.prototype% itself
    // (SetterThatIgnoresPrototypeProperties, 27.1.4.1 and 27.1.4.14).
    function setterIgnoringPrototype(thisValue, key, value) {
        if (!isObject(thisValue))
            throw new TypeErrorConstructor(
                "Iterator.prototype setter called on non-object",
            );
        if (thisValue === IteratorPrototype)
            throw new TypeErrorConstructor(
                "Cannot assign to read only property of Iterator.prototype",
            );
        if (getOwnPropertyDescriptor(thisValue, key) === undefined)
            defineProperty(thisValue, key, {
                value: value,
                writable: true,
                enumerable: true,
                configurable: true,
            });
        else thisValue[key] = value;
    }
    function installAccessor(key, accessors) {
        var descriptor = getOwnPropertyDescriptor(accessors, key);
        markNative(descriptor.get);
        markNative(descriptor.set);
        defineProperty(IteratorPrototype, key, {
            get: descriptor.get,
            set: descriptor.set,
            enumerable: false,
            configurable: true,
        });
    }
    installAccessor(toStringTagSymbol, {
        get [toStringTagSymbol]() {
            return "Iterator";
        },
        set [toStringTagSymbol](value) {
            setterIgnoringPrototype(this, toStringTagSymbol, value);
        },
    });
    installAccessor("constructor", {
        get constructor() {
            return Iterator;
        },
        set constructor(value) {
            setterIgnoringPrototype(this, "constructor", value);
        },
    });
})();
