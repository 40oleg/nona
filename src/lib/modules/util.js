const customInspect = Symbol.for("nodejs.util.inspect.custom");
const customPromisify = Symbol.for("nodejs.util.promisify.custom");
const objectToString = Object.prototype.toString;
const tag = (value) => objectToString.call(value).slice(8, -1);

export const types = {
    isDate: (value) => value instanceof Date,
    isRegExp: (value) => value instanceof RegExp,
    isMap: (value) => value instanceof Map,
    isSet: (value) => value instanceof Set,
    isWeakMap: (value) => value instanceof WeakMap,
    isWeakSet: (value) => value instanceof WeakSet,
    isPromise: (value) => value instanceof Promise,
    isNativeError: (value) => value instanceof Error,
    isArrayBuffer: (value) => value instanceof ArrayBuffer,
    isAnyArrayBuffer: (value) =>
        value instanceof ArrayBuffer ||
        (typeof SharedArrayBuffer === "function" &&
            value instanceof SharedArrayBuffer),
    isSharedArrayBuffer: (value) =>
        typeof SharedArrayBuffer === "function" &&
        value instanceof SharedArrayBuffer,
    isArrayBufferView: (value) => ArrayBuffer.isView(value),
    isTypedArray: (value) =>
        ArrayBuffer.isView(value) && !(value instanceof DataView),
    isUint8Array: (value) => value instanceof Uint8Array,
    isDataView: (value) => value instanceof DataView,
    isGeneratorFunction: (value) =>
        typeof value === "function" && tag(value) === "GeneratorFunction",
    isAsyncFunction: (value) =>
        typeof value === "function" && tag(value) === "AsyncFunction",
    isGeneratorObject: (value) => tag(value) === "Generator",
    isBoxedPrimitive: (value) =>
        value instanceof Number ||
        value instanceof String ||
        value instanceof Boolean ||
        value instanceof Symbol ||
        (typeof BigInt === "function" && value instanceof BigInt),
    isNumberObject: (value) => value instanceof Number,
    isStringObject: (value) => value instanceof String,
    isBooleanObject: (value) => value instanceof Boolean,
    isSymbolObject: (value) => value instanceof Symbol,
    isProxy: (value) => false,
    isExternal: (value) => false,
    isModuleNamespaceObject: (value) => tag(value) === "Module",
};

