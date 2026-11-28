// Interpreter frames are ordinary traced JavaScript objects. A callback can
// allocate, grow memory, throw, or reenter without retaining native raw pointers.
(function () {
    var w = __nonaRegexpVm.wasm;
    var apply = Reflect.apply,
        arrayFrom = Array.from,
        iteratorSymbol = Symbol.iterator;
    w.zero = function (t) {
        return t === 126 ? 0n : t === 112 || t === 111 ? null : 0;
    };
    w.convert = function (t, value) {
        if (t === 126) {
            return BigInt.asIntN(64, value);
        }
        if (t === 112) {
            if (value !== null && !w.functions.has(value))
                throw new TypeError(
                    "WebAssembly funcref requires a WASM function",
                );
            return value;
        }
        if (t === 111) return value;
        if (typeof value === "bigint")
            throw new TypeError("WebAssembly numeric argument requires Number");
        value = +value;
        return t === 127 ? value | 0 : t === 125 ? Math.fround(value) : value;
    };
    w.range = function (offset, length, size) {
        if (offset > size || length > size - offset)
            w.trap("WebAssembly memory or table access out of bounds");
    };
    w.constant = function (expr, state) {
        return expr.op === 35
            ? state.globals[expr.a].value
            : expr.op === 210
              ? state.functions[expr.a]
              : expr.a;
    };
    w.results = function (sig, result) {
        if (!sig.results.length) return [];
        if (sig.results.length === 1)
            return [w.convert(sig.results[0], result)];
        var method = result == null ? undefined : result[iteratorSymbol];
        if (typeof method !== "function")
            throw new TypeError(
                "WebAssembly multivalue callback requires iterable",
            );
        // Capture the iterator method once, as IterableToList does. Array.from
        // alone would also accept a noniterable array-like return value.
        var iterable = {};
        iterable[iteratorSymbol] = function () {
            return apply(method, result, []);
        };
        var values = arrayFrom(iterable);
        if (values.length !== sig.results.length)
            throw new TypeError("WebAssembly callback result count mismatch");
        for (var j = 0; j < values.length; j++)
            values[j] = w.convert(sig.results[j], values[j]);
        return values;
    };
    w.depth = 0;
    w.invoke = function (state, index, args) {
        if (w.depth >= 512) w.trap("WebAssembly call stack exhausted");
        w.depth++;
        try {
            return invoke(state, index, args);
        } finally {
            w.depth--;
        }
    };
    function invoke(state, index, args) {
        var fn = state.module.functions[index],
            sig = fn.sig;
        if (fn.imported) {
            var result = apply(state.importFunctions[index], undefined, args);
            return w.results(sig, result);
        }
        var code = fn.code;
        if (!code) {
            code = w.decodeFunction(state.module, fn);
            fn.code = code;
        }
        var locals = args.slice();
        for (var j = locals.length; j < fn.locals.length; j++)
            locals.push(w.zero(fn.locals[j]));
        var stack = [],
            controls = [
                {
                    height: 0,
                    arity: sig.results.length,
                    loop: false,
                    start: -1,
                    end: code.length - 1,
                },
            ],
            pc = 0;
        function pushValues(values) {
            for (var k = 0; k < values.length; k++) stack.push(values[k]);
        }
        function take(n) {
            return stack.splice(stack.length - n, n);
        }
        function branch(depth) {
            var target = controls.length - 1 - depth,
                frame = controls[target],
                values = take(frame.arity);
            stack.length = frame.height;
            pushValues(values);
            if (frame.loop) {
                controls.length = target + 1;
                pc = frame.start + 1;
            } else {
                controls.length = target;
                pc = frame.end + 1;
            }
        }
        while (pc < code.length && controls.length) {
            var ins = code[pc++],
                op = ins.op,
                a = ins.a,
                b = ins.b,
                x,
                y,
                z,
                mem,
                tab,
                values,
                frame;
            if (op === 0) w.trap("WebAssembly unreachable");
            else if (op === 1) {
            } else if (op >= 2 && op <= 4) {
                x = op === 4 ? stack.pop() : 1;
                controls.push({
                    height: stack.length - ins.sig.params.length,
                    arity:
                        op === 3
                            ? ins.sig.params.length
                            : ins.sig.results.length,
                    results: ins.sig.results.length,
                    loop: op === 3,
                    start: pc - 1,
                    end: ins.end,
                });
                if (!x)
                    pc =
                        ins.otherwise === undefined
                            ? ins.end
                            : ins.otherwise + 1;
            } else if (op === 5) pc = controls[controls.length - 1].end;
            else if (op === 11) {
                frame = controls.pop();
                values = take(
                    frame.results === undefined ? frame.arity : frame.results,
                );
                stack.length = frame.height;
                pushValues(values);
            } else if (op === 12) branch(a);
            else if (op === 13) {
                if (stack.pop()) branch(a);
            } else if (op === 14) {
                x = stack.pop() >>> 0;
                branch(x < ins.labels.length ? ins.labels[x] : a);
            } else if (op === 15) return take(sig.results.length);
            else if (op === 16 || op === 17) {
                var callSig, func;
                if (op === 16) {
                    callSig = state.module.functions[a].sig;
                    values = take(callSig.params.length);
                    pushValues(w.invoke(state, a, values));
                } else {
                    x = stack.pop() >>> 0;
                    tab = w.tables.get(state.tables[b]);
                    w.range(x, 1, tab.items.length);
                    func = tab.items[x];
                    if (func === null)
                        w.trap("WebAssembly indirect call to null");
                    var info = w.functions.get(func);
                    callSig = state.module.types[a];
                    if (
                        !info ||
                        !w.same(callSig.params, info.sig.params) ||
                        !w.same(callSig.results, info.sig.results)
                    )
                        w.trap("WebAssembly indirect call signature mismatch");
                    values = take(callSig.params.length);
                    pushValues(w.invoke(info.state, info.index, values));
                }
            } else if (op === 26) stack.pop();
            else if (op === 27 || op === 28) {
                z = stack.pop();
                y = stack.pop();
                x = stack.pop();
                stack.push(z ? x : y);
            } else if (op === 32) stack.push(locals[a]);
            else if (op === 33) locals[a] = stack.pop();
            else if (op === 34) locals[a] = stack[stack.length - 1];
            else if (op === 35) stack.push(state.globals[a].value);
            else if (op === 36) state.globals[a].value = stack.pop();
            else if (op === 37) {
                tab = w.tables.get(state.tables[a]);
                x = stack.pop() >>> 0;
                w.range(x, 1, tab.items.length);
                stack.push(tab.items[x]);
            } else if (op === 38) {
                tab = w.tables.get(state.tables[a]);
                y = stack.pop();
                x = stack.pop() >>> 0;
                w.range(x, 1, tab.items.length);
                tab.items[x] = y;
            } else if (op >= 40 && op <= 62) {
                mem = w.memories.get(state.memories[0]);
                if (op >= 54) y = stack.pop();
                x = (stack.pop() >>> 0) + b;
                var size =
                    op <= 53 ? w.loadSizes[op - 40] : w.storeSizes[op - 54];
                w.range(x, size, mem.buffer.byteLength);
                var d = mem.view;
                switch (op) {
                    case 40:
                        z = d.getInt32(x, true);
                        break;
                    case 41:
                        z = d.getBigInt64(x, true);
                        break;
                    case 42:
                        z = d.getFloat32(x, true);
                        break;
                    case 43:
                        z = d.getFloat64(x, true);
                        break;
                    case 44:
                        z = d.getInt8(x);
                        break;
                    case 45:
                        z = d.getUint8(x);
                        break;
                    case 46:
                        z = d.getInt16(x, true);
                        break;
                    case 47:
                        z = d.getUint16(x, true);
                        break;
                    case 48:
                        z = BigInt(d.getInt8(x));
                        break;
                    case 49:
                        z = BigInt(d.getUint8(x));
                        break;
                    case 50:
                        z = BigInt(d.getInt16(x, true));
                        break;
                    case 51:
                        z = BigInt(d.getUint16(x, true));
                        break;
                    case 52:
                        z = BigInt(d.getInt32(x, true));
                        break;
                    case 53:
                        z = BigInt(d.getUint32(x, true));
                        break;
                    case 54:
                        d.setInt32(x, y, true);
                        break;
                    case 55:
                        d.setBigInt64(x, y, true);
                        break;
                    case 56:
                        d.setFloat32(x, y, true);
                        break;
                    case 57:
                        d.setFloat64(x, y, true);
                        break;
                    case 58:
                        d.setInt8(x, y);
                        break;
                    case 59:
                        d.setInt16(x, y, true);
                        break;
                    case 60:
                        d.setInt8(x, Number(BigInt.asIntN(8, y)));
                        break;
                    case 61:
                        d.setInt16(x, Number(BigInt.asIntN(16, y)), true);
                        break;
                    case 62:
                        d.setInt32(x, Number(BigInt.asIntN(32, y)), true);
                        break;
                }
                if (op <= 53) stack.push(z);
            } else if (op === 63)
                stack.push(
                    w.memories.get(state.memories[a]).buffer.byteLength / 65536,
                );
            else if (op === 64) {
                x = stack.pop() >>> 0;
                try {
                    stack.push(w.growMemory(state.memories[a], x));
                } catch (e) {
                    if (!(e instanceof RangeError)) throw e;
                    stack.push(-1);
                }
            } else if (op >= 65 && op <= 68) stack.push(a);
            else if (op === 208) stack.push(null);
            else if (op === 209) stack.push(stack.pop() === null ? 1 : 0);
            else if (op === 210) stack.push(state.functions[a]);
            else if (op === 252) {
                if (a < 8) stack.push(w.saturate(a, stack.pop()));
                else if (a === 8 || a === 10 || a === 11) {
                    z = stack.pop() >>> 0;
                    y = stack.pop() >>> 0;
                    x = stack.pop() >>> 0;
                    mem = w.memories.get(state.memories[a === 8 ? ins.c : b]);
                    w.range(x, z, mem.buffer.byteLength);
                    var dest = new Uint8Array(mem.buffer);
                    if (a === 11) dest.fill(y & 255, x, x + z);
                    else {
                        var source =
                            a === 8
                                ? state.data[b]
                                : new Uint8Array(
                                      w.memories.get(state.memories[ins.c])
                                          .buffer,
                                  );
                        w.range(y, z, source.length);
                        if (a === 10 && source.buffer === dest.buffer)
                            dest.copyWithin(x, y, y + z);
                        else dest.set(source.subarray(y, y + z), x);
                    }
                } else if (a === 9) state.data[b] = new Uint8Array(0);
                else if (a === 12 || a === 14 || a === 17) {
                    z = stack.pop() >>> 0;
                    y = stack.pop();
                    x = stack.pop() >>> 0;
                    tab = w.tables.get(state.tables[a === 12 ? ins.c : b]);
                    w.range(x, z, tab.items.length);
                    if (a === 17) {
                        for (var k = 0; k < z; k++) tab.items[x + k] = y;
                    } else {
                        y = y >>> 0;
                        var items =
                            a === 12
                                ? state.elements[b]
                                : w.tables.get(state.tables[ins.c]).items;
                        w.range(y, z, items.length);
                        var copy = items.slice(y, y + z);
                        for (var k = 0; k < z; k++) tab.items[x + k] = copy[k];
                    }
                } else if (a === 13) state.elements[b] = [];
                else if (a === 15) {
                    z = stack.pop() >>> 0;
                    y = stack.pop();
                    try {
                        stack.push(w.growTable(state.tables[b], z, y));
                    } catch (e) {
                        if (!(e instanceof RangeError)) throw e;
                        stack.push(-1);
                    }
                } else if (a === 16)
                    stack.push(w.tables.get(state.tables[b]).items.length);
            } else {
                var ns = w.signature(op);
                if (ns.params.length === 2) {
                    y = stack.pop();
                    x = stack.pop();
                } else {
                    x = stack.pop();
                    y = undefined;
                }
                stack.push(w.numeric(op, x, y));
            }
        }
        return stack.slice(stack.length - sig.results.length);
    }
})();
