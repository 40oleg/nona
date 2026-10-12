import { inspect, isDeepStrictEqual } from "node:util";
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
function looseDeepEqual(a, b) {
    if (a == b) return true;
    if (
        typeof a !== "object" ||
        typeof b !== "object" ||
        a === null ||
        b === null
    )
        return false;
    const ka = Object.keys(a),
        kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every(
        (k) =>
            Object.prototype.hasOwnProperty.call(b, k) &&
            looseDeepEqual(a[k], b[k]),
    );
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
assert.strict = assert;
export const strict = assert;
export default assert;