function quote(text) {
    const q = !text.includes("'")
        ? "'"
        : !text.includes('"')
          ? '"'
          : !text.includes("\x60")
            ? "\x60"
            : "'";
    let out = q;
    for (const ch of text) {
        if (ch === q || ch === "\\") out += "\\" + ch;
        else if (ch === "\n") out += "\\n";
        else if (ch === "\t") out += "\\t";
        else if (ch === "\r") out += "\\r";
        else if (ch < " " || ch === "\x7f")
            out +=
                "\\x" +
                ch.charCodeAt(0).toString(16).padStart(2, "0").toUpperCase();
        else out += ch;
    }
    return out + q;
}
const identifier = /^[A-Za-z_$][\w$]*$/;
function key(name) {
    if (typeof name === "symbol") return "[" + name.toString() + "]";
    return identifier.test(name) ? name : quote(name);
}
function functionLabel(fn) {
    const source = Function.prototype.toString.call(fn);
    const isClass = /^class\b/.test(source);
    const kind = isClass
        ? "class"
        : types.isAsyncFunction(fn)
          ? "AsyncFunction"
          : types.isGeneratorFunction(fn)
            ? "GeneratorFunction"
            : "Function";
    if (isClass) return "[class " + (fn.name || "(anonymous)") + "]";
    return "[" + kind + (fn.name ? ": " + fn.name : " (anonymous)") + "]";
}
function formatPrimitive(value) {
    if (typeof value === "string") return quote(value);
    if (typeof value === "bigint") return String(value) + "n";
    if (typeof value === "number")
        return Object.is(value, -0) ? "-0" : String(value);
    if (typeof value === "symbol") return value.toString();
    return String(value);
}
function inspectValue(value, options, depth, seen) {
    if (
        value === null ||
        (typeof value !== "object" && typeof value !== "function")
    )
        return formatPrimitive(value);
    if (
        options.customInspect !== false &&
        value &&
        typeof value[customInspect] === "function" &&
        value[customInspect] !== inspect
    ) {
        const result = value[customInspect](
            options.depth - depth,
            options,
            inspect,
        );
        if (result !== value)
            return typeof result === "string"
                ? result
                : inspectValue(result, options, depth, seen);
    }
    if (seen.includes(value)) return "[Circular *1]";
    if (typeof value === "function") {
        const own = Object.keys(value);
        const label = functionLabel(value);
        if (!own.length) return label;
        if (depth > options.depth) return label;
        return formatEntries(
            label + " ",
            own.map(
                (k) =>
                    key(k) +
                    ": " +
                    inspectValue(
                        value[k],
                        options,
                        depth + 1,
                        seen.concat([value]),
                    ),
            ),
            "{",
            "}",
            options,
        );
    }
    if (value instanceof Date)
        return isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
    if (value instanceof RegExp) return String(value);
    if (value instanceof Error) {
        const stack =
            typeof value.stack === "string" && value.stack
                ? value.stack
                : (value.name || "Error") +
                  (value.message ? ": " + value.message : "");
        return value.stack ? stack : "[" + stack + "]";
    }
    if (types.isBoxedPrimitive(value))
        return "[" + tag(value) + ": " + formatPrimitive(value.valueOf()) + "]";
    const inner = seen.concat([value]);
    const nested = (item) => inspectValue(item, options, depth + 1, inner);
    if (Array.isArray(value)) {
        if (depth > options.depth) return "[Array]";
        const items = [];
        let holes = 0;
        const limit = Math.min(value.length, options.maxArrayLength);
        for (let i = 0; i < limit; i++) {
            if (!(i in value)) {
                holes++;
                continue;
            }
            if (holes) {
                items.push(
                    "<" + holes + " empty item" + (holes > 1 ? "s" : "") + ">",
                );
                holes = 0;
            }
            items.push(nested(value[i]));
        }
        if (holes)
            items.push(
                "<" + holes + " empty item" + (holes > 1 ? "s" : "") + ">",
            );
        if (value.length > limit)
            items.push(
                "... " +
                    (value.length - limit) +
                    " more item" +
                    (value.length - limit > 1 ? "s" : ""),
            );
        for (const k of Object.keys(value))
            if (!/^(0|[1-9]\d*)$/.test(k))
                items.push(key(k) + ": " + nested(value[k]));
        return formatEntries("", items, "[", "]", options);
    }
    if (value instanceof Map) {
        if (depth > options.depth) return "[Map]";
        const items = [];
        for (const [k, v] of value) items.push(nested(k) + " => " + nested(v));
        return formatEntries(
            "Map(" + value.size + ") ",
            items,
            "{",
            "}",
            options,
        );
    }
    if (value instanceof Set) {
        if (depth > options.depth) return "[Set]";
        const items = [];
        for (const v of value) items.push(nested(v));
        return formatEntries(
            "Set(" + value.size + ") ",
            items,
            "{",
            "}",
            options,
        );
    }
    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
        const name =
            (value.constructor && value.constructor.name) || tag(value);
        if (depth > options.depth) return "[" + name + "]";
        const items = [];
        for (let i = 0; i < Math.min(value.length, options.maxArrayLength); i++)
            items.push(formatPrimitive(value[i]));
        if (value.length > options.maxArrayLength)
            items.push(
                "... " +
                    (value.length - options.maxArrayLength) +
                    " more items",
            );
        return formatEntries(
            name + "(" + value.length + ") ",
            items,
            "[",
            "]",
            options,
        );
    }
    if (value instanceof Promise) return "Promise { <unknown> }";
    const proto = Object.getPrototypeOf(value);
    const constructorName =
        proto === null
            ? null
            : proto.constructor && typeof proto.constructor === "function"
              ? proto.constructor.name
              : "";
    const toStringTag =
        typeof value[Symbol.toStringTag] === "string"
            ? value[Symbol.toStringTag]
            : "";
    let prefix =
        constructorName === null
            ? "[Object: null prototype] "
            : constructorName && constructorName !== "Object"
              ? constructorName + " "
              : "";
    if (toStringTag && toStringTag !== constructorName)
        prefix = (prefix || "Object ") + "[" + toStringTag + "] ";
    if (depth > options.depth) return "[" + (constructorName || "Object") + "]";
    const items = [];
    for (const k of Object.keys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, k);
        if (descriptor && (descriptor.get || descriptor.set))
            items.push(
                key(k) +
                    ": " +
                    (descriptor.get && descriptor.set
                        ? "[Getter/Setter]"
                        : descriptor.get
                          ? "[Getter]"
                          : "[Setter]"),
            );
        else items.push(key(k) + ": " + nested(value[k]));
    }
    for (const s of Object.getOwnPropertySymbols(value))
        if (Object.getOwnPropertyDescriptor(value, s).enumerable)
            items.push(key(s) + ": " + nested(value[s]));
    return formatEntries(prefix, items, "{", "}", options);
}
function formatEntries(prefix, items, open, close, options) {
    if (!items.length) return prefix + open + close;
    const single = prefix + open + " " + items.join(", ") + " " + close;
    if (
        single.length <= options.breakLength &&
        !items.some((item) => item.includes("\n"))
    )
        return single;
    if (
        open === "[" &&
        items.length > 6 &&
        items.every((item) => item.length <= 6)
    ) {
        // Node groups short array items into columns; a fixed width of 16 per line is close.
        const lines = [];
        for (let i = 0; i < items.length; i += 16)
            lines.push(items.slice(i, i + 16).join(", "));
        return prefix + open + "\n  " + lines.join(",\n  ") + "\n" + close;
    }
    return (
        prefix +
        open +
        "\n" +
        items.map((item) => "  " + item.split("\n").join("\n  ")).join(",\n") +
        "\n" +
        close
    );
}
export function inspect(value, options) {
    const settings = Object.assign(
        {},
        inspect.defaultOptions,
        typeof options === "object" && options !== null ? options : {},
    );
    if (typeof options === "boolean") settings.showHidden = options;
    if (settings.depth === null) settings.depth = Infinity;
    return inspectValue(value, settings, 0, []);
}
inspect.custom = customInspect;
inspect.defaultOptions = {
    showHidden: false,
    depth: 2,
    colors: false,
    customInspect: true,
    maxArrayLength: 100,
    maxStringLength: 10000,
    breakLength: 80,
    compact: 3,
    sorted: false,
};
inspect.colors = {
    bold: [1, 22],
    italic: [3, 23],
    underline: [4, 24],
    inverse: [7, 27],
    white: [37, 39],
    grey: [90, 39],
    black: [30, 39],
    blue: [34, 39],
    cyan: [36, 39],
    green: [32, 39],
    magenta: [35, 39],
    red: [31, 39],
    yellow: [33, 39],
};
inspect.styles = {
    special: "cyan",
    number: "yellow",
    bigint: "yellow",
    boolean: "yellow",
    undefined: "grey",
    null: "bold",
    string: "green",
    symbol: "green",
    date: "magenta",
    regexp: "red",
    module: "underline",
};

