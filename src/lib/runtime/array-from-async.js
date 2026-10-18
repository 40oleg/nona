(function () {
    "use strict";
    var defineProperty = Object.defineProperty,
        markNative = Function.prototype.__nonaMarkNativeInternal;
    var construct = Reflect.construct,
        asyncIteratorSymbol = Symbol.asyncIterator,
        iteratorSymbol = Symbol.iterator,
        ArrayConstructor = Array,
        ObjectConstructor = Object,
        MathMin = Math.min,
        MathFloor = Math.floor,
        isNaNValue = Number.isNaN;
    function isConstructor(value) {
        if (typeof value !== "function") return false;
        try {
            construct(String, [], value);
            return true;
        } catch (error) {
            return false;
        }
    }
    function getMethod(object, key) {
        var method = object[key];
        if (method === undefined || method === null) return undefined;
        if (typeof method !== "function")
            throw new TypeError("Iterator method must be callable");
        return method;
    }
    function lengthOfArrayLike(object) {
        var length = +object.length;
        if (isNaNValue(length) || length <= 0) return 0;
        return MathMin(MathFloor(length), 9007199254740991);
    }
    function createDataProperty(target, key, value) {
        defineProperty(target, key, {
            value: value,
            writable: true,
            enumerable: true,
            configurable: true,
        });
    }
    // The body of Array.fromAsync: an async function, so every Await of the
    // specification is an await here and errors reject the returned promise.
    async function run(C, asyncItems, mapfn, thisArg) {
        var mapping = mapfn !== undefined;
        if (mapping && typeof mapfn !== "function")
            throw new TypeError("Array.fromAsync: mapper is not a function");
        var asyncMethod = getMethod(asyncItems, asyncIteratorSymbol);
        var syncMethod =
            asyncMethod === undefined
                ? getMethod(asyncItems, iteratorSymbol)
                : undefined;
        var result, k;
        if (asyncMethod !== undefined || syncMethod !== undefined) {
            result = isConstructor(C) ? new C() : [];
            // for-await supplies CreateAsyncFromSyncIterator and closes the
            // iterator when the body throws.
            var source =
                asyncMethod !== undefined
                    ? {
                          [asyncIteratorSymbol]() {
                              return asyncMethod.call(asyncItems);
                          },
                      }
                    : {
                          [iteratorSymbol]() {
                              return syncMethod.call(asyncItems);
                          },
                      };
            k = 0;
            for await (var value of source) {
                if (mapping) value = await mapfn.call(thisArg, value, k);
                createDataProperty(result, k, value);
                k++;
            }
            result.length = k;
            return result;
        }
        var arrayLike = ObjectConstructor(asyncItems);
        var length = lengthOfArrayLike(arrayLike);
        result = isConstructor(C)
            ? new C(length)
            : new ArrayConstructor(length);
        for (k = 0; k < length; k++) {
            var element = await arrayLike[k];
            if (mapping) element = await mapfn.call(thisArg, element, k);
            createDataProperty(result, k, element);
        }
        result.length = length;
        return result;
    }
    var fromAsync = {
        fromAsync(asyncItems) {
            return run(this, asyncItems, arguments[1], arguments[2]);
        },
    }.fromAsync;
    defineProperty(fromAsync, "length", { value: 1, configurable: true });
    markNative(fromAsync);
    defineProperty(Array, "fromAsync", {
        value: fromAsync,
        writable: true,
        configurable: true,
    });
})();
