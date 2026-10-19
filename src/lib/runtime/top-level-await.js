// Top-level await (#306): the evaluation of cyclic module records in ECMA-262
// 2022 (16.2.1.5.3), linked only when some module of the program has an await
// at its top level (src/link.ts). Without it, promise.js evaluates every
// module synchronously. A module body with top-level await is an async
// function: its call returns the promise of its evaluation.
//
// Statuses of a record: 0 linked, 1 evaluating, 2 evaluated (failed and error
// hold an evaluation error), 3 evaluating-async.
(function () {
    var core = __nonaRegexpVm.moduleCore,
        moduleTable = core.table,
        instantiateModule = core.instantiate,
        newPromise = core.newPromise,
        promiseGet = core.promiseGet,
        enqueueCallback = core.enqueue,
        settle = core.settle,
        resolvePromise = core.resolve,
        performThen = core.performThen,
        append = core.append;
    // The order in which modules start their asynchronous evaluation
    // (IncrementModuleAsyncEvaluationCount).
    var asyncEvaluationCount = 0;
    // Modules that promise.js evaluated synchronously have no cycle root.
    function cycleRoot(module) {
        return module.cycleRoot === undefined ? module : module.cycleRoot;
    }
    function fail(module, error) {
        module.status = 2;
        module.failed = true;
        module.error = error;
    }
    // Evaluate(): the promise of the module's evaluation.
    function evaluate(index) {
        var module = moduleTable[index];
        if (module.status === 2 || module.status === 3)
            module = cycleRoot(module);
        if (module.capability !== undefined) return module.capability;
        var stack = [],
            capability = newPromise();
        module.capability = capability;
        try {
            instantiateModule(index);
            innerModuleEvaluation(module, stack, 0);
        } catch (error) {
            for (var i = 0; i < stack.length; i++) fail(stack[i], error);
            settle(capability, 2, error);
            return capability;
        }
        if (!module.asyncEvaluation) settle(capability, 1, undefined);
        return capability;
    }
    function innerModuleEvaluation(module, stack, index) {
        if (module.status === 2 || module.status === 3) {
            if (module.failed) throw module.error;
            return index;
        }
        if (module.status === 1) return index;
        module.status = 1;
        module.dfsIndex = index;
        module.dfsAncestorIndex = index;
        module.pendingAsyncDependencies = 0;
        module.asyncParentModules = [];
        index++;
        append(stack, module);
        var requests = module.requests;
        for (var i = 0; i < requests.length; i++) {
            var required = moduleTable[requests[i]];
            index = innerModuleEvaluation(required, stack, index);
            if (required.status === 1) {
                if (required.dfsAncestorIndex < module.dfsAncestorIndex)
                    module.dfsAncestorIndex = required.dfsAncestorIndex;
            } else {
                required = cycleRoot(required);
                if (required.failed) throw required.error;
            }
            if (required.asyncEvaluation) {
                module.pendingAsyncDependencies++;
                append(required.asyncParentModules, module);
            }
        }
        if (module.pendingAsyncDependencies > 0 || module.hasTLA) {
            module.asyncEvaluation = true;
            module.asyncOrder = ++asyncEvaluationCount;
            if (module.pendingAsyncDependencies === 0)
                executeAsyncModule(module);
        } else module.body.call(undefined);
        if (module.dfsAncestorIndex === module.dfsIndex) {
            var done;
            do {
                done = stack[stack.length - 1];
                stack.length--;
                done.status = done.asyncEvaluation ? 3 : 2;
                done.cycleRoot = module;
            } while (done !== module);
        }
        return index;
    }
    function executeAsyncModule(module) {
        performThen(
            module.body.call(undefined),
            function () {
                asyncModuleExecutionFulfilled(module);
            },
            function (error) {
                asyncModuleExecutionRejected(module, error);
            },
        );
    }
    function gatherAvailableAncestors(module, execList) {
        var parents = module.asyncParentModules;
        for (var i = 0; i < parents.length; i++) {
            var m = parents[i];
            if (!m.gathered && !cycleRoot(m).failed) {
                if (--m.pendingAsyncDependencies === 0) {
                    m.gathered = true;
                    append(execList, m);
                    if (!m.hasTLA) gatherAvailableAncestors(m, execList);
                }
            }
        }
    }
    function asyncModuleExecutionFulfilled(module) {
        if (module.status === 2) return;
        module.asyncEvaluation = false;
        module.status = 2;
        if (module.capability !== undefined)
            settle(module.capability, 1, undefined);
        var execList = [],
            i,
            j,
            m;
        gatherAvailableAncestors(module, execList);
        // Sorted by the order of their asynchronous evaluation (insertion
        // sort: Array.prototype.sort is an optional part).
        for (i = 1; i < execList.length; i++) {
            m = execList[i];
            for (j = i; j > 0 && execList[j - 1].asyncOrder > m.asyncOrder; j--)
                execList[j] = execList[j - 1];
            execList[j] = m;
        }
        for (i = 0; i < execList.length; i++) {
            m = execList[i];
            m.gathered = false;
        }
        for (i = 0; i < execList.length; i++) {
            m = execList[i];
            if (m.status === 2) continue;
            if (m.hasTLA) {
                executeAsyncModule(m);
                continue;
            }
            try {
                m.body.call(undefined);
            } catch (error) {
                asyncModuleExecutionRejected(m, error);
                continue;
            }
            m.asyncEvaluation = false;
            m.status = 2;
            if (m.capability !== undefined) settle(m.capability, 1, undefined);
        }
    }
    function asyncModuleExecutionRejected(module, error) {
        if (module.status === 2) return;
        fail(module, error);
        // The module's own promise first, then its ancestors' (leaf to root).
        if (module.capability !== undefined)
            settle(module.capability, 2, error);
        var parents = module.asyncParentModules;
        for (var i = 0; i < parents.length; i++)
            asyncModuleExecutionRejected(parents[i], error);
    }
    // import(): the namespace once the evaluation has finished.
    core.evaluateImport = function (index, promise) {
        performThen(
            evaluate(index),
            function () {
                resolvePromise(promise, moduleTable[index].namespace);
            },
            function (error) {
                settle(promise, 2, error);
            },
        );
    };
    // The entry module: a failure while evaluating synchronously is thrown at
    // once, a later rejection is an uncaught exception, and a promise that
    // never settles ends the process with exit code 13, as in Node.js.
    var entry,
        warned = false;
    function unsettled() {
        if (entry === undefined || (promiseGet(entry, 0) & 3) !== 0 || warned) return false;
        warned = true;
        console.error(
            "Warning: Detected unsettled top-level await at file://" +
                moduleTable[0].path,
        );
        return true;
    }
    __nonaRegexpVm.unsettledTopLevelAwait = unsettled;
    // The flag of a module with top-level await follows the arguments of
    // registerModule (module-records.js).
    var registerModule = __nonaRegexpVm.registerModule;
    __nonaRegexpVm.registerModule = function () {
        var args = arguments;
        registerModule(
            args[0],
            args[1],
            args[2],
            args[3],
            args[4],
            args[5],
            args[6],
            args[7],
            args[8],
            args[9],
        );
        moduleTable[args[0]].hasTLA = args[10] === true;
    };
    __nonaRegexpVm.evaluateModule = function (index) {
        var promise = evaluate(index),
            kind = promiseGet(promise, 0) & 3;
        if (kind === 1) return;
        if (kind === 2) {
            __nonaRegexpVm.markPromiseHandled(promise);
            throw promiseGet(promise, 1);
        }
        performThen(promise, undefined, function (error) {
            // A job outside every reaction: the error is uncaught.
            enqueueCallback(function () {
                throw error;
            });
        });
        entry = promise;
        var drainJobs = __nonaPromiseDrainJobs;
        __nonaPromiseDrainJobs = function () {
            drainJobs();
            if (!unsettled()) return;
            if (typeof __nonaRegexpVm.processBuiltin === "function")
                __nonaRegexpVm.processBuiltin().exit(13);
            throw new Error("Detected unsettled top-level await");
        };
    };
})();
