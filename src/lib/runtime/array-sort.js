(function () {
    "use strict";
    var defineProperty = Object.defineProperty;
    var markNative = Function.prototype.__nonaMarkNativeInternal;
    var arrayPrototype = Array.prototype;
    var mathFloor = Math.floor,
        mathMin = Math.min,
        mathMax = Math.max;
    function toLength(value) {
        var number = +value;
        if (number !== number || number <= 0) return 0;
        number = mathFloor(number);
        return mathMin(number, 9007199254740991);
    }
    var objectCreate = Object.create;
    // Scratch lists are prototype-less objects: nothing on a prototype chain
    // can intercept their indexed stores, so plain assignment is both correct
    // and the fast indexed path (array-elements.ts).
    function list() {
        return objectCreate(null);
    }
    // Bottom-up merge sorts: stable, O(n log n) comparisons, one scratch list.
    // A pair of runs that is already in order is copied without merging.
    // The code unit order of the default sort is the < order of strings.
    function sortStrings(source, count) {
        var target = list();
        for (var width = 1; width < count; width *= 2) {
            for (var low = 0; low < count; low += 2 * width) {
                var middle = mathMin(low + width, count),
                    high = mathMin(low + 2 * width, count),
                    i = low,
                    j = middle,
                    out = low;
                if (middle < high && !(source[middle] < source[middle - 1])) {
                    while (i < high) target[out++] = source[i++];
                    continue;
                }
                while (i < middle && j < high) {
                    if (source[j] < source[i]) target[out++] = source[j++];
                    else target[out++] = source[i++];
                }
                while (i < middle) target[out++] = source[i++];
                while (j < high) target[out++] = source[j++];
            }
            var swap = source;
            source = target;
            target = swap;
        }
        return source;
    }
    // Default order of other values: ToString once per element, then an index
    // sort on the strings keeps equal keys stable.
    function sortByKeys(items, count) {
        var keys = list(),
            order = list();
        for (var k = 0; k < count; k++) {
            keys[k] = String(items[k]);
            order[k] = k;
        }
        var source = order,
            target = list();
        for (var width = 1; width < count; width *= 2) {
            for (var low = 0; low < count; low += 2 * width) {
                var middle = mathMin(low + width, count),
                    high = mathMin(low + 2 * width, count),
                    i = low,
                    j = middle,
                    out = low;
                if (
                    middle < high &&
                    !(keys[source[middle]] < keys[source[middle - 1]])
                ) {
                    while (i < high) target[out++] = source[i++];
                    continue;
                }
                while (i < middle && j < high) {
                    if (keys[source[j]] < keys[source[i]])
                        target[out++] = source[j++];
                    else target[out++] = source[i++];
                }
                while (i < middle) target[out++] = source[i++];
                while (j < high) target[out++] = source[j++];
            }
            var swap = source;
            source = target;
            target = swap;
        }
        var result = list();
        for (var r = 0; r < count; r++) result[r] = items[source[r]];
        return result;
    }
    // comparefn(b, a) < 0 moves b before a; NaN counts as 0.
    function sortWithComparator(source, count, comparefn) {
        var target = list();
        for (var width = 1; width < count; width *= 2) {
            for (var low = 0; low < count; low += 2 * width) {
                var middle = mathMin(low + width, count),
                    high = mathMin(low + 2 * width, count),
                    i = low,
                    j = middle,
                    out = low;
                while (i < middle && j < high) {
                    if (+comparefn(source[j], source[i]) < 0)
                        target[out++] = source[j++];
                    else target[out++] = source[i++];
                }
                while (i < middle) target[out++] = source[i++];
                while (j < high) target[out++] = source[j++];
            }
            var swap = source;
            source = target;
            target = swap;
        }
        return source;
    }
    var sort = {
        sort(comparefn) {
            if (comparefn !== undefined && typeof comparefn !== "function")
                throw new TypeError(
                    "The comparison function must be either a function or undefined",
                );
            if (this === undefined || this === null)
                throw new TypeError(
                    "Array.prototype.sort called on null or undefined",
                );
            var object = Object(this);
            var length = toLength(object.length);
            var items = list(),
                count = 0;
            for (var k = 0; k < length; k++)
                if (k in object) {
                    items[count] = object[k];
                    count++;
                }
            // Elements that are undefined sort last and are never compared.
            var defined = list(),
                present = 0,
                allStrings = true;
            for (var d = 0; d < count; d++) {
                var element = items[d];
                if (element === undefined) continue;
                if (typeof element !== "string") allStrings = false;
                defined[present++] = element;
            }
            var source;
            if (comparefn !== undefined)
                source = sortWithComparator(defined, present, comparefn);
            else if (allStrings) source = sortStrings(defined, present);
            else source = sortByKeys(defined, present);
            for (var u = present; u < count; u++) source[u] = undefined;
            var index = 0;
            for (; index < count; index++) object[index] = source[index];
            for (; index < length; index++) delete object[index];
            return object;
        },
    }.sort;
    defineProperty(sort, "name", { value: "sort", configurable: true });
    markNative(sort);
    defineProperty(arrayPrototype, "sort", { value: sort });
})();
