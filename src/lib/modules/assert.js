import { inspect, isDeepStrictEqual, types } from "node:util";
export class AssertionError extends Error {
    constructor(options) {
        const { message, actual, expected, operator } = options || {};
        super(
            message !== undefined
                ? String(message)
                : inspect(actual) + " " + operator + " " + inspect(expected),
        );
        this.name = "AssertionError";
        this.code = "ERR_ASSERTION";
        this.actual = actual;
        this.expected = expected;
        this.operator = operator;
        this.generatedMessage = message === undefined;
    }
}
function fail(actual, expected, message, operator, defaultMessage) {
    if (message instanceof Error) throw message;
    throw new AssertionError({
        message: message === undefined ? defaultMessage : message,
        actual,
        expected,
        operator,
    });
}
const toStringTag = (value) => Object.prototype.toString.call(value);
const isObject = (value) => typeof value === "object" && value !== null;
function looseKeysEqual(a, b, seen) {
    const ka = Object.keys(a),
        kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka)
        if (
            !Object.prototype.hasOwnProperty.call(b, k) ||
            !Object.prototype.propertyIsEnumerable.call(b, k)
        )
            return false;
    for (const k of ka) if (!looseEqual(a[k], b[k], seen)) return false;
    return true;
}
function looseBytesEqual(a, b) {
    if (a.byteLength !== b.byteLength) return false;
    const x = new Uint8Array(a.buffer || a, a.byteOffset || 0, a.byteLength);
    const y = new Uint8Array(b.buffer || b, b.byteOffset || 0, b.byteLength);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
}
function looseMapEqual(a, b, seen) {
    if (a.size !== b.size) return false;
    const entries = [...b];
    const used = new Array(entries.length).fill(false);
    outer: for (const [k, v] of a) {
        for (let i = 0; i < entries.length; i++) {
            if (used[i]) continue;
            if (
                looseEqual(k, entries[i][0], seen) &&
                looseEqual(v, entries[i][1], seen)
            ) {
                used[i] = true;
                continue outer;
            }
        }
        return false;
    }
    return true;
}
function looseSetEqual(a, b, seen) {
    if (a.size !== b.size) return false;
    const items = [...b];
    const used = new Array(items.length).fill(false);
    outer: for (const v of a) {
        for (let i = 0; i < items.length; i++) {
            if (used[i]) continue;
            if (looseEqual(v, items[i], seen)) {
                used[i] = true;
                continue outer;
            }
        }
        return false;
    }
    return true;
}
function looseEqual(a, b, seen) {
    if (a === b) return true;
    if (!isObject(a))
        return isObject(b) ? false : a == b || (a !== a && b !== b);
    if (!isObject(b)) return false;
    if (toStringTag(a) !== toStringTag(b)) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    for (const [x, y] of seen) if (x === a && y === b) return true;
    seen.push([a, b]);
    try {
        if (types.isDate(a)) {
            if (!types.isDate(b)) return false;
            const x = a.getTime(),
                y = b.getTime();
            if (x !== y && !(x !== x && y !== y)) return false;
        } else if (types.isRegExp(a)) {
            if (
                !types.isRegExp(b) ||
                a.source !== b.source ||
                a.flags !== b.flags ||
                a.lastIndex !== b.lastIndex
            )
                return false;
        } else if (types.isBoxedPrimitive(a)) {
            if (!types.isBoxedPrimitive(b)) return false;
            const x = a.valueOf(),
                y = b.valueOf();
            if (x !== y && !(x !== x && y !== y)) return false;
        } else if (types.isNativeError(a) || types.isNativeError(b)) {
            if (
                !types.isNativeError(a) ||
                !types.isNativeError(b) ||
                a.message !== b.message ||
                a.name !== b.name
            )
                return false;
        } else if (types.isAnyArrayBuffer(a)) {
            if (!types.isAnyArrayBuffer(b) || !looseBytesEqual(a, b))
                return false;
            return true;
        } else if (types.isDataView(a)) {
            if (!types.isDataView(b) || !looseBytesEqual(a, b)) return false;
        } else if (types.isTypedArray(a)) {
            if (!types.isTypedArray(b) || a.length !== b.length) return false;
            if (a instanceof Float32Array || a instanceof Float64Array) {
                for (let i = 0; i < a.length; i++)
                    if (a[i] != b[i]) return false;
            } else if (!looseBytesEqual(a, b)) return false;
        } else if (types.isMap(a)) {
            if (!types.isMap(b) || !looseMapEqual(a, b, seen)) return false;
        } else if (types.isSet(a)) {
            if (!types.isSet(b) || !looseSetEqual(a, b, seen)) return false;
        }
        return looseKeysEqual(a, b, seen);
    } finally {
        seen.pop();
    }
}
function looseDeepEqual(a, b) {
    return looseEqual(a, b, []);
}
export function ok(value, message) {
    if (!value)
        fail(
            value,
            true,
            message,
            "==",
            arguments.length === 0
                ? "No value argument passed to \x60assert.ok()\x60"
                : "The expression evaluated to a falsy value:\n\n  assert.ok(" +
                      inspect(value) +
                      ")\n",
        );
}
export function equal(actual, expected, message) {
    if (!(actual == expected || (actual !== actual && expected !== expected)))
        fail(
            actual,
            expected,
            message,
            "==",
            inspect(actual) + " == " + inspect(expected),
        );
}
export function notEqual(actual, expected, message) {
    if (actual == expected || (actual !== actual && expected !== expected))
        fail(
            actual,
            expected,
            message,
            "!=",
            inspect(actual) + " != " + inspect(expected),
        );
}
export function strictEqual(actual, expected, message) {
    if (!Object.is(actual, expected))
        fail(
            actual,
            expected,
            message,
            "strictEqual",
            "Expected values to be strictly equal:\n\n" +
                inspect(actual) +
                " !== " +
                inspect(expected) +
                "\n",
        );
}
export function notStrictEqual(actual, expected, message) {
    if (Object.is(actual, expected))
        fail(
            actual,
            expected,
            message,
            "notStrictEqual",
            'Expected "actual" to be strictly unequal to: ' + inspect(expected),
        );
}
export function deepStrictEqual(actual, expected, message) {
    if (!isDeepStrictEqual(actual, expected))
        fail(
            actual,
            expected,
            message,
            "deepStrictEqual",
            "Expected values to be strictly deep-equal:\n" +
                inspect(actual) +
                "\n\nshould equal\n\n" +
                inspect(expected),
        );
}
export function notDeepStrictEqual(actual, expected, message) {
    if (isDeepStrictEqual(actual, expected))
        fail(
            actual,
            expected,
            message,
            "notDeepStrictEqual",
            'Expected "actual" not to be strictly deep-equal to: ' +
                inspect(expected),
        );
}
export function deepEqual(actual, expected, message) {
    if (!looseDeepEqual(actual, expected))
        fail(
            actual,
            expected,
            message,
            "deepEqual",
            "Expected values to be loosely deep-equal:\n\n" +
                inspect(actual) +
                "\n\nshould loosely deep-equal\n\n" +
                inspect(expected),
        );
}
export function notDeepEqual(actual, expected, message) {
    if (looseDeepEqual(actual, expected))
        fail(
            actual,
            expected,
            message,
            "notDeepEqual",
            '"actual" deepEqual "expected"',
        );
}
function matches(error, expected) {
    if (expected === undefined) return true;
    if (typeof expected === "function") {
        if (expected.prototype !== undefined && error instanceof expected)
            return true;
        if (Error.isPrototypeOf(expected) || expected === Error) return false;
        return expected.call({}, error) === true;
    }
    if (expected instanceof RegExp) return expected.test(String(error));
    if (typeof expected === "object" && expected !== null)
        return Object.keys(expected).every((k) =>
            expected[k] instanceof RegExp && typeof error[k] === "string"
                ? expected[k].test(error[k])
                : isDeepStrictEqual(error[k], expected[k]),
        );
    return true;
}
export function throws(fn, expected, message) {
    if (typeof expected === "string") {
        message = expected;
        expected = undefined;
    }
    try {
        fn();
    } catch (error) {
        if (!matches(error, expected)) throw error;
        return;
    }
    fail(
        undefined,
        expected,
        message,
        "throws",
        "Missing expected exception" + (message ? ": " + message : "."),
    );
}
export function doesNotThrow(fn, message) {
    try {
        fn();
    } catch (error) {
        fail(
            error,
            undefined,
            typeof message === "string" ? message : undefined,
            "doesNotThrow",
            'Got unwanted exception.\nActual message: "' +
                (error && error.message) +
                '"',
        );
    }
}
export async function rejects(promise, expected, message) {
    if (typeof expected === "string") {
        message = expected;
        expected = undefined;
    }
    try {
        await (typeof promise === "function" ? promise() : promise);
    } catch (error) {
        if (!matches(error, expected)) throw error;
        return;
    }
    fail(
        undefined,
        expected,
        message,
        "rejects",
        "Missing expected rejection" + (message ? ": " + message : "."),
    );
}
export async function doesNotReject(promise, message) {
    try {
        await (typeof promise === "function" ? promise() : promise);
    } catch (error) {
        fail(
            error,
            undefined,
            message,
            "doesNotReject",
            'Got unwanted rejection.\nActual message: "' +
                (error && error.message) +
                '"',
        );
    }
}
export function match(text, pattern, message) {
    if (!pattern.test(text))
        fail(
            text,
            pattern,
            message,
            "match",
            "The input did not match the regular expression " +
                inspect(pattern) +
                ". Input:\n\n" +
                inspect(text) +
                "\n",
        );
}
export function doesNotMatch(text, pattern, message) {
    if (pattern.test(text))
        fail(
            text,
            pattern,
            message,
            "doesNotMatch",
            "The input was expected to not match the regular expression " +
                inspect(pattern) +
                ". Input:\n\n" +
                inspect(text) +
                "\n",
        );
}
export function ifError(value) {
    if (value !== null && value !== undefined) {
        if (value instanceof Error) throw value;
        fail(
            value,
            null,
            undefined,
            "ifError",
            "ifError got unwanted exception: " + inspect(value),
        );
    }
}
function fail_(message) {
    fail(
        undefined,
        undefined,
        message === undefined ? "Failed" : message,
        "fail",
    );
}
export { fail_ as fail };
function assert(value, message) {
    ok.apply(undefined, arguments);
}
Object.assign(assert, {
    ok,
    equal,
    notEqual,
    strictEqual,
    notStrictEqual,
    deepStrictEqual,
    notDeepStrictEqual,
    deepEqual,
    notDeepEqual,
    throws,
    doesNotThrow,
    rejects,
    doesNotReject,
    match,
    doesNotMatch,
    ifError,
    fail: fail_,
    AssertionError,
});
function strict(value, message) {
    ok.apply(undefined, arguments);
}
Object.assign(strict, assert, {
    equal: strictEqual,
    notEqual: notStrictEqual,
    deepEqual: deepStrictEqual,
    notDeepEqual: notDeepStrictEqual,
});
strict.strict = strict;
assert.strict = strict;
export { strict };
export default assert;
