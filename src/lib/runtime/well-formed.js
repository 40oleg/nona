(function () {
    "use strict";
    var defineProperty = Object.defineProperty,
        markNative = Function.prototype.__nonaMarkNativeInternal;
    var call = Function.prototype.call.bind(Function.prototype.call);
    var StringConstructor = String,
        TypeErrorConstructor = TypeError,
        fromCharCode = String.fromCharCode;
    var charCodeAt = String.prototype.charCodeAt,
        slice = String.prototype.slice;
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
    function thisString(value, name) {
        if (value === undefined || value === null)
            throw new TypeErrorConstructor(
                "String.prototype." + name + " called on null or undefined",
            );
        if (typeof value === "symbol")
            throw new TypeErrorConstructor(
                "Cannot convert a Symbol value to a string",
            );
        return StringConstructor(value);
    }
    // Index of the first lone surrogate at or after from, or -1.
    function firstLone(string, from) {
        var length = string.length;
        for (var i = from; i < length; i++) {
            var unit = call(charCodeAt, string, i);
            if (unit < 0xd800 || unit > 0xdfff) continue;
            if (unit < 0xdc00 && i + 1 < length) {
                var next = call(charCodeAt, string, i + 1);
                if (next >= 0xdc00 && next <= 0xdfff) {
                    i++;
                    continue;
                }
            }
            return i;
        }
        return -1;
    }
    var proto = String.prototype;
    install(
        proto,
        "isWellFormed",
        0,
        {
            isWellFormed() {
                return firstLone(thisString(this, "isWellFormed"), 0) < 0;
            },
        }.isWellFormed,
    );
    install(
        proto,
        "toWellFormed",
        0,
        {
            toWellFormed() {
                var string = thisString(this, "toWellFormed");
                var lone = firstLone(string, 0);
                if (lone < 0) return string;
                var result = "",
                    start = 0;
                while (lone >= 0) {
                    result +=
                        call(slice, string, start, lone) + fromCharCode(0xfffd);
                    start = lone + 1;
                    lone = firstLone(string, start);
                }
                return result + call(slice, string, start);
            },
        }.toWellFormed,
    );
})();