export function formatWithOptions(options, ...args) {
    const first = args[0];
    let out = "";
    let index = 1;
    if (typeof first === "string") {
        if (args.length === 1) return first;
        for (let i = 0; i < first.length; i++) {
            const ch = first[i];
            if (ch === "%" && i + 1 < first.length) {
                const next = first[i + 1];
                if (next === "%") {
                    out += "%";
                    i++;
                    continue;
                }
                if (index < args.length && "sdifjoOc".includes(next)) {
                    const arg = args[index++];
                    i++;
                    if (next === "s")
                        out +=
                            typeof arg === "string"
                                ? arg
                                : typeof arg === "bigint"
                                  ? arg + "n"
                                  : (typeof arg === "object" && arg !== null) ||
                                      typeof arg === "symbol"
                                    ? inspect(
                                          arg,
                                          Object.assign({}, options, {
                                              depth: 0,
                                          }),
                                      )
                                    : String(arg);
                    else if (next === "d")
                        out +=
                            typeof arg === "bigint"
                                ? arg + "n"
                                : typeof arg === "symbol"
                                  ? "NaN"
                                  : String(Number(arg));
                    else if (next === "i")
                        out +=
                            typeof arg === "bigint"
                                ? arg + "n"
                                : typeof arg === "symbol"
                                  ? "NaN"
                                  : String(parseInt(arg));
                    else if (next === "f")
                        out +=
                            typeof arg === "symbol"
                                ? "NaN"
                                : String(parseFloat(arg));
                    else if (next === "j") {
                        try {
                            out += JSON.stringify(arg);
                        } catch {
                            out += "[Circular]";
                        }
                    } else if (next === "o")
                        out += inspect(
                            arg,
                            Object.assign({}, options, {
                                showHidden: true,
                                depth: 4,
                            }),
                        );
                    else if (next === "O") out += inspect(arg, options);
                    continue;
                }
            }
            out += ch;
        }
    } else index = 0;
    for (; index < args.length; index++) {
        const arg = args[index];
        if (out.length || (index > 0 && typeof first === "string")) out += " ";
        out += typeof arg === "string" ? arg : inspect(arg, options);
    }
    return out;
}
export function format(...args) {
    return formatWithOptions({}, ...args);
}

