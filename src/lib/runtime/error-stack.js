(function () {
    "use strict";
    var defineProperty = Object.defineProperty;
    var markNative = Function.prototype.__nonaMarkNativeInternal;
    var errorToString = Error.prototype.toString;
    // Nona does not walk the stack: a captured trace is this many frames of an
    // unknown location, bounded by Error.stackTraceLimit.
    var frameDepth = 10;
    function CallSite() {}
    var callSitePrototype = CallSite.prototype;
    function method(name, value) {
        var fn = {
            [name]() {
                return value;
            },
        }[name];
        defineProperty(callSitePrototype, name, {
            value: fn,
            writable: true,
            enumerable: false,
            configurable: true,
        });
        markNative(fn);
    }
    method("getThis", undefined);
    method("getTypeName", null);
    method("getFunction", undefined);
    method("getFunctionName", null);
    method("getMethodName", null);
    method("getFileName", undefined);
    method("getLineNumber", null);
    method("getColumnNumber", null);
    method("getEvalOrigin", undefined);
    method("isToplevel", false);
    method("isEval", false);
    method("isNative", false);
    method("isConstructor", false);
    method("isAsync", false);
    method("isPromiseAll", false);
    method("getPromiseIndex", null);
    method("getScriptNameOrSourceURL", undefined);
    method("toString", "<anonymous>");
    function define(object, name, value, writable) {
        defineProperty(object, name, {
            value: value,
            writable: writable,
            enumerable: false,
            configurable: true,
        });
    }
    defineProperty(Error, "stackTraceLimit", {
        value: 10,
        writable: true,
        enumerable: true,
        configurable: true,
    });
    var captureStackTrace = {
        captureStackTrace(target, constructorOpt) {
            if (
                (typeof target !== "object" && typeof target !== "function") ||
                target === null
            )
                throw new TypeError(
                    "Invalid argument: the target must be an object",
                );
            var prepare = Error.prepareStackTrace;
            var value;
            if (typeof prepare === "function") {
                var limit = Error.stackTraceLimit;
                var count = 0;
                if (typeof limit === "number" && limit > 0)
                    count = limit < frameDepth ? Math.floor(limit) : frameDepth;
                var sites = [];
                for (var i = 0; i < count; i++) sites.push(new CallSite());
                value = prepare(target, sites);
            } else {
                value = errorToString.call(target);
            }
            define(target, "stack", value, true);
        },
    }.captureStackTrace;
    defineProperty(captureStackTrace, "length", {
        value: 2,
        configurable: true,
    });
    markNative(captureStackTrace);
    define(Error, "captureStackTrace", captureStackTrace, true);
})();
