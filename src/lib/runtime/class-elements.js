// ES2022 class elements: private names, fields and static blocks (#278): linked only when the lowered program, an agent or a
// linked prelude calls one of these rt.prelude helpers (src/link.ts).
(function () {
    var defineProperty = Object.defineProperty;
    // ES2022 class elements. A private name is a record with a WeakMap from
    // each object that has it to its value (fields) or to true (the brand of a
    // private method or accessor, whose functions the record holds). Kinds:
    // 0 field, 1 method, 2 accessor.
    var weakMapConstructor = WeakMap,
        callPrototype = Function.prototype.call;
    function callBound(method) {
        return callPrototype.bind(method);
    }
    var weakHas = callBound(WeakMap.prototype.has),
        weakGet = callBound(WeakMap.prototype.get),
        weakSet = callBound(WeakMap.prototype.set),
        reflectApplyField = Reflect.apply;
    __nonaRegexpVm.privateName = function (description, kind) {
        // The name is its own WeakMap: native code reads fields and methods through it.
        var name = new weakMapConstructor();
        name.description = description;
        name.kind = kind;
        name.map = name;
        name.method = undefined;
        name.getter = undefined;
        name.setter = undefined;
        return name;
    };
    __nonaRegexpVm.privateMethod = function (name, fn, kind) {
        if (kind === 1) name.getter = fn;
        else if (kind === 2) name.setter = fn;
        else name.method = fn;
    };
    // Private elements cannot be added to a non-extensible object (Test262
    // nonextensible-applies-to-private, ES2026).
    var objectIsExtensible = Object.isExtensible;
    function privateAdd(object, name, value) {
        if (weakHas(name.map, object))
            throw new TypeError(
                "Cannot initialize " +
                    name.description +
                    " twice on the same object",
            );
        if (!objectIsExtensible(object))
            throw new TypeError(
                "Cannot define private member " +
                    name.description +
                    " on a non-extensible object",
            );
        weakSet(name.map, object, value);
    }
    function privateCheck(object, name, action) {
        if (
            object === null ||
            (typeof object !== "object" && typeof object !== "function") ||
            !weakHas(name.map, object)
        )
            throw new TypeError(
                "Cannot " +
                    action +
                    " private member " +
                    name.description +
                    " from an object whose class did not declare it",
            );
    }
    // A method's brand maps the object to the method itself.
    __nonaRegexpVm.privateBrand = function (object, name) {
        privateAdd(object, name, name.kind === 1 ? name.method : true);
    };
    __nonaRegexpVm.privateDefine = function (object, name, value) {
        privateAdd(object, name, value);
    };
    __nonaRegexpVm.privateGet = function (object, name) {
        privateCheck(object, name, "read");
        if (name.kind === 0) return weakGet(name.map, object);
        if (name.kind === 1) return name.method;
        if (name.getter === undefined)
            throw new TypeError(
                "'" + name.description + "' was defined without a getter",
            );
        return reflectApplyField(name.getter, object, []);
    };
    __nonaRegexpVm.privateSet = function (object, name, value) {
        privateCheck(object, name, "write");
        if (name.kind === 0) weakSet(name.map, object, value);
        else if (name.kind === 1)
            throw new TypeError(
                "Private method " + name.description + " is not writable",
            );
        else if (name.setter === undefined)
            throw new TypeError(
                "'" + name.description + "' was defined without a setter",
            );
        else reflectApplyField(name.setter, object, [value]);
        return value;
    };
    __nonaRegexpVm.privateIn = function (name, object) {
        if (
            object === null ||
            (typeof object !== "object" && typeof object !== "function")
        )
            throw new TypeError(
                "Cannot use 'in' operator to search for '" +
                    name.description +
                    "' in " +
                    (object === null ? "null" : typeof object),
            );
        return weakHas(name.map, object);
    };
    // InitializeInstanceElements / static elements: triples of kind (0 brand of
    // a private method, 1 field, 2 private field, 3 static block), key or
    // private name or block, and initializer (undefined without one).
    var fieldDescriptor = {
        value: undefined,
        writable: true,
        enumerable: true,
        configurable: true,
    };
    __nonaRegexpVm.initializeFields = function (object, list) {
        for (var i = 0; i < list.length; i += 3) {
            var kind = list[i],
                key = list[i + 1],
                init = list[i + 2];
            if (kind === 0) {
                privateAdd(object, key, key.kind === 1 ? key.method : true);
                continue;
            }
            if (kind === 3) {
                reflectApplyField(key, object, []);
                continue;
            }
            var value =
                init === undefined
                    ? undefined
                    : reflectApplyField(init, object, [
                          kind === 2 ? key.description : key,
                      ]);
            if (kind === 2) {
                privateAdd(object, key, value);
                continue;
            }
            fieldDescriptor.value = value;
            try {
                defineProperty(object, key, fieldDescriptor);
            } finally {
                fieldDescriptor.value = undefined;
            }
        }
    };
    // A computed static class element named "prototype" fails DefinePropertyOrThrow.
    __nonaRegexpVm.staticMethodKey = function (key) {
        if (key === "prototype")
            throw new TypeError(
                "Classes may not have a static property named 'prototype'",
            );
        return key;
    };
})();
