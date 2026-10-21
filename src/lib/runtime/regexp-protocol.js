// RegExpExec (ES2020 21.2.5.2.1): a callable exec wins, otherwise the builtin one.
// regExpExecWith takes the exec that was already read from R.
__nonaRegexpVm.regExpExecWith = (function (builtinExec, apply) {
    return function (R, S, exec) {
        if (typeof exec === "function") {
            var result = apply(exec, R, S);
            if (
                result !== null &&
                typeof result !== "object" &&
                typeof result !== "function"
            )
                throw new TypeError(
                    "RegExp exec method returned something other than an Object or null",
                );
            return result;
        }
        return apply(builtinExec, R, S);
    };
})(
    RegExp.prototype.exec,
    Function.prototype.call.bind(Function.prototype.call),
);
__nonaRegexpVm.regExpExec = function (R, S) {
    return __nonaRegexpVm.regExpExecWith(R, S, R.exec);
};
// Whether exec, just read from R, is the builtin one and every later read
// of R.exec returns it without running user code (#389): R is a genuine
// RegExp (not a Proxy: the source getter throws for anything else) without
// an own exec, whose prototype is the original RegExp.prototype with its
// exec a data property. [Symbol.match] may then let the engine run the
// whole global loop.
__nonaRegexpVm.isBuiltinExec = (function (
    builtinExec,
    regexpPrototype,
    sourceGetter,
    getOwnPropertyDescriptor,
    getPrototypeOf,
    apply,
) {
    return function (R, exec) {
        if (exec !== builtinExec || R === regexpPrototype) return false;
        try {
            apply(sourceGetter, R);
        } catch (error) {
            return false;
        }
        if (getOwnPropertyDescriptor(R, "exec") !== undefined) return false;
        if (getPrototypeOf(R) !== regexpPrototype) return false;
        var own = getOwnPropertyDescriptor(regexpPrototype, "exec");
        return own !== undefined && own.value === builtinExec;
    };
})(
    RegExp.prototype.exec,
    RegExp.prototype,
    Object.getOwnPropertyDescriptor(RegExp.prototype, "source").get,
    Object.getOwnPropertyDescriptor,
    Object.getPrototypeOf,
    Function.prototype.call.bind(Function.prototype.call),
);
Object.defineProperty(RegExp.prototype, Symbol.match, {
    value: {
        [Symbol.match](string) {
            "use strict";
            if (typeof string === "symbol")
                throw new TypeError(
                    "Cannot convert a Symbol value to a string",
                );
            var input = String(string);
            var flags = String(this.flags);
            var global = flags.indexOf("g") >= 0,
                unicode = flags.indexOf("u") >= 0 || flags.indexOf("v") >= 0;
            if (!global) {
                var single = __nonaRegexpVm.regExpExec(this, input);
                if (
                    single !== null &&
                    typeof single !== "object" &&
                    typeof single !== "function"
                )
                    throw new TypeError("RegExp exec returned invalid result");
                return single;
            }
            this.lastIndex = 0;
            var matches = [],
                safe = __nonaRegexpVm,
                exec = this.exec,
                result;
            if (safe.isBuiltinExec(this, exec)) {
                // The engine collects the matched strings in one call of
                // the builtin exec when the expression's own flags agree;
                // otherwise that call was the first exec of the loop.
                safe.collect = unicode ? 2 : 1;
                safe.collected = false;
                try {
                    result = safe.safeCall(exec, this, input);
                } finally {
                    safe.collect = 0;
                }
                if (safe.collected) {
                    safe.collected = false;
                    return result;
                }
            } else result = safe.regExpExecWith(this, input, exec);
            while (true) {
                if (result === null)
                    return matches.length === 0 ? null : matches;
                if (typeof result !== "object" && typeof result !== "function")
                    throw new TypeError("RegExp exec returned invalid result");
                var value = String(result[0]);
                matches.push(value);
                if (value === "") {
                    var index = this.lastIndex;
                    if (unicode && index + 1 < input.length) {
                        var first = input.charCodeAt(index),
                            second = input.charCodeAt(index + 1);
                        this.lastIndex =
                            index +
                            (first >= 0xd800 &&
                            first <= 0xdbff &&
                            second >= 0xdc00 &&
                            second <= 0xdfff
                                ? 2
                                : 1);
                    } else this.lastIndex = index + 1;
                }
                result = safe.regExpExec(this, input);
            }
        },
    }[Symbol.match],
    writable: true,
    configurable: true,
});
Object.defineProperty(RegExp.prototype[Symbol.match], "name", {
    value: "[Symbol.match]",
    configurable: true,
});
Object.defineProperty(String.prototype, "match", {
    value: {
        match(regexp) {
            "use strict";
            if (this === null || this === undefined)
                throw new TypeError(
                    "String.prototype.match called on null or undefined",
                );
            if (
                regexp !== null &&
                (typeof regexp === "object" || typeof regexp === "function")
            ) {
                var matcher = regexp[Symbol.match];
                if (matcher !== null && matcher !== undefined) {
                    if (typeof matcher !== "function")
                        throw new TypeError("Symbol.match is not callable");
                    return matcher.call(regexp, this);
                }
            }
            var string = String(this),
                rx = new RegExp(regexp);
            return rx[Symbol.match](string);
        },
    }.match,
    writable: true,
    configurable: true,
});
Object.defineProperty(String.prototype.match, "name", {
    value: "match",
    configurable: true,
});
Object.defineProperty(RegExp.prototype, Symbol.search, {
    value: {
        [Symbol.search](string) {
            "use strict";
            if (this === null || this === undefined)
                throw new TypeError("Invalid RegExp receiver");
            if (typeof string === "symbol")
                throw new TypeError(
                    "Cannot convert a Symbol value to a string",
                );
            var input = String(string),
                previous = this.lastIndex;
            if (!Object.is(previous, 0)) this.lastIndex = 0;
            var result = __nonaRegexpVm.regExpExec(this, input);
            if (
                result !== null &&
                typeof result !== "object" &&
                typeof result !== "function"
            )
                throw new TypeError("RegExp exec returned invalid result");
            if (!Object.is(this.lastIndex, previous)) this.lastIndex = previous;
            return result === null ? -1 : result.index;
        },
    }[Symbol.search],
    writable: true,
    configurable: true,
});
Object.defineProperty(String.prototype, "search", {
    value: {
        search(regexp) {
            "use strict";
            if (this === null || this === undefined)
                throw new TypeError(
                    "String.prototype.search called on null or undefined",
                );
            if (
                regexp !== null &&
                (typeof regexp === "object" || typeof regexp === "function")
            ) {
                var searcher = regexp[Symbol.search];
                if (searcher !== null && searcher !== undefined) {
                    if (typeof searcher !== "function")
                        throw new TypeError("Symbol.search is not callable");
                    return searcher.call(regexp, this);
                }
            }
            var string = String(this),
                rx = new RegExp(regexp);
            return rx[Symbol.search](string);
        },
    }.search,
    writable: true,
    configurable: true,
});
Object.defineProperty(RegExp.prototype, Symbol.replace, {
    value: {
        [Symbol.replace](string, replaceValue) {
            "use strict";
            var safe = __nonaRegexpVm;
            if (this === null || this === undefined)
                throw new TypeError("Invalid RegExp receiver");
            if (typeof string === "symbol")
                throw new TypeError(
                    "Cannot convert a Symbol value to a string",
                );
            var input = String(string),
                functional = typeof replaceValue === "function";
            var replacement = undefined;
            if (!functional) {
                if (typeof replaceValue === "symbol")
                    throw new TypeError(
                        "Cannot convert a Symbol value to a string",
                    );
                replacement = String(replaceValue);
            }
            var flags = String(this.flags);
            var global = Boolean(this.global),
                unicode =
                    global &&
                    (flags.indexOf("u") >= 0 || flags.indexOf("v") >= 0);
            if (global) this.lastIndex = 0;
            // A replacement without $ is used as it is, not expanded per match (#387).
            var literal =
                !functional &&
                safe.replaceIndexOf.call(replacement, "$", 0) < 0;
            var results = [];
            while (true) {
                var result = __nonaRegexpVm.regExpExec(this, input);
                if (result === null) break;
                if (typeof result !== "object" && typeof result !== "function")
                    throw new TypeError("RegExp exec returned invalid result");
                Object.defineProperty(results, results.length, {
                    value: result,
                    writable: true,
                    enumerable: true,
                    configurable: true,
                });
                if (!global) break;
                var matched = String(result[0]);
                if (matched === "") {
                    var index = Number(this.lastIndex);
                    if (index !== index || index < 0) index = 0;
                    else if (index > 9007199254740991) index = 9007199254740991;
                    else index = Math.floor(index);
                    if (unicode && index + 1 < input.length) {
                        var first = safe.replaceCharCodeAt.call(input, index),
                            second = safe.replaceCharCodeAt.call(
                                input,
                                index + 1,
                            );
                        this.lastIndex =
                            index +
                            (first >= 0xd800 &&
                            first <= 0xdbff &&
                            second >= 0xdc00 &&
                            second <= 0xdfff
                                ? 2
                                : 1);
                    } else this.lastIndex = index + 1;
                }
            }
            // The result is joined from its pieces once: appending to one string
            // copied it for every match (quadratic in the number of matches).
            var pieces = [],
                nextSourcePosition = 0;
            for (var i = 0; i < results.length; i++) {
                var item = results[i],
                    match = String(item[0]),
                    position = Number(item.index);
                if (position !== position || position < 0) position = 0;
                else if (position > input.length) position = input.length;
                else position = Math.floor(position);
                var captures = [],
                    length = Number(item.length);
                if (length !== length || length < 0) length = 0;
                else length = Math.floor(length);
                for (var j = 1; j < length; j++) {
                    var capture = item[j];
                    if (capture !== undefined) {
                        if (typeof capture === "symbol")
                            throw new TypeError(
                                "Cannot convert a Symbol value to a string",
                            );
                        capture = String(capture);
                    }
                    Object.defineProperty(captures, captures.length, {
                        value: capture,
                        writable: true,
                        enumerable: true,
                        configurable: true,
                    });
                }
                var groups = item.groups,
                    value = "";
                if (!functional && groups === null)
                    throw new TypeError("Invalid named capture groups");
                if (functional) {
                    var args = [match];
                    for (var j = 0; j < captures.length; j++)
                        Object.defineProperty(args, args.length, {
                            value: captures[j],
                            writable: true,
                            enumerable: true,
                            configurable: true,
                        });
                    Object.defineProperty(args, args.length, {
                        value: position,
                        writable: true,
                        enumerable: true,
                        configurable: true,
                    });
                    Object.defineProperty(args, args.length, {
                        value: input,
                        writable: true,
                        enumerable: true,
                        configurable: true,
                    });
                    if (groups !== undefined)
                        Object.defineProperty(args, args.length, {
                            value: groups,
                            writable: true,
                            enumerable: true,
                            configurable: true,
                        });
                    value = String(
                        safe.replaceApply.call(replaceValue, undefined, args),
                    );
                } else if (literal) value = replacement;
                else {
                    for (var j = 0; j < replacement.length; j++) {
                        var c = replacement[j];
                        if (c !== "$" || j + 1 >= replacement.length) {
                            value += c;
                            continue;
                        }
                        var next = replacement[j + 1];
                        if (next === "$") {
                            value += "$";
                            j++;
                            continue;
                        }
                        if (next === "&") {
                            value += match;
                            j++;
                            continue;
                        }
                        if (safe.replaceCharCodeAt.call(next, 0) === 96) {
                            value += safe.replaceSlice.call(input, 0, position);
                            j++;
                            continue;
                        }
                        if (next === "'") {
                            value += safe.replaceSlice.call(
                                input,
                                position + match.length,
                            );
                            j++;
                            continue;
                        }
                        if (next === "<" && groups !== undefined) {
                            var end = safe.replaceIndexOf.call(
                                replacement,
                                ">",
                                j + 2,
                            );
                            if (end >= 0) {
                                var named =
                                    groups[
                                        safe.replaceSlice.call(
                                            replacement,
                                            j + 2,
                                            end,
                                        )
                                    ];
                                if (named !== undefined) value += String(named);
                                j = end;
                                continue;
                            }
                        }
                        var digit = safe.replaceCharCodeAt.call(next, 0) - 48;
                        if (digit >= 0 && digit <= 9) {
                            var number = digit,
                                used = 1;
                            if (j + 2 < replacement.length) {
                                var secondDigit =
                                    safe.replaceCharCodeAt.call(
                                        replacement,
                                        j + 2,
                                    ) - 48;
                                if (
                                    secondDigit >= 0 &&
                                    secondDigit <= 9 &&
                                    digit * 10 + secondDigit <= captures.length
                                ) {
                                    number = digit * 10 + secondDigit;
                                    used = 2;
                                }
                            }
                            if (number > 0 && number <= captures.length) {
                                var capture = captures[number - 1];
                                if (capture !== undefined)
                                    value += String(capture);
                                j += used;
                                continue;
                            }
                        }
                        value += "$";
                    }
                }
                if (position >= nextSourcePosition) {
                    Object.defineProperty(pieces, pieces.length, {
                        value: safe.replaceSlice.call(
                            input,
                            nextSourcePosition,
                            position,
                        ),
                        writable: true,
                        enumerable: true,
                        configurable: true,
                    });
                    Object.defineProperty(pieces, pieces.length, {
                        value: value,
                        writable: true,
                        enumerable: true,
                        configurable: true,
                    });
                    nextSourcePosition = position + match.length;
                }
            }
            Object.defineProperty(pieces, pieces.length, {
                value: safe.replaceSlice.call(input, nextSourcePosition),
                writable: true,
                enumerable: true,
                configurable: true,
            });
            return safe.replaceJoin.call(pieces, "");
        },
    }[Symbol.replace],
    writable: true,
    configurable: true,
});
Object.defineProperty(RegExp.prototype, Symbol.split, {
    value: {
        [Symbol.split](string, limit) {
            "use strict";
            if (
                this === null ||
                (typeof this !== "object" && typeof this !== "function")
            )
                throw new TypeError("Invalid RegExp receiver");
            if (typeof string === "symbol")
                throw new TypeError(
                    "Cannot convert a Symbol value to a string",
                );
            var input = String(string);
            var ctor = this.constructor,
                species;
            if (ctor === undefined) species = RegExp;
            else {
                if (
                    ctor === null ||
                    (typeof ctor !== "object" && typeof ctor !== "function")
                )
                    throw new TypeError("Invalid RegExp constructor");
                species = ctor[Symbol.species];
                if (species === null || species === undefined) species = RegExp;
            }
            var flagValue = this.flags;
            if (typeof flagValue === "symbol")
                throw new TypeError(
                    "Cannot convert a Symbol value to a string",
                );
            var flags = String(flagValue),
                unicode = flags.indexOf("u") >= 0 || flags.indexOf("v") >= 0;
            var stickyFlags = flags.indexOf("y") >= 0 ? flags : flags + "y";
            var splitter = new species(this, stickyFlags);
            var length = input.length,
                result = [],
                max = limit === undefined ? 4294967295 : limit >>> 0;
            if (max === 0) return result;
            if (length === 0) {
                if (__nonaRegexpVm.regExpExec(splitter, input) !== null)
                    return result;
                result[0] = input;
                return result;
            }
            var p = 0,
                q = 0;
            while (q < length) {
                splitter.lastIndex = q;
                var match = __nonaRegexpVm.regExpExec(splitter, input);
                if (match === null) {
                    var step = 1;
                    if (unicode && q + 1 < length) {
                        var first = input.charCodeAt(q),
                            second = input.charCodeAt(q + 1);
                        if (
                            first >= 0xd800 &&
                            first <= 0xdbff &&
                            second >= 0xdc00 &&
                            second <= 0xdfff
                        )
                            step = 2;
                    }
                    q += step;
                    continue;
                }
                if (typeof match !== "object" && typeof match !== "function")
                    throw new TypeError("RegExp exec returned invalid result");
                var e = Number(splitter.lastIndex);
                if (e !== e || e < 0) e = 0;
                else if (e > 9007199254740991) e = 9007199254740991;
                else e = Math.floor(e);
                if (e > length) e = length;
                if (e === p) {
                    var step = 1;
                    if (unicode && q + 1 < length) {
                        var first = input.charCodeAt(q),
                            second = input.charCodeAt(q + 1);
                        if (
                            first >= 0xd800 &&
                            first <= 0xdbff &&
                            second >= 0xdc00 &&
                            second <= 0xdfff
                        )
                            step = 2;
                    }
                    q += step;
                    continue;
                }
                result[result.length] = input.slice(p, q);
                if (result.length === max) return result;
                p = e;
                var captures = Number(match.length);
                if (captures !== captures || captures < 0) captures = 0;
                else captures = Math.floor(captures);
                for (var i = 1; i < captures; i++) {
                    result[result.length] = match[i];
                    if (result.length === max) return result;
                }
                q = p;
            }
            result[result.length] = input.slice(p, length);
            return result;
        },
    }[Symbol.split],
    writable: true,
    configurable: true,
});
__nonaRegexpVm.matchAllPrototype = Object.create(
    Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]())),
);
(function () {
    var matchAllSlots = new WeakMap();
    Object.defineProperty(__nonaRegexpVm.matchAllPrototype, "next", {
        value: {
            next() {
                "use strict";
                var slots = matchAllSlots.get(this);
                if (slots === undefined)
                    throw new TypeError("Invalid RegExp String Iterator");
                if (slots.done) return { value: undefined, done: true };
                var matcher = slots.matcher,
                    input = slots.input;
                var result = __nonaRegexpVm.regExpExec(matcher, input);
                if (result === null) {
                    slots.done = true;
                    return { value: undefined, done: true };
                }
                if (typeof result !== "object" && typeof result !== "function")
                    throw new TypeError("RegExp exec returned invalid result");
                if (!slots.global) slots.done = true;
                else if (String(result[0]) === "") {
                    var index = Number(matcher.lastIndex);
                    if (index !== index || index < 0) index = 0;
                    else if (index > 9007199254740991) index = 9007199254740991;
                    else index = Math.floor(index);
                    if (slots.unicode && index + 1 < input.length) {
                        var first = input.charCodeAt(index),
                            second = input.charCodeAt(index + 1);
                        matcher.lastIndex =
                            index +
                            (first >= 0xd800 &&
                            first <= 0xdbff &&
                            second >= 0xdc00 &&
                            second <= 0xdfff
                                ? 2
                                : 1);
                    } else matcher.lastIndex = index + 1;
                }
                return { value: result, done: false };
            },
        }.next,
        writable: true,
        configurable: true,
    });
    Object.defineProperty(__nonaRegexpVm.matchAllPrototype, Symbol.iterator, {
        value: {
            [Symbol.iterator]() {
                return this;
            },
        }[Symbol.iterator],
        writable: true,
        configurable: true,
    });
    Object.defineProperty(
        __nonaRegexpVm.matchAllPrototype,
        Symbol.toStringTag,
        { value: "RegExp String Iterator", configurable: true },
    );
    Object.defineProperty(RegExp.prototype, Symbol.matchAll, {
        value: {
            [Symbol.matchAll](string) {
                "use strict";
                if (
                    this === null ||
                    (typeof this !== "object" && typeof this !== "function")
                )
                    throw new TypeError("Invalid RegExp receiver");
                if (typeof string === "symbol")
                    throw new TypeError(
                        "Cannot convert a Symbol value to a string",
                    );
                var input = String(string),
                    ctor = this.constructor,
                    species;
                if (ctor === undefined) species = RegExp;
                else {
                    if (
                        ctor === null ||
                        (typeof ctor !== "object" && typeof ctor !== "function")
                    )
                        throw new TypeError("Invalid RegExp constructor");
                    species = ctor[Symbol.species];
                    if (species === null || species === undefined)
                        species = RegExp;
                }
                var flagValue = this.flags;
                if (typeof flagValue === "symbol")
                    throw new TypeError(
                        "Cannot convert a Symbol value to a string",
                    );
                var flags = String(flagValue),
                    matcher = new species(this, flags);
                var index = Number(this.lastIndex);
                if (index !== index || index < 0) index = 0;
                else if (index > 9007199254740991) index = 9007199254740991;
                else index = Math.floor(index);
                matcher.lastIndex = index;
                var iterator = Object.create(__nonaRegexpVm.matchAllPrototype);
                matchAllSlots.set(iterator, {
                    matcher: matcher,
                    input: input,
                    global: flags.indexOf("g") >= 0,
                    unicode: flags.indexOf("u") >= 0 || flags.indexOf("v") >= 0,
                    done: false,
                });
                return iterator;
            },
        }[Symbol.matchAll],
        writable: true,
        configurable: true,
    });
})();
Object.defineProperty(String.prototype, "matchAll", {
    value: {
        matchAll(regexp) {
            "use strict";
            if (this === null || this === undefined)
                throw new TypeError(
                    "String.prototype.matchAll called on null or undefined",
                );
            if (
                regexp !== null &&
                (typeof regexp === "object" || typeof regexp === "function")
            ) {
                var marker = regexp[Symbol.match],
                    isRegExp =
                        marker === undefined
                            ? regexp instanceof RegExp
                            : Boolean(marker);
                if (isRegExp) {
                    var flags = String(regexp.flags);
                    if (flags.indexOf("g") < 0)
                        throw new TypeError("RegExp must have global flag");
                }
                var method = regexp[Symbol.matchAll];
                if (method !== null && method !== undefined) {
                    if (typeof method !== "function")
                        throw new TypeError("Symbol.matchAll is not callable");
                    return method.call(regexp, this);
                }
            }
            var input = String(this),
                rx = new RegExp(regexp, "g");
            return rx[Symbol.matchAll](input);
        },
    }.matchAll,
    writable: true,
    configurable: true,
});
Object.defineProperty(String.prototype, "replaceAll", {
    value: {
        replaceAll(searchValue, replaceValue) {
            "use strict";
            if (this === null || this === undefined)
                throw new TypeError(
                    "String.prototype.replaceAll called on null or undefined",
                );
            if (
                searchValue !== null &&
                (typeof searchValue === "object" ||
                    typeof searchValue === "function")
            ) {
                var marker = searchValue[Symbol.match],
                    isRegExp =
                        marker === undefined
                            ? searchValue instanceof RegExp
                            : Boolean(marker);
                if (isRegExp) {
                    var flags = String(searchValue.flags);
                    if (flags.indexOf("g") < 0)
                        throw new TypeError("RegExp must have global flag");
                }
                var hook = searchValue[Symbol.replace];
                if (hook !== null && hook !== undefined) {
                    if (typeof hook !== "function")
                        throw new TypeError("Symbol.replace is not callable");
                    return hook.call(searchValue, this, replaceValue);
                }
            }
            var input = String(this);
            if (typeof searchValue === "symbol")
                throw new TypeError(
                    "Cannot convert a Symbol value to a string",
                );
            var search = String(searchValue),
                functional = typeof replaceValue === "function",
                replacement = "";
            if (!functional) {
                if (typeof replaceValue === "symbol")
                    throw new TypeError(
                        "Cannot convert a Symbol value to a string",
                    );
                replacement = String(replaceValue);
            }
            var safe = __nonaRegexpVm,
                pieces = [],
                parts = null,
                constant = "";
            var add = function (list, piece) {
                Object.defineProperty(list, list.length, {
                    value: piece,
                    writable: true,
                    enumerable: true,
                    configurable: true,
                });
            };
            if (!functional) {
                // The replacement is expanded once (#387): for a string search
                // only the prefix and suffix patterns depend on the match. parts then
                // alternates the constant pieces with 1 (prefix) and 2 (suffix).
                var from = 0,
                    at = safe.replaceIndexOf.call(replacement, "$", 0);
                while (at >= 0 && at + 1 < replacement.length) {
                    constant += safe.replaceSlice.call(replacement, from, at);
                    var next = safe.replaceCharCodeAt.call(replacement, at + 1);
                    from = at + 2;
                    if (next === 36) constant += "$";
                    else if (next === 38) constant += search;
                    else if (next === 96 || next === 39) {
                        if (parts === null) parts = [];
                        add(parts, constant);
                        add(parts, next === 96 ? 1 : 2);
                        constant = "";
                    } else {
                        constant += "$";
                        from = at + 1;
                    }
                    at = safe.replaceIndexOf.call(replacement, "$", from);
                }
                constant += safe.replaceSlice.call(replacement, from);
                // A literal replacement of a non-empty search: one native scan
                // and one copy into a result of the final length.
                if (
                    parts === null &&
                    search.length > 0 &&
                    safe.replaceAllUnits !== null
                )
                    return safe.replaceAllUnits(input, search, constant);
            }
            var end = 0,
                position = safe.replaceIndexOf.call(input, search, 0);
            while (position >= 0) {
                add(pieces, safe.replaceSlice.call(input, end, position));
                var value = constant;
                if (functional)
                    value = String(replaceValue(search, position, input));
                else if (parts !== null) {
                    value = "";
                    for (var i = 0; i < parts.length; i++) {
                        var part = parts[i];
                        if (part === 1)
                            value += safe.replaceSlice.call(input, 0, position);
                        else if (part === 2)
                            value += safe.replaceSlice.call(
                                input,
                                position + search.length,
                            );
                        else value += part;
                    }
                    value += constant;
                }
                add(pieces, value);
                end = position + search.length;
                var nextPosition =
                    position + (search.length === 0 ? 1 : search.length);
                position =
                    nextPosition > input.length
                        ? -1
                        : safe.replaceIndexOf.call(input, search, nextPosition);
            }
            add(pieces, safe.replaceSlice.call(input, end));
            return __nonaRegexpVm.replaceJoin.call(pieces, "");
        },
    }.replaceAll,
    writable: true,
    configurable: true,
});
__nonaRegexpVm.replaceSlice = String.prototype.slice;
__nonaRegexpVm.replaceIndexOf = String.prototype.indexOf;
__nonaRegexpVm.replaceCharCodeAt = String.prototype.charCodeAt;
__nonaRegexpVm.replaceJoin = Array.prototype.join;
// The native literal replaceAll (#387): a host global wherever this prelude is.
__nonaRegexpVm.replaceAllUnits =
    typeof __nonaReplaceAllInternal === "function"
        ? __nonaReplaceAllInternal
        : null;
delete globalThis.__nonaReplaceAllInternal;
__nonaRegexpVm.positionArrayConstructor = Uint32Array;
__nonaRegexpVm.byteArrayConstructor = Uint8Array;
__nonaRegexpVm.byteArrayFill = Uint8Array.prototype.fill;
Function.prototype.__nonaMarkNativeInternal(RegExp.prototype[Symbol.match]);
Function.prototype.__nonaMarkNativeInternal(
    Object.getOwnPropertyDescriptor(RegExp, Symbol.species).get,
);
