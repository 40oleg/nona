// structuredClone (HTML structured serialize/deserialize within one thread),
// linked only when a source names structuredClone. Class instances clone as
// plain objects; Proxy objects cannot be told apart from their targets.
(function () {
    "use strict";
    var call = Function.prototype.call.bind(Function.prototype.call),
        TypeErrorConstructor = TypeError,
        MapConstructor = Map,
        SetConstructor = Set,
        ObjectKeys = Object.keys,
        defineProperty = Object.defineProperty,
        getPrototypeOf = Object.getPrototypeOf,
        getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor,
        hasOwn = Object.prototype.hasOwnProperty,
        objectToString = Object.prototype.toString,
        isArray = Array.isArray,
        mapSet = Map.prototype.set,
        mapForEach = Map.prototype.forEach,
        setAdd = Set.prototype.add,
        setForEach = Set.prototype.forEach,
        dateGetTime = Date.prototype.getTime,
        mapSize = getOwnPropertyDescriptor(Map.prototype, "size").get,
        setSize = getOwnPropertyDescriptor(Set.prototype, "size").get,
        regexpSource = getOwnPropertyDescriptor(RegExp.prototype, "source").get,
        regexpFlags = getOwnPropertyDescriptor(RegExp.prototype, "flags").get,
        bufferLength = getOwnPropertyDescriptor(
            ArrayBuffer.prototype,
            "byteLength",
        ).get,
        bufferDetached = getOwnPropertyDescriptor(
            ArrayBuffer.prototype,
            "detached",
        ),
        bufferSlice = ArrayBuffer.prototype.slice,
        bufferTransfer = ArrayBuffer.prototype.transfer,
        viewBuffer = getOwnPropertyDescriptor(DataView.prototype, "buffer").get,
        viewOffset = getOwnPropertyDescriptor(
            DataView.prototype,
            "byteOffset",
        ).get,
        viewLength = getOwnPropertyDescriptor(
            DataView.prototype,
            "byteLength",
        ).get,
        TypedArray = getPrototypeOf(Int8Array),
        typedTag = getOwnPropertyDescriptor(
            TypedArray.prototype,
            Symbol.toStringTag,
        ).get,
        typedBuffer = getOwnPropertyDescriptor(
            TypedArray.prototype,
            "buffer",
        ).get,
        typedOffset = getOwnPropertyDescriptor(
            TypedArray.prototype,
            "byteOffset",
        ).get,
        typedLength = getOwnPropertyDescriptor(
            TypedArray.prototype,
            "length",
        ).get,
        booleanValue = Boolean.prototype.valueOf,
        numberValue = Number.prototype.valueOf,
        stringValue = String.prototype.valueOf,
        bigintValue = BigInt.prototype.valueOf,
        symbolValue = Symbol.prototype.valueOf,
        DOMExceptionConstructor = globalThis.DOMException;
    var typedConstructors = {};
    [
        "Int8Array",
        "Uint8Array",
        "Uint8ClampedArray",
        "Int16Array",
        "Uint16Array",
        "Int32Array",
        "Uint32Array",
        "Float16Array",
        "Float32Array",
        "Float64Array",
        "BigInt64Array",
        "BigUint64Array",
    ].forEach(function (name) {
        if (typeof globalThis[name] === "function")
            typedConstructors[name] = globalThis[name];
    });
    var errorConstructors = {
        Error: Error,
        EvalError: EvalError,
        RangeError: RangeError,
        ReferenceError: ReferenceError,
        SyntaxError: SyntaxError,
        TypeError: TypeError,
        URIError: URIError,
    };
    function fail(message) {
        throw new DOMExceptionConstructor(message, "DataCloneError");
    }
    // Whether the internal-slot accessor accepts the value.
    function brand(accessor, value) {
        try {
            call(accessor, value);
            return true;
        } catch (e) {
            return false;
        }
    }
    function isDetached(buffer) {
        return bufferDetached ? call(bufferDetached.get, buffer) : false;
    }
    function copyProperties(source, target, state) {
        var keys = ObjectKeys(source);
        for (var i = 0; i < keys.length; i++)
            defineProperty(target, keys[i], {
                value: clone(source[keys[i]], state),
                writable: true,
                enumerable: true,
                configurable: true,
            });
    }
    function copyData(source, target, key, state, convert) {
        var descriptor = getOwnPropertyDescriptor(source, key);
        if (descriptor && hasOwn.call(descriptor, "value"))
            defineProperty(target, key, {
                value: convert(descriptor.value, state),
                writable: true,
                configurable: true,
            });
    }
    function cloneError(value, state) {
        var name = value.name;
        var Constructor = hasOwn.call(errorConstructors, name)
            ? errorConstructors[name]
            : Error;
        var result = new Constructor();
        state.memo.set(value, result);
        copyData(value, result, "message", state, function (v) {
            return String(v);
        });
        copyData(value, result, "stack", state, function (v) {
            return typeof v === "string" ? v : undefined;
        });
        copyData(value, result, "cause", state, clone);
        return result;
    }
    function clone(value, state) {
        var type = typeof value;
        if (type === "symbol" || type === "function")
            fail(
                (type === "symbol" ? "Symbol" : "Function") +
                    " could not be cloned.",
            );
        if (type !== "object" || value === null) return value;
        var memo = state.memo;
        if (memo.has(value)) return memo.get(value);
        var result, i;
        if (isArray(value)) {
            result = new Array(value.length);
            memo.set(value, result);
            copyProperties(value, result, state);
            return result;
        }
        if (brand(dateGetTime, value)) {
            result = new Date(call(dateGetTime, value));
            memo.set(value, result);
            return result;
        }
        if (brand(regexpSource, value) && brand(regexpFlags, value)) {
            result = new RegExp(
                call(regexpSource, value),
                call(regexpFlags, value),
            );
            memo.set(value, result);
            return result;
        }
        if (brand(mapSize, value)) {
            result = new MapConstructor();
            memo.set(value, result);
            // Snapshot first: cloning a key or value may run getters.
            var entries = [];
            call(mapForEach, value, function (v, k) {
                entries.push(k, v);
            });
            for (i = 0; i < entries.length; i += 2)
                call(
                    mapSet,
                    result,
                    clone(entries[i], state),
                    clone(entries[i + 1], state),
                );
            return result;
        }
        if (brand(setSize, value)) {
            result = new SetConstructor();
            memo.set(value, result);
            var items = [];
            call(setForEach, value, function (v) {
                items.push(v);
            });
            for (i = 0; i < items.length; i++)
                call(setAdd, result, clone(items[i], state));
            return result;
        }
        if (brand(bufferLength, value)) {
            if (isDetached(value))
                fail("An ArrayBuffer is detached and could not be cloned.");
            result = call(bufferSlice, value, 0);
            memo.set(value, result);
            return result;
        }
        if (brand(typedTag, value) && call(typedTag, value) !== undefined) {
            var buffer = clone(call(typedBuffer, value), state);
            result = new typedConstructors[call(typedTag, value)](
                buffer,
                call(typedOffset, value),
                call(typedLength, value),
            );
            memo.set(value, result);
            return result;
        }
        if (brand(viewLength, value)) {
            result = new DataView(
                clone(call(viewBuffer, value), state),
                call(viewOffset, value),
                call(viewLength, value),
            );
            memo.set(value, result);
            return result;
        }
        var tag = objectToString.call(value);
        if (tag === "[object Error]") return cloneError(value, state);
        var boxes = [booleanValue, numberValue, stringValue, bigintValue];
        for (i = 0; i < boxes.length; i++)
            if (brand(boxes[i], value)) {
                result = Object(call(boxes[i], value));
                memo.set(value, result);
                return result;
            }
        if (
            brand(symbolValue, value) ||
            tag === "[object WeakMap]" ||
            tag === "[object WeakSet]" ||
            tag === "[object WeakRef]" ||
            tag === "[object FinalizationRegistry]" ||
            tag === "[object Promise]" ||
            tag === "[object Generator]" ||
            tag === "[object AsyncGenerator]"
        )
            fail(tag + " could not be cloned.");
        if (tag === "[object SharedArrayBuffer]") return value;
        result = {};
        memo.set(value, result);
        copyProperties(value, result, state);
        return result;
    }
    function structuredClone(value) {
        if (arguments.length === 0)
            throw new TypeErrorConstructor(
                'The "value" argument must be specified',
            );
        var options = arguments[1];
        if (
            options !== undefined &&
            options !== null &&
            typeof options !== "object" &&
            typeof options !== "function"
        )
            throw new TypeErrorConstructor(
                'The "options" argument must be of type object.',
            );
        var state = { memo: new MapConstructor() };
        var transfer = [];
        var list = options == null ? undefined : options.transfer;
        if (list !== undefined) {
            for (var item of list) {
                if (
                    typeof item !== "object" ||
                    item === null ||
                    !brand(bufferLength, item)
                )
                    fail("Value not transferable");
                if (transfer.indexOf(item) >= 0 || isDetached(item))
                    fail("Transfer list contains duplicate or detached buffer");
                transfer.push(item);
            }
        }
        var result = clone(value, state);
        // Transferring detaches the sources once the whole value was cloned.
        for (var i = 0; i < transfer.length; i++)
            call(bufferTransfer, transfer[i]);
        return result;
    }
    defineProperty(globalThis, "structuredClone", {
        value: structuredClone,
        writable: true,
        configurable: true,
    });
})();