export function inherits(constructor, superConstructor) {
    if (constructor === undefined || constructor === null)
        throw new TypeError('The "ctor" argument must be of type function');
    if (superConstructor === undefined || superConstructor === null)
        throw new TypeError(
            'The "superCtor" argument must be of type function',
        );
    if (superConstructor.prototype === undefined)
        throw new TypeError(
            'The "superCtor.prototype" property must be of type object',
        );
    Object.defineProperty(constructor, "super_", {
        value: superConstructor,
        writable: true,
        configurable: true,
    });
    Object.setPrototypeOf(constructor.prototype, superConstructor.prototype);
}

const warned = new Set();
export function deprecate(fn, message, code) {
    function deprecated(...args) {
        const id = code || message;
        if (!warned.has(id) && !process.noDeprecation) {
            warned.add(id);
            if (typeof process.emitWarning === "function")
                process.emitWarning(message, "DeprecationWarning", code);
        }
        return new.target
            ? Reflect.construct(fn, args, new.target)
            : fn.apply(this, args);
    }
    Object.setPrototypeOf(deprecated, fn);
    if (fn.prototype) deprecated.prototype = fn.prototype;
    return deprecated;
}

export function promisify(original) {
    if (typeof original !== "function")
        throw new TypeError('The "original" argument must be of type function');
    if (original[customPromisify]) {
        const fn = original[customPromisify];
        return Object.defineProperty(fn, customPromisify, {
            value: fn,
            enumerable: false,
            writable: false,
            configurable: true,
        });
    }
    function fn(...args) {
        return new Promise((resolve, reject) => {
            original.call(this, ...args, (error, ...values) =>
                error
                    ? reject(error)
                    : resolve(values.length > 1 ? values : values[0]),
            );
        });
    }
    Object.setPrototypeOf(fn, Object.getPrototypeOf(original));
    Object.defineProperty(fn, customPromisify, {
        value: fn,
        enumerable: false,
        writable: false,
        configurable: true,
    });
    return Object.defineProperties(
        fn,
        Object.getOwnPropertyDescriptors(original),
    );
}
promisify.custom = customPromisify;

export function callbackify(original) {
    if (typeof original !== "function")
        throw new TypeError('The "original" argument must be of type function');
    return function (...args) {
        const callback = args.pop();
        if (typeof callback !== "function")
            throw new TypeError("The last argument must be of type function");
        original.apply(this, args).then(
            (value) => queueMicrotask(() => callback(null, value)),
            (reason) =>
                queueMicrotask(() => {
                    if (!reason) {
                        const error = new Error(
                            "Promise was rejected with a falsy value",
                        );
                        error.reason = reason;
                        error.code = "ERR_FALSY_VALUE_REJECTION";
                        reason = error;
                    }
                    callback(reason);
                }),
        );
    };
}

