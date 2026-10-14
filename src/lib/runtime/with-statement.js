// Object environment records of sloppy-mode with statements (#278): linked only when the lowered program, an agent or a
// linked prelude calls one of these rt.prelude helpers (src/link.ts).
(function () {
    function isObject(value) {
        return (
            (typeof value === "object" && value !== null) ||
            typeof value === "function"
        );
    }
    // Object environment records for sloppy-mode with statements.
    var unscopablesSymbol = Symbol.unscopables,
        reflectSet = Reflect.set;
    __nonaRegexpVm.withObject = function (value) {
        if (value === undefined || value === null)
            throw new TypeError("Cannot convert undefined or null to object");
        return Object(value);
    };
    __nonaRegexpVm.withHasBinding = function (object, name) {
        if (object === undefined) return false; // eval-aot environment not created yet
        if (!(name in object)) return false;
        var unscopables = object[unscopablesSymbol];
        return !(isObject(unscopables) && unscopables[name]);
    };
    __nonaRegexpVm.withGetBindingValue = function (object, name, strict) {
        if (!(name in object)) {
            if (strict) throw new ReferenceError(name + " is not defined");
            return undefined;
        }
        return object[name];
    };
    __nonaRegexpVm.withSetMutableBinding = function (
        object,
        name,
        value,
        strict,
    ) {
        if (!(name in object) && strict)
            throw new ReferenceError(name + " is not defined");
        if (!reflectSet(object, name, value) && strict)
            throw new TypeError("Cannot assign to read only property " + name);
    };
})();
