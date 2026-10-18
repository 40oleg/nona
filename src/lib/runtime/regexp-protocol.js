// RegExpExec (ES2020 21.2.5.2.1): a callable exec wins, otherwise the builtin one.
__nonaRegexpVm.regExpExec = (function (builtinExec, apply) {
    return function (R, S) {
        var exec = R.exec;
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
            var matches = [];
            while (true) {
                var result = __nonaRegexpVm.regExpExec(this, input);
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
                } else {
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
            var pieces = [],
                end = 0,
                position = input.indexOf(search, 0);
            var add = function (piece) {
                Object.defineProperty(pieces, pieces.length, {
                    value: piece,
                    writable: true,
                    enumerable: true,
                    configurable: true,
                });
            };
            while (position >= 0) {
                add(input.slice(end, position));
                var value = "";
                if (functional)
                    value = String(replaceValue(search, position, input));
                else {
                    for (var i = 0; i < replacement.length; i++) {
                        var c = replacement[i];
                        if (c !== "$" || i + 1 >= replacement.length) {
                            value += c;
                            continue;
                        }
                        var next = replacement[i + 1];
                        if (next === "$") {
                            value += "$";
                            i++;
                            continue;
                        }
                        if (next === "&") {
                            value += search;
                            i++;
                            continue;
                        }
                        if (next.charCodeAt(0) === 96) {
                            value += input.slice(0, position);
                            i++;
                            continue;
                        }
                        if (next === "'") {
                            value += input.slice(position + search.length);
                            i++;
                            continue;
                        }
                        value += "$";
                    }
                }
                add(value);
                end = position + search.length;
                var nextPosition =
                    position + (search.length === 0 ? 1 : search.length);
                position =
                    nextPosition > input.length
                        ? -1
                        : input.indexOf(search, nextPosition);
            }
            add(input.slice(end));
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
__nonaRegexpVm.positionArrayConstructor = Uint32Array;
__nonaRegexpVm.byteArrayConstructor = Uint8Array;
__nonaRegexpVm.byteArrayFill = Uint8Array.prototype.fill;
Function.prototype.__nonaMarkNativeInternal(RegExp.prototype[Symbol.match]);
Function.prototype.__nonaMarkNativeInternal(
    Object.getOwnPropertyDescriptor(RegExp, Symbol.species).get,
);