function deepEqual(a, b, seen) {
    if (Object.is(a, b)) return true;
    if (
        typeof a !== "object" ||
        typeof b !== "object" ||
        a === null ||
        b === null
    )
        return false;
    if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
    for (const [x, y] of seen) if (x === a && y === b) return true;
    seen = seen.concat([[a, b]]);
    if (a instanceof Date) return a.getTime() === b.getTime();
    if (a instanceof RegExp)
        return String(a) === String(b) && a.lastIndex === b.lastIndex;
    if (types.isBoxedPrimitive(a)) return Object.is(a.valueOf(), b.valueOf());
    if (a instanceof Map) {
        if (a.size !== b.size) return false;
        const used = new Set();
        outer: for (const [k, v] of a) {
            if (b.has(k)) {
                if (!deepEqual(v, b.get(k), seen)) return false;
                used.add(k);
                continue;
            }
            if (typeof k === "object" && k !== null)
                for (const [k2, v2] of b)
                    if (
                        !used.has(k2) &&
                        deepEqual(k, k2, seen) &&
                        deepEqual(v, v2, seen)
                    ) {
                        used.add(k2);
                        continue outer;
                    }
            return false;
        }
        return true;
    }
    if (a instanceof Set) {
        if (a.size !== b.size) return false;
        outer: for (const v of a) {
            if (b.has(v)) continue;
            if (typeof v === "object" && v !== null)
                for (const w of b) if (deepEqual(v, w, seen)) continue outer;
            return false;
        }
        return true;
    }
    if (types.isAnyArrayBuffer(a)) {
        if (
            !types.isAnyArrayBuffer(b) ||
            types.isSharedArrayBuffer(a) !== types.isSharedArrayBuffer(b) ||
            a.byteLength !== b.byteLength
        )
            return false;
        const ua = new Uint8Array(a),
            ub = new Uint8Array(b);
        for (let i = 0; i < ua.length; i++) if (ua[i] !== ub[i]) return false;
    }
    if (ArrayBuffer.isView(a)) {
        if (a.length !== b.length || a.byteLength !== b.byteLength)
            return false;
        for (let i = 0; i < a.length; i++)
            if (!Object.is(a[i], b[i])) return false;
    }
    if (a instanceof Error && (a.message !== b.message || a.name !== b.name))
        return false;
    const ka = Object.keys(a),
        kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka)
        if (
            !Object.prototype.hasOwnProperty.call(b, k) ||
            !deepEqual(a[k], b[k], seen)
        )
            return false;
    const sa = Object.getOwnPropertySymbols(a).filter((s) =>
        Object.prototype.propertyIsEnumerable.call(a, s),
    );
    const sb = Object.getOwnPropertySymbols(b).filter((s) =>
        Object.prototype.propertyIsEnumerable.call(b, s),
    );
    if (sa.length !== sb.length) return false;
    for (const s of sa) if (!deepEqual(a[s], b[s], seen)) return false;
    return true;
}
export function isDeepStrictEqual(a, b) {
    return deepEqual(a, b, []);
}

