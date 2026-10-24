const isProxy = globalThis.__nonaIsProxy;
delete globalThis.__nonaIsProxy;
const customInspect = Symbol.for("nodejs.util.inspect.custom");
const customPromisify = Symbol.for("nodejs.util.promisify.custom");
const objectToString = Object.prototype.toString;
const tag = (value) => objectToString.call(value).slice(8, -1);

const getter = (proto, name) =>
    Object.getOwnPropertyDescriptor(proto, name).get;
// Calls a built-in accessor or method that throws a TypeError for a receiver
// without the internal slot; Reflect.apply ignores the receiver's prototype.
const brand = (fn, value, ...args) => {
    if (
        value === null ||
        (typeof value !== "object" && typeof value !== "function")
    )
        return false;
    try {
        Reflect.apply(fn, value, args);
        return true;
    } catch {
        return false;
    }
};
const dateGetTime = Date.prototype.getTime;
const mapHas = Map.prototype.has;
const setHas = Set.prototype.has;
const weakMapHas = WeakMap.prototype.has;
const weakSetHas = WeakSet.prototype.has;
const arrayBufferByteLength = getter(ArrayBuffer.prototype, "byteLength");
const sharedByteLength =
    typeof SharedArrayBuffer === "function"
        ? getter(SharedArrayBuffer.prototype, "byteLength")
        : undefined;
// RegExp.prototype.global returns undefined for %RegExp.prototype% itself.
const regExpGlobal = getter(RegExp.prototype, "global");
const isRegExpObject = (value) => {
    if (value === null || typeof value !== "object") return false;
    try {
        return typeof Reflect.apply(regExpGlobal, value, []) === "boolean";
    } catch {
        return false;
    }
};
// Installed by the promise prelude: reads the promise slot, no side effects.
const isPromise = (value) => {
    const hook = globalThis.__nonaIsPromise;
    return typeof hook === "function" ? hook(value) : value instanceof Promise;
};
const isSharedArrayBuffer = (value) =>
    sharedByteLength !== undefined && brand(sharedByteLength, value);

export const types = {
    isDate: (value) => brand(dateGetTime, value),
    isRegExp: isRegExpObject,
    isMap: (value) => brand(mapHas, value, undefined),
    isSet: (value) => brand(setHas, value, undefined),
    isWeakMap: (value) => brand(weakMapHas, value, {}),
    isWeakSet: (value) => brand(weakSetHas, value, {}),
    isPromise,
    // [[ErrorData]] is what gives an object the built-in "Error" tag.
    isNativeError: (value) =>
        typeof Error.isError === "function"
            ? Error.isError(value)
            : value !== null &&
              typeof value === "object" &&
              !(Symbol.toStringTag in value) &&
              tag(value) === "Error",
    isArrayBuffer: (value) => brand(arrayBufferByteLength, value),
    isAnyArrayBuffer: (value) =>
        brand(arrayBufferByteLength, value) || isSharedArrayBuffer(value),
    isSharedArrayBuffer,
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
    isProxy,
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
function formatString(value, options) {
    const max = options && options.maxStringLength;
    if (typeof max !== "number" || !Number.isFinite(max)) return quote(value);
    if (value.length <= max) return quote(value);
    const remaining = value.length - max;
    return (
        quote(value.slice(0, max)) +
        "... " +
        remaining +
        " more character" +
        (remaining > 1 ? "s" : "")
    );
}
function formatPrimitive(value, options) {
    if (typeof value === "string") return formatString(value, options);
    if (typeof value === "bigint") return String(value) + "n";
    if (typeof value === "number")
        return Object.is(value, -0) ? "-0" : String(value);
    if (typeof value === "symbol") return value.toString();
    return String(value);
}
function refPrefix(value, circular) {
    const index = circular.get(value);
    return index === undefined ? "" : "<ref *" + index + "> ";
}
function inspectValue(value, options, depth, seen, circular) {
    if (
        value === null ||
        (typeof value !== "object" && typeof value !== "function")
    )
        return formatPrimitive(value, options);
    if (
        options.customInspect !== false &&
        value &&
        typeof value[customInspect] === "function" &&
        value[customInspect] !== inspect
    ) {
        const remaining = options.depth - depth;
        const custom = Object.assign({}, options, {
            stylize(text, styleType) {
                const plain = String(text);
                if (!custom.colors) return plain;
                const codes = inspect.colors[inspect.styles[styleType]];
                if (!codes) return plain;
                return (
                    "\u001b[" +
                    codes[0] +
                    "m" +
                    plain +
                    "\u001b[" +
                    codes[1] +
                    "m"
                );
            },
        });
        const result = value[customInspect](remaining, custom, inspect);
        if (result !== value)
            return typeof result === "string"
                ? result
                : inspectValue(result, options, depth, seen, circular);
    }
    if (seen.includes(value)) {
        let index = circular.get(value);
        if (index === undefined) {
            index = circular.size + 1;
            circular.set(value, index);
        }
        return "[Circular *" + index + "]";
    }
    if (typeof value === "function") {
        const own = Object.keys(value);
        const label = functionLabel(value);
        if (!own.length) return label;
        if (depth > options.depth) return label;
        const entries = own.map(
            (k) =>
                key(k) +
                ": " +
                inspectValue(
                    value[k],
                    options,
                    depth + 1,
                    seen.concat([value]),
                    circular,
                ),
        );
        return formatEntries(
            refPrefix(value, circular) + label + " ",
            entries,
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
        return (
            "[" +
            tag(value) +
            ": " +
            formatPrimitive(value.valueOf(), options) +
            "]"
        );
    const inner = seen.concat([value]);
    const nested = (item) =>
        inspectValue(item, options, depth + 1, inner, circular);
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
        return formatEntries(
            refPrefix(value, circular),
            items,
            "[",
            "]",
            options,
        );
    }
    if (value instanceof Map) {
        if (depth > options.depth) return "[Map]";
        const items = [];
        for (const [k, v] of value) items.push(nested(k) + " => " + nested(v));
        return formatEntries(
            refPrefix(value, circular) + "Map(" + value.size + ") ",
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
            refPrefix(value, circular) + "Set(" + value.size + ") ",
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
            items.push(formatPrimitive(value[i], options));
        if (value.length > options.maxArrayLength)
            items.push(
                "... " +
                    (value.length - options.maxArrayLength) +
                    " more items",
            );
        return formatEntries(
            refPrefix(value, circular) + name + "(" + value.length + ") ",
            items,
            "[",
            "]",
            options,
        );
    }
    if (value instanceof Promise) {
        const promiseState = globalThis.__nonaPromiseState;
        const state =
            typeof promiseState === "function"
                ? promiseState(value)
                : undefined;
        if (state === undefined) return "Promise { <unknown> }";
        if (depth > options.depth) return "[Promise]";
        const text =
            state[0] === 0
                ? "<pending>"
                : state[0] === 1
                  ? nested(state[1])
                  : "<rejected> " + nested(state[1]);
        return formatEntries("Promise ", [text], "{", "}", options);
    }
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
    return formatEntries(
        refPrefix(value, circular) + prefix,
        items,
        "{",
        "}",
        options,
    );
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
    return inspectValue(value, settings, 0, [], new Map());
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
};
export default util;
