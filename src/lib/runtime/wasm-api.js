// The WebAssembly JS embedding. Private state is branded with WeakMaps; exposed
// functions strongly retain their instance, imports, memory and table owners.
(function () {
    var w = __nonaRegexpVm.wasm;
    w.modules = new WeakMap();
    w.instances = new WeakMap();
    w.memories = new WeakMap();
    w.tables = new WeakMap();
    w.globals = new WeakMap();
    w.functions = new WeakMap();
    w.buffers = new WeakSet();
    class CompileError extends Error {
        constructor(message) {
            super(message);
            this.name = "CompileError";
        }
    }
    class LinkError extends Error {
        constructor(message) {
            super(message);
            this.name = "LinkError";
        }
    }
    class RuntimeError extends Error {
        constructor(message) {
            super(message);
            this.name = "RuntimeError";
        }
    }
    w.CompileError = CompileError;
    w.LinkError = LinkError;
    w.RuntimeError = RuntimeError;
    function brand(map, obj, name) {
        var state = map.get(obj);
        if (!state)
            throw new TypeError("Invalid WebAssembly." + name + " receiver");
        return state;
    }
    function bytes(source) {
        var view;
        if (source instanceof ArrayBuffer) view = new Uint8Array(source);
        else if (ArrayBuffer.isView(source))
            view = new Uint8Array(
                source.buffer,
                source.byteOffset,
                source.byteLength,
            );
        else throw new TypeError("WebAssembly requires an ArrayBuffer or view");
        return new Uint8Array(view);
    }
    function index(value) {
        if (typeof value === "bigint")
            throw new TypeError("WebAssembly size requires Number");
        var n = +value;
        if (!Number.isFinite(n) || n < 0 || n > 4294967295)
            throw new TypeError("Invalid WebAssembly size");
        return Math.trunc(n) + 0;
    }
    function descriptor(d, memory) {
        if (d === null || typeof d !== "object")
            throw new TypeError("WebAssembly descriptor requires an object");
        var initial = d.initial;
        if (initial === undefined) initial = d.minimum;
        if (initial === undefined)
            throw new TypeError("WebAssembly descriptor requires initial");
        var min = index(initial),
            maximum = d.maximum,
            max =
                maximum === undefined
                    ? memory
                        ? 65536
                        : 4294967295
                    : index(maximum);
        if (max < min || (memory && max > 65536))
            throw new RangeError("Invalid WebAssembly limits");
        if (memory && d.shared)
            throw new TypeError("Shared WebAssembly memory is unsupported");
        if (d.address !== undefined && d.address !== "i32")
            throw new TypeError(
                "Only 32-bit WebAssembly addresses are supported",
            );
        return { min: min, max: max, hasMax: maximum !== undefined };
    }
    var typeNames = {
        i32: 127,
        i64: 126,
        f32: 125,
        f64: 124,
        externref: 111,
        anyfunc: 112,
    };
    function typeName(t) {
        return t === 127
            ? "i32"
            : t === 126
              ? "i64"
              : t === 125
                ? "f32"
                : t === 124
                  ? "f64"
                  : t === 112
                    ? "anyfunc"
                    : "externref";
    }
    class Memory {
        constructor(d) {
            var s = descriptor(d, true);
            s.buffer = new ArrayBuffer(s.min * 65536);
            s.view = new DataView(s.buffer);
            w.buffers.add(s.buffer);
            w.memories.set(this, s);
        }
        get buffer() {
            return brand(w.memories, this, "Memory").buffer;
        }
        grow(delta) {
            return w.growMemory(this, index(delta));
        }
    }
    w.growMemory = function (memory, delta) {
        var s = brand(w.memories, memory, "Memory"),
            old = s.buffer,
            previous = old.byteLength / 65536;
        if (delta > s.max - previous)
            throw new RangeError("WebAssembly.Memory.grow exceeds maximum");
        var next;
        try {
            next = new ArrayBuffer((previous + delta) * 65536);
            new Uint8Array(next).set(new Uint8Array(old));
        } catch (e) {
            throw new RangeError(
                "WebAssembly.Memory.grow could not allocate memory",
            );
        }
        var view = new DataView(next);
        w.buffers.add(next);
        __nonaRegexpVm.arrayBufferDetach(old);
        s.buffer = next;
        s.view = view;
        return previous;
    };
    class Table {
        constructor(d, value) {
            var s = descriptor(d, false),
                t = d.element;
            if (t !== "anyfunc" && t !== "externref")
                throw new TypeError("Invalid WebAssembly table element type");
            s.type = typeNames[t];
            value =
                arguments.length < 2
                    ? s.type === 112
                        ? null
                        : undefined
                    : value;
            value = w.convert(s.type, value);
            s.items = new Array(s.min).fill(value);
            w.tables.set(this, s);
        }
        get length() {
            return brand(w.tables, this, "Table").items.length;
        }
        get(i) {
            var s = brand(w.tables, this, "Table");
            i = index(i);
            if (i >= s.items.length)
                throw new RangeError(
                    "WebAssembly.Table.get index out of bounds",
                );
            return s.items[i];
        }
        set(i, value) {
            var s = brand(w.tables, this, "Table");
            i = index(i);
            value = w.convert(
                s.type,
                arguments.length < 2
                    ? s.type === 112
                        ? null
                        : undefined
                    : value,
            );
            if (i >= s.items.length)
                throw new RangeError(
                    "WebAssembly.Table.set index out of bounds",
                );
            s.items[i] = value;
        }
        grow(delta, value) {
            var s = brand(w.tables, this, "Table");
            delta = index(delta);
            value = w.convert(
                s.type,
                arguments.length < 2
                    ? s.type === 112
                        ? null
                        : undefined
                    : value,
            );
            return w.growTable(this, delta, value);
        }
    }
    w.growTable = function (table, delta, value) {
        var s = brand(w.tables, table, "Table"),
            old = s.items.length;
        if (delta > s.max - old)
            throw new RangeError("WebAssembly.Table.grow exceeds maximum");
        var next;
        try {
            next = s.items.concat(new Array(delta).fill(value));
        } catch (e) {
            throw new RangeError("WebAssembly.Table.grow allocation failed");
        }
        s.items = next;
        return old;
    };
    class Global {
        constructor(d, value) {
            if (d === null || typeof d !== "object")
                throw new TypeError("WebAssembly.Global requires descriptor");
            var t = typeNames[d.value];
            if (!t) throw new TypeError("Invalid WebAssembly global type");
            w.globals.set(this, {
                type: t,
                mutable: !!d.mutable,
                value:
                    arguments.length < 2
                        ? t === 111
                            ? undefined
                            : w.zero(t)
                        : w.convert(t, value),
            });
        }
        get value() {
            return brand(w.globals, this, "Global").value;
        }
        set value(v) {
            var s = brand(w.globals, this, "Global");
            if (!s.mutable)
                throw new TypeError("WebAssembly global is immutable");
            s.value = w.convert(s.type, v);
        }
        valueOf() {
            return brand(w.globals, this, "Global").value;
        }
    }
    class Module {
        constructor(source) {
            w.modules.set(this, w.decode(bytes(source)));
        }
        static imports(mod) {
            return brand(w.modules, mod, "Module").imports.map(function (e) {
                return {
                    module: e.module,
                    name: e.name,
                    kind: ["function", "table", "memory", "global"][e.kind],
                };
            });
        }
        static exports(mod) {
            return brand(w.modules, mod, "Module").exports.map(function (e) {
                return {
                    name: e.name,
                    kind: ["function", "table", "memory", "global"][e.kind],
                };
            });
        }
        static customSections(mod, name) {
            name = String(name);
            return brand(w.modules, mod, "Module")
                .custom.filter(function (e) {
                    return e.name === name;
                })
                .map(function (e) {
                    return new Uint8Array(e.bytes).buffer;
                });
        }
    }
    function linkFail(entry, message) {
        throw new LinkError(
            "WebAssembly import " +
                entry.module +
                "." +
                entry.name +
                ": " +
                message,
        );
    }
    function compatible(entry, actual, current) {
        var required = entry.desc;
        if (
            current < required.min ||
            (required.hasMax && (!actual.hasMax || actual.max > required.max))
        )
            linkFail(entry, "incompatible limits");
    }
    function func(state, index) {
        var sig = state.module.functions[index].sig;
        var f = (...values) => {
            var args = [];
            for (var j = 0; j < sig.params.length; j++)
                args.push(w.convert(sig.params[j], values[j]));
            var results = w.invoke(state, index, args);
            return sig.results.length === 0
                ? undefined
                : sig.results.length === 1
                  ? results[0]
                  : results;
        };
        Object.defineProperty(f, "length", {
            value: sig.params.length,
            configurable: true,
        });
        Object.defineProperty(f, "name", {
            value: String(index),
            configurable: true,
        });
        w.functions.set(f, { state: state, index: index, sig: sig });
        return f;
    }
    class Instance {
        constructor(mod, imports) {
            var m = brand(w.modules, mod, "Module");
            if (
                imports !== undefined &&
                (imports === null ||
                    (typeof imports !== "object" &&
                        typeof imports !== "function"))
            )
                throw new TypeError("WebAssembly imports requires object");
            if (m.imports.length && imports === undefined)
                throw new TypeError("WebAssembly module requires imports");
            var state = {
                module: m,
                functions: [],
                importFunctions: [],
                memories: [],
                tables: [],
                globals: [],
                globalObjects: [],
                data: [],
                elements: [],
            };
            for (var j = 0; j < m.imports.length; j++) {
                var entry = m.imports[j],
                    namespace = imports[entry.module];
                if (
                    namespace === null ||
                    (typeof namespace !== "object" &&
                        typeof namespace !== "function")
                )
                    throw new TypeError(
                        "WebAssembly import namespace " +
                            entry.module +
                            " must be an object",
                    );
                var value = namespace[entry.name],
                    desc = entry.desc,
                    actual;
                if (entry.kind === 0) {
                    if (typeof value !== "function")
                        linkFail(entry, "expected callable function");
                    actual = w.functions.get(value);
                    if (
                        actual &&
                        (!w.same(actual.sig.params, desc.sig.params) ||
                            !w.same(actual.sig.results, desc.sig.results))
                    )
                        linkFail(entry, "function signature mismatch");
                    state.importFunctions.push(value);
                    state.functions.push(actual ? value : null);
                } else if (entry.kind === 1) {
                    actual = w.tables.get(value);
                    if (!actual || actual.type !== desc.type)
                        linkFail(entry, "expected compatible Table");
                    compatible(entry, actual, actual.items.length);
                    state.tables.push(value);
                } else if (entry.kind === 2) {
                    actual = w.memories.get(value);
                    if (!actual) linkFail(entry, "expected Memory");
                    compatible(entry, actual, actual.buffer.byteLength / 65536);
                    state.memories.push(value);
                } else {
                    actual = w.globals.get(value);
                    if (actual) {
                        if (
                            actual.type !== desc.type ||
                            actual.mutable !== desc.mutable
                        )
                            linkFail(
                                entry,
                                "incompatible Global type or mutability",
                            );
                    } else {
                        if (desc.mutable)
                            linkFail(entry, "mutable global requires Global");
                        if (
                            (desc.type === 126 && typeof value !== "bigint") ||
                            (desc.type >= 124 &&
                                desc.type !== 126 &&
                                typeof value !== "number")
                        )
                            linkFail(entry, "global scalar type mismatch");
                        try {
                            value = new Global(
                                { value: typeName(desc.type) },
                                value,
                            );
                            actual = w.globals.get(value);
                        } catch (e) {
                            linkFail(entry, "invalid global value");
                        }
                    }
                    state.globals.push(actual);
                    state.globalObjects.push(value);
                }
            }
            for (var j = state.functions.length; j < m.functions.length; j++)
                state.functions.push(null);
            for (var j = 0; j < state.functions.length; j++)
                if (state.functions[j] === null)
                    state.functions[j] = func(state, j);
            for (var j = state.memories.length; j < m.memories.length; j++) {
                var d = m.memories[j];
                state.memories.push(
                    new Memory(
                        d.hasMax
                            ? { initial: d.min, maximum: d.max }
                            : { initial: d.min },
                    ),
                );
            }
            for (var j = state.tables.length; j < m.tables.length; j++) {
                var d = m.tables[j];
                state.tables.push(
                    new Table(
                        d.hasMax
                            ? {
                                  element: typeName(d.type),
                                  initial: d.min,
                                  maximum: d.max,
                              }
                            : { element: typeName(d.type), initial: d.min },
                    ),
                );
            }
            for (var j = state.globals.length; j < m.globals.length; j++) {
                var d = m.globals[j],
                    g = new Global(
                        { value: typeName(d.type), mutable: d.mutable },
                        w.constant(d.init, state),
                    );
                state.globalObjects.push(g);
                state.globals.push(w.globals.get(g));
            }
            for (var j = 0; j < m.elements.length; j++) {
                var el = m.elements[j],
                    items = el.items.map(function (expr) {
                        return w.constant(expr, state);
                    });
                if (el.active) {
                    var t = w.tables.get(state.tables[el.table]),
                        offset = w.constant(el.offset, state) >>> 0;
                    w.range(offset, items.length, t.items.length);
                    for (var k = 0; k < items.length; k++)
                        t.items[offset + k] = items[k];
                }
                state.elements.push(el.active || el.declarative ? [] : items);
            }
            for (var j = 0; j < m.data.length; j++) {
                var data = m.data[j];
                if (data.active) {
                    var mem = w.memories.get(state.memories[data.memory]),
                        offset = w.constant(data.offset, state) >>> 0;
                    w.range(offset, data.bytes.length, mem.buffer.byteLength);
                    new Uint8Array(mem.buffer).set(data.bytes, offset);
                }
                state.data.push(data.active ? new Uint8Array(0) : data.bytes);
            }
            var exports = Object.create(null),
                lists = [
                    state.functions,
                    state.tables,
                    state.memories,
                    state.globalObjects,
                ];
            for (var j = 0; j < m.exports.length; j++) {
                var e = m.exports[j];
                Object.defineProperty(exports, e.name, {
                    value: lists[e.kind][e.index],
                    enumerable: true,
                });
            }
            Object.preventExtensions(exports);
            state.exports = exports;
            w.instances.set(this, state);
            if (m.start !== null) w.invoke(state, m.start, []);
        }
        get exports() {
            return brand(w.instances, this, "Instance").exports;
        }
    }
    var api = {
        Module: Module,
        Instance: Instance,
        Memory: Memory,
        Table: Table,
        Global: Global,
        CompileError: CompileError,
        LinkError: LinkError,
        RuntimeError: RuntimeError,
        validate: function (source) {
            var b = bytes(source);
            try {
                w.decode(b);
                return true;
            } catch (e) {
                if (e instanceof CompileError) return false;
                throw e;
            }
        },
        compile: function (source) {
            return new Promise(function (resolve, reject) {
                try {
                    resolve(new Module(source));
                } catch (e) {
                    reject(e);
                }
            });
        },
        instantiate: function (source, imports) {
            return new Promise(function (resolve, reject) {
                try {
                    if (w.modules.has(source))
                        resolve(new Instance(source, imports));
                    else {
                        var mod = new Module(source);
                        resolve({
                            module: mod,
                            instance: new Instance(mod, imports),
                        });
                    }
                } catch (e) {
                    reject(e);
                }
            });
        },
    };
    Object.defineProperty(api, Symbol.toStringTag, {
        value: "WebAssembly",
        configurable: true,
    });
    for (var key of ["Module", "Instance", "Memory", "Table", "Global"])
        Object.defineProperty(api[key].prototype, Symbol.toStringTag, {
            value: "WebAssembly." + key,
            configurable: true,
        });
    Object.defineProperty(globalThis, "WebAssembly", {
        value: api,
        writable: true,
        configurable: true,
    });
})();
