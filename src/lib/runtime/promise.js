var __nonaPromiseDrainJobs = (function () {
    // The job queue is a linked list of job records (next): a record's job
    // function runs with the record as its argument. A reaction record is its
    // own job, and a promise's pending reactions form a list that settling
    // splices into the queue whole.
    var queueHead,
        queueTail,
        unhandled = [],
        handledLater = [],
        states = new WeakMap(),
        defineProperty = Object.defineProperty;
    var failOnUnhandled = __NONA_FAIL_ON_UNHANDLED__;
    var getState = WeakMap.prototype.get.bind(states),
        setState = WeakMap.prototype.set.bind(states);
    var objectCreate = Object.create,
        reflectApply = Reflect.apply;
    // Read once: a global read per reaction is a lookup by name.
    var vm = __nonaRegexpVm,
        speciesSymbol = Symbol.species;
    // The async context tracker (async_hooks sets it): reads of an absent
    // property of the large prelude object scan its whole property list, so
    // the property is an accessor over this variable, which the reactions read.
    var asyncContext = vm.asyncContext;
    defineProperty(vm, "asyncContext", {
        get: function () {
            return asyncContext;
        },
        set: function (value) {
            asyncContext = value;
        },
        enumerable: true,
        configurable: true,
    });
    // CreateDataProperty at the end, natively (Array.__nonaAppendInternal).
    // Hosts without the intrinsic (source tests on Node) use one reused descriptor.
    var appendDescriptor = {
        value: undefined,
        writable: true,
        enumerable: true,
        configurable: true,
    };
    var nativeAppend =
        __nonaRegexpVm.append ||
        function (array, value) {
            appendDescriptor.value = value;
            defineProperty(array, array.length, appendDescriptor);
            appendDescriptor.value = undefined;
        };
    function append(array, value) {
        nativeAppend(array, value);
    }
    // Appends the list first..last (linked through next) to the queue.
    function enqueueList(first, last) {
        if (queueTail === undefined) queueHead = first;
        else queueTail.next = first;
        queueTail = last;
    }
    // Realms created later reuse the first realm's queue and drain.
    var sharedQueue = Function.prototype.__nonaSharedQueueInternal,
        hostEnqueue = sharedQueue();
    if (typeof hostEnqueue === "function")
        enqueueList = function (first, last) {
            hostEnqueue(first, last);
        };
    else sharedQueue(enqueueList);
    function enqueue(record) {
        enqueueList(record, record);
    }
    // A job without an argument (queueMicrotask, module evaluation).
    function callJob(record) {
        var callback = record.callback;
        callback();
    }
    function CallbackJob(callback) {
        return { job: callJob, next: undefined, callback: callback };
    }
    function enqueueCallback(callback) {
        enqueue(CallbackJob(callback));
    }
    function drain() {
        while (queueHead !== undefined) {
            var node = queueHead,
                job = node.job;
            queueHead = node.next;
            if (queueHead === undefined) queueTail = undefined;
            node.next = undefined;
            try {
                job(node);
            } catch (error) {
                if (typeof __nonaRegexpVm.dispatchUncaught !== "function")
                    throw error;
                __nonaRegexpVm.dispatchUncaught(error, "uncaughtException");
            }
        }
        var handled = handledLater;
        handledLater = [];
        var pending = unhandled;
        unhandled = [];
        for (var i = 0; i < pending.length; i++) {
            var state = pending[i];
            if (state.handled) continue;
            state.reported = true;
            if (typeof __nonaRegexpVm.reportUnhandledRejection === "function")
                __nonaRegexpVm.reportUnhandledRejection(
                    state.value,
                    state.promise,
                    failOnUnhandled,
                );
            else if (failOnUnhandled) throw state.value;
        }
        for (var i = 0; i < handled.length; i++)
            if (typeof __nonaRegexpVm.reportRejectionHandled === "function")
                __nonaRegexpVm.reportRejectionHandled(handled[i].promise);
    }
    function markHandled(state) {
        if (state.handled) return;
        state.handled = true;
        if (state.reported) append(handledLater, state);
    }
    __nonaRegexpVm.markPromiseHandled = function (promise) {
        markHandled(record(promise));
    };
    function record(value) {
        var state = getState(value);
        if (state === undefined)
            throw new TypeError("Incompatible Promise receiver");
        return state;
    }
    // The internal slots of a promise: kind 0 pending, 1 fulfilled, 2 rejected;
    // first..last is the list of pending reactions.
    // Records are object literals with fixed keys: each site resolves its
    // shape once and stores the values into the slots (no construct call).
    function PromiseState(promise) {
        return {
            kind: 0,
            value: undefined,
            first: undefined,
            last: undefined,
            handled: false,
            reported: false,
            promise: promise,
        };
    }
    // One record per then: both handlers and either the derived promise's
    // state (target) or a foreign capability's functions; source is the
    // promise whose settlement the job delivers.
    function Reaction(
        target,
        onFulfilled,
        onRejected,
        resolve,
        reject,
        context,
    ) {
        return {
            job: runReaction,
            next: undefined,
            target: target,
            onFulfilled: onFulfilled,
            onRejected: onRejected,
            resolve: resolve,
            reject: reject,
            context: context,
            source: undefined,
        };
    }
    function addReaction(state, reaction) {
        reaction.source = state;
        if (!state.handled) {
            state.handled = true;
            if (state.reported) append(handledLater, state);
        }
        if (state.kind !== 0) enqueueList(reaction, reaction);
        else {
            if (state.last === undefined) state.first = reaction;
            else state.last.next = reaction;
            state.last = reaction;
        }
    }
    function settle(state, kind, value) {
        if (state.kind !== 0) return;
        state.kind = kind;
        state.value = value;
        if (kind === 2 && !state.handled) append(unhandled, state);
        var first = state.first;
        if (first === undefined) return;
        enqueueList(first, state.last);
        state.first = undefined;
        state.last = undefined;
    }
    // NewPromiseReactionJob.
    function runReaction(reaction) {
        var source = reaction.source,
            kind = source.kind,
            value = source.value;
        reaction.source = undefined;
        var context = asyncContext,
            previous = context ? context.activeRecord : undefined;
        var handler = kind === 1 ? reaction.onFulfilled : reaction.onRejected,
            result,
            failed = false;
        if (typeof handler !== "function") {
            result = value;
            failed = kind === 2;
        } else if (!context) {
            try {
                result = handler(value);
            } catch (error) {
                result = error;
                failed = true;
            }
        } else {
            try {
                var snapshot =
                    reaction.context ||
                    (context ? context.defaultRecord : undefined);
                result =
                    context && snapshot && snapshot !== context.activeRecord
                        ? context.runCapturedUnary(snapshot, handler, value)
                        : handler(value);
            } catch (error) {
                result = error;
                failed = true;
            }
        }
        try {
            var target = reaction.target;
            if (target !== undefined) {
                if (failed) settle(target, 2, result);
                else if (
                    result !== null &&
                    (typeof result === "object" || typeof result === "function")
                )
                    resolveState(target, result);
                // Fulfilment with a primitive: settle(target, 1, result) written out.
                else if (target.kind === 0) {
                    target.kind = 1;
                    target.value = result;
                    var first = target.first;
                    if (first !== undefined) {
                        enqueueList(first, target.last);
                        target.first = undefined;
                        target.last = undefined;
                    }
                }
            } else if (failed) {
                var reject = reaction.reject;
                if (reject !== undefined) reject(result);
            } else {
                var resolve = reaction.resolve;
                if (resolve !== undefined) resolve(result);
            }
        } catch (error) {
            restoreContext(context, previous);
            throw error;
        }
        // Without async context tracking (async_hooks) there is nothing to restore.
        if (context || asyncContext) restoreContext(context, previous);
    }
    function restoreContext(context, previous) {
        if (!context) {
            context = asyncContext;
            previous = context ? context.defaultRecord : undefined;
        }
        if (context && context.activeRecord !== previous)
            context.restoreRecord(previous);
    }
    // The resolve function of a promise's resolving functions (the alreadyResolved check is the caller's).
    function resolveState(state, value) {
        if (value === state.promise) {
            settle(state, 2, new TypeError("Promise self resolution"));
            return;
        }
        if (
            value !== null &&
            (typeof value === "object" || typeof value === "function")
        ) {
            var then;
            try {
                then = value.then;
            } catch (error) {
                settle(state, 2, error);
                return;
            }
            if (typeof then === "function") {
                enqueue(ThenableJob(state, value, then));
                return;
            }
        }
        settle(state, 1, value);
    }
    // NewPromiseResolveThenableJob: the thenable gets fresh resolving functions.
    function ThenableJob(state, thenable, then) {
        return {
            job: resolveThenableJob,
            next: undefined,
            state: state,
            thenable: thenable,
            then: then,
        };
    }
    function resolveThenableJob(job) {
        var functions = resolving(job.state);
        try {
            reflectApply(job.then, job.thenable, functions);
        } catch (error) {
            var reject = functions[1];
            reject(error);
        }
    }
    // The resolving functions are anonymous (name ""): arrows in an array
    // literal get no name, so nothing has to be redefined afterwards.
    function resolving(state) {
        var called = false;
        return [
            (value) => {
                if (called) return;
                called = true;
                resolveState(state, value);
            },
            (reason) => {
                if (called) return;
                called = true;
                settle(state, 2, reason);
            },
        ];
    }
    // Absent when the prelude is evaluated by Node.js in source tests.
    var promiseRealm =
        Function.prototype.__nonaPromiseRealmInternal || function () {};
    function Promise(executor) {
        if (new.target === undefined)
            throw new TypeError("Promise requires new");
        if (typeof executor !== "function")
            throw new TypeError("Promise executor must be callable");
        promiseRealm(this, false);
        var state = PromiseState(this);
        setState(this, state);
        var functions = resolving(state);
        try {
            executor(functions[0], functions[1]);
        } catch (error) {
            var reject = functions[1];
            reject(error);
        }
    }
    var promisePrototype = Promise.prototype;
    // new %Promise%(executor) whose resolving functions are never observable:
    // the caller settles the returned state directly.
    function newPromiseState() {
        var promise = objectCreate(promisePrototype),
            state = PromiseState(promise);
        setState(promise, state);
        return state;
    }
    function species(value) {
        var constructor = value.constructor;
        if (constructor === undefined) return Promise;
        if (
            constructor !== Promise &&
            (constructor === null ||
                (typeof constructor !== "object" &&
                    typeof constructor !== "function"))
        )
            throw new TypeError("Invalid Promise constructor");
        var result = constructor[speciesSymbol];
        return result === undefined || result === null ? Promise : result;
    }
    function capability(C) {
        if (!__nonaRegexpVm.isConstructor(C))
            throw new TypeError("Promise constructor required");
        var resolve, reject;
        var promise = new C((y, n) => {
            if (resolve !== undefined || reject !== undefined)
                throw new TypeError("Promise capability executor called twice");
            resolve = y;
            reject = n;
        });
        if (typeof resolve !== "function" || typeof reject !== "function")
            throw new TypeError("Invalid Promise capability");
        return { promise: promise, resolve: resolve, reject: reject };
    }
    function currentContext() {
        var context = asyncContext;
        return context ? context.activeRecord : undefined;
    }
    var then = {
        then(onFulfilled, onRejected) {
            var state = getState(this);
            if (state === undefined)
                throw new TypeError("Incompatible Promise receiver");
            // SpeciesConstructor(this, %Promise%), as species() does.
            var C = Promise,
                constructor = this.constructor;
            if (constructor !== undefined) {
                if (
                    constructor !== Promise &&
                    (constructor === null ||
                        (typeof constructor !== "object" &&
                            typeof constructor !== "function"))
                )
                    throw new TypeError("Invalid Promise constructor");
                C = constructor[speciesSymbol];
                if (C === undefined || C === null) C = Promise;
            }
            if (C === Promise) {
                // The derived promise and the reaction, written out (one call each
                // would cost more than the record).
                var promise = objectCreate(promisePrototype),
                    context = asyncContext;
                var target = {
                    kind: 0,
                    value: undefined,
                    first: undefined,
                    last: undefined,
                    handled: false,
                    reported: false,
                    promise: promise,
                };
                setState(promise, target);
                addReaction(state, {
                    job: runReaction,
                    next: undefined,
                    target: target,
                    onFulfilled: onFulfilled,
                    onRejected: onRejected,
                    resolve: undefined,
                    reject: undefined,
                    context: context ? context.activeRecord : undefined,
                    source: undefined,
                });
                return promise;
            }
            var next = capability(C);
            addReaction(
                state,
                Reaction(
                    undefined,
                    onFulfilled,
                    onRejected,
                    next.resolve,
                    next.reject,
                    currentContext(),
                ),
            );
            return next.promise;
        },
    }.then;
    var caught = {
        catch(onRejected) {
            return this.then(undefined, onRejected);
        },
    }.catch;
    var resolved = {
        resolve(value) {
            var C = this;
            if (!__nonaRegexpVm.isConstructor(C))
                throw new TypeError(
                    "Promise.resolve receiver is not a constructor",
                );
            return promiseResolve(C, value);
        },
    }.resolve;
    var rejected = {
        reject(reason) {
            if (this === Promise) {
                var state = newPromiseState();
                settle(state, 2, reason);
                return state.promise;
            }
            var next = capability(this),
                reject = next.reject;
            reject(reason);
            return next.promise;
        },
    }.reject;
    var finallyMethod = {
        finally(onFinally) {
            var C = species(this);
            if (typeof onFinally !== "function")
                return this.then(onFinally, onFinally);
            return this.then(
                (value) => promiseResolve(C, onFinally()).then(() => value),
                (reason) =>
                    promiseResolve(C, onFinally()).then(() => {
                        throw reason;
                    }),
            );
        },
    }.finally;
    function promiseResolve(C, value) {
        if (
            value !== null &&
            (typeof value === "object" || typeof value === "function") &&
            getState(value) !== undefined &&
            value.constructor === C
        )
            return value;
        if (C === Promise) {
            var state = newPromiseState();
            resolveState(state, value);
            return state.promise;
        }
        var next = capability(C),
            resolve = next.resolve;
        resolve(value);
        return next.promise;
    }
    function combinator(C, iterable, mode) {
        var next = capability(C),
            resolve = next.resolve,
            reject = next.reject;
        var values = [],
            remaining = 1;
        try {
            var resolveMethod = C.resolve;
            if (typeof resolveMethod !== "function")
                throw new TypeError("Promise.resolve must be callable");
            for (var item of iterable) {
                var promise = resolveMethod.call(C, item);
                if (mode === 2) {
                    promise.then(resolve, reject);
                    continue;
                }
                var index = values.length;
                append(values, undefined);
                remaining++;
                (function (position) {
                    var called = false;
                    // Promise.any (ES2021): the first fulfilment wins; all rejections
                    // reject with an AggregateError of the reasons in order.
                    if (mode === 3)
                        promise.then(resolve, (reason) => {
                            if (called) return;
                            called = true;
                            values[position] = reason;
                            remaining--;
                            if (remaining === 0) reject(aggregate(values));
                        });
                    else if (mode === 0)
                        promise.then((value) => {
                            if (called) return;
                            called = true;
                            values[position] = value;
                            remaining--;
                            if (remaining === 0) resolve(values);
                        }, reject);
                    else
                        promise.then(
                            (value) => {
                                if (called) return;
                                called = true;
                                values[position] = {
                                    status: "fulfilled",
                                    value: value,
                                };
                                remaining--;
                                if (remaining === 0) resolve(values);
                            },
                            (reason) => {
                                if (called) return;
                                called = true;
                                values[position] = {
                                    status: "rejected",
                                    reason: reason,
                                };
                                remaining--;
                                if (remaining === 0) resolve(values);
                            },
                        );
                })(index);
            }
            remaining--;
            if (remaining === 0 && mode === 3) reject(aggregate(values));
            else if (remaining === 0 && mode !== 2) resolve(values);
        } catch (error) {
            reject(error);
        }
        return next.promise;
    }
    var all = {
        all(iterable) {
            return combinator(this, iterable, 0);
        },
    }.all;
    var allSettled = {
        allSettled(iterable) {
            return combinator(this, iterable, 1);
        },
    }.allSettled;
    var race = {
        race(iterable) {
            return combinator(this, iterable, 2);
        },
    }.race;
    var AggregateErrorConstructor = __nonaRegexpVm.AggregateError;
    function aggregate(errors) {
        var error = new AggregateErrorConstructor([]);
        Object.defineProperty(error, "errors", {
            value: errors,
            writable: true,
            enumerable: false,
            configurable: true,
        });
        return error;
    }
    var any = {
        any(iterable) {
            return combinator(this, iterable, 3);
        },
    }.any;
    function method(target, name, value) {
        Object.defineProperty(target, name, {
            value: value,
            writable: true,
            configurable: true,
        });
        Object.defineProperty(value, "name", {
            value: name,
            configurable: true,
        });
        Function.prototype.__nonaMarkNativeInternal(value);
    }
    method(Promise.prototype, "then", then);
    method(Promise.prototype, "catch", caught);
    method(Promise.prototype, "finally", finallyMethod);
    method(Promise, "resolve", resolved);
    method(Promise, "reject", rejected);
    method(Promise, "all", all);
    method(Promise, "allSettled", allSettled);
    method(Promise, "race", race);
    method(Promise, "any", any);
    var speciesGetter = Object.getOwnPropertyDescriptor(
        {
            get [Symbol.species]() {
                return this;
            },
        },
        Symbol.species,
    ).get;
    Object.defineProperty(Promise, Symbol.species, {
        get: speciesGetter,
        configurable: true,
    });
    Object.defineProperty(Promise, "prototype", { writable: false });
    Object.defineProperty(Promise.prototype, Symbol.toStringTag, {
        value: "Promise",
        configurable: true,
    });
    Object.defineProperty(globalThis, "Promise", {
        value: Promise,
        writable: true,
        configurable: true,
    });
    Function.prototype.__nonaMarkNativeInternal(Promise);
    Function.prototype.__nonaMarkNativeInternal(speciesGetter);
    Function.prototype.__nonaMarkPromiseInternal(Promise);
    promiseRealm(Promise.prototype, true);

    // Async functions and generators run on internal generator coroutines.
    // Each await suspends the coroutine with an own "await" flag in its result.
    var coroutinePrototype = Object.getPrototypeOf(function* () {}).prototype;
    var coroutineNext = coroutinePrototype.next,
        coroutineThrow = coroutinePrototype.throw,
        coroutineReturn = coroutinePrototype.return;
    var hasOwn = Object.prototype.hasOwnProperty,
        getPrototypeOf = Object.getPrototypeOf;
    function noop() {}
    // PerformPromiseThen without a result capability.
    function performThen(promise, onFulfilled, onRejected) {
        addReaction(
            record(promise),
            Reaction(
                undefined,
                onFulfilled,
                onRejected,
                undefined,
                undefined,
                currentContext(),
            ),
        );
    }
    // Await(value): PromiseResolve(%Promise%, value), then PerformPromiseThen.
    // A primitive becomes a fulfilled promise nobody else can see, whose
    // reaction is queued at once: only the reaction is created, with that
    // promise's settled state as its source.
    function awaitValue(value, onFulfilled, onRejected) {
        if (
            value === null ||
            (typeof value !== "object" && typeof value !== "function")
        ) {
            var context = asyncContext,
                reaction = {
                    job: runReaction,
                    next: undefined,
                    target: undefined,
                    onFulfilled: onFulfilled,
                    onRejected: onRejected,
                    resolve: undefined,
                    reject: undefined,
                    context: context ? context.activeRecord : undefined,
                    source: undefined,
                };
            reaction.source = { kind: 1, value: value };
            enqueueList(reaction, reaction);
            return;
        }
        performThen(promiseResolve(Promise, value), onFulfilled, onRejected);
    }
    function resume(coroutine, mode, value) {
        return mode === 0
            ? coroutineNext.call(coroutine, value)
            : mode === 1
              ? coroutineThrow.call(coroutine, value)
              : coroutineReturn.call(coroutine, value);
    }
    // The internal coroutine marks an await step with an own "await" property
    // on its fresh result object (see rt.generatorNext); nothing else can.
    function isAwait(result) {
        return result.await === true;
    }
    __nonaRegexpVm.asyncFunctionStart = function (coroutine) {
        var state = newPromiseState(),
            resumeNext,
            resumeThrow;
        function step(mode, value) {
            var result;
            try {
                result = resume(coroutine, mode, value);
            } catch (error) {
                settle(state, 2, error);
                return;
            }
            if (isAwait(result)) {
                // The continuations exist only for functions that do await.
                if (resumeNext === undefined) {
                    resumeNext = function (value) {
                        step(0, value);
                    };
                    resumeThrow = function (error) {
                        step(1, error);
                    };
                }
                try {
                    awaitValue(result.value, resumeNext, resumeThrow);
                } catch (error) {
                    step(1, error);
                }
                return;
            }
            resolveState(state, result.value);
        }
        step(0, undefined);
        return state.promise;
    };

    var asyncGeneratorStates = new WeakMap();
    var getGeneratorState = WeakMap.prototype.get.bind(asyncGeneratorStates),
        setGeneratorState = WeakMap.prototype.set.bind(asyncGeneratorStates);
    var asyncGeneratorPrototype = Object.getPrototypeOf(
        async function* () {}.prototype,
    );
    function iterResult(value, done) {
        return { value: value, done: done };
    }
    function generatorSettle(generator, rejected, value) {
        var state = getGeneratorState(generator),
            request = state.queue[state.head];
        state.queue[state.head++] = undefined;
        if (state.head === state.queue.length) {
            state.queue = [];
            state.head = 0;
        }
        if (rejected) settle(request.state, 2, value);
        else resolveState(request.state, value);
    }
    // AsyncGeneratorResumeNext: states 0 suspendedStart, 1 suspendedYield,
    // 2 executing, 3 awaiting-return, 4 completed.
    function resumeNextRequest(generator) {
        var state = getGeneratorState(generator);
        for (;;) {
            if (
                state.state === 2 ||
                state.state === 3 ||
                state.head === state.queue.length
            )
                return;
            var request = state.queue[state.head],
                mode = request.mode,
                value = request.value;
            if (mode !== 0) {
                if (state.state === 0) state.state = 4;
                if (state.state === 4) {
                    if (mode === 2) {
                        state.state = 3;
                        try {
                            awaitValue(
                                value,
                                function (result) {
                                    state.state = 4;
                                    generatorSettle(
                                        generator,
                                        false,
                                        iterResult(result, true),
                                    );
                                    resumeNextRequest(generator);
                                },
                                function (reason) {
                                    state.state = 4;
                                    generatorSettle(generator, true, reason);
                                    resumeNextRequest(generator);
                                },
                            );
                        } catch (error) {
                            state.state = 4;
                            generatorSettle(generator, true, error);
                            continue;
                        }
                        return;
                    }
                    generatorSettle(generator, true, value);
                    continue;
                }
            } else if (state.state === 4) {
                generatorSettle(generator, false, iterResult(undefined, true));
                continue;
            }
            var resumeFromYield = state.state === 1;
            state.state = 2;
            // A return request resumes a suspended yield after awaiting its value.
            if (mode === 2 && resumeFromYield) {
                try {
                    awaitValue(
                        value,
                        function (result) {
                            generatorStep(generator, 2, result);
                        },
                        function (reason) {
                            generatorStep(generator, 1, reason);
                        },
                    );
                } catch (error) {
                    generatorStep(generator, 1, error);
                }
                return;
            }
            generatorStep(generator, mode, value);
            return;
        }
    }
    function generatorStep(generator, mode, value) {
        var state = getGeneratorState(generator),
            result;
        try {
            result = resume(state.coroutine, mode, value);
        } catch (error) {
            state.state = 4;
            generatorSettle(generator, true, error);
            resumeNextRequest(generator);
            return;
        }
        if (isAwait(result)) {
            try {
                awaitValue(
                    result.value,
                    function (next) {
                        generatorStep(generator, 0, next);
                    },
                    function (reason) {
                        generatorStep(generator, 1, reason);
                    },
                );
            } catch (error) {
                generatorStep(generator, 1, error);
            }
            return;
        }
        if (result.done) {
            state.state = 4;
            generatorSettle(generator, false, iterResult(result.value, true));
            resumeNextRequest(generator);
            return;
        }
        state.state = 1;
        generatorSettle(generator, false, iterResult(result.value, false));
        resumeNextRequest(generator);
    }
    __nonaRegexpVm.asyncGeneratorStart = function (coroutine) {
        var prototype = getPrototypeOf(coroutine);
        if (prototype === coroutinePrototype)
            prototype = asyncGeneratorPrototype;
        var generator = objectCreate(prototype);
        setGeneratorState(generator, {
            coroutine: coroutine,
            state: 0,
            queue: [],
            head: 0,
        });
        return generator;
    };
    function enqueueRequest(generator, mode, value) {
        var promise = newPromiseState();
        var state =
            generator !== null &&
            (typeof generator === "object" || typeof generator === "function")
                ? getGeneratorState(generator)
                : undefined;
        if (state === undefined) {
            settle(promise, 2, new TypeError("Not an async generator"));
            return promise.promise;
        }
        append(state.queue, { mode: mode, value: value, state: promise });
        if (state.state !== 2) resumeNextRequest(generator);
        return promise.promise;
    }
    function define(target, name, value, writable) {
        Object.defineProperty(target, name, {
            value: value,
            writable: writable,
            configurable: true,
        });
    }
    function nativeMethod(target, name, value) {
        define(target, name, value, true);
        Function.prototype.__nonaMarkNativeInternal(value);
    }
    nativeMethod(
        asyncGeneratorPrototype,
        "next",
        {
            next(value) {
                return enqueueRequest(this, 0, value);
            },
        }.next,
    );
    nativeMethod(
        asyncGeneratorPrototype,
        "return",
        {
            return(value) {
                return enqueueRequest(this, 2, value);
            },
        }.return,
    );
    nativeMethod(
        asyncGeneratorPrototype,
        "throw",
        {
            throw(value) {
                return enqueueRequest(this, 1, value);
            },
        }.throw,
    );
    define(
        asyncGeneratorPrototype,
        Symbol.toStringTag,
        "AsyncGenerator",
        false,
    );
    var asyncIteratorPrototype = getPrototypeOf(asyncGeneratorPrototype);
    var asyncIterator = {
        [Symbol.asyncIterator]() {
            "use strict";
            return this;
        },
    }[Symbol.asyncIterator];
    nativeMethod(asyncIteratorPrototype, Symbol.asyncIterator, asyncIterator);
    // GetIterator(obj, async) and %AsyncFromSyncIteratorPrototype%.
    var asyncIteratorSymbol = Symbol.asyncIterator,
        iteratorSymbol = Symbol.iterator;
    function isObject(value) {
        return (
            value !== null &&
            (typeof value === "object" || typeof value === "function")
        );
    }
    var asyncFromSyncStates = new WeakMap();
    var getSyncRecord = WeakMap.prototype.get.bind(asyncFromSyncStates),
        setSyncRecord = WeakMap.prototype.set.bind(asyncFromSyncStates);
    var asyncFromSyncPrototype = objectCreate(asyncIteratorPrototype);
    function syncRecord(iterator) {
        var record = isObject(iterator) ? getSyncRecord(iterator) : undefined;
        if (record === undefined)
            throw new TypeError("Not an async-from-sync iterator");
        return record;
    }
    // Newer editions close the sync iterator when a yielded promise rejects;
    // Test262 and current engines follow that behavior.
    function closeSyncIterator(record, throwing, error) {
        if (throwing) {
            try {
                var method = record.iterator.return;
                if (method !== undefined && method !== null)
                    method.call(record.iterator);
            } catch (ignored) {}
            throw error;
        }
        var method = record.iterator.return;
        if (method === undefined || method === null) return;
        var result = method.call(record.iterator);
        if (!isObject(result))
            throw new TypeError("Iterator result must be an object");
    }
    function asyncFromSyncContinuation(
        result,
        promise,
        record,
        closeOnRejection,
    ) {
        try {
            var done = !!result.done,
                value = result.value,
                wrapper;
            try {
                wrapper = promiseResolve(Promise, value);
            } catch (error) {
                if (!done && closeOnRejection)
                    closeSyncIterator(record, true, error);
                throw error;
            }
            var onRejected =
                done || !closeOnRejection
                    ? undefined
                    : function (error) {
                          closeSyncIterator(record, true, error);
                      };
            addReaction(
                record_(wrapper),
                Reaction(
                    promise,
                    function (unwrapped) {
                        return iterResult(unwrapped, done);
                    },
                    onRejected,
                    undefined,
                    undefined,
                    undefined,
                ),
            );
        } catch (error) {
            settle(promise, 2, error);
        }
    }
    var record_ = record;
    function asyncFromSyncMethod(name, body) {
        var method = {
            [name](value) {
                var promise = newPromiseState();
                try {
                    var record = syncRecord(this);
                    body(record, arguments.length > 0, value, promise);
                } catch (error) {
                    settle(promise, 2, error);
                }
                return promise.promise;
            },
        }[name];
        nativeMethod(asyncFromSyncPrototype, name, method);
    }
    asyncFromSyncMethod("next", function (record, present, value, promise) {
        var result = present
            ? record.next.call(record.iterator, value)
            : record.next.call(record.iterator);
        if (!isObject(result))
            throw new TypeError("Iterator result must be an object");
        asyncFromSyncContinuation(result, promise, record, true);
    });
    asyncFromSyncMethod("return", function (record, present, value, promise) {
        var method = record.iterator.return;
        if (method === undefined || method === null) {
            resolveState(promise, iterResult(value, true));
            return;
        }
        var result = present
            ? method.call(record.iterator, value)
            : method.call(record.iterator);
        if (!isObject(result))
            throw new TypeError("Iterator result must be an object");
        asyncFromSyncContinuation(result, promise, record, false);
    });
    asyncFromSyncMethod("throw", function (record, present, value, promise) {
        var method = record.iterator.throw;
        if (method === undefined || method === null) {
            closeSyncIterator(record, false);
            throw new TypeError("The iterator does not provide a throw method");
        }
        var result = present
            ? method.call(record.iterator, value)
            : method.call(record.iterator);
        if (!isObject(result))
            throw new TypeError("Iterator result must be an object");
        asyncFromSyncContinuation(result, promise, record, true);
    });
    __nonaRegexpVm.getAsyncIterator = function (object) {
        var method = object[asyncIteratorSymbol];
        if (method === undefined || method === null) {
            var syncMethod = object[iteratorSymbol];
            if (typeof syncMethod !== "function")
                throw new TypeError("Object is not async iterable");
            var syncIterator = syncMethod.call(object);
            if (!isObject(syncIterator))
                throw new TypeError("Iterator must be an object");
            var iterator = objectCreate(asyncFromSyncPrototype);
            setSyncRecord(iterator, {
                iterator: syncIterator,
                next: syncIterator.next,
            });
            return iterator;
        }
        if (typeof method !== "function")
            throw new TypeError("Symbol.asyncIterator must be callable");
        var result = method.call(object);
        if (!isObject(result))
            throw new TypeError("Async iterator must be an object");
        return result;
    };
    var moduleTable = [],
        modulePaths = objectCreate(null),
        builtinModules = objectCreate(null);
    function instantiateModule(index) {
        var record = moduleTable[index];
        if (record.instantiated) return;
        if (record.failed) throw record.error;
        try {
            if (record.namespaceFactory) {
                record.namespace = record.namespaceFactory();
                record.namespaceFactory = undefined;
            }
        } catch (error) {
            record.status = 2;
            record.failed = true;
            record.error = error;
            throw error;
        }
        record.instantiated = true;
        // The whole static graph must exist before bodies run, including siblings
        // that a cyclic dependency can reach through a re-exported namespace.
        for (var i = 0; i < record.requests.length; i++)
            instantiateModule(record.requests[i]);
    }
    function evaluateModule(index) {
        var record = moduleTable[index];
        if (record.status === 2) {
            if (record.failed) throw record.error;
            return;
        }
        // Evaluating, or evaluating-async (3, see top-level-await.js).
        if (record.status !== 0) return;
        record.status = 1;
        try {
            instantiateModule(index);
            for (var i = 0; i < record.requests.length; i++)
                evaluateModule(record.requests[i]);
            record.body.call(undefined);
        } catch (error) {
            record.status = 2;
            record.failed = true;
            record.error = error;
            throw error;
        }
        record.status = 2;
    }
    __nonaRegexpVm.evaluateModule = evaluateModule;
    // Link errors anywhere in the static graph of an imported module.
    function linkError(index, seen) {
        if (seen[index]) return undefined;
        seen[index] = true;
        var record = moduleTable[index];
        if (record.linkError !== undefined) return record.linkError;
        for (var i = 0; i < record.requests.length; i++) {
            var error = linkError(record.requests[i], seen);
            if (error !== undefined) return error;
        }
        return undefined;
    }
    __nonaRegexpVm.getBuiltinModule = function (id) {
        if (typeof id !== "string") {
            var error = new TypeError('The "id" argument must be a string');
            error.code = "ERR_INVALID_ARG_TYPE";
            throw error;
        }
        if (!hasOwn.call(builtinModules, id)) return undefined;
        var index = builtinModules[id],
            failure = linkError(index, objectCreate(null));
        if (failure !== undefined) throw new SyntaxError(failure);
        // Process already has a private lazy factory. Its CommonJS default does
        // not require allocating the ESM namespace's individual export getters.
        if (
            moduleTable[index].path === "node:process" &&
            typeof __nonaRegexpVm.processBuiltin === "function"
        )
            return __nonaRegexpVm.processBuiltin();
        evaluateModule(index);
        var namespace = moduleTable[index].namespace;
        return hasOwn.call(namespace, "default")
            ? namespace.default
            : namespace;
    };
    // The module records part (module-records.js) registers modules and
    // implements import() over these.
    __nonaRegexpVm.moduleCore = {
        table: moduleTable,
        paths: modulePaths,
        builtins: builtinModules,
        evaluate: evaluateModule,
        instantiate: instantiateModule,
        linkError: linkError,
        newPromiseState: newPromiseState,
        enqueue: enqueueCallback,
        settle: settle,
        resolve: resolveState,
        performThen: performThen,
        append: append,
    };
    // Dynamic async function constructors are part of the documented
    // eval/Function exception; they exist for reflection only.
    // An empty source needs no compiler: it yields a fresh anonymous function of that kind.
    var realmVm = Function.prototype.__nonaRealmVmInternal || function () {};
    var dynamicPrototypes = objectCreate(null);
    __nonaRegexpVm.dynamicPrototypes = dynamicPrototypes;
    function dynamicConstructor(name, prototype, makeEmpty) {
        dynamicPrototypes[name] = prototype;
        var constructor = function () {
            // ToString of every argument first (observable), then the exception.
            for (var i = 0, source = false; i < arguments.length; i++)
                if (("" + arguments[i]).trim() !== "") source = true;
            if (source)
                throw new EvalError(
                    "Nona compiles ahead of time: " +
                        name +
                        " needs source text known at compile time",
                );
            var fn = makeEmpty();
            define(fn, "name", "anonymous", false);
            if (new.target !== undefined && new.target !== constructor) {
                var proto = new.target.prototype;
                if (
                    proto !== null &&
                    (typeof proto === "object" || typeof proto === "function")
                )
                    Object.setPrototypeOf(fn, proto);
                // Otherwise the intrinsic prototype of new.target's realm.
                else {
                    var vm = realmVm(this),
                        prototypes = vm ? vm.dynamicPrototypes : undefined;
                    if (prototypes) Object.setPrototypeOf(fn, prototypes[name]);
                }
            }
            return fn;
        };
        define(constructor, "name", name, false);
        define(constructor, "length", 1, false);
        Object.defineProperty(constructor, "prototype", {
            value: prototype,
            writable: false,
            enumerable: false,
            configurable: false,
        });
        Object.setPrototypeOf(constructor, Function);
        define(prototype, "constructor", constructor, false);
        Function.prototype.__nonaMarkNativeInternal(constructor);
        return constructor;
    }
    var asyncFunctionPrototype = getPrototypeOf(async function () {});
    define(asyncFunctionPrototype, Symbol.toStringTag, "AsyncFunction", false);
    dynamicConstructor("AsyncFunction", asyncFunctionPrototype, function () {
        return async function () {};
    });
    var asyncGeneratorFunctionPrototype = getPrototypeOf(async function* () {});
    define(
        asyncGeneratorFunctionPrototype,
        Symbol.toStringTag,
        "AsyncGeneratorFunction",
        false,
    );
    define(
        asyncGeneratorFunctionPrototype,
        "prototype",
        asyncGeneratorPrototype,
        false,
    );
    define(
        asyncGeneratorPrototype,
        "constructor",
        asyncGeneratorFunctionPrototype,
        false,
    );
    dynamicConstructor(
        "AsyncGeneratorFunction",
        asyncGeneratorFunctionPrototype,
        function () {
            return async function* () {};
        },
    );
    var generatorFunctionPrototype = getPrototypeOf(function* () {});
    if (!hasOwn.call(generatorFunctionPrototype, "constructor"))
        dynamicConstructor(
            "GeneratorFunction",
            generatorFunctionPrototype,
            function () {
                return function* () {};
            },
        );
    if (!hasOwn.call(generatorFunctionPrototype, Symbol.toStringTag))
        define(
            generatorFunctionPrototype,
            Symbol.toStringTag,
            "GeneratorFunction",
            false,
        );
    // The timer prelude queues microtasks (queueMicrotask) on the same queue.
    __nonaRegexpVm.enqueueJob = enqueueCallback;
    __nonaRegexpVm.hasPendingPromiseJobs = function () {
        return (
            queueHead !== undefined ||
            handledLater.length > 0 ||
            unhandled.length > 0
        );
    };
    return drain;
})();
