// Source text module records, namespaces and import() (#278): linked only when the lowered program, an agent or a
// linked prelude calls one of these rt.prelude helpers (src/link.ts).
(function () {
    var core = __nonaRegexpVm.moduleCore,
        moduleTable = core.table,
        modulePaths = core.paths,
        builtinModules = core.builtins,
        evaluateModule = core.evaluate,
        graphLinkError = core.linkError,
        newPromiseState = core.newPromiseState,
        enqueueCallback = core.enqueue,
        settle = core.settle,
        resolveState = core.resolve,
        append = __nonaRegexpVm.append,
        objectCreate = Object.create,
        defineProperty = Object.defineProperty,
        hasOwn = Object.prototype.hasOwnProperty;
    // Source text modules: namespace exotic objects, evaluation and import().
    var reflectGetOwn = Reflect.getOwnPropertyDescriptor,
        reflectDefine = Reflect.defineProperty,
        reflectDelete = Reflect.deleteProperty,
        reflectGet = Reflect.get;
    var proxyCreate = Function.prototype.__nonaProxyCreateInternal,
        preventExtensions = Object.preventExtensions,
        toStringTagSymbol = Symbol.toStringTag;
    function sameValue(a, b) {
        return a === b ? a !== 0 || 1 / a === 1 / b : a !== a && b !== b;
    }
    __nonaRegexpVm.createImportMeta = function (url, filename, dirname) {
        var meta = objectCreate(null);
        if (url !== undefined) {
            meta.dirname = dirname;
            meta.filename = filename;
            meta.url = url;
        }
        return meta;
    };
    __nonaRegexpVm.createNamespace = function (names, getters) {
        var target = objectCreate(null),
            lookup = objectCreate(null),
            keys = [];
        for (var i = 0; i < names.length; i++) {
            defineProperty(target, names[i], {
                value: undefined,
                writable: true,
                enumerable: true,
                configurable: false,
            });
            lookup[names[i]] = getters[i];
            append(keys, names[i]);
        }
        defineProperty(target, toStringTagSymbol, {
            value: "Module",
            writable: false,
            enumerable: false,
            configurable: false,
        });
        preventExtensions(target);
        function exported(key) {
            return typeof key === "string" && hasOwn.call(lookup, key);
        }
        function ownDescriptor(key) {
            return {
                value: lookup[key](),
                writable: true,
                enumerable: true,
                configurable: false,
            };
        }
        return proxyCreate(target, {
            get(t, key) {
                if (typeof key === "symbol") return reflectGet(t, key);
                return exported(key) ? lookup[key]() : undefined;
            },
            set() {
                return false;
            },
            has(t, key) {
                return typeof key === "symbol" ? key in t : exported(key);
            },
            deleteProperty(t, key) {
                return typeof key === "symbol"
                    ? reflectDelete(t, key)
                    : !exported(key);
            },
            getOwnPropertyDescriptor(t, key) {
                if (typeof key === "symbol") return reflectGetOwn(t, key);
                return exported(key) ? ownDescriptor(key) : undefined;
            },
            defineProperty(t, key, descriptor) {
                if (typeof key === "symbol")
                    return reflectDefine(t, key, descriptor);
                if (!exported(key)) return false;
                var current = ownDescriptor(key);
                if (
                    descriptor.configurable === true ||
                    descriptor.enumerable === false ||
                    "get" in descriptor ||
                    "set" in descriptor ||
                    descriptor.writable === false
                )
                    return false;
                return "value" in descriptor
                    ? sameValue(descriptor.value, current.value)
                    : true;
            },
            ownKeys(t) {
                var result = [];
                for (var i = 0; i < keys.length; i++) append(result, keys[i]);
                append(result, toStringTagSymbol);
                return result;
            },
            getPrototypeOf() {
                return null;
            },
            setPrototypeOf(t, prototype) {
                return prototype === null;
            },
            isExtensible() {
                return false;
            },
            preventExtensions() {
                return true;
            },
        });
    };
    __nonaRegexpVm.registerModule = function (
        index,
        path,
        body,
        requests,
        namespace,
        specifiers,
        targets,
        linkError,
        aliases,
        namespaceFactory,
    ) {
        var resolved = objectCreate(null);
        for (var i = 0; i < specifiers.length; i++)
            resolved[specifiers[i]] = targets[i];
        moduleTable[index] = {
            path: path,
            body: body,
            requests: requests,
            namespace: namespace,
            namespaceFactory: namespaceFactory,
            instantiated: false,
            resolved: resolved,
            status: 0,
            error: undefined,
            failed: false,
            linkError: linkError,
        };
        modulePaths[path] = index;
        if (aliases)
            for (var i = 0; i < aliases.length; i++)
                builtinModules[aliases[i]] = index;
    };
    var scriptRecord;
    __nonaRegexpVm.registerScript = function (path, specifiers, targets) {
        var resolved = objectCreate(null);
        for (var i = 0; i < specifiers.length; i++)
            resolved[specifiers[i]] = targets[i];
        scriptRecord = { path: path, resolved: resolved };
    };
    function resolveSpecifier(specifier, referrerPath) {
        if (!(
            specifier.slice(0, 2) === "./" ||
            specifier.slice(0, 3) === "../" ||
            specifier.slice(0, 1) === "/"
        ))
            return undefined;
        var parts = [],
            segments = specifier.split("/"),
            i;
        if (specifier.slice(0, 1) !== "/") {
            var base = referrerPath.split("/");
            for (i = 1; i < base.length - 1; i++) append(parts, base[i]);
        }
        for (i = 0; i < segments.length; i++) {
            var segment = segments[i];
            if (segment === "" || segment === ".") continue;
            if (segment === "..")
                parts.length = parts.length > 0 ? parts.length - 1 : 0;
            else append(parts, segment);
        }
        return "/" + parts.join("/");
    }
    __nonaRegexpVm.dynamicImport = function (specifier, referrer) {
        var promise = newPromiseState();
        try {
            if (typeof specifier === "symbol")
                throw new TypeError(
                    "Cannot convert a Symbol value to a string",
                );
            var text = String(specifier);
            var target,
                record = referrer >= 0 ? moduleTable[referrer] : scriptRecord;
            if (record && hasOwn.call(record.resolved, text))
                target = record.resolved[text];
            else if (record) {
                var path = resolveSpecifier(text, record.path);
                if (path !== undefined && hasOwn.call(modulePaths, path))
                    target = modulePaths[path];
            }
            if (target === undefined)
                throw new TypeError("Cannot find module '" + text + "'");
            var failure = graphLinkError(target, objectCreate(null));
            if (failure !== undefined) throw new SyntaxError(failure);
            enqueueCallback(function () {
                try {
                    evaluateModule(target);
                } catch (error) {
                    settle(promise, 2, error);
                    return;
                }
                resolveState(promise, moduleTable[target].namespace);
            });
        } catch (error) {
            settle(promise, 2, error);
        }
        return promise.promise;
    };
})();
