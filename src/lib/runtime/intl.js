// Intl (ECMA-402) for the en locale (#300): Nona's own implementation, without
// ICU and without data for other locales. en and en-US are the available
// locales; any other request resolves to the default locale en-US, and
// resolvedOptions().locale reports that fallback. The formats and the
// collation order follow ICU's en data as Node.js uses it. Constructors and
// most intrinsics are captured while the prelude runs; the hot paths call
// string methods directly, like the other preludes.
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
                optionsValue = asciiLower(optionsValue);
                if (optionsValue === "") optionsValue = "true";
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

    // Intl.DateTimeFormat (#300) is installed here, before NumberFormat, so
    // that the properties of Intl keep the order of V8.

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
    // Date.prototype.toLocaleString, toLocaleDateString and toLocaleTimeString
    // delegate to Intl.DateTimeFormat (#300, next step).
})();