export function debuglog(section) {
    const enabled =
        new RegExp(
            "^(" +
                String(process.env.NODE_DEBUG || "")
                    .split(/[\s,]+/)
                    .filter(Boolean)
                    .map((s) =>
                        s
                            .replace(/[|\\{}()[\]^$+?.]/g, "\\$&")
                            .replace(/\*/g, ".*"),
                    )
                    .join("|") +
                ")$",
            "i",
        ).test(section) && !!process.env.NODE_DEBUG;
    const log = (...args) => {
        if (enabled)
            process.stderr.write(
                section.toUpperCase() +
                    " " +
                    process.pid +
                    ": " +
                    format(...args) +
                    "\n",
            );
    };
    log.enabled = enabled;
    return log;
}
export const debug = debuglog;
export function stripVTControlCharacters(text) {
    return String(text).replace(
        /[\u001B\u009B][[\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g,
        "",
    );
}
export function toUSVString(text) {
    return String(text).toWellFormed
        ? String(text).toWellFormed()
        : String(text);
}
export function styleText(style, text, options) {
    const styles = Array.isArray(style) ? style : [style];
    for (const name of styles)
        if (!inspect.colors[name])
            throw new TypeError(
                "The argument 'format' must be a valid style. Received " + name,
            );
    const settings = options || {};
    if (settings.validateStream !== false) {
        // As in Node.js: colors only for a terminal, unless FORCE_COLOR or NO_COLOR say otherwise.
        const stream = settings.stream || process.stdout,
            env = process.env;
        const forced =
            env.FORCE_COLOR !== undefined
                ? env.FORCE_COLOR !== "0" && env.FORCE_COLOR !== "false"
                : undefined;
        const colors =
            forced !== undefined
                ? forced
                : env.NO_COLOR === undefined &&
                  env.NODE_DISABLE_COLORS === undefined &&
                  !!(stream && stream.isTTY) &&
                  env.TERM !== "dumb";
        if (!colors) return String(text);
    }
    let out = String(text);
    for (const name of styles) {
        const codes = inspect.colors[name];
        out = "\u001b[" + codes[0] + "m" + out + "\u001b[" + codes[1] + "m";
    }
    return out;
}
export const isArray = Array.isArray;
export function isBoolean(value) {
    return typeof value === "boolean";
}
export function isNull(value) {
    return value === null;
}
export function isNullOrUndefined(value) {
    return value === null || value === undefined;
}
export function isNumber(value) {
    return typeof value === "number";
}
export function isString(value) {
    return typeof value === "string";
}
export function isSymbol(value) {
    return typeof value === "symbol";
}
export function isUndefined(value) {
    return value === undefined;
}
export function isRegExp(value) {
    return value instanceof RegExp;
}
export function isObject(value) {
    return value !== null && typeof value === "object";
}
export function isDate(value) {
    return value instanceof Date;
}
export function isError(value) {
    return value instanceof Error;
}
export function isFunction(value) {
    return typeof value === "function";
}
export function isPrimitive(value) {
    return (
        value === null ||
        (typeof value !== "object" && typeof value !== "function")
    );
}
export const TextEncoder = globalThis.TextEncoder,
    TextDecoder = globalThis.TextDecoder;
export function getSystemErrorName(code) {
    return "Unknown system error " + code;
}
function parseArgsError(Type, code, message) {
    const error = new Type(message);
    error.code = code;
    return error;
}
function parseArgsReceived(value) {
    if (value === null || value === undefined) return " Received " + value;
    if (typeof value === "function") return " Received function " + value.name;
    if (typeof value === "object") {
        const name = value.constructor && value.constructor.name;
        if (name) return " Received an instance of " + name;
        return " Received " + inspect(value, { depth: -1 });
    }
    let shown = inspect(value, { colors: false });
    if (shown.length > 28) shown = shown.slice(0, 25) + "...";
    return " Received type " + typeof value + " (" + shown + ")";
}
function parseArgsTypeError(name, expected, value) {
    return parseArgsError(
        TypeError,
        "ERR_INVALID_ARG_TYPE",
        'The "' +
            name +
            '" ' +
            (name.includes(".") ? "property" : "argument") +
            " must be " +
            expected +
            "." +
            parseArgsReceived(value),
    );
}
function parseArgsValidate(value, name, type) {
    if (typeof value !== type)
        throw parseArgsTypeError(name, "of type " + type, value);
}
function parseArgsValidateArray(value, name, type) {
    if (!Array.isArray(value))
        throw parseArgsTypeError(name, "an instance of Array", value);
    if (type)
        for (let i = 0; i < value.length; i++)
            parseArgsValidate(value[i], name + "[" + i + "]", type);
}
function parseArgsValidateObject(value, name) {
    if (value === null || Array.isArray(value) || typeof value !== "object")
        throw parseArgsTypeError(name, "of type object", value);
}
function parseArgsOwn(object, key) {
    return Object.hasOwn(object, key) ? object[key] : undefined;
}
function parseArgsOptionOwn(options, name, key) {
    return Object.hasOwn(options, name)
        ? parseArgsOwn(options[name], key)
        : undefined;
}
function parseArgsLongForShort(short, options) {
    for (const name of Object.keys(options))
        if (parseArgsOwn(options[name], "short") === short) return name;
    return short;
}
function parseArgsTokens(args, options, allowNegative, negated) {
    const tokens = [];
    let index = -1;
    let groupCount = 0;
    const remaining = args.slice();
    const isValue = (value) => value !== undefined && value !== null;
    const isGroupOrValue = (arg, wantString) => {
        if (arg[0] !== "-" || arg[1] === "-" || arg.length <= 2) return false;
        const long = parseArgsLongForShort(arg[1], options);
        return (
            (parseArgsOptionOwn(options, long, "type") === "string") ===
            wantString
        );
    };
    const optionToken = (name, rawName, value, inlineValue) => {
        const token = { kind: "option", name, rawName, index };
        if (value !== undefined) {
            token.value = value;
            token.inlineValue = inlineValue;
        }
        return token;
    };
    while (remaining.length > 0) {
        const arg = remaining.shift();
        const next = remaining[0];
        if (groupCount > 0) groupCount--;
        else index++;
        if (arg === "--") {
            tokens.push({ kind: "option-terminator", index });
            for (const rest of remaining)
                tokens.push({
                    kind: "positional",
                    index: ++index,
                    value: rest,
                });
            break;
        }
        if (arg.length === 2 && arg[0] === "-" && arg[1] !== "-") {
            const long = parseArgsLongForShort(arg[1], options);
            let value;
            let inlineValue;
            if (
                parseArgsOptionOwn(options, long, "type") === "string" &&
                isValue(next)
            ) {
                value = remaining.shift();
                inlineValue = false;
            }
            tokens.push(optionToken(long, arg, value, inlineValue));
            if (value != null) ++index;
            continue;
        }
        if (isGroupOrValue(arg, false)) {
            const expanded = [];
            for (let i = 1; i < arg.length; i++) {
                const long = parseArgsLongForShort(arg[i], options);
                if (
                    parseArgsOptionOwn(options, long, "type") !== "string" ||
                    i === arg.length - 1
                ) {
                    expanded.push("-" + arg[i]);
                } else {
                    expanded.push("-" + arg.slice(i));
                    break;
                }
            }
            remaining.unshift(...expanded);
            groupCount = expanded.length;
            continue;
        }
        if (isGroupOrValue(arg, true)) {
            tokens.push(
                optionToken(
                    parseArgsLongForShort(arg[1], options),
                    "-" + arg[1],
                    arg.slice(2),
                    true,
                ),
            );
            continue;
        }
        if (arg.length > 2 && arg.startsWith("--")) {
            const equal = arg.indexOf("=", 3);
            let token;
            if (equal === -1) {
                const name = arg.slice(2);
                let value;
                let inlineValue;
                if (
                    parseArgsOptionOwn(options, name, "type") === "string" &&
                    isValue(next)
                ) {
                    value = remaining.shift();
                    inlineValue = false;
                }
                token = optionToken(name, arg, value, inlineValue);
                if (value != null) ++index;
            } else {
                const name = arg.slice(2, equal);
                token = optionToken(
                    name,
                    "--" + name,
                    arg.slice(equal + 1),
                    true,
                );
            }
            if (allowNegative && token.name.startsWith("no-")) {
                token.name = token.name.slice(3);
                negated.add(token);
            }
            tokens.push(token);
            continue;
        }
        tokens.push({ kind: "positional", index, value: arg });
    }
    return tokens;
}
function parseArgsCheckOption(config, token, negative) {
    const { options, allowPositionals } = config;
    if (
        !Object.hasOwn(options, token.name) ||
        (negative &&
            parseArgsOptionOwn(options, token.name, "type") !== "boolean")
    )
        throw parseArgsError(
            TypeError,
            "ERR_PARSE_ARGS_UNKNOWN_OPTION",
            "Unknown option '" +
                token.rawName +
                "'" +
                (allowPositionals
                    ? ". To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- " +
                      JSON.stringify(token.rawName)
                    : ""),
        );
    const short = parseArgsOptionOwn(options, token.name, "short");
    const both = (short ? "-" + short + ", " : "") + "--" + token.name;
    const type = parseArgsOptionOwn(options, token.name, "type");
    if (type === "string" && typeof token.value !== "string")
        throw parseArgsError(
            TypeError,
            "ERR_PARSE_ARGS_INVALID_OPTION_VALUE",
            "Option '" + both + " <value>' argument missing",
        );
    if (type === "boolean" && token.value != null)
        throw parseArgsError(
            TypeError,
            "ERR_PARSE_ARGS_INVALID_OPTION_VALUE",
            "Option '" + both + "' does not take an argument",
        );
    if (
        !token.inlineValue &&
        typeof token.value === "string" &&
        token.value.length > 1 &&
        token.value[0] === "-"
    ) {
        const raw = token.rawName;
        const example = raw.startsWith("--")
            ? raw + "=-XYZ"
            : "--" + token.name + "=-XYZ' or '" + raw + "-XYZ";
        throw parseArgsError(
            TypeError,
            "ERR_PARSE_ARGS_INVALID_OPTION_VALUE",
            "Option '" +
                raw +
                "' argument is ambiguous.\nDid you forget to specify the option argument for '" +
                raw +
                "'?\nTo specify an option argument starting with a dash use '" +
                example +
                "'.",
        );
    }
}
export function parseArgs(config = {}) {
    const args = parseArgsOwn(config, "args") ?? process.argv.slice(1);
    const strict = parseArgsOwn(config, "strict") ?? true;
    const allowPositionals =
        parseArgsOwn(config, "allowPositionals") ?? !strict;
    const returnTokens = parseArgsOwn(config, "tokens") ?? false;
    const allowNegative = parseArgsOwn(config, "allowNegative") ?? false;
    const options = parseArgsOwn(config, "options") ?? Object.create(null);
    parseArgsValidateArray(args, "args");
    parseArgsValidate(strict, "strict", "boolean");
    parseArgsValidate(allowPositionals, "allowPositionals", "boolean");
    parseArgsValidate(returnTokens, "tokens", "boolean");
    parseArgsValidate(allowNegative, "allowNegative", "boolean");
    parseArgsValidateObject(options, "options");
    for (const name of Object.keys(options)) {
        const option = options[name];
        const path = "options." + name;
        parseArgsValidateObject(option, path);
        const type = parseArgsOwn(option, "type");
        if (type !== "string" && type !== "boolean")
            throw parseArgsTypeError(
                path + ".type",
                "('string|boolean')",
                type,
            );
        if (Object.hasOwn(option, "short")) {
            parseArgsValidate(option.short, path + ".short", "string");
            if (option.short.length !== 1)
                throw parseArgsError(
                    TypeError,
                    "ERR_INVALID_ARG_VALUE",
                    "The property '" +
                        path +
                        ".short' must be a single character. Received " +
                        inspect(option.short),
                );
        }
        const multiple = parseArgsOwn(option, "multiple");
        if (Object.hasOwn(option, "multiple"))
            parseArgsValidate(multiple, path + ".multiple", "boolean");
        const def = parseArgsOwn(option, "default");
        if (def !== undefined) {
            if (multiple) parseArgsValidateArray(def, path + ".default", type);
            else parseArgsValidate(def, path + ".default", type);
        }
    }
    const negated = new Set();
    const tokens = parseArgsTokens(args, options, allowNegative, negated);
    const result = { values: Object.create(null), positionals: [] };
    if (returnTokens) result.tokens = tokens;
    const parseConfig = { options, allowPositionals };
    for (const token of tokens) {
        if (token.kind === "option") {
            const negative = negated.has(token);
            if (strict) parseArgsCheckOption(parseConfig, token, negative);
            if (token.name === "__proto__") continue;
            const value = negative ? false : (token.value ?? true);
            if (parseArgsOptionOwn(options, token.name, "multiple")) {
                if (result.values[token.name] !== undefined)
                    result.values[token.name].push(value);
                else result.values[token.name] = [value];
            } else result.values[token.name] = value;
        } else if (token.kind === "positional") {
            if (!allowPositionals)
                throw parseArgsError(
                    TypeError,
                    "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL",
                    "Unexpected argument '" +
                        token.value +
                        "'. This command does not take positional arguments",
                );
            result.positionals.push(token.value);
        }
    }
    for (const name of Object.keys(options)) {
        const def = parseArgsOwn(options[name], "default");
        if (def !== undefined && result.values[name] === undefined)
            result.values[name] = def;
    }
    return result;
}
const util = {
    format,
    formatWithOptions,
    inspect,
    inherits,
    deprecate,
    promisify,
    callbackify,
    isDeepStrictEqual,
    debuglog,
    debug,
    types,
    stripVTControlCharacters,
    toUSVString,
    styleText,
    isArray,
    isBoolean,
    isNull,
    isNullOrUndefined,
    isNumber,
    isString,
    isSymbol,
    isUndefined,
    isRegExp,
    isObject,
    isDate,
    isError,
    isFunction,
    isPrimitive,
    TextEncoder,
    TextDecoder,
    getSystemErrorName,
    parseArgs,
};
export default util;
