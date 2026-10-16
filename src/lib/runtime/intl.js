// Intl (ECMA-402) for the en locale (#300): Nona's own implementation, without
// ICU and without data for other locales. en and en-US are the available
// locales; any other request resolves to the default locale en-US, and
// resolvedOptions().locale reports that fallback. The formats and the
// collation order follow ICU's en data as Node.js uses it. DateTimeFormat
// knows the Gregorian calendar, UTC (Nona's local time zone) and fixed UTC
// offsets. Constructors and most intrinsics are captured while the prelude
// runs; the hot paths call string methods directly, like the other preludes.
(function () {
    "use strict";
    var defineProperty = Object.defineProperty,
        objectCreate = Object.create,
        getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor,
        // Absent when the prelude is evaluated by Node.js in source tests.
        markNative =
            Function.prototype.__nonaMarkNativeInternal || function () {},
        call = Function.prototype.call.bind(Function.prototype.call);
    var TypeErrorConstructor = TypeError,
        RangeErrorConstructor = RangeError,
        StringConstructor = String,
        ObjectConstructor = Object,
        ObjectPrototype = Object.prototype,
        mathFloor = Math.floor,
        toPrimitiveSymbol = Symbol.toPrimitive,
        toStringTagSymbol = Symbol.toStringTag;
    var WeakMapConstructor = WeakMap,
        weakMapGet = WeakMap.prototype.get,
        weakMapSet = WeakMap.prototype.set;
    var fromCharCode = String.fromCharCode,
        StringPrototype = String.prototype,
        stringIndexOf = StringPrototype.indexOf,
        stringLastIndexOf = StringPrototype.lastIndexOf,
        stringTrim = StringPrototype.trim,
        stringNormalize = StringPrototype.normalize,
        numberValueOf = Number.prototype.valueOf,
        hasOwnProperty = ObjectPrototype.hasOwnProperty,
        DatePrototype = Date.prototype,
        dateGetTime = DatePrototype.getTime,
        dateNow = Date.now,
        bigintValueOf =
            typeof BigInt === "function" ? BigInt.prototype.valueOf : undefined;

    // ---- Helpers --------------------------------------------------------

    function setFunction(fn, name, length) {
        defineProperty(fn, "name", { value: name, configurable: true });
        defineProperty(fn, "length", { value: length, configurable: true });
        markNative(fn);
        return fn;
    }
    function method(object, name, length, fn) {
        setFunction(fn, name, length);
        defineProperty(object, name, {
            value: fn,
            writable: true,
            enumerable: false,
            configurable: true,
        });
    }
    function getter(object, name, fn) {
        markNative(fn);
        defineProperty(object, name, {
            get: fn,
            enumerable: false,
            configurable: true,
        });
    }
    function isObject(value) {
        return (
            value !== null &&
            (typeof value === "object" || typeof value === "function")
        );
    }
    function toStr(value) {
        if (typeof value === "symbol")
            throw new TypeErrorConstructor(
                "Cannot convert a Symbol value to a string",
            );
        return StringConstructor(value);
    }
    function toObject(value) {
        if (value === undefined || value === null)
            throw new TypeErrorConstructor(
                "Cannot convert undefined or null to object",
            );
        return ObjectConstructor(value);
    }
    // Hot paths call the string methods directly, like the other preludes.
    function slice(text, start, end) {
        return end === undefined ? text.slice(start) : text.slice(start, end);
    }
    function code(text, index) {
        return text.charCodeAt(index);
    }
    function lower(text) {
        return text.toLowerCase();
    }
    function upper(text) {
        return text.toUpperCase();
    }
    // ASCII lowercase: language tags and option values ignore other letters.
    function asciiLower(text) {
        var result = "";
        for (var i = 0; i < text.length; i++) {
            var c = code(text, i);
            result += c >= 65 && c <= 90 ? fromCharCode(c + 32) : text[i];
        }
        return result;
    }
    function push(list, value) {
        list[list.length] = value;
    }
    function contains(list, value) {
        for (var i = 0; i < list.length; i++)
            if (list[i] === value) return true;
        return false;
    }
    function split(text, separator) {
        var parts = [],
            start = 0;
        for (var i = 0; i < text.length; i++)
            if (text[i] === separator) {
                push(parts, slice(text, start, i));
                start = i + 1;
            }
        push(parts, slice(text, start));
        return parts;
    }
    function join(list, separator) {
        var text = "";
        for (var i = 0; i < list.length; i++)
            text += (i ? separator : "") + list[i];
        return text;
    }
    function sortStrings(list) {
        for (var i = 1; i < list.length; i++)
            for (var j = i; j > 0 && list[j - 1] > list[j]; j--) {
                var swap = list[j];
                list[j] = list[j - 1];
                list[j - 1] = swap;
            }
        return list;
    }
    function zeros(count) {
        var text = "";
        while (text.length < count) text += "0";
        return text;
    }
    function copyArray(list) {
        var result = [];
        for (var i = 0; i < list.length; i++) push(result, list[i]);
        return result;
    }
    function dataProperty(object, name, value) {
        defineProperty(object, name, {
            value: value,
            writable: true,
            enumerable: true,
            configurable: true,
        });
    }
    // Internal slots live in weak maps keyed by the Intl objects.
    function slotsOf(map, object, name) {
        var slots = isObject(object)
            ? call(weakMapGet, map, object)
            : undefined;
        if (slots === undefined)
            throw new TypeErrorConstructor(
                "Method " + name + " called on incompatible receiver",
            );
        return slots;
    }
    // OrdinaryCreateFromConstructor (ES2024 10.1.13).
    function createFrom(newTarget, fallback) {
        var proto = newTarget.prototype;
        return objectCreate(isObject(proto) ? proto : fallback);
    }
    function installConstructor(name, constructor, proto, tag) {
        setFunction(constructor, name, 0);
        defineProperty(constructor, "prototype", {
            value: proto,
            writable: false,
            enumerable: false,
            configurable: false,
        });
        defineProperty(proto, "constructor", {
            value: constructor,
            writable: true,
            enumerable: false,
            configurable: true,
        });
        defineProperty(proto, toStringTagSymbol, {
            value: tag,
            writable: false,
            enumerable: false,
            configurable: true,
        });
    }

    // ---- Language tags (ECMA-402 6.2, UTS 35 unicode_locale_id) ----------

    function isAlpha(text) {
        for (var i = 0; i < text.length; i++) {
            var c = code(text, i);
            if (c < 97 || c > 122) return false;
        }
        return true;
    }
    function isDigits(text) {
        for (var i = 0; i < text.length; i++) {
            var c = code(text, i);
            if (c < 48 || c > 57) return false;
        }
        return true;
    }
    function isAlnum(text, min, max) {
        if (text.length < min || text.length > max) return false;
        for (var i = 0; i < text.length; i++) {
            var c = code(text, i);
            if ((c < 97 || c > 122) && (c < 48 || c > 57)) return false;
        }
        return true;
    }
    function isLanguage(text) {
        var n = text.length;
        return isAlpha(text) && (n === 2 || n === 3 || (n >= 5 && n <= 8));
    }
    function isScript(text) {
        return text.length === 4 && isAlpha(text);
    }
    function isRegion(text) {
        return (
            (text.length === 2 && isAlpha(text)) ||
            (text.length === 3 && isDigits(text))
        );
    }
    function isVariant(text) {
        return (
            isAlnum(text, 5, 8) ||
            (isAlnum(text, 4, 4) && isDigits(slice(text, 0, 1)))
        );
    }
    // The type nonterminal of a Unicode extension value: (3*8alphanum)(-3*8alphanum)*.
    function isUnicodeType(text) {
        var parts = split(asciiLower(text), "-");
        for (var i = 0; i < parts.length; i++)
            if (!isAlnum(parts[i], 3, 8)) return false;
        return true;
    }
    var languageAliases = {
        iw: "he",
        in: "id",
        ji: "yi",
        jw: "jv",
        mo: "ro",
        tl: "fil",
        sh: "sr",
    };
    // Parses a unicode_language_id at parts[index] (in a transformed
    // extension too): { end, text } or undefined.
    function languageId(parts, index, casing) {
        var language = parts[index];
        if (index >= parts.length || !isLanguage(language)) return undefined;
        var i = index + 1,
            script,
            region,
            variants = [];
        if (i < parts.length && isScript(parts[i])) script = parts[i++];
        if (i < parts.length && isRegion(parts[i])) region = parts[i++];
        while (i < parts.length && isVariant(parts[i])) {
            if (contains(variants, parts[i])) return undefined;
            push(variants, parts[i++]);
        }
        if (casing) {
            var alias = languageAliases[language];
            if (typeof alias === "string") {
                if (language === "sh" && script === undefined) script = "latn";
                language = alias;
            }
            if (script !== undefined)
                script = upper(slice(script, 0, 1)) + slice(script, 1);
            if (region !== undefined) region = upper(region);
        }
        var text = language;
        if (script !== undefined) text += "-" + script;
        if (region !== undefined) text += "-" + region;
        sortStrings(variants);
        for (var k = 0; k < variants.length; k++) text += "-" + variants[k];
        return { end: i, text: text };
    }
    function unicodeExtension(parts, i) {
        var text = "u",
            found = false;
        while (i < parts.length && isAlnum(parts[i], 3, 8)) {
            text += "-" + parts[i++];
            found = true;
        }
        var keys = [],
            keywords = objectCreate(null);
        while (
            i < parts.length &&
            parts[i].length === 2 &&
            isAlpha(slice(parts[i], 1))
        ) {
            var key = parts[i++],
                types = [];
            while (i < parts.length && isAlnum(parts[i], 3, 8))
                push(types, parts[i++]);
            var value = join(types, "-");
            if (value === "true") value = "";
            if (!contains(keys, key)) {
                push(keys, key);
                keywords[key] = value;
            }
            found = true;
        }
        if (!found) return undefined;
        sortStrings(keys);
        for (var k = 0; k < keys.length; k++) {
            text += "-" + keys[k];
            if (keywords[keys[k]] !== "") text += "-" + keywords[keys[k]];
        }
        return { end: i, text: text };
    }
    function transformedExtension(parts, i) {
        var text = "t",
            found = false,
            tlang = languageId(parts, i, false);
        if (tlang !== undefined) {
            text += "-" + tlang.text;
            i = tlang.end;
            found = true;
        }
        var fields = [];
        while (
            i < parts.length &&
            parts[i].length === 2 &&
            isAlpha(slice(parts[i], 0, 1)) &&
            isDigits(slice(parts[i], 1))
        ) {
            var field = parts[i++],
                values = 0;
            while (i < parts.length && isAlnum(parts[i], 3, 8)) {
                field += "-" + parts[i++];
                values++;
            }
            if (!values) return undefined;
            push(fields, field);
            found = true;
        }
        if (!found) return undefined;
        sortStrings(fields);
        for (var k = 0; k < fields.length; k++) text += "-" + fields[k];
        return { end: i, text: text };
    }
    // IsStructurallyValidLanguageTag and CanonicalizeUnicodeLocaleId: the
    // canonical tag or undefined. Only a few language aliases are replaced.
    function canonicalizeTag(tag) {
        var parts = split(asciiLower(tag), "-");
        for (var k = 0; k < parts.length; k++)
            if (!isAlnum(parts[k], 1, 8)) return undefined;
        var id = languageId(parts, 0, true);
        if (id === undefined) return undefined;
        var i = id.end,
            extensions = [],
            singletons = "";
        while (i < parts.length && parts[i].length === 1 && parts[i] !== "x") {
            var singleton = parts[i++],
                extension;
            if (call(stringIndexOf, singletons, singleton) >= 0)
                return undefined;
            singletons += singleton;
            if (singleton === "u") extension = unicodeExtension(parts, i);
            else if (singleton === "t")
                extension = transformedExtension(parts, i);
            else {
                var other = singleton;
                while (i < parts.length && isAlnum(parts[i], 2, 8))
                    other += "-" + parts[i++];
                extension =
                    other.length > 1 ? { end: i, text: other } : undefined;
            }
            if (extension === undefined) return undefined;
            i = extension.end;
            push(extensions, extension.text);
        }
        sortStrings(extensions);
        var text = id.text;
        for (var e = 0; e < extensions.length; e++) text += "-" + extensions[e];
        if (i < parts.length && parts[i] === "x") {
            if (++i >= parts.length) return undefined;
            text += "-x";
            while (i < parts.length) text += "-" + parts[i++];
        }
        return i === parts.length ? text : undefined;
    }
    // CanonicalizeLocaleList (ECMA-402 9.2.1).
    function canonicalizeLocaleList(locales) {
        var seen = [];
        if (locales === undefined) return seen;
        var O = typeof locales === "string" ? [locales] : toObject(locales);
        var length = +O.length;
        length =
            length !== length || length <= 0
                ? 0
                : length > 9007199254740991
                  ? 9007199254740991
                  : mathFloor(length);
        for (var k = 0; k < length; k++) {
            var Pk = toStr(k);
            if (!(Pk in O)) continue;
            var value = O[Pk];
            if (typeof value !== "string" && !isObject(value))
                throw new TypeErrorConstructor(
                    "Language ID should be string or object.",
                );
            var tag = toStr(value),
                canonical = canonicalizeTag(tag);
            if (canonical === undefined)
                throw new RangeErrorConstructor(
                    "Incorrect locale information provided: " + tag,
                );
            if (!contains(seen, canonical)) push(seen, canonical);
        }
        return seen;
    }

    // ---- Locale negotiation (ECMA-402 9.2.2-9.2.10) -----------------------

    // ICU has en-US data for formats and collation; plural rules exist for en only.
    var defaultLocale = "en-US";
    function bestAvailableLocale(candidate, enOnly) {
        for (;;) {
            if (candidate === "en" || (candidate === "en-US" && !enOnly))
                return candidate;
            var pos = call(stringLastIndexOf, candidate, "-");
            if (pos < 0) return undefined;
            if (pos >= 2 && candidate[pos - 2] === "-") pos -= 2;
            candidate = slice(candidate, 0, pos);
        }
    }
    // The locale without its Unicode extension, and that extension's keywords.
    function splitUnicodeExtension(locale) {
        var parts = split(locale, "-"),
            base = [],
            keywords,
            i = 0;
        while (i < parts.length) {
            if (parts[i] === "x") {
                while (i < parts.length) push(base, parts[i++]);
                break;
            }
            if (parts[i] === "u" && i > 0) {
                keywords = objectCreate(null);
                i++;
                var key;
                while (i < parts.length && parts[i].length > 1) {
                    if (parts[i].length === 2) {
                        key = parts[i];
                        keywords[key] = "";
                    } else if (key !== undefined)
                        keywords[key] =
                            keywords[key] === ""
                                ? parts[i]
                                : keywords[key] + "-" + parts[i];
                    i++;
                }
                continue;
            }
            push(base, parts[i++]);
        }
        return { base: join(base, "-"), keywords: keywords };
    }
    function insertUnicodeExtension(locale, extension) {
        var privateIndex = call(stringIndexOf, locale, "-x-");
        if (privateIndex < 0) return locale + extension;
        return (
            slice(locale, 0, privateIndex) +
            extension +
            slice(locale, privateIndex)
        );
    }
    // ResolveLocale with the lookup matcher (best fit is the same here).
    function resolveLocale(
        requested,
        options,
        relevantKeys,
        localeData,
        enOnly,
    ) {
        var found, keywords;
        for (var i = 0; i < requested.length && found === undefined; i++) {
            var parts = splitUnicodeExtension(requested[i]);
            found = bestAvailableLocale(parts.base, enOnly);
            keywords = parts.keywords;
        }
        if (found === undefined) {
            found = bestAvailableLocale(defaultLocale, enOnly);
            keywords = undefined;
        }
        var result = { dataLocale: found },
            supported = "";
        for (var k = 0; k < relevantKeys.length; k++) {
            var key = relevantKeys[k],
                values = localeData[key],
                value = values[0],
                addition = "";
            if (keywords !== undefined && key in keywords) {
                var requestedValue = keywords[key];
                if (requestedValue !== "") {
                    if (contains(values, requestedValue)) {
                        value = requestedValue;
                        addition = "-" + key + "-" + value;
                    }
                } else if (contains(values, "true")) {
                    value = "true";
                    addition = "-" + key;
                }
            }
            var optionsValue = options[key];
            if (optionsValue !== undefined) {
                // null (DateTimeFormat's hc with hour12) drops the keyword.
                if (optionsValue !== null) {
                    optionsValue = asciiLower(optionsValue);
                    if (optionsValue === "") optionsValue = "true";
                }
                if (optionsValue !== value && contains(values, optionsValue)) {
                    value = optionsValue;
                    addition = "";
                }
            }
            result[key] = value;
            supported += addition;
        }
        if (supported !== "")
            found = insertUnicodeExtension(found, "-u" + supported);
        result.locale = found;
        return result;
    }
    function supportedLocales(locales, options) {
        var requested = canonicalizeLocaleList(locales);
        options = coerceOptions(options);
        getOption(
            options,
            "localeMatcher",
            "string",
            ["lookup", "best fit"],
            "best fit",
        );
        var result = [];
        for (var i = 0; i < requested.length; i++)
            if (
                bestAvailableLocale(
                    splitUnicodeExtension(requested[i]).base,
                    false,
                ) !== undefined
            )
                push(result, requested[i]);
        return result;
    }

    // ---- Options (ECMA-402 9.2.11-9.2.15) ----------------------------------

    function coerceOptions(options) {
        return options === undefined ? objectCreate(null) : toObject(options);
    }
    function getOption(options, property, type, values, fallback) {
        var value = options[property];
        if (value === undefined) return fallback;
        value = type === "boolean" ? !!value : toStr(value);
        if (values !== undefined && !contains(values, value))
            throw new RangeErrorConstructor(
                "Value " + value + " out of range for " + property,
            );
        return value;
    }
    function defaultNumberOption(value, minimum, maximum, fallback, property) {
        if (value === undefined) return fallback;
        value = +value;
        if (value !== value || value < minimum || value > maximum)
            throw new RangeErrorConstructor(
                property + " value is out of range.",
            );
        return mathFloor(value);
    }
    function getNumberOption(options, property, minimum, maximum, fallback) {
        return defaultNumberOption(
            options[property],
            minimum,
            maximum,
            fallback,
            property,
        );
    }
    function localeMatcherOption(options) {
        return getOption(
            options,
            "localeMatcher",
            "string",
            ["lookup", "best fit"],
            "best fit",
        );
    }

    // ---- Exact decimals ----------------------------------------------------
    // A finite value is { kind: "dec", negative, d, p }: the digits d without
    // leading or trailing zeros ("" for zero) and the position p of the decimal
    // point, so that the magnitude is 0.d * 10^p. Formatting rounds on these
    // digits, like ICU on the shortest decimal form of a double.

    function decimal(digits, point, negative) {
        var start = 0,
            end = digits.length;
        while (start < end && code(digits, start) === 48) start++;
        while (end > start && code(digits, end - 1) === 48) end--;
        return {
            kind: "dec",
            negative: negative,
            d: slice(digits, start, end),
            p: start < end ? point - start : 0,
        };
    }
    // Digits and exponent of a decimal literal: 12.5, .5, 1e21, 1.5e-7.
    function parseDecimal(text, negative) {
        var i = 0,
            digits = "",
            point = -1,
            n = text.length;
        for (; i < n; i++) {
            var c = code(text, i);
            if (c >= 48 && c <= 57) digits += text[i];
            else if (c === 46 && point < 0) point = digits.length;
            else break;
        }
        if (!digits.length) return undefined;
        if (point < 0) point = digits.length;
        var exponent = 0;
        if (i < n && (text[i] === "e" || text[i] === "E")) {
            var sign = 1,
                expDigits = 0;
            i++;
            if (i < n && (text[i] === "+" || text[i] === "-"))
                sign = text[i++] === "-" ? -1 : 1;
            for (; i < n; i++) {
                var e = code(text, i);
                if (e < 48 || e > 57) break;
                exponent = exponent * 10 + (e - 48);
                expDigits++;
            }
            if (!expDigits) return undefined;
            exponent *= sign;
        }
        if (i !== n) return undefined;
        return decimal(digits, point + exponent, negative);
    }
    function fromNumber(x) {
        if (x !== x) return { kind: "nan", negative: false };
        var negative = x < 0 || (x === 0 && 1 / x < 0);
        if (negative) x = -x;
        if (x === 1 / 0) return { kind: "inf", negative: negative };
        return parseDecimal(StringConstructor(x), negative);
    }
    function fromBigInt(value) {
        var text = StringConstructor(value),
            negative = text[0] === "-";
        if (negative) text = slice(text, 1);
        return decimal(text, text.length, negative);
    }
    // StringToNumber with the exact decimal value (ToIntlMathematicalValue).
    function fromString(text) {
        var number = +text;
        if (number !== number || number === 1 / 0 || number === -1 / 0)
            return fromNumber(number);
        var trimmed = call(stringTrim, text),
            negative = trimmed[0] === "-",
            body = negative || trimmed[0] === "+" ? slice(trimmed, 1) : trimmed,
            exact = body === "" ? undefined : parseDecimal(body, negative);
        return exact === undefined ? fromNumber(number) : exact;
    }
    function toPrimitiveNumber(value) {
        var exotic = value[toPrimitiveSymbol];
        if (exotic !== undefined && exotic !== null) {
            if (typeof exotic !== "function")
                throw new TypeErrorConstructor(
                    "Symbol.toPrimitive is not a function",
                );
            var result = call(exotic, value, "number");
            if (isObject(result))
                throw new TypeErrorConstructor(
                    "Cannot convert object to primitive value",
                );
            return result;
        }
        var names = ["valueOf", "toString"];
        for (var i = 0; i < 2; i++) {
            var fn = value[names[i]];
            if (typeof fn === "function") {
                var primitive = call(fn, value);
                if (!isObject(primitive)) return primitive;
            }
        }
        throw new TypeErrorConstructor(
            "Cannot convert object to primitive value",
        );
    }
    function toIntlMathematicalValue(value) {
        var primitive = isObject(value) ? toPrimitiveNumber(value) : value;
        if (typeof primitive === "bigint") return fromBigInt(primitive);
        if (typeof primitive === "string") return fromString(primitive);
        return fromNumber(+primitive);
    }
    function shift(x, places) {
        return { kind: "dec", negative: x.negative, d: x.d, p: x.p + places };
    }
    function multiplySmall(x, factor) {
        var digits = "",
            carry = 0;
        for (var i = x.d.length - 1; i >= 0; i--) {
            var product = (code(x.d, i) - 48) * factor + carry;
            digits = (product % 10) + digits;
            carry = mathFloor(product / 10);
        }
        var grown = 0;
        while (carry > 0) {
            digits = (carry % 10) + digits;
            carry = mathFloor(carry / 10);
            grown++;
        }
        return decimal(digits, x.p + grown, x.negative);
    }
    function roundUp(mode, negative, half, odd) {
        switch (mode) {
            case "ceil":
                return !negative;
            case "floor":
                return negative;
            case "expand":
                return true;
            case "trunc":
                return false;
            case "halfCeil":
                return half > 0 || (half === 0 && !negative);
            case "halfFloor":
                return half > 0 || (half === 0 && negative);
            case "halfTrunc":
                return half > 0;
            case "halfEven":
                return half > 0 || (half === 0 && odd);
        }
        return half >= 0;
    }
    // x rounded to a multiple of 10^-places.
    function roundAt(x, places, mode) {
        var d = x.d,
            keep = x.p + places;
        if (d === "" || keep >= d.length) return x;
        var kept = keep > 0 ? slice(d, 0, keep) : "",
            half = -1;
        if (keep >= 0) {
            var first = code(d, keep) - 48;
            half = first > 5 ? 1 : first < 5 ? -1 : keep + 1 < d.length ? 1 : 0;
        }
        var odd = kept !== "" && (code(kept, kept.length - 1) - 48) % 2 === 1;
        if (!roundUp(mode, x.negative, half, odd))
            return decimal(kept, x.p, x.negative);
        if (keep <= 0) return decimal("1", 1 - places, x.negative);
        var digits = "",
            i = kept.length - 1;
        while (i >= 0 && kept[i] === "9") {
            digits = "0" + digits;
            i--;
        }
        if (i < 0) return decimal("1" + digits, x.p + 1, x.negative);
        return decimal(
            slice(kept, 0, i) + StringConstructor(code(kept, i) - 47) + digits,
            x.p,
            x.negative,
        );
    }
    function fractionLength(x) {
        return x.d.length > x.p ? x.d.length - x.p : 0;
    }
    // ToRawPrecision (ECMA-402 15.5.8).
    function rawPrecision(x, minPrecision, maxPrecision, mode) {
        if (x.d === "")
            return {
                x: x,
                fraction: minPrecision - 1,
                magnitude: 1 - maxPrecision,
            };
        var rounded = roundAt(x, maxPrecision - x.p, mode),
            shown =
                rounded.d.length > minPrecision
                    ? rounded.d.length
                    : minPrecision;
        return {
            x: rounded,
            fraction: shown > rounded.p ? shown - rounded.p : 0,
            magnitude: rounded.p - maxPrecision,
        };
    }
    // ToRawFixed (ECMA-402 15.5.9), with the rounding increment.
    function rawFixed(x, minFraction, maxFraction, increment, mode) {
        var rounded;
        if (increment === 1) rounded = roundAt(x, maxFraction, mode);
        else {
            // increment = a * 10^b with a in 1, 2, 5 or 25: round x / increment.
            var a = increment,
                b = 0;
            while (a % 10 === 0) {
                a /= 10;
                b++;
            }
            var scaled = shift(multiplySmall(x, 100 / a), -2 - b);
            rounded = shift(
                multiplySmall(roundAt(scaled, maxFraction, mode), a),
                b,
            );
        }
        var fraction = fractionLength(rounded);
        return {
            x: rounded,
            fraction: fraction > minFraction ? fraction : minFraction,
            magnitude: -maxFraction,
        };
    }
    // FormatNumericToString (ECMA-402 15.5.3) for |x|: integer and fraction digits.
    function formatNumericToString(slots, x) {
        var type = slots.roundingType,
            mode = slots.roundingMode,
            result;
        if (type === "significantDigits")
            result = rawPrecision(
                x,
                slots.minimumSignificantDigits,
                slots.maximumSignificantDigits,
                mode,
            );
        else if (type === "fractionDigits")
            result = rawFixed(
                x,
                slots.minimumFractionDigits,
                slots.maximumFractionDigits,
                slots.roundingIncrement,
                mode,
            );
        else {
            var s = rawPrecision(
                    x,
                    slots.minimumSignificantDigits,
                    slots.maximumSignificantDigits,
                    mode,
                ),
                f = rawFixed(
                    x,
                    slots.minimumFractionDigits,
                    slots.maximumFractionDigits,
                    slots.roundingIncrement,
                    mode,
                );
            result =
                (type === "morePrecision") === s.magnitude <= f.magnitude
                    ? s
                    : f;
        }
        var rounded = result.x,
            fraction = result.fraction,
            d = rounded.d,
            p = rounded.p;
        if (
            slots.trailingZeroDisplay === "stripIfInteger" &&
            fractionLength(rounded) === 0
        )
            fraction = 0;
        var integer =
            d === "" || p <= 0
                ? "0"
                : d.length >= p
                  ? slice(d, 0, p)
                  : d + zeros(p - d.length);
        var digits = d === "" ? "" : p >= 0 ? slice(d, p) : zeros(-p) + d;
        digits += zeros(fraction - digits.length);
        if (integer.length < slots.minimumIntegerDigits)
            integer =
                zeros(slots.minimumIntegerDigits - integer.length) + integer;
        return { x: rounded, integer: integer, fraction: digits };
    }

    // ---- Number format options (ECMA-402 15.1) -----------------------------

    // ISO 4217 minor units as ICU (CLDR) uses them; everything else has 2.
    var currencyDigits0 =
            " AFN ALL BIF CLP COP DJF GNF HUF IDR IQD IRR ISK JPY KMF KPW KRW LAK LBP MGA MMK PKR PYG RWF SLL SOS SYP UGX VND VUV XAF XOF XPF YER ",
        currencyDigits3 = " BHD JOD KWD LYD OMR TND ",
        currencyDigits4 = " CLF UYW ";
    function currencyDigits(currency) {
        var key = " " + currency + " ";
        if (call(stringIndexOf, currencyDigits0, key) >= 0) return 0;
        if (call(stringIndexOf, currencyDigits3, key) >= 0) return 3;
        if (call(stringIndexOf, currencyDigits4, key) >= 0) return 4;
        return 2;
    }
    // code|symbol|narrow symbol|singular name[|plural name] (en).
    var currencyRows = [
        "USD|$|$|US dollar|US dollars",
        "EUR|\u20AC|\u20AC|euro|euros",
        "GBP|\u00A3|\u00A3|British pound|British pounds",
        "JPY|\u00A5|\u00A5|Japanese yen",
        "CAD|CA$|$|Canadian dollar|Canadian dollars",
        "AUD|A$|$|Australian dollar|Australian dollars",
        "CNY|CN\u00A5|\u00A5|Chinese yuan",
        "INR|\u20B9|\u20B9|Indian rupee|Indian rupees",
        "KRW|\u20A9|\u20A9|South Korean won",
        "MXN|MX$|$|Mexican peso|Mexican pesos",
        "BRL|R$|R$|Brazilian real|Brazilian reals",
        "CHF|CHF|CHF|Swiss franc|Swiss francs",
        "HKD|HK$|$|Hong Kong dollar|Hong Kong dollars",
        "NZD|NZ$|$|New Zealand dollar|New Zealand dollars",
        "TWD|NT$|$|New Taiwan dollar|New Taiwan dollars",
        "ILS|\u20AA|\u20AA|Israeli new shekel|Israeli new shekels",
        "VND|\u20AB|\u20AB|Vietnamese dong",
        "XAF|FCFA|FCFA|Central African CFA franc|Central African CFA francs",
        "XOF|F\u202FCFA|F\u202FCFA|West African CFA franc|West African CFA francs",
        "XPF|CFPF|CFPF|CFP franc|CFP francs",
        "RUB|RUB|\u20BD|Russian ruble|Russian rubles",
        "PHP|\u20B1|\u20B1|Philippine peso|Philippine pesos",
        "SEK|SEK|kr|Swedish krona|Swedish kronor",
        "NOK|NOK|kr|Norwegian krone|Norwegian kroner",
        "DKK|DKK|kr|Danish krone|Danish kroner",
        "PLN|PLN|z\u0142|Polish zloty|Polish zlotys",
        "TRY|TRY|\u20BA|Turkish lira|Turkish Lira",
        "ZAR|ZAR|R|South African rand",
        "SGD|SGD|$|Singapore dollar|Singapore dollars",
        "THB|THB|\u0E3F|Thai baht",
        "IDR|IDR|Rp|Indonesian rupiah|Indonesian rupiahs",
        "HUF|HUF|Ft|Hungarian forint|Hungarian forints",
        "CZK|CZK|K\u010D|Czech koruna|Czech korunas",
        "ISK|ISK|kr|Icelandic kr\u00F3na|Icelandic kr\u00F3nur",
        "CLP|CLP|$|Chilean peso|Chilean pesos",
        "COP|COP|$|Colombian peso|Colombian pesos",
        "ARS|ARS|$|Argentine peso|Argentine pesos",
        "EGP|EGP|E\u00A3|Egyptian pound|Egyptian pounds",
        "NGN|NGN|\u20A6|Nigerian naira|Nigerian nairas",
        "UAH|UAH|\u20B4|Ukrainian hryvnia|Ukrainian hryvnias",
        "PKR|PKR|Rs|Pakistani rupee|Pakistani rupees",
        "AED|AED|AED|UAE dirham|UAE dirhams",
        "SAR|SAR|SAR|Saudi riyal|Saudi riyals",
        "MYR|MYR|RM|Malaysian ringgit|Malaysian ringgits",
        "KZT|KZT|\u20B8|Kazakhstani tenge|Kazakhstani tenges",
        "GHS|GHS|GH\u20B5|Ghanaian cedi|Ghanaian cedis",
        "KES|KES|KES|Kenyan shilling|Kenyan shillings",
        "KWD|KWD|KWD|Kuwaiti dinar|Kuwaiti dinars",
        "BHD|BHD|BHD|Bahraini dinar|Bahraini dinars",
        "JOD|JOD|JOD|Jordanian dinar|Jordanian dinars",
        "OMR|OMR|OMR|Omani rial|Omani rials",
        "TND|TND|TND|Tunisian dinar|Tunisian dinars",
        "LYD|LYD|LYD|Libyan dinar|Libyan dinars",
        "IQD|IQD|IQD|Iraqi dinar|Iraqi dinars",
        "PYG|PYG|\u20B2|Paraguayan guarani|Paraguayan guaranis",
        "UGX|UGX|UGX|Ugandan shilling|Ugandan shillings",
        "BIF|BIF|BIF|Burundian franc|Burundian francs",
        "RON|RON|lei|Romanian leu|Romanian lei",
        "BGN|BGN|BGN|Bulgarian lev|Bulgarian leva",
    ];
    var currencies = objectCreate(null),
        currencyCodes = [];
    for (var row = 0; row < currencyRows.length; row++) {
        var fields = split(currencyRows[row], "|");
        if (fields.length < 5) push(fields, fields[3]);
        currencies[fields[0]] = fields;
        push(currencyCodes, fields[0]);
    }
    sortStrings(currencyCodes);
    // The units IsSanctionedSingleUnitIdentifier accepts (ECMA-402 6.6.2).
    var sanctionedUnits =
        " acre bit byte celsius centimeter day degree fahrenheit fluid-ounce foot gallon gigabit gigabyte gram hectare hour inch kilobit kilobyte kilogram kilometer liter megabit megabyte meter microsecond mile mile-scandinavian milliliter millimeter millisecond minute month nanosecond ounce percent petabyte pound second stone terabit terabyte week yard year ";
    function isSanctionedUnit(unit) {
        return (
            unit !== "" &&
            call(stringIndexOf, unit, " ") < 0 &&
            call(stringIndexOf, sanctionedUnits, " " + unit + " ") >= 0
        );
    }
    function isWellFormedUnit(unit) {
        if (isSanctionedUnit(unit)) return true;
        var per = call(stringIndexOf, unit, "-per-");
        return (
            per >= 0 &&
            isSanctionedUnit(slice(unit, 0, per)) &&
            isSanctionedUnit(slice(unit, per + 5))
        );
    }
    function isWellFormedCurrencyCode(currency) {
        if (currency.length !== 3) return false;
        for (var i = 0; i < 3; i++) {
            var c = code(currency, i) | 32;
            if (c < 97 || c > 122) return false;
        }
        return true;
    }
    // SetNumberFormatDigitOptions (ECMA-402 15.1.3).
    function setDigitOptions(
        slots,
        options,
        mnfdDefault,
        mxfdDefault,
        notation,
    ) {
        var mnid = getNumberOption(options, "minimumIntegerDigits", 1, 21, 1),
            mnfd = options.minimumFractionDigits,
            mxfd = options.maximumFractionDigits,
            mnsd = options.minimumSignificantDigits,
            mxsd = options.maximumSignificantDigits;
        slots.minimumIntegerDigits = mnid;
        var increment = getNumberOption(
            options,
            "roundingIncrement",
            1,
            5000,
            1,
        );
        if (
            !contains(
                [
                    1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000,
                    2500, 5000,
                ],
                increment,
            )
        )
            throw new RangeErrorConstructor(
                "roundingIncrement value is out of range.",
            );
        var roundingMode = getOption(
            options,
            "roundingMode",
            "string",
            [
                "ceil",
                "floor",
                "expand",
                "trunc",
                "halfCeil",
                "halfFloor",
                "halfExpand",
                "halfTrunc",
                "halfEven",
            ],
            "halfExpand",
        );
        var roundingPriority = getOption(
            options,
            "roundingPriority",
            "string",
            ["auto", "morePrecision", "lessPrecision"],
            "auto",
        );
        var trailingZeroDisplay = getOption(
            options,
            "trailingZeroDisplay",
            "string",
            ["auto", "stripIfInteger"],
            "auto",
        );
        if (increment !== 1) mxfdDefault = mnfdDefault;
        slots.roundingIncrement = increment;
        slots.roundingMode = roundingMode;
        slots.trailingZeroDisplay = trailingZeroDisplay;
        var hasSd = mnsd !== undefined || mxsd !== undefined,
            hasFd = mnfd !== undefined || mxfd !== undefined,
            needSd = true,
            needFd = true;
        if (roundingPriority === "auto") {
            needSd = hasSd;
            if (needSd || (!hasFd && notation === "compact")) needFd = false;
        }
        if (needSd) {
            if (hasSd) {
                mnsd = defaultNumberOption(
                    mnsd,
                    1,
                    21,
                    1,
                    "minimumSignificantDigits",
                );
                mxsd = defaultNumberOption(
                    mxsd,
                    mnsd,
                    21,
                    21,
                    "maximumSignificantDigits",
                );
                slots.minimumSignificantDigits = mnsd;
                slots.maximumSignificantDigits = mxsd;
            } else {
                slots.minimumSignificantDigits = 1;
                slots.maximumSignificantDigits = 21;
            }
        }
        if (needFd) {
            if (hasFd) {
                mnfd = defaultNumberOption(
                    mnfd,
                    0,
                    100,
                    undefined,
                    "minimumFractionDigits",
                );
                mxfd = defaultNumberOption(
                    mxfd,
                    0,
                    100,
                    undefined,
                    "maximumFractionDigits",
                );
                if (mnfd === undefined)
                    mnfd = mnfdDefault < mxfd ? mnfdDefault : mxfd;
                else if (mxfd === undefined)
                    mxfd = mxfdDefault > mnfd ? mxfdDefault : mnfd;
                else if (mnfd > mxfd)
                    throw new RangeErrorConstructor(
                        "maximumFractionDigits value is out of range.",
                    );
                slots.minimumFractionDigits = mnfd;
                slots.maximumFractionDigits = mxfd;
            } else {
                slots.minimumFractionDigits = mnfdDefault;
                slots.maximumFractionDigits = mxfdDefault;
            }
        }
        if (!needSd && !needFd) {
            slots.minimumFractionDigits = 0;
            slots.maximumFractionDigits = 0;
            slots.minimumSignificantDigits = 1;
            slots.maximumSignificantDigits = 2;
            slots.roundingType = "morePrecision";
            slots.computedRoundingPriority = "morePrecision";
        } else if (roundingPriority === "auto") {
            slots.roundingType = hasSd ? "significantDigits" : "fractionDigits";
            slots.computedRoundingPriority = "auto";
        } else {
            slots.roundingType = roundingPriority;
            slots.computedRoundingPriority = roundingPriority;
        }
        if (increment !== 1) {
            if (slots.roundingType !== "fractionDigits")
                throw new TypeErrorConstructor(
                    "roundingIncrement requires fraction digit rounding.",
                );
            if (slots.maximumFractionDigits !== slots.minimumFractionDigits)
                throw new RangeErrorConstructor(
                    "maximumFractionDigits must equal minimumFractionDigits with a roundingIncrement.",
                );
        }
    }
    // InitializeNumberFormat (ECMA-402 15.1.2) on a slot record.
    function initializeNumberFormat(slots, locales, options) {
        var requested = canonicalizeLocaleList(locales);
        options = coerceOptions(options);
        var opt = objectCreate(null);
        opt.localeMatcher = localeMatcherOption(options);
        var numberingSystem = getOption(
            options,
            "numberingSystem",
            "string",
            undefined,
            undefined,
        );
        if (numberingSystem !== undefined && !isUnicodeType(numberingSystem))
            throw new RangeErrorConstructor(
                "Invalid numberingSystem : " + numberingSystem,
            );
        opt.nu = numberingSystem;
        var r = resolveLocale(requested, opt, ["nu"], { nu: ["latn"] });
        slots.locale = r.locale;
        slots.dataLocale = r.dataLocale;
        slots.numberingSystem = r.nu;
        // SetNumberFormatUnitOptions (15.1.4).
        var style = getOption(
            options,
            "style",
            "string",
            ["decimal", "percent", "currency", "unit"],
            "decimal",
        );
        var currency = getOption(
            options,
            "currency",
            "string",
            undefined,
            undefined,
        );
        if (currency === undefined) {
            if (style === "currency")
                throw new TypeErrorConstructor(
                    "Currency code is required with currency style.",
                );
        } else if (!isWellFormedCurrencyCode(currency))
            throw new RangeErrorConstructor(
                "Invalid currency code : " + currency,
            );
        var currencyDisplay = getOption(
            options,
            "currencyDisplay",
            "string",
            ["code", "symbol", "narrowSymbol", "name"],
            "symbol",
        );
        var currencySign = getOption(
            options,
            "currencySign",
            "string",
            ["standard", "accounting"],
            "standard",
        );
        var unit = getOption(options, "unit", "string", undefined, undefined);
        if (unit === undefined) {
            if (style === "unit")
                throw new TypeErrorConstructor(
                    "Unit is required with unit style.",
                );
        } else if (!isWellFormedUnit(unit))
            throw new RangeErrorConstructor("Invalid unit argument: " + unit);
        getOption(
            options,
            "unitDisplay",
            "string",
            ["short", "narrow", "long"],
            "short",
        );
        slots.style = style;
        if (style === "currency") {
            slots.currency = upper(currency);
            slots.currencyDisplay = currencyDisplay;
            slots.currencySign = currencySign;
        }
        var mnfdDefault = 0,
            mxfdDefault = style === "percent" ? 0 : 3;
        if (style === "currency")
            mnfdDefault = mxfdDefault = currencyDigits(slots.currency);
        var notation = getOption(
            options,
            "notation",
            "string",
            ["standard", "scientific", "engineering", "compact"],
            "standard",
        );
        slots.notation = notation;
        setDigitOptions(slots, options, mnfdDefault, mxfdDefault, notation);
        var compactDisplay = getOption(
            options,
            "compactDisplay",
            "string",
            ["short", "long"],
            "short",
        );
        var defaultUseGrouping = notation === "compact" ? "min2" : "auto";
        // GetBooleanOrStringNumberFormatOption (15.5.20).
        var useGrouping = options.useGrouping;
        if (useGrouping === undefined) useGrouping = defaultUseGrouping;
        else if (useGrouping === true) useGrouping = "always";
        else if (!useGrouping) useGrouping = false;
        else {
            useGrouping = toStr(useGrouping);
            if (useGrouping === "true" || useGrouping === "false")
                useGrouping = defaultUseGrouping;
            else if (!contains(["min2", "auto", "always"], useGrouping))
                throw new RangeErrorConstructor(
                    "Value " + useGrouping + " out of range for useGrouping",
                );
        }
        slots.useGrouping = useGrouping;
        slots.signDisplay = getOption(
            options,
            "signDisplay",
            "string",
            ["auto", "never", "always", "exceptZero", "negative"],
            "auto",
        );
        if (notation === "compact") slots.compactDisplay = compactDisplay;
        if (style === "unit")
            throw new RangeErrorConstructor(
                'Intl.NumberFormat style "unit" is not supported by Nona',
            );
        return slots;
    }

    // ---- Number formatting (ECMA-402 15.5) --------------------------------

    function exponentForMagnitude(slots, magnitude) {
        var notation = slots.notation;
        if (notation === "scientific") return magnitude;
        if (notation === "engineering") return mathFloor(magnitude / 3) * 3;
        if (magnitude < 3) return 0;
        return magnitude > 14 ? 12 : mathFloor(magnitude / 3) * 3;
    }
    // ComputeExponent (15.5.7).
    function computeExponent(slots, x) {
        if (x.d === "") return 0;
        var magnitude = x.p - 1,
            exponent = exponentForMagnitude(slots, magnitude),
            rounded = formatNumericToString(slots, shift(x, -exponent)).x;
        if (rounded.d === "" || rounded.p - 1 === magnitude - exponent)
            return exponent;
        return exponentForMagnitude(slots, magnitude + 1);
    }
    var compactShort = ["K", "M", "B", "T"],
        compactLong = ["thousand", "million", "billion", "trillion"];
    function part(parts, type, value) {
        push(parts, { type: type, value: value });
    }
    function isLetter(character) {
        return lower(character) !== upper(character);
    }
    // PartitionNumberPattern (15.5.4) for the en patterns.
    function partitionNumber(slots, x) {
        var number = [],
            exponent = 0,
            zero = false,
            plural = "other",
            style = slots.style;
        if (x.kind === "nan") part(number, "nan", "NaN");
        else if (x.kind === "inf") part(number, "infinity", "\u221E");
        else {
            var value = style === "percent" ? shift(x, 2) : x;
            if (slots.notation !== "standard")
                exponent = computeExponent(slots, value);
            var result = formatNumericToString(slots, shift(value, -exponent)),
                integer = result.integer,
                grouping = slots.useGrouping;
            zero = result.x.d === "";
            if (
                exponent === 0 &&
                result.fraction === "" &&
                result.x.d === "1" &&
                result.x.p === 1
            )
                plural = "one";
            if (
                grouping !== false &&
                integer.length >= (grouping === "min2" ? 5 : 4)
            ) {
                var first = integer.length % 3 || 3;
                part(number, "integer", slice(integer, 0, first));
                for (var i = first; i < integer.length; i += 3) {
                    part(number, "group", ",");
                    part(number, "integer", slice(integer, i, i + 3));
                }
            } else part(number, "integer", integer);
            if (result.fraction !== "") {
                part(number, "decimal", ".");
                part(number, "fraction", result.fraction);
            }
            if (
                slots.notation === "scientific" ||
                slots.notation === "engineering"
            ) {
                part(number, "exponentSeparator", "E");
                if (exponent < 0) part(number, "exponentMinusSign", "-");
                part(
                    number,
                    "exponentInteger",
                    StringConstructor(exponent < 0 ? -exponent : exponent),
                );
            } else if (exponent !== 0) {
                var index = exponent / 3 - 1;
                if (slots.compactDisplay === "long") {
                    part(number, "literal", " ");
                    part(number, "compact", compactLong[index]);
                } else part(number, "compact", compactShort[index]);
            }
        }
        var negative = x.negative,
            sign = "";
        switch (slots.signDisplay) {
            case "auto":
                sign = negative ? "-" : "";
                break;
            case "always":
                sign = negative ? "-" : "+";
                break;
            case "exceptZero":
                sign = x.kind === "nan" || zero ? "" : negative ? "-" : "+";
                break;
            case "negative":
                sign = negative && !zero && x.kind !== "nan" ? "-" : "";
                break;
        }
        var parts = [],
            k;
        if (style !== "currency") {
            if (sign !== "")
                part(parts, sign === "-" ? "minusSign" : "plusSign", sign);
            for (k = 0; k < number.length; k++) push(parts, number[k]);
            // ICU reports the percent sign of a compact number as a unit.
            if (style === "percent")
                part(
                    parts,
                    slots.notation === "compact" ? "unit" : "percentSign",
                    "%",
                );
            return parts;
        }
        var currency = slots.currency,
            data = currencies[currency],
            display = slots.currencyDisplay;
        if (display === "name") {
            if (sign !== "")
                part(parts, sign === "-" ? "minusSign" : "plusSign", sign);
            for (k = 0; k < number.length; k++) push(parts, number[k]);
            part(parts, "literal", " ");
            part(
                parts,
                "currency",
                data === undefined
                    ? currency
                    : plural === "one"
                      ? data[3]
                      : data[4],
            );
            return parts;
        }
        var symbol =
            display === "code" || data === undefined
                ? currency
                : display === "symbol"
                  ? data[1]
                  : data[2];
        var accounting = slots.currencySign === "accounting" && sign === "-";
        if (accounting) part(parts, "literal", "(");
        else if (sign !== "")
            part(parts, sign === "-" ? "minusSign" : "plusSign", sign);
        part(parts, "currency", symbol);
        if (isLetter(symbol[symbol.length - 1]))
            part(parts, "literal", "\u00A0");
        for (k = 0; k < number.length; k++) push(parts, number[k]);
        if (accounting) part(parts, "literal", ")");
        return parts;
    }
    function formatToString(slots, x) {
        var parts = partitionNumber(slots, x),
            text = "";
        for (var i = 0; i < parts.length; i++) text += parts[i].value;
        return text;
    }

    // ---- Plural rules (en) ------------------------------------------------

    function pluralCategory(slots, n) {
        if (n !== n || n === 1 / 0 || n === -1 / 0) return "other";
        var result = formatNumericToString(slots, fromNumber(n)),
            integer = result.integer,
            fraction = result.fraction;
        while (integer.length > 1 && integer[0] === "0")
            integer = slice(integer, 1);
        if (slots.type === "cardinal")
            return integer === "1" && fraction === "" ? "one" : "other";
        for (var i = 0; i < fraction.length; i++)
            if (fraction[i] !== "0") return "other";
        var last = integer[integer.length - 1],
            tens = integer.length > 1 ? integer[integer.length - 2] : "0";
        if (tens === "1") return "other";
        return last === "1"
            ? "one"
            : last === "2"
              ? "two"
              : last === "3"
                ? "few"
                : "other";
    }

    // ---- Collation --------------------------------------------------------
    // An approximation of the CLDR root collation (what ICU uses for en):
    // primary weights from the order below, NFD accents as secondary weights,
    // case as tertiary weights with lowercase first, and the code units of the
    // compared characters as the last tie-break. Whitespace and punctuation are
    // the variable characters that ignorePunctuation skips.
    var variableOrder =
            "\t\n\u000B\u000C\r\u0085\u2028\u2029 \u00A0\u203E_\u2017-\u2010\u2011\u2012\u2013\u2014\u2015\u2053,;\u204F:!\u203C\u2049\u00A1?\u2048\u2047\u00BF\u203D.\u2024\u2025\u2026\u00B7\u2055\u2056\u2058\u2059\u205A\u205B\u205C\u205D\u205E'\u2018\u2019\u201A\u201B\u2039\u203A\"\u201C\u201D\u201E\u201F\u00AB\u00BB()[]{}\u2045\u2046\u2016\u00A7\u00B6\u204B@*\u204E\u2051/\\&\u204A#%\u2030\u2031\u2020\u2021\u2022\u2023\u2027\u2043\u204C\u204D\u2032\u2033\u2034\u2057\u2035\u2036\u2037\u2038\u203B\u203F\u2054\u2040\u2050\u2041\u2042",
        symbolOrder =
            "\u0060\u00B4^\u00AF\u00A8\u00B8\u00B0\u00A9\u00AE+\u00B1\u00F7\u00D7<=>\u00AC|\u00A6~\u2052\u2044\u00A4\u00A2$\u00A3\u00A5\u20A0\u20A1\u20A2\u20A3\u20A4\u20A5\u20A6\u20A9\u20AA\u20AB\u20AC\u20AD\u20AE\u20AF\u20B0\u20B1\u20B2\u20B3\u20B4\u20B5\u20B6\u20B7\u20B8\u20B9\u20BA\u20BB\u20BC\u20BD\u20BE\u20BF",
        // Characters with the primary weight of the character before them.
        samePrimary =
            "\u00A0\u2011\u2024\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F",
        // Secondary weights of combining marks, lowest first.
        markOrder =
            "\u0332\u0313\u0314\u0301\u0300\u0306\u0302\u030C\u030A\u0342\u0308\u030B\u0303\u0307\u0338\u0327\u0328\u0304";
    var primaries = objectCreate(null),
        weight = 0,
        lastVariable,
        digitWeight = 700,
        letterWeight = 1000;
    function addPrimaries(order) {
        for (var i = 0; i < order.length; i++) {
            if (call(stringIndexOf, samePrimary, order[i]) < 0) weight++;
            primaries[order[i]] = weight;
        }
    }
    addPrimaries(variableOrder);
    lastVariable = weight;
    addPrimaries(symbolOrder);
    for (var digit = 0; digit < 10; digit++)
        primaries[StringConstructor(digit)] = digitWeight + digit;
    for (var letter = 0; letter < 26; letter++)
        primaries[fromCharCode(97 + letter)] = letterWeight + letter * 4;
    // Letters with their own primary weight, just after a base letter.
    var ownPrimaries = [
        ["\u0192", "f"],
        ["\u01DD", "e"],
        ["\u0259", "e"],
        ["\u025B", "e"],
        ["\u0131", "i"],
        ["\u0138", "q"],
        ["\u014B", "n"],
        ["\u0254", "o"],
        ["\u0167", "t"],
        ["\u00FE", "z"],
    ];
    for (var own = 0; own < ownPrimaries.length; own++)
        primaries[ownPrimaries[own][0]] = primaries[ownPrimaries[own][1]] + 2;
    // Letters that sort as other letters with a secondary difference.
    var expansions = objectCreate(null);
    expansions["\u00DF"] = "ss";
    expansions["\u00E6"] = "ae";
    expansions["\u0153"] = "oe";
    expansions["\u00F8"] = "o";
    expansions["\u0111"] = "d";
    expansions["\u00F0"] = "d";
    expansions["\u0142"] = "l";
    expansions["\u0127"] = "h";
    expansions["\u017F"] = "s";
    expansions["\u0140"] = "l";
    // Equal to their expansion except for the final tie-break.
    var tertiaryExpansions = objectCreate(null);
    tertiaryExpansions["\u0133"] = "ij";
    tertiaryExpansions["\u20A7"] = "pts";
    tertiaryExpansions["\u20A8"] = "rs";
    var commonSecondary = 1,
        specialSecondary = 0x20000;
    function isIgnorable(c) {
        return (
            c <= 8 ||
            (c >= 0x0e && c <= 0x1f) ||
            (c >= 0x7f && c <= 0x9f && c !== 0x85) ||
            c === 0xad ||
            c === 0x34f ||
            (c >= 0x200b && c <= 0x200f) ||
            (c >= 0x2060 && c <= 0x2064) ||
            c === 0xfeff
        );
    }
    function isMark(c) {
        return (
            (c >= 0x300 && c <= 0x36f) ||
            (c >= 0x483 && c <= 0x489) ||
            (c >= 0x591 && c <= 0x5c7) ||
            (c >= 0x610 && c <= 0x61a) ||
            (c >= 0x64b && c <= 0x65f) ||
            (c >= 0x1ab0 && c <= 0x1aff) ||
            (c >= 0x1dc0 && c <= 0x1dff) ||
            (c >= 0x20d0 && c <= 0x20ff) ||
            (c >= 0xfe20 && c <= 0xfe2f)
        );
    }
    // Primary weights of ASCII characters by code unit (uppercase as lowercase).
    var asciiPrimaries = [];
    for (var ascii = 0; ascii < 128; ascii++) {
        var asciiChar = fromCharCode(
            ascii >= 65 && ascii <= 90 ? ascii + 32 : ascii,
        );
        asciiPrimaries[ascii] = isIgnorable(ascii) ? 0 : primaries[asciiChar];
    }
    // The weights of text: primary weights P, and with full also the
    // secondary S and tertiary T weights and the characters K behind them
    // (the final tie-break). Sorting mostly needs P alone.
    function collationKey(text, slots, full) {
        var numeric = slots.numeric,
            ignorePunctuation = slots.ignorePunctuation,
            n = text.length,
            i = 0;
        // Only characters from U+00C0 on have canonical decompositions.
        for (; i < n; i++)
            if (text.charCodeAt(i) >= 0xc0) {
                text = call(stringNormalize, text, "NFD");
                n = text.length;
                break;
            }
        i = 0;
        var P = [],
            S = full ? [] : undefined,
            T = full ? [] : undefined,
            K = "";
        function element(primary, tertiary) {
            P[P.length] = primary;
            if (full) {
                S[S.length] = commonSecondary;
                T[T.length] = tertiary;
            }
        }
        while (i < n) {
            var c = text.charCodeAt(i),
                start = i++;
            if (numeric && c >= 48 && c <= 57) {
                while (
                    i < n &&
                    text.charCodeAt(i) >= 48 &&
                    text.charCodeAt(i) <= 57
                )
                    i++;
                while (start < i - 1 && text.charCodeAt(start) === 48) start++;
                // A longer number is larger: the length first, then the digits.
                var length = i - start;
                element(digitWeight + 10 + (length < 280 ? length : 280), 0);
                for (var r = start; r < i; r++)
                    element(digitWeight + text.charCodeAt(r) - 48, 0);
                if (full) K += text.slice(start, i);
                continue;
            }
            if (c < 128) {
                var weight = asciiPrimaries[c];
                if (weight === 0) continue;
                if (ignorePunctuation && weight <= lastVariable) continue;
                element(weight, c >= 65 && c <= 90 ? 1 : 0);
                if (full) K += text[start];
                continue;
            }
            if (c >= 0xd800 && c <= 0xdbff && i < n) {
                var low = text.charCodeAt(i);
                if (low >= 0xdc00 && low <= 0xdfff) {
                    c = (c - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000;
                    i++;
                }
            }
            if (isIgnorable(c)) continue;
            var ch = text.slice(start, i);
            if (isMark(c)) {
                if (full) {
                    var rank = call(stringIndexOf, markOrder, ch);
                    S[S.length] = rank >= 0 ? rank + 2 : 0x100 + c;
                    K += ch;
                }
                continue;
            }
            var lowered = ch.toLowerCase();
            if (lowered.length !== ch.length) lowered = ch;
            var caseWeight = lowered === ch ? 0 : 1,
                expansion = expansions[lowered],
                primary;
            if (expansion === undefined)
                expansion = tertiaryExpansions[lowered];
            if (expansion !== undefined) {
                for (var e = 0; e < expansion.length; e++)
                    element(primaries[expansion[e]], caseWeight);
                if (full) {
                    if (expansions[lowered] !== undefined)
                        S[S.length] = specialSecondary;
                    K += ch;
                }
                continue;
            }
            primary = primaries[lowered];
            if (primary === undefined) {
                primary = lowered.charCodeAt(0);
                if (lowered.length === 2)
                    primary =
                        (primary - 0xd800) * 0x400 +
                        (lowered.charCodeAt(1) - 0xdc00) +
                        0x10000;
                primary += 0x10000;
            } else if (ignorePunctuation && primary <= lastVariable) continue;
            element(primary, caseWeight);
            if (full) K += ch;
        }
        return { P: P, S: S, T: T, K: K };
    }
    function compareLists(a, b) {
        var n = a.length < b.length ? a.length : b.length;
        for (var i = 0; i < n; i++)
            if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
        return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
    }
    function compareStrings(slots, x, y) {
        if (x === y) return 0;
        var sensitivity = slots.sensitivity,
            result = compareLists(
                collationKey(x, slots, false).P,
                collationKey(y, slots, false).P,
            );
        if (result !== 0 || sensitivity === "base") return result;
        var a = collationKey(x, slots, true),
            b = collationKey(y, slots, true);
        if (sensitivity !== "case") {
            result = compareLists(a.S, b.S);
            if (result !== 0 || sensitivity === "accent") return result;
        }
        result = compareLists(a.T, b.T);
        if (slots.caseFirst === "upper") result = -result;
        if (result !== 0 || sensitivity === "case") return result;
        return a.K < b.K ? -1 : a.K > b.K ? 1 : 0;
    }
    // InitializeCollator (ECMA-402 10.1.2) on a slot record.
    function initializeCollator(slots, locales, options) {
        var requested = canonicalizeLocaleList(locales);
        options = coerceOptions(options);
        slots.usage = getOption(
            options,
            "usage",
            "string",
            ["sort", "search"],
            "sort",
        );
        var opt = objectCreate(null);
        opt.localeMatcher = localeMatcherOption(options);
        var collation = getOption(
            options,
            "collation",
            "string",
            undefined,
            undefined,
        );
        if (collation !== undefined && !isUnicodeType(collation))
            throw new RangeErrorConstructor("Invalid collation : " + collation);
        opt.co = collation;
        var numeric = getOption(
            options,
            "numeric",
            "boolean",
            undefined,
            undefined,
        );
        opt.kn = numeric === undefined ? undefined : toStr(numeric);
        opt.kf = getOption(
            options,
            "caseFirst",
            "string",
            ["upper", "lower", "false"],
            undefined,
        );
        var r = resolveLocale(requested, opt, ["co", "kf", "kn"], {
            co: [null],
            kf: ["false", "lower", "upper"],
            kn: ["false", "true"],
        });
        slots.locale = r.locale;
        slots.collation = r.co === null ? "default" : r.co;
        slots.numeric = r.kn === "true";
        slots.caseFirst = r.kf;
        var sensitivity = getOption(
            options,
            "sensitivity",
            "string",
            ["base", "accent", "case", "variant"],
            undefined,
        );
        slots.sensitivity = sensitivity === undefined ? "variant" : sensitivity;
        var ignorePunctuation = getOption(
            options,
            "ignorePunctuation",
            "boolean",
            undefined,
            undefined,
        );
        slots.ignorePunctuation =
            ignorePunctuation === undefined ? false : ignorePunctuation;
        return slots;
    }

    // ---- Date and time patterns (ECMA-402 11, ICU's en data) ---------------
    // Formats are ICU date patterns, held as lists of fields { c, n } and
    // literal strings. A skeleton names the requested fields; bestPattern
    // follows ICU's DateTimePatternGenerator on CLDR's en data and the range
    // formats follow ICU's DateIntervalFormat, quirks included, so that the
    // output matches Node.js. The tables are built on first use.

    var monthNames = [
            "January",
            "February",
            "March",
            "April",
            "May",
            "June",
            "July",
            "August",
            "September",
            "October",
            "November",
            "December",
        ],
        weekdayNames = [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
        ],
        weekdayShorter = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
    // The generator's table in ICU's order of precedence: canonical items,
    // the style patterns of DateFormat and CLDR's available formats, which
    // replace the entries with the same fields. Pairs of a specified
    // skeleton ("" for the pattern's own fields) and a pattern.
    var generatorTable = [
        "",
        "G",
        "y",
        "y",
        "M",
        "L",
        "E",
        "ccc",
        "d",
        "d",
        "",
        "a",
        "H",
        "HH",
        "",
        "m",
        "",
        "s",
        "",
        "S",
        "",
        "v",
        "",
        "EEEE, MMMM d, y",
        "",
        "h:mm:ss\u202fa zzzz",
        "",
        "MMMM d, y",
        "",
        "h:mm:ss\u202fa z",
        "yMMMd",
        "MMM d, y",
        "",
        "h:mm:ss\u202fa",
        "",
        "M/d/yy",
        "",
        "h:mm\u202fa",
        "Bh",
        "h B",
        "Bhm",
        "h:mm B",
        "Bhms",
        "h:mm:ss B",
        "EBh",
        "E h B",
        "EBhm",
        "E h:mm B",
        "EBhms",
        "E h:mm:ss B",
        "Ed",
        "d E",
        "Eh",
        "E h\u202fa",
        "Ehm",
        "E h:mm\u202fa",
        "EHm",
        "E HH:mm",
        "Ehms",
        "E h:mm:ss\u202fa",
        "EHms",
        "E HH:mm:ss",
        "Gy",
        "y G",
        "GyM",
        "M/y G",
        "GyMd",
        "M/d/y G",
        "GyMEd",
        "E, M/d/y G",
        "GyMMM",
        "MMM y G",
        "GyMMMd",
        "MMM d, y G",
        "GyMMMEd",
        "E, MMM d, y G",
        "h",
        "h\u202fa",
        "hm",
        "h:mm\u202fa",
        "Hm",
        "HH:mm",
        "hms",
        "h:mm:ss\u202fa",
        "Hms",
        "HH:mm:ss",
        "hmsv",
        "h:mm:ss\u202fa v",
        "Hmsv",
        "HH:mm:ss v",
        "hmv",
        "h:mm\u202fa v",
        "Hmv",
        "HH:mm v",
        "hv",
        "h\u202fa v",
        "Hv",
        "HH v",
        "Md",
        "M/d",
        "MEd",
        "E, M/d",
        "MMM",
        "LLL",
        "MMMd",
        "MMM d",
        "MMMEd",
        "E, MMM d",
        "MMMMd",
        "MMMM d",
        "ms",
        "mm:ss",
        "yM",
        "M/y",
        "yMd",
        "M/d/y",
        "yMEd",
        "E, M/d/y",
        "yMMM",
        "MMM y",
        "yMMMEd",
        "E, MMM d, y",
        "yMMMM",
        "MMMM y",
    ];
    // The style patterns of DateFormat, which ICU adds to the generator too.
    var dateStylePatterns = {
            full: "EEEE, MMMM d, y",
            long: "MMMM d, y",
            medium: "MMM d, y",
            short: "M/d/yy",
        },
        timeStylePatterns = {
            full: "h:mm:ss\u202fa zzzz",
            long: "h:mm:ss\u202fa z",
            medium: "h:mm:ss\u202fa",
            short: "h:mm\u202fa",
        };
    // Interval formats by skeleton and by the letter of the largest
    // different field.
    var intervalFormats = {
        Bh: { B: "h B\u2009\u2013\u2009h B", h: "h\u2009\u2013\u2009h B" },
        Bhm: {
            B: "h:mm B\u2009\u2013\u2009h:mm B",
            h: "h:mm\u2009\u2013\u2009h:mm B",
            m: "h:mm\u2009\u2013\u2009h:mm B",
        },
        d: { d: "d\u2009\u2013\u2009d" },
        Gy: { G: "y G\u2009\u2013\u2009y G", y: "y\u2009\u2013\u2009y G" },
        GyM: {
            G: "M/y G\u2009\u2013\u2009M/y G",
            M: "M/y\u2009\u2013\u2009M/y G",
            y: "M/y\u2009\u2013\u2009M/y G",
        },
        GyMd: {
            d: "M/d/y\u2009\u2013\u2009M/d/y G",
            G: "M/d/y G\u2009\u2013\u2009M/d/y G",
            M: "M/d/y\u2009\u2013\u2009M/d/y G",
            y: "M/d/y\u2009\u2013\u2009M/d/y G",
        },
        GyMEd: {
            d: "E, M/d/y\u2009\u2013\u2009E, M/d/y G",
            G: "E, M/d/y G\u2009\u2013\u2009E, M/d/y G",
            M: "E, M/d/y\u2009\u2013\u2009E, M/d/y G",
            y: "E, M/d/y\u2009\u2013\u2009E, M/d/y G",
        },
        GyMMM: {
            G: "MMM y G\u2009\u2013\u2009MMM y G",
            M: "MMM\u2009\u2013\u2009MMM y G",
            y: "MMM y\u2009\u2013\u2009MMM y G",
        },
        GyMMMd: {
            d: "MMM d\u2009\u2013\u2009d, y G",
            G: "MMM d, y G\u2009\u2013\u2009MMM d, y G",
            M: "MMM d\u2009\u2013\u2009MMM d, y G",
            y: "MMM d, y\u2009\u2013\u2009MMM d, y G",
        },
        GyMMMEd: {
            d: "E, MMM d\u2009\u2013\u2009E, MMM d, y G",
            G: "E, MMM d, y G\u2009\u2013\u2009E, MMM d, y G",
            M: "E, MMM d\u2009\u2013\u2009E, MMM d, y G",
            y: "E, MMM d, y\u2009\u2013\u2009E, MMM d, y G",
        },
        h: {
            a: "h\u202fa\u2009\u2013\u2009h\u202fa",
            h: "h\u2009\u2013\u2009h\u202fa",
        },
        H: { H: "HH\u2009\u2013\u2009HH" },
        hm: {
            a: "h:mm\u202fa\u2009\u2013\u2009h:mm\u202fa",
            h: "h:mm\u2009\u2013\u2009h:mm\u202fa",
            m: "h:mm\u2009\u2013\u2009h:mm\u202fa",
        },
        Hm: {
            H: "HH:mm\u2009\u2013\u2009HH:mm",
            m: "HH:mm\u2009\u2013\u2009HH:mm",
        },
        hmv: {
            a: "h:mm\u202fa\u2009\u2013\u2009h:mm\u202fa v",
            h: "h:mm\u2009\u2013\u2009h:mm\u202fa v",
            m: "h:mm\u2009\u2013\u2009h:mm\u202fa v",
        },
        Hmv: {
            H: "HH:mm\u2009\u2013\u2009HH:mm v",
            m: "HH:mm\u2009\u2013\u2009HH:mm v",
        },
        hv: {
            a: "h\u202fa\u2009\u2013\u2009h\u202fa v",
            h: "h\u2009\u2013\u2009h\u202fa v",
        },
        Hv: { H: "HH\u2009\u2013\u2009HH v" },
        M: { M: "M\u2009\u2013\u2009M" },
        Md: { d: "M/d\u2009\u2013\u2009M/d", M: "M/d\u2009\u2013\u2009M/d" },
        MEd: {
            d: "E, M/d\u2009\u2013\u2009E, M/d",
            M: "E, M/d\u2009\u2013\u2009E, M/d",
        },
        MMM: { M: "MMM\u2009\u2013\u2009MMM" },
        MMMd: {
            d: "MMM d\u2009\u2013\u2009d",
            M: "MMM d\u2009\u2013\u2009MMM d",
        },
        MMMEd: {
            d: "E, MMM d\u2009\u2013\u2009E, MMM d",
            M: "E, MMM d\u2009\u2013\u2009E, MMM d",
        },
        y: { y: "y\u2009\u2013\u2009y" },
        yM: { M: "M/y\u2009\u2013\u2009M/y", y: "M/y\u2009\u2013\u2009M/y" },
        yMd: {
            d: "M/d/y\u2009\u2013\u2009M/d/y",
            M: "M/d/y\u2009\u2013\u2009M/d/y",
            y: "M/d/y\u2009\u2013\u2009M/d/y",
        },
        yMEd: {
            d: "E, M/d/y\u2009\u2013\u2009E, M/d/y",
            M: "E, M/d/y\u2009\u2013\u2009E, M/d/y",
            y: "E, M/d/y\u2009\u2013\u2009E, M/d/y",
        },
        yMMM: {
            M: "MMM\u2009\u2013\u2009MMM y",
            y: "MMM y\u2009\u2013\u2009MMM y",
        },
        yMMMd: {
            d: "MMM d\u2009\u2013\u2009d, y",
            M: "MMM d\u2009\u2013\u2009MMM d, y",
            y: "MMM d, y\u2009\u2013\u2009MMM d, y",
        },
        yMMMEd: {
            d: "E, MMM d\u2009\u2013\u2009E, MMM d, y",
            M: "E, MMM d\u2009\u2013\u2009E, MMM d, y",
            y: "E, MMM d, y\u2009\u2013\u2009E, MMM d, y",
        },
        yMMMM: {
            M: "MMMM\u2009\u2013\u2009MMMM y",
            y: "MMMM y\u2009\u2013\u2009MMMM y",
        },
    };
    var rangeSeparator = "\u2009\u2013\u2009";

    function isPatternLetter(c) {
        return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
    }
    // Hot paths slice literals instead of building them per character: the
    // prelude allocates little, which matters for GC stress tests.
    function parsePattern(pattern) {
        var items = [],
            literal = "",
            quoted = false,
            i = 0,
            start = 0,
            n = pattern.length;
        while (i < n) {
            var c = code(pattern, i);
            if (c === 39) {
                if (start < i) literal += slice(pattern, start, i);
                if (i + 1 < n && code(pattern, i + 1) === 39) {
                    literal += "'";
                    i += 2;
                } else {
                    quoted = !quoted;
                    i++;
                }
                start = i;
            } else if (!quoted && isPatternLetter(c)) {
                if (start < i) literal += slice(pattern, start, i);
                if (literal !== "") push(items, literal);
                literal = "";
                var first = i;
                while (i < n && code(pattern, i) === c) i++;
                push(items, { c: pattern[first], n: i - first });
                start = i;
            } else i++;
        }
        if (start < n) literal += slice(pattern, start, n);
        if (literal !== "") push(items, literal);
        return items;
    }
    function repeatLetter(c, n) {
        var text = c;
        while (text.length < n) text += c;
        return text;
    }
    // The pattern string of items; literals with letters are quoted.
    function patternString(items) {
        var text = "";
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (typeof item !== "string") {
                text += repeatLetter(item.c, item.n);
                continue;
            }
            var quote = false,
                apostrophe = false;
            for (var j = 0; j < item.length; j++) {
                if (isPatternLetter(code(item, j))) quote = true;
                if (code(item, j) === 39) apostrophe = true;
            }
            var body = item;
            if (apostrophe) {
                body = "";
                for (var k = 0; k < item.length; k++)
                    body += item[k] === "'" ? "''" : item[k];
            }
            text += quote ? "'" + body + "'" : body;
        }
        return text;
    }

    // DateTimePatternGenerator fields (UDATPG_*_FIELD) and type values.
    var ERA_FIELD = 0,
        YEAR_FIELD = 1,
        MONTH_FIELD = 3,
        WEEKDAY_FIELD = 6,
        DAY_FIELD = 9,
        DAYPERIOD_FIELD = 10,
        HOUR_FIELD = 11,
        MINUTE_FIELD = 12,
        SECOND_FIELD = 13,
        FRACTIONAL_FIELD = 14,
        ZONE_FIELD = 15,
        FIELD_COUNT = 16;
    var NUMERIC = 0x100,
        DELTA = 0x10,
        NARROW = -0x101,
        SHORTER = -0x102,
        SHORT = -0x103,
        LONG = -0x104;
    // For each letter: its field, then pairs of minimum length and type.
    var letterTypes = {
        G: [ERA_FIELD, 1, SHORT, 4, LONG, 5, NARROW],
        y: [YEAR_FIELD, 1, NUMERIC],
        M: [MONTH_FIELD, 1, NUMERIC, 3, SHORT, 4, LONG, 5, NARROW],
        L: [
            MONTH_FIELD,
            1,
            NUMERIC + DELTA,
            3,
            SHORT - DELTA,
            4,
            LONG - DELTA,
            5,
            NARROW - DELTA,
        ],
        E: [WEEKDAY_FIELD, 1, SHORT, 4, LONG, 5, NARROW, 6, SHORTER],
        c: [
            WEEKDAY_FIELD,
            1,
            NUMERIC + 2 * DELTA,
            3,
            SHORT - 2 * DELTA,
            4,
            LONG - 2 * DELTA,
            5,
            NARROW - 2 * DELTA,
            6,
            SHORTER - 2 * DELTA,
        ],
        d: [DAY_FIELD, 1, NUMERIC],
        a: [DAYPERIOD_FIELD, 1, SHORT, 4, LONG, 5, NARROW],
        B: [
            DAYPERIOD_FIELD,
            1,
            SHORT - 3 * DELTA,
            4,
            LONG - 3 * DELTA,
            5,
            NARROW - 3 * DELTA,
        ],
        H: [HOUR_FIELD, 1, NUMERIC + 10 * DELTA],
        k: [HOUR_FIELD, 1, NUMERIC + 11 * DELTA],
        h: [HOUR_FIELD, 1, NUMERIC],
        K: [HOUR_FIELD, 1, NUMERIC + DELTA],
        m: [MINUTE_FIELD, 1, NUMERIC],
        s: [SECOND_FIELD, 1, NUMERIC],
        S: [FRACTIONAL_FIELD, 1, NUMERIC],
        v: [ZONE_FIELD, 1, SHORT - 2 * DELTA, 4, LONG - 2 * DELTA],
        z: [ZONE_FIELD, 1, SHORT, 4, LONG],
        O: [ZONE_FIELD, 1, SHORT - DELTA, 4, LONG - DELTA],
    };
    function letterRow(c) {
        return call(hasOwnProperty, letterTypes, c)
            ? letterTypes[c]
            : undefined;
    }
    // The position of the type of a field of n letters in its row.
    function rowIndex(row, n) {
        var k = 1;
        while (k + 2 < row.length && row[k + 2] <= n) k += 2;
        return k;
    }
    function rowType(row, k, n) {
        var type = row[k + 1];
        return type > 0 ? type + n : type;
    }
    // DateTimeMatcher: the fields of a skeleton or pattern, with their
    // letters, lengths, type values and base lengths.
    function fieldArray(value) {
        return [
            value,
            value,
            value,
            value,
            value,
            value,
            value,
            value,
            value,
            value,
            value,
            value,
            value,
            value,
            value,
            value,
        ];
    }
    function newMatcher() {
        return {
            type: fieldArray(0),
            c: fieldArray(""),
            n: fieldArray(0),
            base: fieldArray(0),
        };
    }
    function setField(m, f, c, n, type, base) {
        m.type[f] = type;
        m.c[f] = c;
        m.n[f] = n;
        m.base[f] = base;
    }
    function addField(m, c, n) {
        var row = letterRow(c);
        if (row === undefined) return;
        var k = rowIndex(row, n);
        setField(m, row[0], c, n, rowType(row, k, n), row[k]);
    }
    function finishMatcher(m) {
        // Minutes and fractions of a second need the seconds between them.
        if (
            m.type[MINUTE_FIELD] &&
            m.type[FRACTIONAL_FIELD] &&
            !m.type[SECOND_FIELD]
        )
            setField(m, SECOND_FIELD, "s", 1, NUMERIC + 1, 1);
        // A 12-hour clock needs a day period; a 24-hour clock ignores it.
        if (m.c[HOUR_FIELD] === "h" || m.c[HOUR_FIELD] === "K") {
            if (!m.type[DAYPERIOD_FIELD])
                setField(m, DAYPERIOD_FIELD, "a", 1, SHORT, 1);
        } else if (m.type[HOUR_FIELD] && m.type[DAYPERIOD_FIELD])
            setField(m, DAYPERIOD_FIELD, "", 0, 0, 0);
        return m;
    }
    // Fills a matcher from a skeleton or pattern string, without items.
    function fillMatcher(m, text) {
        for (var f = 0; f < FIELD_COUNT; f++) setField(m, f, "", 0, 0, 0);
        var quoted = false,
            i = 0,
            n = text.length;
        while (i < n) {
            var c = code(text, i);
            if (c === 39) quoted = !quoted;
            if (quoted || !isPatternLetter(c)) {
                i++;
                continue;
            }
            var first = i;
            while (i < n && code(text, i) === c) i++;
            addField(m, text[first], i - first);
        }
        return finishMatcher(m);
    }
    function matcher(text) {
        return fillMatcher(newMatcher(), text);
    }
    function itemsMatcher(items) {
        var m = newMatcher();
        for (var i = 0; i < items.length; i++)
            if (typeof items[i] !== "string")
                addField(m, items[i].c, items[i].n);
        return finishMatcher(m);
    }
    function fieldMask(m) {
        var mask = 0;
        for (var f = 0; f < FIELD_COUNT; f++) if (m.type[f]) mask |= 1 << f;
        return mask;
    }
    // staticGetSkeleton: the fields of a pattern in field order.
    function skeletonOf(items) {
        var m = itemsMatcher(items),
            text = "";
        for (var f = 0; f < FIELD_COUNT; f++)
            if (m.n[f]) text += repeatLetter(m.c[f], m.n[f]);
        return text;
    }

    // The entries' matchers are filled into one scratch matcher; patterns
    // and specified skeletons are read when an entry is chosen.
    var entryFieldList = [],
        entryPatterns = [],
        entrySkeletons = [];
    function entryPattern(index) {
        if (entryPatterns[index] === undefined)
            entryPatterns[index] = parsePattern(generatorTable[2 * index + 1]);
        return entryPatterns[index];
    }
    function entrySpecified(index) {
        var skeleton = generatorTable[2 * index];
        if (skeleton === "") return undefined;
        if (entrySkeletons[index] === undefined)
            entrySkeletons[index] = matcher(skeleton);
        return entrySkeletons[index];
    }
    // The field types and the field mask of every entry, read once:
    // matching runs for each DateTimeFormat, and GC stress collects before
    // every operation. This is fillMatcher without the letters and lengths.
    function entryOf(text) {
        var type = fieldArray(0),
            mask = 0,
            hour = "",
            quoted = false,
            i = 0,
            n = text.length;
        while (i < n) {
            var c = code(text, i);
            if (c === 39) quoted = !quoted;
            if (quoted || !isPatternLetter(c)) {
                i++;
                continue;
            }
            var first = i;
            while (i < n && code(text, i) === c) i++;
            var letter = text[first],
                row = letterRow(letter);
            if (row === undefined) continue;
            var f = row[0];
            type[f] = rowType(row, rowIndex(row, i - first), i - first);
            mask |= 1 << f;
            if (f === HOUR_FIELD) hour = letter;
        }
        if (
            type[MINUTE_FIELD] &&
            type[FRACTIONAL_FIELD] &&
            !type[SECOND_FIELD]
        ) {
            type[SECOND_FIELD] = NUMERIC + 1;
            mask |= 1 << SECOND_FIELD;
        }
        if (hour === "h" || hour === "K") {
            if (!type[DAYPERIOD_FIELD]) {
                type[DAYPERIOD_FIELD] = SHORT;
                mask |= 1 << DAYPERIOD_FIELD;
            }
        } else if (type[HOUR_FIELD] && type[DAYPERIOD_FIELD]) {
            type[DAYPERIOD_FIELD] = 0;
            mask &= ~(1 << DAYPERIOD_FIELD);
        }
        return { type: type, mask: mask };
    }
    function entryFields() {
        if (entryFieldList.length === 0)
            for (var i = 0; 2 * i < generatorTable.length; i++) {
                var skeleton = generatorTable[2 * i];
                push(
                    entryFieldList,
                    entryOf(
                        skeleton === "" ? generatorTable[2 * i + 1] : skeleton,
                    ),
                );
            }
        return entryFieldList;
    }
    function bestRaw(request, mask) {
        var entries = entryFields(),
            wanted = fieldMask(request) & mask,
            mine = [],
            best,
            bestDistance = 1 / 0,
            bestMissing = -1,
            bestExtra = 0;
        for (var f = 0; f < FIELD_COUNT; f++)
            if (wanted & (1 << f)) push(mine, f);
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i],
                distance = 0;
            for (var k = 0; k < mine.length; k++) {
                var a = request.type[mine[k]],
                    b = entry.type[mine[k]];
                if (b === 0) distance += 0x1000;
                else distance += a > b ? a - b : b - a;
            }
            for (var extra = entry.mask & ~wanted; extra; extra &= extra - 1)
                distance += 0x10000;
            if (distance > bestDistance) continue;
            var missing = wanted & ~entry.mask;
            if (distance < bestDistance || bestMissing < missing) {
                bestDistance = distance;
                bestMissing = missing;
                bestExtra = entry.mask & ~wanted;
                best = i;
                if (distance === 0) break;
            }
        }
        return { index: best, missing: bestMissing, extra: bestExtra };
    }
    // adjustFieldTypes: the widths and letters of the request in a found
    // pattern. options.hour matches the length of the hour field (V8 asks
    // for it, DateIntervalFormat does not); options.letter is the hour
    // letter of the locale's hour cycle.
    function adjustFieldTypes(items, specified, request, options, fix) {
        var result = [];
        for (var i = 0; i < items.length; i++) {
            var item = items[i],
                row = typeof item === "string" ? undefined : letterRow(item.c);
            if (row === undefined) {
                push(result, item);
                continue;
            }
            var f = row[0];
            if (fix && f === SECOND_FIELD) {
                push(result, item);
                push(result, ".");
                push(result, {
                    c: request.c[FRACTIONAL_FIELD],
                    n: request.n[FRACTIONAL_FIELD],
                });
                continue;
            }
            if (!request.type[f]) {
                push(result, item);
                continue;
            }
            var requested = request.c[f],
                length = request.n[f];
            if (requested === "E" && length < 3) length = 3;
            if (
                f === MINUTE_FIELD ||
                f === SECOND_FIELD ||
                (f === HOUR_FIELD && !options.hour)
            )
                length = item.n;
            else if (specified !== undefined && requested !== "c") {
                var numeric = rowType(row, rowIndex(row, item.n), item.n) > 0,
                    specifiedNumeric = specified.type[f] > 0;
                if (specified.n[f] === length || numeric !== specifiedNumeric)
                    length = item.n;
            }
            var c =
                f !== HOUR_FIELD &&
                f !== MONTH_FIELD &&
                f !== WEEKDAY_FIELD &&
                f !== YEAR_FIELD
                    ? requested
                    : item.c;
            if (f === HOUR_FIELD) {
                var letter = options.letter;
                if (requested === letter) c = letter;
                else if (requested === "h" && letter === "K") c = "K";
                else if (requested === "H" && letter === "k") c = "k";
                else if (requested === "k" && letter === "H") c = "H";
                else if (requested === "K" && letter === "h") c = "h";
            }
            push(result, { c: c, n: length });
        }
        return result;
    }
    // appendItems of en (and root for the fields en leaves out).
    function appendItem(items, extra, field) {
        var names = [
            "era",
            "year",
            "quarter",
            "month",
            "week",
            "week of month",
            "day of the week",
            "day of year",
            "weekday of the month",
            "day",
            "AM/PM",
            "hour",
            "minute",
            "second",
            "F14",
            "time zone",
        ];
        if (
            field === ERA_FIELD ||
            field === YEAR_FIELD ||
            field === WEEKDAY_FIELD ||
            field === ZONE_FIELD
        )
            return items.concat([" "], extra);
        if (
            field === DAYPERIOD_FIELD ||
            field === FRACTIONAL_FIELD ||
            field === 5 ||
            field === 7 ||
            field === 8
        )
            return items.concat([" \u251c" + names[field] + ": "], extra, [
                "\u2524",
            ]);
        return items.concat([" (" + names[field] + ": "], extra, [")"]);
    }
    function topBit(mask) {
        var bit = -1;
        while (mask) {
            mask >>>= 1;
            bit++;
        }
        return bit;
    }
    function bestAppending(request, fields, options) {
        if (!fields) return undefined;
        var raw = bestRaw(request, fields),
            result = adjustFieldTypes(
                entryPattern(raw.index),
                entrySpecified(raw.index),
                request,
                options,
                false,
            ),
            missing = raw.missing,
            secondAndFraction = (1 << SECOND_FIELD) | (1 << FRACTIONAL_FIELD);
        while (missing) {
            if (
                (missing & secondAndFraction) === 1 << FRACTIONAL_FIELD &&
                (fields & secondAndFraction) === secondAndFraction
            ) {
                result = adjustFieldTypes(
                    result,
                    entrySpecified(raw.index),
                    request,
                    options,
                    true,
                );
                missing &= ~(1 << FRACTIONAL_FIELD);
                continue;
            }
            var starting = missing;
            raw = bestRaw(request, missing);
            missing = raw.missing;
            var found = starting & ~missing;
            if (!found) break;
            result = appendItem(
                result,
                adjustFieldTypes(
                    entryPattern(raw.index),
                    entrySpecified(raw.index),
                    request,
                    options,
                    false,
                ),
                topBit(found),
            );
        }
        return result;
    }
    // getBestPattern; options as for adjustFieldTypes, by default V8's
    // (UDATPG_MATCH_HOUR_FIELD_LENGTH in en).
    var v8PatternOptions = { hour: true, letter: "h" };
    function bestPattern(skeleton, options) {
        if (options === undefined) options = v8PatternOptions;
        var request = matcher(skeleton),
            raw = bestRaw(request, -1);
        if (!raw.missing && !raw.extra)
            return adjustFieldTypes(
                entryPattern(raw.index),
                entrySpecified(raw.index),
                request,
                options,
                false,
            );
        var needed = fieldMask(request),
            datePart = bestAppending(request, needed & 0x3ff, options),
            timePart = bestAppending(request, needed & ~0x3ff, options);
        if (datePart === undefined) return timePart;
        if (timePart === undefined) return datePart;
        // The date-time combination of the style of the month: full and
        // long join with "at".
        return datePart.concat(
            [request.base[MONTH_FIELD] === 4 ? " at " : ", "],
            timePart,
        );
    }
    var hourCycleLetters = { h11: "K", h12: "h", h23: "H", h24: "k" };
    function isHourLetter(c) {
        return c === "h" || c === "H" || c === "k" || c === "K";
    }
    // V8's ReplaceHourCycleInPattern.
    function replaceHourCycle(items, hourCycle) {
        var letter = hourCycleLetters[hourCycle],
            result = [];
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (typeof item !== "string" && isHourLetter(item.c)) {
                var previous = items[i - 1];
                if (i > 0 && typeof previous !== "string" && previous.c === "d")
                    push(result, " ");
                item = { c: letter, n: item.n };
            }
            push(result, item);
        }
        return result;
    }
    // V8's DateTimeStylePattern: the style patterns, regenerated for an
    // hour cycle other than en's h12.
    function stylePattern(dateStyle, timeStyle, hourCycle) {
        var datePart =
                dateStyle === undefined
                    ? undefined
                    : parsePattern(dateStylePatterns[dateStyle]),
            timePart =
                timeStyle === undefined
                    ? undefined
                    : parsePattern(timeStylePatterns[timeStyle]);
        if (timePart === undefined) return datePart;
        var items =
            datePart === undefined
                ? timePart
                : datePart.concat(
                      [
                          dateStyle === "full" || dateStyle === "long"
                              ? " at "
                              : ", ",
                      ],
                      timePart,
                  );
        if (hourCycle === undefined || hourCycle === "h12") return items;
        var skeleton = skeletonOf(items),
            letter = hourCycleLetters[hourCycle],
            replaced = "";
        for (var i = 0; i < skeleton.length; i++) {
            var c = skeleton[i];
            if (c === "a" || c === "b" || c === "B") continue;
            replaced += isHourLetter(c) ? letter : c;
        }
        return replaceHourCycle(bestPattern(replaced), hourCycle);
    }

    // ---- Date and time format options (ECMA-402 11.1) -----------------------

    var componentOptions = [
        ["weekday", ["narrow", "short", "long"]],
        ["era", ["narrow", "short", "long"]],
        ["year", ["2-digit", "numeric"]],
        ["month", ["2-digit", "numeric", "narrow", "short", "long"]],
        ["day", ["2-digit", "numeric"]],
        ["dayPeriod", ["narrow", "short", "long"]],
        ["hour", ["2-digit", "numeric"]],
        ["minute", ["2-digit", "numeric"]],
        ["second", ["2-digit", "numeric"]],
        ["fractionalSecondDigits"],
        [
            "timeZoneName",
            [
                "short",
                "long",
                "shortOffset",
                "longOffset",
                "shortGeneric",
                "longGeneric",
            ],
        ],
    ];
    // V8's skeleton letters for the component options.
    var skeletonLetters = {
        weekday: { narrow: "EEEEE", short: "EEE", long: "EEEE" },
        era: { narrow: "GGGGG", short: "G", long: "GGGG" },
        year: { "2-digit": "yy", numeric: "y" },
        month: {
            "2-digit": "MM",
            numeric: "M",
            narrow: "MMMMM",
            short: "MMM",
            long: "MMMM",
        },
        day: { "2-digit": "dd", numeric: "d" },
        dayPeriod: { narrow: "BBBBB", short: "B", long: "BBBB" },
        minute: { "2-digit": "mm", numeric: "m" },
        second: { "2-digit": "ss", numeric: "s" },
        timeZoneName: {
            short: "z",
            long: "zzzz",
            shortOffset: "O",
            longOffset: "OOOO",
            shortGeneric: "v",
            longGeneric: "vvvv",
        },
    };
    // V8 reads the resolved components back from the pattern text, quoted
    // literals included.
    var resolvedPatterns = [
        [
            "weekday",
            "EEEEE",
            "narrow",
            "EEEE",
            "long",
            "EEE",
            "short",
            "ccccc",
            "narrow",
            "cccc",
            "long",
            "ccc",
            "short",
        ],
        [
            "era",
            "GGGGG",
            "narrow",
            "GGGG",
            "long",
            "GGG",
            "short",
            "GG",
            "short",
            "G",
            "short",
        ],
        ["year", "yy", "2-digit", "y", "numeric"],
        [
            "month",
            "MMMMM",
            "narrow",
            "MMMM",
            "long",
            "MMM",
            "short",
            "MM",
            "2-digit",
            "M",
            "numeric",
            "LLLLL",
            "narrow",
            "LLLL",
            "long",
            "LLL",
            "short",
            "LL",
            "2-digit",
            "L",
            "numeric",
        ],
        ["day", "dd", "2-digit", "d", "numeric"],
        [
            "dayPeriod",
            "BBBBB",
            "narrow",
            "bbbbb",
            "narrow",
            "BBBB",
            "long",
            "bbbb",
            "long",
            "B",
            "short",
            "b",
            "short",
        ],
        [
            "hour",
            "HH",
            "2-digit",
            "H",
            "numeric",
            "hh",
            "2-digit",
            "h",
            "numeric",
            "kk",
            "2-digit",
            "k",
            "numeric",
            "KK",
            "2-digit",
            "K",
            "numeric",
        ],
        ["minute", "mm", "2-digit", "m", "numeric"],
        ["second", "ss", "2-digit", "s", "numeric"],
        [
            "timeZoneName",
            "zzzz",
            "long",
            "z",
            "short",
            "OOOO",
            "longOffset",
            "O",
            "shortOffset",
            "vvvv",
            "longGeneric",
            "v",
            "shortGeneric",
        ],
    ];
    // Time zones: Nona's local time is UTC, so the host's zone resolves to
    // UTC. The aliases of UTC and fixed offsets are available; other IANA
    // names are not.
    var utcNames = [
        "utc",
        "etc/utc",
        "uct",
        "etc/uct",
        "gmt",
        "etc/gmt",
        "gmt0",
        "etc/gmt0",
        "gmt+0",
        "etc/gmt+0",
        "gmt-0",
        "etc/gmt-0",
        "greenwich",
        "etc/greenwich",
        "universal",
        "etc/universal",
        "zulu",
        "etc/zulu",
    ];
    function twoDigits(text, index) {
        var a = code(text, index) - 48,
            b = code(text, index + 1) - 48;
        return a >= 0 && a <= 9 && b >= 0 && b <= 9 ? a * 10 + b : -1;
    }
    // A UTC offset (+HH, +HHMM, +HH:MM) in minutes, or undefined.
    function parseOffset(text) {
        var n = text.length;
        if (n < 3 || (text[0] !== "+" && text[0] !== "-")) return undefined;
        var hours = twoDigits(text, 1),
            minutes = 0;
        if (n === 5) minutes = twoDigits(text, 3);
        else if (n === 6 && text[3] === ":") minutes = twoDigits(text, 4);
        else if (n !== 3) return undefined;
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59)
            return undefined;
        var offset = hours * 60 + minutes;
        return text[0] === "-" && offset ? -offset : offset;
    }
    function pad(value, length) {
        var text = "" + value;
        while (text.length < length) text = "0" + text;
        return text;
    }
    function offsetName(offset, prefix, long) {
        var abs = offset < 0 ? -offset : offset,
            hours = mathFloor(abs / 60),
            minutes = abs % 60;
        return (
            prefix +
            (offset < 0 ? "-" : "+") +
            (long
                ? pad(hours, 2) + ":" + pad(minutes, 2)
                : hours + (minutes ? ":" + pad(minutes, 2) : ""))
        );
    }
    function resolveTimeZone(slots, name) {
        var offset = parseOffset(name);
        if (offset !== undefined) {
            slots.timeZone = offsetName(offset, "", true);
            slots.offset = offset;
        } else if (contains(utcNames, asciiLower(name))) {
            slots.timeZone = "UTC";
            slots.offset = 0;
        } else
            throw new RangeErrorConstructor(
                "Invalid time zone specified: " + name,
            );
    }
    // The locale without a keyword of its Unicode extension (and without
    // the extension if it is left empty).
    function removeKeyword(locale, key) {
        var parts = split(locale, "-"),
            kept = [],
            result = [],
            unicode = false;
        for (var i = 0; i < parts.length; i++) {
            var part = parts[i];
            if (part.length === 1) unicode = part === "u";
            else if (unicode && part === key) {
                while (i + 1 < parts.length && parts[i + 1].length > 2) i++;
                continue;
            }
            push(kept, part);
        }
        for (var k = 0; k < kept.length; k++)
            if (
                kept[k] !== "u" ||
                (k + 1 < kept.length && kept[k + 1].length > 1)
            )
                push(result, kept[k]);
        return join(result, "-");
    }
    // CreateDateTimeFormat (ECMA-402 11.1.2) with V8's pattern selection.
    function initializeDateTimeFormat(
        slots,
        locales,
        options,
        required,
        defaults,
    ) {
        var requested = canonicalizeLocaleList(locales);
        options = coerceOptions(options);
        var opt = objectCreate(null);
        opt.localeMatcher = localeMatcherOption(options);
        var calendar = getOption(
            options,
            "calendar",
            "string",
            undefined,
            undefined,
        );
        if (calendar !== undefined && !isUnicodeType(calendar))
            throw new RangeErrorConstructor("Invalid calendar : " + calendar);
        opt.ca = calendar;
        var numberingSystem = getOption(
            options,
            "numberingSystem",
            "string",
            undefined,
            undefined,
        );
        if (numberingSystem !== undefined && !isUnicodeType(numberingSystem))
            throw new RangeErrorConstructor(
                "Invalid numberingSystem : " + numberingSystem,
            );
        opt.nu = numberingSystem;
        var hour12 = getOption(options, "hour12", "boolean", undefined);
        var hourCycle = getOption(
            options,
            "hourCycle",
            "string",
            ["h11", "h12", "h23", "h24"],
            undefined,
        );
        opt.hc = hour12 !== undefined ? undefined : hourCycle;
        var r = resolveLocale(requested, opt, ["ca", "hc", "nu"], {
            ca: ["gregory"],
            hc: [null, "h11", "h12", "h23", "h24"],
            nu: ["latn"],
        });
        slots.locale = r.locale;
        slots.calendar = r.ca;
        slots.numberingSystem = r.nu;
        var timeZone = options.timeZone;
        if (timeZone === undefined) {
            slots.timeZone = "UTC";
            slots.offset = 0;
        } else resolveTimeZone(slots, toStr(timeZone));
        var formatOptions = objectCreate(null),
            explicit;
        for (var i = 0; i < componentOptions.length; i++) {
            var name = componentOptions[i][0],
                value =
                    name === "fractionalSecondDigits"
                        ? getNumberOption(options, name, 1, 3, undefined)
                        : getOption(
                              options,
                              name,
                              "string",
                              componentOptions[i][1],
                              undefined,
                          );
            formatOptions[name] = value;
            if (value !== undefined && explicit === undefined) explicit = name;
        }
        getOption(
            options,
            "formatMatcher",
            "string",
            ["basic", "best fit"],
            "best fit",
        );
        var styles = ["full", "long", "medium", "short"],
            dateStyle = getOption(
                options,
                "dateStyle",
                "string",
                styles,
                undefined,
            ),
            timeStyle = getOption(
                options,
                "timeStyle",
                "string",
                styles,
                undefined,
            ),
            hasStyle = dateStyle !== undefined || timeStyle !== undefined;
        if (hasStyle) {
            if (explicit !== undefined)
                throw new TypeErrorConstructor(
                    "Can't set option " +
                        explicit +
                        " when " +
                        (dateStyle !== undefined ? "dateStyle" : "timeStyle") +
                        " is used",
                );
            if (required === "date" && timeStyle !== undefined)
                throw new TypeErrorConstructor("Invalid option : timeStyle");
            if (required === "time" && dateStyle !== undefined)
                throw new TypeErrorConstructor("Invalid option : dateStyle");
        } else {
            var needDefaults = true,
                fields =
                    required === "date"
                        ? ["weekday", "year", "month", "day"]
                        : required === "time"
                          ? [
                                "dayPeriod",
                                "hour",
                                "minute",
                                "second",
                                "fractionalSecondDigits",
                            ]
                          : [
                                "weekday",
                                "year",
                                "month",
                                "day",
                                "dayPeriod",
                                "hour",
                                "minute",
                                "second",
                                "fractionalSecondDigits",
                            ];
            for (var k = 0; k < fields.length; k++)
                if (formatOptions[fields[k]] !== undefined)
                    needDefaults = false;
            if (needDefaults && (defaults === "date" || defaults === "all"))
                formatOptions.year =
                    formatOptions.month =
                    formatOptions.day =
                        "numeric";
            if (needDefaults && (defaults === "time" || defaults === "all"))
                formatOptions.hour =
                    formatOptions.minute =
                    formatOptions.second =
                        "numeric";
        }
        // The hour cycle: the option or the locale's hc keyword. hour12
        // picks the 12- or 24-hour cycle of the keyword (h12 or h23 without
        // it), and V8 keeps the keyword only when it stays the hour cycle.
        var hc = r.hc === null ? undefined : r.hc;
        if (hour12 !== undefined) {
            var keyword = hc,
                hasHour = hasStyle
                    ? timeStyle !== undefined
                    : formatOptions.hour !== undefined;
            if (hour12) hc = hc === "h11" || hc === "h12" ? hc : "h12";
            else hc = hc === "h23" || hc === "h24" ? hc : "h23";
            if (keyword !== undefined && (!hasHour || hc !== keyword))
                slots.locale = removeKeyword(slots.locale, "hc");
        }
        var pattern;
        if (hasStyle) pattern = stylePattern(dateStyle, timeStyle, hc);
        else {
            var skeleton = "",
                names = [
                    "weekday",
                    "era",
                    "year",
                    "month",
                    "day",
                    "dayPeriod",
                    "hour",
                    "minute",
                    "second",
                    "fractionalSecondDigits",
                    "timeZoneName",
                ];
            for (var j = 0; j < names.length; j++) {
                var option = formatOptions[names[j]];
                if (option === undefined) continue;
                if (names[j] === "hour") {
                    var letter = hc === undefined ? "h" : hourCycleLetters[hc];
                    skeleton += option === "2-digit" ? letter + letter : letter;
                } else if (names[j] === "fractionalSecondDigits")
                    skeleton += slice("SSS", 0, option);
                else skeleton += skeletonLetters[names[j]][option];
            }
            pattern = bestPattern(skeleton);
            if (hc !== undefined) pattern = replaceHourCycle(pattern, hc);
        }
        slots.pattern = pattern;
        slots.dateStyle = dateStyle;
        slots.timeStyle = timeStyle;
        // resolvedOptions reads the hour cycle and the components back
        // from the pattern, like V8.
        var text = patternString(pattern);
        for (var p = 0; p < pattern.length; p++) {
            var item = pattern[p];
            if (typeof item !== "string" && isHourLetter(item.c)) {
                slots.hourCycle =
                    item.c === "K"
                        ? "h11"
                        : item.c === "h"
                          ? "h12"
                          : item.c === "H"
                            ? "h23"
                            : "h24";
                break;
            }
        }
        if (!hasStyle) {
            var resolved = objectCreate(null);
            for (var q = 0; q < resolvedPatterns.length; q++) {
                var row = resolvedPatterns[q];
                for (var e = 1; e < row.length; e += 2)
                    if (call(stringIndexOf, text, row[e]) >= 0) {
                        resolved[row[0]] = row[e + 1];
                        break;
                    }
            }
            var fraction = call(stringIndexOf, text, "S");
            if (fraction >= 0) {
                var count = 0;
                while (text[fraction + count] === "S") count++;
                resolved.fractionalSecondDigits = count;
            }
            slots.components = resolved;
        }
        return slots;
    }

    // ---- Date and time formatting (ECMA-402 11.5) ---------------------------

    // TimeClip with ToNumber; NaN for invalid times.
    function timeClip(value) {
        var t = +value;
        if (t !== t || t > 8.64e15 || t < -8.64e15) return NaN;
        t = t < 0 ? -mathFloor(-t) : mathFloor(t);
        return t === 0 ? 0 : t;
    }
    function validTime(value) {
        var t = timeClip(value);
        if (t !== t) throw new RangeErrorConstructor("Invalid time value");
        return t;
    }
    // The proleptic Gregorian fields of a time in the format's time zone.
    function dateFields(slots, t) {
        var local = t + slots.offset * 60000,
            days = mathFloor(local / 86400000),
            time = local - days * 86400000,
            z = days + 719468,
            era = mathFloor(z / 146097),
            doe = z - era * 146097,
            yoe = mathFloor(
                (doe -
                    mathFloor(doe / 1460) +
                    mathFloor(doe / 36524) -
                    mathFloor(doe / 146096)) /
                    365,
            ),
            doy = doe - (365 * yoe + mathFloor(yoe / 4) - mathFloor(yoe / 100)),
            mp = mathFloor((5 * doy + 2) / 153),
            month = mp < 10 ? mp + 2 : mp - 10,
            weekday = (days + 4) % 7;
        return {
            year: yoe + era * 400 + (month < 2 ? 1 : 0),
            month: month,
            day: doy - mathFloor((153 * mp + 2) / 5) + 1,
            weekday: weekday < 0 ? weekday + 7 : weekday,
            hour: mathFloor(time / 3600000),
            minute: mathFloor(time / 60000) % 60,
            second: mathFloor(time / 1000) % 60,
            millisecond: time % 1000,
        };
    }
    function nameOf(names, index, n) {
        var name = names[index];
        return n === 5 ? slice(name, 0, 1) : n === 4 ? name : slice(name, 0, 3);
    }
    function timeZoneName(slots, c, n) {
        var long = n >= 4;
        if (slots.timeZone === "UTC")
            return c === "z"
                ? long
                    ? "Coordinated Universal Time"
                    : "UTC"
                : offsetName(0, "GMT", long);
        if (slots.offset === 0 && c !== "O")
            return long ? "Greenwich Mean Time" : "GMT";
        return offsetName(slots.offset, "GMT", long);
    }
    // FormatDateTimePattern: [type, value, letter] for the items.
    function formatPattern(slots, items, d) {
        var parts = [],
            hasMinute = false,
            hasSecond = false;
        for (var i = 0; i < items.length; i++)
            if (typeof items[i] !== "string") {
                if (items[i].c === "m") hasMinute = true;
                if (items[i].c === "s") hasSecond = true;
            }
        for (var k = 0; k < items.length; k++) {
            var item = items[k];
            if (typeof item === "string") {
                push(parts, ["literal", item, ""]);
                continue;
            }
            var c = item.c,
                n = item.n,
                type,
                value,
                year = d.year > 0 ? d.year : 1 - d.year;
            if (c === "G") {
                type = "era";
                value =
                    n === 4
                        ? d.year > 0
                            ? "Anno Domini"
                            : "Before Christ"
                        : n === 5
                          ? d.year > 0
                              ? "A"
                              : "B"
                          : d.year > 0
                            ? "AD"
                            : "BC";
            } else if (c === "y") {
                type = "year";
                value = n === 2 ? pad(year % 100, 2) : pad(year, n);
            } else if (c === "M" || c === "L") {
                type = "month";
                value =
                    n <= 2
                        ? pad(d.month + 1, n)
                        : nameOf(monthNames, d.month, n);
            } else if (c === "d") {
                type = "day";
                value = pad(d.day, n);
            } else if (c === "E" || c === "c") {
                type = "weekday";
                value =
                    n === 6
                        ? weekdayShorter[d.weekday]
                        : c === "c" && n < 3
                          ? pad(d.weekday + 1, n)
                          : nameOf(weekdayNames, d.weekday, n);
            } else if (c === "a") {
                type = "dayPeriod";
                value =
                    n === 5
                        ? d.hour < 12
                            ? "a"
                            : "p"
                        : d.hour < 12
                          ? "AM"
                          : "PM";
            } else if (c === "B") {
                type = "dayPeriod";
                value =
                    d.hour === 12 &&
                    !(hasMinute && d.minute) &&
                    !(hasSecond && d.second)
                        ? n === 5
                            ? "n"
                            : "noon"
                        : d.hour < 12
                          ? "in the morning"
                          : d.hour < 18
                            ? "in the afternoon"
                            : d.hour < 21
                              ? "in the evening"
                              : "at night";
            } else if (isHourLetter(c)) {
                type = "hour";
                value = pad(
                    c === "H"
                        ? d.hour
                        : c === "k"
                          ? d.hour || 24
                          : c === "K"
                            ? d.hour % 12
                            : d.hour % 12 || 12,
                    n,
                );
            } else if (c === "m") {
                type = "minute";
                value = pad(d.minute, n);
            } else if (c === "s") {
                type = "second";
                value = pad(d.second, n);
            } else if (c === "S") {
                type = "fractionalSecond";
                value = pad(d.millisecond, 3);
                value = n <= 3 ? slice(value, 0, n) : value + zeros(n - 3);
            } else if (c === "z" || c === "O" || c === "v") {
                type = "timeZoneName";
                value = timeZoneName(slots, c, n);
            } else {
                type = "literal";
                value = "";
                for (var j = 0; j < n; j++) value += c;
            }
            push(parts, [type, value, c]);
        }
        return parts;
    }
    function partsToString(parts) {
        var text = "";
        for (var i = 0; i < parts.length; i++) text += parts[i][1];
        return text;
    }
    // The parts as objects; adjacent literals of the same source merge.
    function partsToArray(parts, sources) {
        var result = [];
        for (var i = 0; i < parts.length; i++) {
            if (parts[i][1] === "") continue;
            var last = result[result.length - 1];
            if (
                parts[i][0] === "literal" &&
                last !== undefined &&
                last.type === "literal" &&
                (sources === undefined || last.source === sources[i])
            ) {
                last.value += parts[i][1];
                continue;
            }
            var part = { type: parts[i][0], value: parts[i][1] };
            if (sources !== undefined) part.source = sources[i];
            push(result, part);
        }
        return result;
    }

    // ---- Date ranges (ICU's DateIntervalFormat) ------------------------------

    // Calendar fields, coarsest first, with their levels, and the levels of
    // the pattern letters (SimpleDateFormat::isFieldUnitIgnored).
    var ERA = 0,
        YEAR = 1,
        MONTH = 2,
        DATE = 3,
        AM_PM = 4,
        HOUR = 5,
        MINUTE = 6;
    var intervalLetters = ["G", "y", "M", "d", "a", "h", "m", "s", "S"];
    var letterLevels = {
        G: 0,
        y: 10,
        M: 20,
        L: 20,
        d: 30,
        E: 30,
        c: 30,
        a: 40,
        h: 50,
        H: 50,
        k: 50,
        K: 50,
        m: 60,
        s: 70,
        S: 80,
        z: 0,
        v: 0,
        O: 0,
    };
    function letterLevel(c) {
        return call(hasOwnProperty, letterLevels, c) ? letterLevels[c] : -1;
    }
    function isFieldUnitIgnored(items, field) {
        var level = field * 10;
        for (var i = 0; i < items.length; i++)
            if (
                typeof items[i] !== "string" &&
                level <= letterLevel(items[i].c)
            )
                return false;
        return true;
    }
    // getDateTimeSkeleton: the date and time halves of a skeleton and
    // their normalized forms.
    function splitSkeleton(skeleton) {
        var result = { date: "", normDate: "", time: "", normTime: "" },
            counts = { E: 0, d: 0, M: 0, y: 0, m: 0, v: 0, z: 0 },
            hour = "";
        for (var i = 0; i < skeleton.length; i++) {
            var c = skeleton[i];
            if (c === "E" || c === "d" || c === "M" || c === "y") {
                result.date += c;
                counts[c]++;
            } else if (call(stringIndexOf, "GYuQqLlWwDFgecUr", c) >= 0) {
                result.normDate += c;
                result.date += c;
            } else if (c === "a") result.time += c;
            else if (isHourLetter(c)) {
                result.time += c;
                if (hour === "") hour = c;
            } else if (c === "m" || c === "z" || c === "v") {
                result.time += c;
                counts[c]++;
            } else if (call(stringIndexOf, "VZjsSAbB", c) >= 0) {
                result.time += c;
                result.normTime += c;
            }
        }
        for (var y = 0; y < counts.y; y++) result.normDate += "y";
        if (counts.M)
            result.normDate += counts.M < 3 ? "M" : slice("MMMMM", 0, counts.M);
        if (counts.E)
            result.normDate +=
                counts.E <= 3 ? "E" : slice("EEEEEE", 0, counts.E);
        if (counts.d) result.normDate += "d";
        result.normTime += hour;
        if (counts.m) result.normTime += "m";
        if (counts.z) result.normTime += "z";
        if (counts.v) result.normTime += "v";
        return result;
    }
    function letterWidths(skeleton) {
        var widths = objectCreate(null);
        for (var i = 0; i < skeleton.length; i++)
            widths[skeleton[i]] = (widths[skeleton[i]] || 0) + 1;
        return widths;
    }
    // DateIntervalInfo::getBestSkeleton: { skeleton, difference } with
    // difference 0 (same), 1 (other widths), 2 (v/z, k/K, a differ) or -1
    // (other fields).
    function bestIntervalSkeleton(skeleton) {
        var input = skeleton,
            replaced = false;
        for (var i = 0; i < skeleton.length; i++)
            if (call(stringIndexOf, "zkKab", skeleton[i]) >= 0) replaced = true;
        if (replaced) {
            input = "";
            for (var j = 0; j < skeleton.length; j++) {
                var c = skeleton[j];
                if (c === "a" || c === "b") continue;
                input +=
                    c === "z" ? "v" : c === "k" ? "H" : c === "K" ? "h" : c;
            }
        }
        var widths = letterWidths(input),
            best,
            bestDistance = 1 / 0,
            difference = 0;
        for (var key in intervalFormats) {
            var keyWidths = letterWidths(key),
                distance = 0,
                fieldDifference = 1,
                letters = input + key;
            for (var k = 0; k < letters.length; k++) {
                var letter = letters[k];
                if (call(stringIndexOf, letters, letter) !== k) continue;
                var a = widths[letter] || 0,
                    b = keyWidths[letter] || 0;
                if (a === b) continue;
                if (!a || !b) {
                    fieldDifference = -1;
                    distance += 0x1000;
                } else if (letter === "M" && a <= 2 !== b <= 2)
                    distance += 0x100;
                else distance += a > b ? a - b : b - a;
            }
            if (distance < bestDistance) {
                best = key;
                bestDistance = distance;
                difference = fieldDifference;
            }
            if (distance === 0) {
                difference = 0;
                break;
            }
        }
        if (replaced && difference !== -1) difference = 2;
        return best === undefined
            ? undefined
            : { skeleton: best, difference: difference };
    }
    function intervalLookup(skeleton, field) {
        var formats = call(hasOwnProperty, intervalFormats, skeleton)
            ? intervalFormats[skeleton]
            : undefined;
        if (formats === undefined) return undefined;
        if (field === HOUR) return formats.h || formats.H;
        if (field === AM_PM) return formats.a || formats.B;
        return formats[intervalLetters[field]];
    }
    // Replaces a letter outside quotes.
    function replaceLetter(pattern, from, to) {
        var result = "",
            quoted = false;
        for (var i = 0; i < pattern.length; i++) {
            var c = pattern[i];
            if (c === "'") quoted = !quoted;
            result += !quoted && c === from ? to : c;
        }
        return result;
    }
    // adjustFieldWidth: widens the fields of an interval pattern to the
    // requested skeleton.
    function adjustFieldWidth(input, best, pattern, difference) {
        var inputWidths = letterWidths(input),
            bestWidths = letterWidths(best);
        if (difference === 2) {
            if (call(stringIndexOf, input, "z") >= 0) {
                bestWidths.z = bestWidths.v;
                pattern = replaceLetter(pattern, "v", "z");
            }
            if (call(stringIndexOf, input, "K") >= 0)
                pattern = replaceLetter(pattern, "h", "K");
            if (call(stringIndexOf, input, "k") >= 0)
                pattern = replaceLetter(pattern, "H", "k");
            if (call(stringIndexOf, input, "b") >= 0)
                pattern = replaceLetter(pattern, "a", "b");
        }
        if (call(stringIndexOf, pattern, "a") >= 0 && !bestWidths.a)
            bestWidths.a = 1;
        var result = "",
            quoted = false,
            i = 0;
        while (i < pattern.length) {
            var c = pattern[i];
            if (c === "'") quoted = !quoted;
            if (quoted || !isPatternLetter(code(c, 0))) {
                result += c;
                i++;
                continue;
            }
            var start = i;
            while (i < pattern.length && pattern[i] === c) i++;
            var count = i - start,
                letter = c === "L" ? "M" : c,
                fieldCount = bestWidths[letter] || 0,
                inputCount = inputWidths[letter] || 0;
            if (fieldCount === count && inputCount > fieldCount)
                count = inputCount;
            for (var k = 0; k < count; k++) result += c;
        }
        return result;
    }
    // splitPatternInto2Part: the parts before and from the first repeated
    // field, for the earlier and the later date.
    function splitInterval(pattern) {
        var seen = "",
            quoted = false,
            previous = "",
            count = 0,
            repeated = false,
            i;
        for (i = 0; i < pattern.length; i++) {
            var c = pattern[i];
            if (c !== previous && count > 0) {
                if (call(stringIndexOf, seen, previous) >= 0) {
                    repeated = true;
                    break;
                }
                seen += previous;
                count = 0;
            }
            if (c === "'") {
                if (pattern[i + 1] === "'") i++;
                else quoted = !quoted;
            } else if (!quoted && isPatternLetter(code(c, 0))) {
                previous = c;
                count++;
            }
        }
        if (count > 0 && !repeated && call(stringIndexOf, seen, previous) < 0)
            count = 0;
        var split = i - count;
        return {
            first: parsePattern(slice(pattern, 0, split)),
            second: parsePattern(slice(pattern, split)),
        };
    }
    // setIntervalPattern of DateIntervalFormat; state carries the skeleton,
    // its best match and the extended skeletons shared between the calls.
    function setIntervalPattern(info, field, state, extend) {
        var skeleton = state.skeleton,
            best = state.best,
            difference = state.difference,
            pattern = intervalLookup(best, field);
        if (pattern === undefined) {
            if (isFieldUnitIgnored(parsePattern(best), field)) return false;
            if (field === AM_PM) {
                pattern = intervalLookup(best, HOUR);
                if (pattern !== undefined)
                    info.patterns[field] = splitInterval(
                        adjustFieldWidth(skeleton, best, pattern, difference),
                    );
                return false;
            }
            if (extend) {
                var letter = intervalLetters[field];
                state.extSkeleton = letter + skeleton;
                state.extBest = letter + best;
                pattern = intervalLookup(state.extBest, field);
                if (pattern === undefined && difference === 0) {
                    var tmp = bestIntervalSkeleton(state.extBest);
                    if (tmp !== undefined) difference = tmp.difference;
                    if (tmp !== undefined && difference !== -1) {
                        pattern = intervalLookup(tmp.skeleton, field);
                        best = tmp.skeleton;
                    }
                } else best = state.extBest;
                skeleton = state.extSkeleton;
            }
        }
        if (pattern === undefined) return false;
        info.patterns[field] = splitInterval(
            difference !== 0
                ? adjustFieldWidth(skeleton, best, pattern, difference)
                : pattern,
        );
        return extend && state.extSkeleton !== undefined;
    }
    // initializePattern of DateIntervalFormat for the format's skeleton.
    function intervalInfo(slots) {
        if (slots.interval !== undefined) return slots.interval;
        var skeleton = skeletonOf(slots.pattern),
            parts = splitSkeleton(skeleton),
            info = { patterns: [] },
            target = parts.time !== "" ? parts.normTime : parts.normDate,
            best = bestIntervalSkeleton(target),
            // DateFormat::getBestPattern in the locale of the hour cycle.
            options = {
                hour: false,
                letter:
                    slots.hourCycle === undefined
                        ? "h"
                        : hourCycleLetters[slots.hourCycle],
            };
        slots.interval = info;
        // The date or the time alone, from the normalized skeletons.
        if (best !== undefined) {
            if (parts.date !== "")
                info.datePattern = bestPattern(parts.normDate, options);
            if (parts.time !== "")
                info.timePattern = bestPattern(parts.normTime, options);
        }
        var found = best !== undefined && best.difference !== -1;
        if (found) {
            var state = {
                skeleton: target,
                best: best.skeleton,
                difference: best.difference,
            };
            if (parts.time === "") {
                setIntervalPattern(info, DATE, state, true);
                if (setIntervalPattern(info, MONTH, state, true)) {
                    state.skeleton = state.extSkeleton;
                    state.best = state.extBest;
                }
                setIntervalPattern(info, YEAR, state, true);
                setIntervalPattern(info, ERA, state, true);
            } else {
                setIntervalPattern(info, MINUTE, state, false);
                setIntervalPattern(info, HOUR, state, false);
                setIntervalPattern(info, AM_PM, state, false);
            }
        }
        if (parts.time === "" || (!found && parts.date !== "")) return info;
        if (parts.date === "") {
            // Different days show the dates too.
            var withDate = bestPattern("yMd" + parts.time, options);
            info.patterns[DATE] =
                info.patterns[MONTH] =
                info.patterns[YEAR] =
                    { fallback: withDate };
            info.patterns[ERA] = {
                fallback: bestPattern("GyMd" + parts.time, options),
            };
            return info;
        }
        var extended = skeleton,
            fields = [DATE, MONTH, YEAR, ERA];
        for (var i = 0; i < fields.length; i++) {
            var letter = intervalLetters[fields[i]];
            if (call(stringIndexOf, parts.date, letter) < 0) {
                extended = letter + extended;
                info.patterns[fields[i]] = {
                    fallback: bestPattern(extended, options),
                };
            }
        }
        // The date, then the time range.
        var timeFields = [AM_PM, HOUR, MINUTE],
            date = patternString(info.datePattern);
        for (var t = 0; t < timeFields.length; t++) {
            var interval = info.patterns[timeFields[t]];
            if (interval !== undefined && interval.first.length)
                info.patterns[timeFields[t]] = splitInterval(
                    date +
                        ", " +
                        patternString(interval.first) +
                        patternString(interval.second),
                );
        }
        return info;
    }
    function rangeParts(slots, x, y) {
        var a = dateFields(slots, x),
            b = dateFields(slots, y),
            av = [
                a.year > 0,
                a.year,
                a.month,
                a.day,
                a.hour < 12,
                a.hour % 12,
                a.minute,
                a.second,
                a.millisecond,
            ],
            bv = [
                b.year > 0,
                b.year,
                b.month,
                b.day,
                b.hour < 12,
                b.hour % 12,
                b.minute,
                b.second,
                b.millisecond,
            ],
            field = -1;
        for (var i = 0; i < av.length && field < 0; i++)
            if (av[i] !== bv[i]) field = i;
        var single = { parts: formatPattern(slots, slots.pattern, a) };
        if (field < 0) return single;
        var info = intervalInfo(slots),
            interval = info.patterns[field],
            sameDay = field >= AM_PM,
            current = slots.pattern;
        if (interval === undefined) {
            if (isFieldUnitIgnored(slots.pattern, field)) return single;
        } else if (interval.fallback !== undefined) current = interval.fallback;
        else
            return {
                parts: formatPattern(slots, interval.first, a).concat(
                    formatPattern(slots, interval.second, b),
                ),
                range: true,
            };
        // The fallback: both dates in full, or the date and the time range.
        var separator = [["literal", rangeSeparator, ""]];
        if (
            sameDay &&
            info.datePattern !== undefined &&
            info.timePattern !== undefined
        )
            return {
                parts: formatPattern(slots, info.datePattern, a).concat(
                    [["literal", ", ", ""]],
                    formatPattern(slots, info.timePattern, a),
                    separator,
                    formatPattern(slots, info.timePattern, b),
                ),
                range: true,
            };
        return {
            parts: formatPattern(slots, current, a).concat(
                separator,
                formatPattern(slots, current, b),
            ),
            range: true,
        };
    }
    // The sources of the range parts: ICU's overlap spans, from the first
    // to the last field that repeats, for each date.
    function rangeSources(result) {
        var parts = result.parts,
            sources = [],
            starts = [],
            position = 0,
            s1a = 1 / 0,
            s1b = 0,
            s2a = 1 / 0,
            s2b = 0;
        for (var i = 0; i < parts.length; i++) {
            starts[i] = position;
            position += parts[i][1].length;
        }
        if (result.range)
            for (var j = 0; j < parts.length; j++) {
                if (parts[j][0] === "literal") continue;
                for (var k = j + 1; k < parts.length; k++)
                    if (parts[k][2] === parts[j][2]) {
                        if (starts[j] < s1a) s1a = starts[j];
                        if (starts[j] + parts[j][1].length > s1b)
                            s1b = starts[j] + parts[j][1].length;
                        if (starts[k] < s2a) s2a = starts[k];
                        if (starts[k] + parts[k][1].length > s2b)
                            s2b = starts[k] + parts[k][1].length;
                        break;
                    }
            }
        for (var p = 0; p < parts.length; p++) {
            var start = starts[p];
            sources[p] =
                start >= s1a && start < s1b
                    ? "startRange"
                    : start >= s2a && start < s2b
                      ? "endRange"
                      : "shared";
        }
        return sources;
    }

    // ---- The Intl object --------------------------------------------------

    var Intl = objectCreate(ObjectPrototype);
    defineProperty(Intl, toStringTagSymbol, {
        value: "Intl",
        writable: false,
        enumerable: false,
        configurable: true,
    });
    method(
        Intl,
        "getCanonicalLocales",
        1,
        {
            getCanonicalLocales(locales) {
                return canonicalizeLocaleList(locales);
            },
        }.getCanonicalLocales,
    );
    method(
        Intl,
        "supportedValuesOf",
        1,
        {
            supportedValuesOf(key) {
                key = toStr(key);
                if (key === "calendar") return ["gregory"];
                if (key === "collation" || key === "unit") return [];
                if (key === "currency") return copyArray(currencyCodes);
                if (key === "numberingSystem") return ["latn"];
                if (key === "timeZone") return ["UTC"];
                throw new RangeErrorConstructor("Invalid key : " + key);
            },
        }.supportedValuesOf,
    );
    function installSupportedLocalesOf(constructor) {
        method(
            constructor,
            "supportedLocalesOf",
            1,
            {
                supportedLocalesOf(locales) {
                    return supportedLocales(locales, arguments[1]);
                },
            }.supportedLocalesOf,
        );
    }

    // Intl.DateTimeFormat (ECMA-402 11), installed before NumberFormat so
    // that the properties of Intl keep the order of V8.
    var dateTimeFormatSlots = new WeakMapConstructor(),
        DateTimeFormatPrototype = objectCreate(ObjectPrototype);
    function DateTimeFormat(locales, options) {
        var object = createFrom(
            new.target === undefined ? DateTimeFormat : new.target,
            DateTimeFormatPrototype,
        );
        var slots = initializeDateTimeFormat(
            objectCreate(null),
            locales,
            options,
            "any",
            "date",
        );
        call(weakMapSet, dateTimeFormatSlots, object, slots);
        return object;
    }
    installConstructor(
        "DateTimeFormat",
        DateTimeFormat,
        DateTimeFormatPrototype,
        "Intl.DateTimeFormat",
    );
    installSupportedLocalesOf(DateTimeFormat);
    // format and toLocaleString print U+202F as a space, like V8 (for web
    // compatibility), and so does formatRange when both dates format alike;
    // formatToParts, formatRangeToParts and the true ranges keep it.
    function spaceParts(parts) {
        for (var i = 0; i < parts.length; i++) {
            var value = parts[i][1];
            if (call(stringIndexOf, value, " ") >= 0) {
                var spaced = "";
                for (var j = 0; j < value.length; j++)
                    spaced += value[j] === " " ? " " : value[j];
                parts[i][1] = spaced;
            }
        }
        return parts;
    }
    function formatDate(slots, t) {
        return partsToString(
            spaceParts(
                formatPattern(slots, slots.pattern, dateFields(slots, t)),
            ),
        );
    }
    function dateArgument(value) {
        return validTime(value === undefined ? dateNow() : value);
    }
    function rangeArguments(startDate, endDate) {
        if (startDate === undefined || endDate === undefined)
            throw new TypeErrorConstructor("Invalid time value");
        return [validTime(startDate), validTime(endDate)];
    }
    method(
        DateTimeFormatPrototype,
        "resolvedOptions",
        0,
        {
            resolvedOptions() {
                var slots = slotsOf(
                        dateTimeFormatSlots,
                        this,
                        "Intl.DateTimeFormat.prototype.resolvedOptions",
                    ),
                    result = {};
                dataProperty(result, "locale", slots.locale);
                dataProperty(result, "calendar", slots.calendar);
                dataProperty(result, "numberingSystem", slots.numberingSystem);
                dataProperty(result, "timeZone", slots.timeZone);
                if (slots.hourCycle !== undefined) {
                    dataProperty(result, "hourCycle", slots.hourCycle);
                    dataProperty(
                        result,
                        "hour12",
                        slots.hourCycle === "h11" || slots.hourCycle === "h12",
                    );
                }
                var components = slots.components;
                if (components !== undefined)
                    for (var i = 0; i < componentOptions.length; i++) {
                        var name = componentOptions[i][0];
                        if (components[name] !== undefined)
                            dataProperty(result, name, components[name]);
                    }
                if (slots.dateStyle !== undefined)
                    dataProperty(result, "dateStyle", slots.dateStyle);
                if (slots.timeStyle !== undefined)
                    dataProperty(result, "timeStyle", slots.timeStyle);
                return result;
            },
        }.resolvedOptions,
    );
    method(
        DateTimeFormatPrototype,
        "formatToParts",
        1,
        {
            formatToParts(date) {
                var slots = slotsOf(
                        dateTimeFormatSlots,
                        this,
                        "Intl.DateTimeFormat.prototype.formatToParts",
                    ),
                    t = dateArgument(date);
                return partsToArray(
                    formatPattern(slots, slots.pattern, dateFields(slots, t)),
                );
            },
        }.formatToParts,
    );
    getter(
        DateTimeFormatPrototype,
        "format",
        getOwnPropertyDescriptor(
            {
                get format() {
                    var slots = slotsOf(
                        dateTimeFormatSlots,
                        this,
                        "get Intl.DateTimeFormat.prototype.format",
                    );
                    if (slots.boundFormat === undefined)
                        slots.boundFormat = setFunction(
                            (date) => formatDate(slots, dateArgument(date)),
                            "",
                            1,
                        );
                    return slots.boundFormat;
                },
            },
            "format",
        ).get,
    );
    method(
        DateTimeFormatPrototype,
        "formatRange",
        2,
        {
            formatRange(startDate, endDate) {
                var slots = slotsOf(
                    dateTimeFormatSlots,
                    this,
                    "Intl.DateTimeFormat.prototype.formatRange",
                );
                var range = rangeArguments(startDate, endDate),
                    result = rangeParts(slots, range[0], range[1]);
                return partsToString(
                    result.range ? result.parts : spaceParts(result.parts),
                );
            },
        }.formatRange,
    );
    method(
        DateTimeFormatPrototype,
        "formatRangeToParts",
        2,
        {
            formatRangeToParts(startDate, endDate) {
                var slots = slotsOf(
                        dateTimeFormatSlots,
                        this,
                        "Intl.DateTimeFormat.prototype.formatRangeToParts",
                    ),
                    range = rangeArguments(startDate, endDate),
                    result = rangeParts(slots, range[0], range[1]);
                return partsToArray(result.parts, rangeSources(result));
            },
        }.formatRangeToParts,
    );
    defineProperty(Intl, "DateTimeFormat", {
        value: DateTimeFormat,
        writable: true,
        enumerable: false,
        configurable: true,
    });

    // Intl.NumberFormat (ECMA-402 15).
    var numberFormatSlots = new WeakMapConstructor(),
        NumberFormatPrototype = objectCreate(ObjectPrototype);
    function NumberFormat(locales, options) {
        var object = createFrom(
            new.target === undefined ? NumberFormat : new.target,
            NumberFormatPrototype,
        );
        var slots = initializeNumberFormat(
            objectCreate(null),
            locales,
            options,
        );
        call(weakMapSet, numberFormatSlots, object, slots);
        return object;
    }
    installConstructor(
        "NumberFormat",
        NumberFormat,
        NumberFormatPrototype,
        "Intl.NumberFormat",
    );
    installSupportedLocalesOf(NumberFormat);
    method(
        NumberFormatPrototype,
        "resolvedOptions",
        0,
        {
            resolvedOptions() {
                var slots = slotsOf(
                        numberFormatSlots,
                        this,
                        "Intl.NumberFormat.prototype.resolvedOptions",
                    ),
                    result = {},
                    names = [
                        ["locale", "locale"],
                        ["numberingSystem", "numberingSystem"],
                        ["style", "style"],
                        ["currency", "currency"],
                        ["currencyDisplay", "currencyDisplay"],
                        ["currencySign", "currencySign"],
                        ["minimumIntegerDigits", "minimumIntegerDigits"],
                        ["minimumFractionDigits", "minimumFractionDigits"],
                        ["maximumFractionDigits", "maximumFractionDigits"],
                        [
                            "minimumSignificantDigits",
                            "minimumSignificantDigits",
                        ],
                        [
                            "maximumSignificantDigits",
                            "maximumSignificantDigits",
                        ],
                        ["useGrouping", "useGrouping"],
                        ["notation", "notation"],
                        ["compactDisplay", "compactDisplay"],
                        ["signDisplay", "signDisplay"],
                        ["roundingIncrement", "roundingIncrement"],
                        ["roundingMode", "roundingMode"],
                        ["computedRoundingPriority", "roundingPriority"],
                        ["trailingZeroDisplay", "trailingZeroDisplay"],
                    ];
                for (var i = 0; i < names.length; i++) {
                    var value = slots[names[i][0]];
                    if (value !== undefined)
                        dataProperty(result, names[i][1], value);
                }
                return result;
            },
        }.resolvedOptions,
    );
    method(
        NumberFormatPrototype,
        "formatToParts",
        1,
        {
            formatToParts(value) {
                var slots = slotsOf(
                    numberFormatSlots,
                    this,
                    "Intl.NumberFormat.prototype.formatToParts",
                );
                return partitionNumber(slots, toIntlMathematicalValue(value));
            },
        }.formatToParts,
    );
    getter(
        NumberFormatPrototype,
        "format",
        getOwnPropertyDescriptor(
            {
                get format() {
                    var slots = slotsOf(
                        numberFormatSlots,
                        this,
                        "get Intl.NumberFormat.prototype.format",
                    );
                    if (slots.boundFormat === undefined)
                        slots.boundFormat = setFunction(
                            (value) =>
                                formatToString(
                                    slots,
                                    toIntlMathematicalValue(value),
                                ),
                            "",
                            1,
                        );
                    return slots.boundFormat;
                },
            },
            "format",
        ).get,
    );
    defineProperty(Intl, "NumberFormat", {
        value: NumberFormat,
        writable: true,
        enumerable: false,
        configurable: true,
    });

    // Intl.Collator (ECMA-402 10).
    var collatorSlots = new WeakMapConstructor(),
        CollatorPrototype = objectCreate(ObjectPrototype);
    function Collator(locales, options) {
        var object = createFrom(
            new.target === undefined ? Collator : new.target,
            CollatorPrototype,
        );
        var slots = initializeCollator(objectCreate(null), locales, options);
        call(weakMapSet, collatorSlots, object, slots);
        return object;
    }
    installConstructor(
        "Collator",
        Collator,
        CollatorPrototype,
        "Intl.Collator",
    );
    installSupportedLocalesOf(Collator);
    method(
        CollatorPrototype,
        "resolvedOptions",
        0,
        {
            resolvedOptions() {
                var slots = slotsOf(
                        collatorSlots,
                        this,
                        "Intl.Collator.prototype.resolvedOptions",
                    ),
                    result = {},
                    names = [
                        "locale",
                        "usage",
                        "sensitivity",
                        "ignorePunctuation",
                        "collation",
                        "numeric",
                        "caseFirst",
                    ];
                for (var i = 0; i < names.length; i++)
                    dataProperty(result, names[i], slots[names[i]]);
                return result;
            },
        }.resolvedOptions,
    );
    getter(
        CollatorPrototype,
        "compare",
        getOwnPropertyDescriptor(
            {
                get compare() {
                    var slots = slotsOf(
                        collatorSlots,
                        this,
                        "get Intl.Collator.prototype.compare",
                    );
                    if (slots.boundCompare === undefined)
                        slots.boundCompare = setFunction(
                            (x, y) => compareStrings(slots, toStr(x), toStr(y)),
                            "",
                            2,
                        );
                    return slots.boundCompare;
                },
            },
            "compare",
        ).get,
    );
    defineProperty(Intl, "Collator", {
        value: Collator,
        writable: true,
        enumerable: false,
        configurable: true,
    });

    // Intl.PluralRules (ECMA-402 16).
    var pluralRulesSlots = new WeakMapConstructor(),
        PluralRulesPrototype = objectCreate(ObjectPrototype);
    function PluralRules(locales, options) {
        if (new.target === undefined)
            throw new TypeErrorConstructor(
                "Constructor Intl.PluralRules requires 'new'",
            );
        var object = createFrom(new.target, PluralRulesPrototype),
            slots = objectCreate(null),
            requested = canonicalizeLocaleList(locales);
        options = coerceOptions(options);
        var opt = objectCreate(null);
        opt.localeMatcher = localeMatcherOption(options);
        slots.type = getOption(
            options,
            "type",
            "string",
            ["cardinal", "ordinal"],
            "cardinal",
        );
        setDigitOptions(slots, options, 0, 3, "standard");
        slots.locale = resolveLocale(requested, opt, [], {}, true).locale;
        call(weakMapSet, pluralRulesSlots, object, slots);
        return object;
    }
    installConstructor(
        "PluralRules",
        PluralRules,
        PluralRulesPrototype,
        "Intl.PluralRules",
    );
    installSupportedLocalesOf(PluralRules);
    method(
        PluralRulesPrototype,
        "resolvedOptions",
        0,
        {
            resolvedOptions() {
                var slots = slotsOf(
                        pluralRulesSlots,
                        this,
                        "Intl.PluralRules.prototype.resolvedOptions",
                    ),
                    result = {},
                    names = [
                        ["locale", "locale"],
                        ["type", "type"],
                        ["minimumIntegerDigits", "minimumIntegerDigits"],
                        ["minimumFractionDigits", "minimumFractionDigits"],
                        ["maximumFractionDigits", "maximumFractionDigits"],
                        [
                            "minimumSignificantDigits",
                            "minimumSignificantDigits",
                        ],
                        [
                            "maximumSignificantDigits",
                            "maximumSignificantDigits",
                        ],
                        ["pluralCategories", "pluralCategories"],
                        ["roundingIncrement", "roundingIncrement"],
                        ["roundingMode", "roundingMode"],
                        ["computedRoundingPriority", "roundingPriority"],
                        ["trailingZeroDisplay", "trailingZeroDisplay"],
                    ];
                for (var i = 0; i < names.length; i++) {
                    var value =
                        names[i][0] === "pluralCategories"
                            ? slots.type === "cardinal"
                                ? ["one", "other"]
                                : ["few", "one", "two", "other"]
                            : slots[names[i][0]];
                    if (value !== undefined)
                        dataProperty(result, names[i][1], value);
                }
                return result;
            },
        }.resolvedOptions,
    );
    method(
        PluralRulesPrototype,
        "select",
        1,
        {
            select(value) {
                var slots = slotsOf(
                    pluralRulesSlots,
                    this,
                    "Intl.PluralRules.prototype.select",
                );
                return pluralCategory(slots, +value);
            },
        }.select,
    );
    method(
        PluralRulesPrototype,
        "selectRange",
        2,
        {
            selectRange(start, end) {
                slotsOf(
                    pluralRulesSlots,
                    this,
                    "Intl.PluralRules.prototype.selectRange",
                );
                if (start === undefined || end === undefined)
                    throw new TypeErrorConstructor("start or end is undefined");
                var x = +start,
                    y = +end;
                if (x !== x || y !== y)
                    throw new RangeErrorConstructor("start or end is NaN");
                // The en plural ranges always select "other".
                return "other";
            },
        }.selectRange,
    );
    defineProperty(Intl, "PluralRules", {
        value: PluralRules,
        writable: true,
        enumerable: false,
        configurable: true,
    });

    defineProperty(globalThis, "Intl", {
        value: Intl,
        writable: true,
        enumerable: false,
        configurable: true,
    });

    // ---- Locale-sensitive methods of other built-ins ------------------------
    // The default formatter and collator are shared by calls without locales
    // and options; the methods keep their names, lengths and positions.

    var defaultNumberFormat, defaultCollator;
    function numberFormatFor(locales, options) {
        if (locales === undefined && options === undefined)
            return (
                defaultNumberFormat ||
                (defaultNumberFormat = initializeNumberFormat(
                    objectCreate(null),
                ))
            );
        return initializeNumberFormat(objectCreate(null), locales, options);
    }
    method(
        Number.prototype,
        "toLocaleString",
        0,
        {
            toLocaleString() {
                var x = call(numberValueOf, this);
                return formatToString(
                    numberFormatFor(arguments[0], arguments[1]),
                    fromNumber(x),
                );
            },
        }.toLocaleString,
    );
    if (bigintValueOf !== undefined)
        method(
            BigInt.prototype,
            "toLocaleString",
            0,
            {
                toLocaleString() {
                    var x = call(bigintValueOf, this);
                    return formatToString(
                        numberFormatFor(arguments[0], arguments[1]),
                        fromBigInt(x),
                    );
                },
            }.toLocaleString,
        );
    method(
        StringPrototype,
        "localeCompare",
        1,
        {
            localeCompare(that) {
                if (this === undefined || this === null)
                    throw new TypeErrorConstructor(
                        "String.prototype.localeCompare called on null or undefined",
                    );
                var S = toStr(this),
                    T = toStr(that),
                    locales = arguments[1],
                    options = arguments[2],
                    slots =
                        locales === undefined && options === undefined
                            ? defaultCollator ||
                              (defaultCollator = initializeCollator(
                                  objectCreate(null),
                              ))
                            : initializeCollator(
                                  objectCreate(null),
                                  locales,
                                  options,
                              );
                return compareStrings(slots, S, T);
            },
        }.localeCompare,
    );
    // Date.prototype.toLocaleString, toLocaleDateString and
    // toLocaleTimeString format with Intl.DateTimeFormat (ECMA-402 20.4).
    var defaultDateFormats = objectCreate(null);
    function dateToLocale(date, locales, options, name, required, defaults) {
        var x = call(dateGetTime, date);
        if (x !== x) return "Invalid Date";
        var slots;
        if (locales === undefined && options === undefined)
            slots =
                defaultDateFormats[name] ||
                (defaultDateFormats[name] = initializeDateTimeFormat(
                    objectCreate(null),
                    undefined,
                    undefined,
                    required,
                    defaults,
                ));
        else
            slots = initializeDateTimeFormat(
                objectCreate(null),
                locales,
                options,
                required,
                defaults,
            );
        return formatDate(slots, x);
    }
    method(
        DatePrototype,
        "toLocaleString",
        0,
        {
            toLocaleString() {
                return dateToLocale(
                    this,
                    arguments[0],
                    arguments[1],
                    "toLocaleString",
                    "any",
                    "all",
                );
            },
        }.toLocaleString,
    );
    method(
        DatePrototype,
        "toLocaleDateString",
        0,
        {
            toLocaleDateString() {
                return dateToLocale(
                    this,
                    arguments[0],
                    arguments[1],
                    "toLocaleDateString",
                    "date",
                    "date",
                );
            },
        }.toLocaleDateString,
    );
    method(
        DatePrototype,
        "toLocaleTimeString",
        0,
        {
            toLocaleTimeString() {
                return dateToLocale(
                    this,
                    arguments[0],
                    arguments[1],
                    "toLocaleTimeString",
                    "time",
                    "time",
                );
            },
        }.toLocaleTimeString,
    );
})();
