// Literal eval compiled ahead of time (#278): linked only when the lowered program, an agent or a
// linked prelude calls one of these rt.prelude helpers (src/link.ts).
(function () {
    var objectCreate = Object.create,
        reflectGetOwn = Reflect.getOwnPropertyDescriptor,
        reflectDefine = Reflect.defineProperty;
    // Literal eval compiled ahead of time (src/frontend/eval-aot.ts).
    var intrinsicEval = globalThis.eval,
        isExtensible = Object.isExtensible,
        reflectApplyEval = Reflect.apply;
    __nonaRegexpVm.isEval = function (value) {
        return value === intrinsicEval;
    };
    // The object environment of a function's sloppy eval var declarations, created on first use.
    __nonaRegexpVm.evalDeclareVars = function (env, names) {
        if (env === undefined) env = objectCreate(null);
        for (var i = 0; i < names.length; i++)
            if (!reflectGetOwn(env, names[i]))
                reflectDefine(env, names[i], {
                    value: undefined,
                    writable: true,
                    enumerable: true,
                    configurable: true,
                });
        return env;
    };
    // EvalDeclarationInstantiation for global code: CanDeclareGlobalFunction and
    // CanDeclareGlobalVar for every name, then the configurable bindings.
    __nonaRegexpVm.evalGlobalDeclarations = function (
        functionNames,
        functions,
        varNames,
    ) {
        var global = globalThis,
            i,
            d;
        for (i = 0; i < functionNames.length; i++) {
            d = reflectGetOwn(global, functionNames[i]);
            if (
                d === undefined
                    ? !isExtensible(global)
                    : !d.configurable &&
                      !("value" in d && d.writable && d.enumerable)
            )
                throw new TypeError(
                    "Cannot declare global function " + functionNames[i],
                );
        }
        for (i = 0; i < varNames.length; i++)
            if (!reflectGetOwn(global, varNames[i]) && !isExtensible(global))
                throw new TypeError(
                    "Cannot declare global variable " + varNames[i],
                );
        for (i = 0; i < functionNames.length; i++) {
            d = reflectGetOwn(global, functionNames[i]);
            if (
                !reflectDefine(
                    global,
                    functionNames[i],
                    d === undefined || d.configurable
                        ? {
                              value: functions[i],
                              writable: true,
                              enumerable: true,
                              configurable: true,
                          }
                        : { value: functions[i] },
                )
            )
                throw new TypeError(
                    "Cannot declare global function " + functionNames[i],
                );
        }
        for (i = 0; i < varNames.length; i++)
            if (!reflectGetOwn(global, varNames[i]))
                reflectDefine(global, varNames[i], {
                    value: undefined,
                    writable: true,
                    enumerable: true,
                    configurable: true,
                });
    };
    __nonaRegexpVm.callWithGlobalThis = function (code) {
        return reflectApplyEval(code, globalThis, []);
    };
})();
