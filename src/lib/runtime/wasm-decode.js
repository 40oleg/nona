// Binary decoding and typed validation; no module bytes are ever executable JS.
(function () {
    var w = __nonaRegexpVm.wasm;
    function Reader(bytes) {
        this.bytes = bytes;
        this.pos = 0;
    }
    Reader.prototype.byte = function () {
        if (this.pos >= this.bytes.length)
            w.fail(
                "unexpected end of WebAssembly resource at byte " + this.pos,
            );
        return this.bytes[this.pos++];
    };
    Reader.prototype.take = function (n) {
        if (n > this.bytes.length - this.pos)
            w.fail("truncated WebAssembly resource at byte " + this.pos);
        var b = this.bytes.subarray(this.pos, this.pos + n);
        this.pos += n;
        return b;
    };
    Reader.prototype.uint = function () {
        var n = 0,
            scale = 1;
        for (var j = 0; j < 5; j++) {
            var b = this.byte();
            if (j === 4 && b & 0xf0) w.fail("invalid u32 LEB128");
            n += (b & 127) * scale;
            if (!(b & 128)) return n;
            scale *= 128;
        }
        w.fail("unterminated u32 LEB128");
    };
    Reader.prototype.sint = function (bits) {
        var n = 0n,
            shift = 0n,
            count = Math.ceil(bits / 7);
        for (var j = 0; j < count; j++) {
            var b = this.byte(),
                payload = b & 127;
            if (j === count - 1) {
                var used = bits - 7 * j,
                    mask = 127 ^ ((1 << used) - 1);
                if (
                    (payload & mask) !==
                    (payload & (1 << (used - 1)) ? mask : 0)
                )
                    w.fail("invalid signed LEB128");
            }
            n |= BigInt(payload) << shift;
            shift += 7n;
            if (!(b & 128)) {
                if (b & 64) n -= 1n << shift;
                return BigInt.asIntN(bits, n);
            }
        }
        w.fail("unterminated signed LEB128");
    };
    Reader.prototype.name = function () {
        var b = this.take(this.uint());
        try {
            return new TextDecoder("utf-8", {
                fatal: true,
                ignoreBOM: true,
            }).decode(b);
        } catch (e) {
            w.fail("invalid UTF-8 WebAssembly name");
        }
    };
    Reader.prototype.vector = function (read) {
        var n = this.uint(),
            a = [];
        if (n > this.bytes.length - this.pos) w.fail("invalid vector length");
        for (var j = 0; j < n; j++) a.push(read(this));
        return a;
    };
    function valueType(r) {
        var t = r.byte();
        if (
            t !== 127 &&
            t !== 126 &&
            t !== 125 &&
            t !== 124 &&
            t !== 112 &&
            t !== 111
        )
            w.fail("unsupported WebAssembly value type " + t);
        return t;
    }
    function refType(r) {
        var t = valueType(r);
        if (t !== 112 && t !== 111) w.fail("invalid reference type");
        return t;
    }
    function limits(r, memory) {
        var flag = r.byte();
        if (flag > 1) w.fail("shared or memory64 limits are unsupported");
        var min = r.uint(),
            max = flag ? r.uint() : memory ? 65536 : 4294967295;
        if (max < min || (memory && max > 65536))
            w.fail("invalid WebAssembly limits");
        return { min: min, max: max, hasMax: !!flag };
    }
    function tableType(r) {
        var t = refType(r),
            l = limits(r, false);
        l.type = t;
        return l;
    }
    function globalType(r) {
        var t = valueType(r),
            mut = r.byte();
        if (mut > 1) w.fail("invalid global mutability");
        return { type: t, mutable: !!mut };
    }
    function at(a, n, what) {
        if (n >= a.length) w.fail("invalid " + what + " index " + n);
        return a[n];
    }
    w.at = at;
    function constant(r, m, expected) {
        var op = r.byte(),
            a,
            t;
        if (op === 65) {
            t = 127;
            a = Number(r.sint(32));
        } else if (op === 66) {
            t = 126;
            a = r.sint(64);
        } else if (op === 67 || op === 68) {
            t = op === 67 ? 125 : 124;
            var b = r.take(op === 67 ? 4 : 8);
            var d = new DataView(b.buffer, b.byteOffset, b.byteLength);
            a = op === 67 ? d.getFloat32(0, true) : d.getFloat64(0, true);
        } else if (op === 35) {
            a = r.uint();
            var g = at(m.globals, a, "global");
            if (!g.imported || g.mutable)
                w.fail(
                    "constant expression requires immutable imported global",
                );
            t = g.type;
        } else if (op === 208) {
            t = refType(r);
            a = null;
        } else if (op === 210) {
            t = 112;
            a = r.uint();
            at(m.functions, a, "function");
            m.declared.add(a);
        } else w.fail("invalid constant expression opcode " + op);
        if (r.byte() !== 11 || t !== expected)
            w.fail("invalid constant expression type or end");
        return { op: op, a: a, type: t };
    }
    function blockType(r, m) {
        var b = r.bytes[r.pos];
        if (b === 64) {
            r.pos++;
            return { params: [], results: [] };
        }
        if (
            b === 127 ||
            b === 126 ||
            b === 125 ||
            b === 124 ||
            b === 112 ||
            b === 111
        ) {
            r.pos++;
            return { params: [], results: [b] };
        }
        var n = Number(r.sint(33));
        if (n < 0) w.fail("invalid block type");
        return at(m.types, n, "block type");
    }
    w.loadTypes = [
        127, 126, 125, 124, 127, 127, 127, 127, 126, 126, 126, 126, 126, 126,
    ];
    w.loadSizes = [4, 8, 4, 8, 1, 1, 2, 2, 1, 1, 2, 2, 4, 4];
    w.storeTypes = [127, 126, 125, 124, 127, 127, 126, 126, 126];
    w.storeSizes = [4, 8, 4, 8, 1, 2, 1, 2, 4];
    w.decodeFunction = function (m, fn) {
        var r = new Reader(fn.bytes),
            code = [],
            nesting = [];
        while (r.pos < r.bytes.length) {
            var op = r.byte(),
                ins = { op: op },
                index = code.length;
            if (op >= 2 && op <= 4) {
                ins.sig = blockType(r, m);
                nesting.push(index);
            } else if (op === 5) {
                if (
                    !nesting.length ||
                    code[nesting[nesting.length - 1]].op !== 4 ||
                    code[nesting[nesting.length - 1]].otherwise !== undefined
                )
                    w.fail("unexpected else");
                code[nesting[nesting.length - 1]].otherwise = index;
            } else if (op === 11) {
                if (nesting.length) {
                    var start = nesting.pop();
                    code[start].end = index;
                    ins.start = start;
                } else {
                    code.push(ins);
                    if (r.pos !== r.bytes.length)
                        w.fail("trailing function bytes");
                    return code;
                }
            } else if (
                (op >= 12 && op <= 13) ||
                op === 16 ||
                (op >= 32 && op <= 38) ||
                op === 210
            )
                ins.a = r.uint();
            else if (op === 14) {
                ins.labels = r.vector(function (rr) {
                    return rr.uint();
                });
                ins.a = r.uint();
            } else if (op === 17) {
                ins.a = r.uint();
                ins.b = r.uint();
            } else if (op === 28) {
                var ts = r.vector(valueType);
                if (ts.length !== 1) w.fail("invalid typed select");
                ins.a = ts[0];
            } else if (op >= 40 && op <= 62) {
                ins.a = r.uint();
                ins.b = r.uint();
                var size =
                    op <= 53 ? w.loadSizes[op - 40] : w.storeSizes[op - 54];
                if (ins.a > Math.log2(size)) w.fail("invalid memory alignment");
            } else if (op === 63 || op === 64) {
                ins.a = r.uint();
                if (ins.a !== 0) w.fail("multiple memories unsupported");
            } else if (op === 65) ins.a = Number(r.sint(32));
            else if (op === 66) ins.a = r.sint(64);
            else if (op === 67 || op === 68) {
                var b = r.take(op === 67 ? 4 : 8),
                    d = new DataView(b.buffer, b.byteOffset, b.byteLength);
                ins.a =
                    op === 67 ? d.getFloat32(0, true) : d.getFloat64(0, true);
            } else if (op === 208) ins.a = refType(r);
            else if (op === 252) {
                ins.a = r.uint();
                if (
                    ins.a === 8 ||
                    ins.a === 10 ||
                    ins.a === 12 ||
                    ins.a === 14
                ) {
                    ins.b = r.uint();
                    ins.c = r.uint();
                } else if (ins.a >= 9 && ins.a <= 17) ins.b = r.uint();
                else if (ins.a > 7) w.fail("unsupported bulk opcode " + ins.a);
            } else if (
                op !== 0 &&
                op !== 1 &&
                op !== 15 &&
                op !== 26 &&
                op !== 27 &&
                op !== 209 &&
                !w.signature(op)
            )
                w.fail("unsupported WebAssembly opcode " + op);
            code.push(ins);
        }
        w.fail("missing function end");
    };
    function same(a, b) {
        return (
            a.length === b.length &&
            a.every(function (t, i) {
                return t === b[i];
            })
        );
    }
    w.same = same;
    function validate(m, fn, code) {
        var stack = [],
            controls = [
                {
                    height: 0,
                    params: [],
                    results: fn.sig.results,
                    label: fn.sig.results,
                    dead: false,
                    op: -1,
                },
            ];
        function top() {
            return controls[controls.length - 1];
        }
        function pop(t) {
            var frame = top();
            if (stack.length === frame.height && frame.dead) return t || 0;
            if (stack.length <= frame.height)
                w.fail("WebAssembly operand stack underflow");
            var got = stack.pop();
            if (t && got && t !== got)
                w.fail("WebAssembly operand type mismatch");
            return got;
        }
        function pops(ts) {
            for (var i = ts.length - 1; i >= 0; i--) pop(ts[i]);
        }
        function pushes(ts) {
            for (var i = 0; i < ts.length; i++) stack.push(ts[i]);
        }
        function dead() {
            stack.length = top().height;
            top().dead = true;
        }
        function label(n) {
            if (n >= controls.length) w.fail("invalid branch depth");
            return controls[controls.length - 1 - n].label;
        }
        function memory(n) {
            at(m.memories, n, "memory");
        }
        for (var pc = 0; pc < code.length; pc++) {
            var ins = code[pc],
                op = ins.op,
                a = ins.a,
                t,
                sig,
                frame;
            if (op === 0) dead();
            else if (op === 1) {
            } else if (op >= 2 && op <= 4) {
                if (op === 4) pop(127);
                sig = ins.sig;
                pops(sig.params);
                frame = {
                    height: stack.length,
                    params: sig.params,
                    results: sig.results,
                    label: op === 3 ? sig.params : sig.results,
                    dead: false,
                    op: op,
                    otherwise: false,
                };
                controls.push(frame);
                pushes(sig.params);
            } else if (op === 5) {
                frame = top();
                pops(frame.results);
                if (stack.length !== frame.height) w.fail("invalid if stack");
                stack.length = frame.height;
                frame.dead = false;
                frame.otherwise = true;
                pushes(frame.params);
            } else if (op === 11) {
                frame = top();
                pops(frame.results);
                if (stack.length !== frame.height)
                    w.fail("invalid block stack height");
                if (
                    frame.op === 4 &&
                    !frame.otherwise &&
                    !same(frame.params, frame.results)
                )
                    w.fail("if without else has incompatible results");
                controls.pop();
                pushes(frame.results);
            } else if (op === 12 || op === 13) {
                if (op === 13) pop(127);
                t = label(a);
                pops(t);
                if (op === 13) pushes(t);
                else dead();
            } else if (op === 14) {
                pop(127);
                t = label(a);
                for (var j = 0; j < ins.labels.length; j++)
                    if (!same(t, label(ins.labels[j])))
                        w.fail("br_table label type mismatch");
                pops(t);
                dead();
            } else if (op === 15) {
                pops(fn.sig.results);
                dead();
            } else if (op === 16 || op === 17) {
                if (op === 16) sig = at(m.functions, a, "function").sig;
                else {
                    sig = at(m.types, a, "type");
                    if (at(m.tables, ins.b, "table").type !== 112)
                        w.fail("indirect call requires funcref table");
                    pop(127);
                }
                pops(sig.params);
                pushes(sig.results);
            } else if (op === 26) pop(0);
            else if (op === 27 || op === 28) {
                pop(127);
                t = pop(op === 28 ? a : 0);
                var other = pop(t);
                if (!t) t = other;
                if (
                    op === 27 &&
                    t &&
                    t !== 127 &&
                    t !== 126 &&
                    t !== 125 &&
                    t !== 124
                )
                    w.fail("untyped reference select");
                stack.push(t);
            } else if (op >= 32 && op <= 34) {
                t = at(fn.locals, a, "local");
                if (op !== 32) pop(t);
                if (op !== 33) stack.push(t);
            } else if (op === 35 || op === 36) {
                var g = at(m.globals, a, "global");
                if (op === 35) stack.push(g.type);
                else {
                    if (!g.mutable) w.fail("write to immutable global");
                    pop(g.type);
                }
            } else if (op === 37 || op === 38) {
                t = at(m.tables, a, "table").type;
                if (op === 38) pop(t);
                pop(127);
                if (op === 37) stack.push(t);
            } else if (op >= 40 && op <= 53) {
                memory(0);
                pop(127);
                stack.push(w.loadTypes[op - 40]);
            } else if (op >= 54 && op <= 62) {
                memory(0);
                pop(w.storeTypes[op - 54]);
                pop(127);
            } else if (op === 63 || op === 64) {
                memory(a);
                if (op === 64) pop(127);
                stack.push(127);
            } else if (op >= 65 && op <= 68) stack.push(127 - (op - 65));
            else if (op === 208) stack.push(a);
            else if (op === 209) {
                t = pop(0);
                if (t && t !== 112 && t !== 111)
                    w.fail("ref.is_null requires reference");
                stack.push(127);
            } else if (op === 210) {
                at(m.functions, a, "function");
                if (!m.declared.has(a)) w.fail("undeclared function reference");
                stack.push(112);
            } else if (op === 252) {
                if (a < 8) {
                    pop(a & 2 ? 124 : 125);
                    stack.push(a < 4 ? 127 : 126);
                } else if (a === 8) {
                    if (m.dataCount === null)
                        w.fail("memory.init requires data count");
                    at(m.data, ins.b, "data");
                    memory(ins.c);
                    pops([127, 127, 127]);
                } else if (a === 9) {
                    if (m.dataCount === null)
                        w.fail("data.drop requires data count");
                    at(m.data, ins.b, "data");
                } else if (a === 10) {
                    memory(ins.b);
                    memory(ins.c);
                    pops([127, 127, 127]);
                } else if (a === 11) {
                    memory(ins.b);
                    pops([127, 127, 127]);
                } else if (a === 12) {
                    var el = at(m.elements, ins.b, "element");
                    if (el.type !== at(m.tables, ins.c, "table").type)
                        w.fail("table.init type mismatch");
                    pops([127, 127, 127]);
                } else if (a === 13) at(m.elements, ins.b, "element");
                else if (a === 14) {
                    if (
                        at(m.tables, ins.b, "table").type !==
                        at(m.tables, ins.c, "table").type
                    )
                        w.fail("table.copy type mismatch");
                    pops([127, 127, 127]);
                } else if (a === 15) {
                    t = at(m.tables, ins.b, "table").type;
                    pops([t, 127]);
                    stack.push(127);
                } else if (a === 16) {
                    at(m.tables, ins.b, "table");
                    stack.push(127);
                } else if (a === 17) {
                    t = at(m.tables, ins.b, "table").type;
                    pops([127, t, 127]);
                }
            } else {
                sig = w.signature(op);
                pops(sig.params);
                pushes(sig.results);
            }
        }
        if (controls.length) w.fail("unterminated control block");
    }
    w.decode = function (bytes) {
        var r = new Reader(bytes);
        var magic = [0, 97, 115, 109, 1, 0, 0, 0];
        for (var h = 0; h < 8; h++)
            if (r.byte() !== magic[h])
                w.fail("invalid WebAssembly magic or version");
        var m = {
            bytes: bytes,
            types: [],
            imports: [],
            functions: [],
            tables: [],
            memories: [],
            globals: [],
            exports: [],
            custom: [],
            elements: [],
            data: [],
            start: null,
            dataCount: null,
            declared: new Set(),
        };
        var previous = 0,
            defined = [],
            bodies = 0;
        while (r.pos < bytes.length) {
            var id = r.byte(),
                payload = r.take(r.uint()),
                s = new Reader(payload),
                rank = id === 12 ? 9.5 : id === 10 ? 10 : id === 11 ? 11 : id;
            if (id > 12) w.fail("unknown WebAssembly section " + id);
            if (id !== 0) {
                if (rank <= previous)
                    w.fail("duplicate or out-of-order section");
                previous = rank;
            }
            if (id === 0) {
                var cn = s.name();
                m.custom.push({
                    name: cn,
                    bytes: s.take(s.bytes.length - s.pos),
                });
            } else if (id === 1)
                m.types = s.vector(function (rr) {
                    if (rr.byte() !== 96) w.fail("unsupported function type");
                    return {
                        params: rr.vector(valueType),
                        results: rr.vector(valueType),
                    };
                });
            else if (id === 2)
                m.imports = s.vector(function (rr) {
                    var entry = {
                            module: rr.name(),
                            name: rr.name(),
                            kind: rr.byte(),
                        },
                        d;
                    if (entry.kind === 0) {
                        d = {
                            sig: at(m.types, rr.uint(), "type"),
                            imported: true,
                        };
                        m.functions.push(d);
                    } else if (entry.kind === 1) {
                        d = tableType(rr);
                        d.imported = true;
                        m.tables.push(d);
                    } else if (entry.kind === 2) {
                        d = limits(rr, true);
                        d.imported = true;
                        m.memories.push(d);
                    } else if (entry.kind === 3) {
                        d = globalType(rr);
                        d.imported = true;
                        m.globals.push(d);
                    } else w.fail("unsupported import kind");
                    entry.desc = d;
                    return entry;
                });
            else if (id === 3)
                defined = s.vector(function (rr) {
                    var f = {
                        sig: at(m.types, rr.uint(), "type"),
                        imported: false,
                    };
                    m.functions.push(f);
                    return f;
                });
            else if (id === 4) {
                var ts = s.vector(tableType);
                for (var ti = 0; ti < ts.length; ti++) m.tables.push(ts[ti]);
            } else if (id === 5) {
                var ms = s.vector(function (rr) {
                    return limits(rr, true);
                });
                for (var mi = 0; mi < ms.length; mi++) m.memories.push(ms[mi]);
            } else if (id === 6) {
                var gs = s.uint();
                for (var gi = 0; gi < gs; gi++) {
                    var g = globalType(s);
                    g.init = constant(s, m, g.type);
                    m.globals.push(g);
                }
            } else if (id === 7) {
                var names = new Set();
                m.exports = s.vector(function (rr) {
                    var en = rr.name(),
                        kind = rr.byte(),
                        index = rr.uint();
                    if (names.has(en)) w.fail("duplicate export " + en);
                    names.add(en);
                    var lists = [m.functions, m.tables, m.memories, m.globals];
                    if (kind > 3) w.fail("invalid export kind");
                    at(lists[kind], index, "export");
                    if (kind === 0) m.declared.add(index);
                    return { name: en, kind: kind, index: index };
                });
            } else if (id === 8) {
                m.start = s.uint();
                var sf = at(m.functions, m.start, "start function");
                if (sf.sig.params.length || sf.sig.results.length)
                    w.fail("invalid start function type");
            } else if (id === 9)
                m.elements = s.vector(function (rr) {
                    var flag = rr.uint();
                    if (flag > 7) w.fail("invalid element segment flags");
                    var active = (flag & 1) === 0,
                        table = 0,
                        offset = null;
                    if (active) {
                        if (flag & 2) table = rr.uint();
                        offset = constant(rr, m, 127);
                    }
                    var t = 112,
                        expressions = !!(flag & 4);
                    if (flag !== 0 && flag !== 4) {
                        if (expressions) t = refType(rr);
                        else if (rr.byte() !== 0)
                            w.fail("invalid element kind");
                    }
                    var items = rr.vector(function (ir) {
                        if (expressions) return constant(ir, m, t);
                        var n = ir.uint();
                        at(m.functions, n, "element function");
                        m.declared.add(n);
                        return { op: 210, a: n, type: 112 };
                    });
                    if (
                        active &&
                        at(m.tables, table, "element table").type !== t
                    )
                        w.fail("element table type mismatch");
                    return {
                        active: active,
                        declarative: (flag & 3) === 3,
                        table: table,
                        offset: offset,
                        type: t,
                        items: items,
                    };
                });
            else if (id === 12) m.dataCount = s.uint();
            else if (id === 10) {
                bodies = s.uint();
                if (bodies !== defined.length)
                    w.fail("function/code count mismatch");
                for (var fi = 0; fi < bodies; fi++) {
                    var br = new Reader(s.take(s.uint())),
                        f = defined[fi],
                        locals = f.sig.params.slice(),
                        groups = br.uint();
                    for (var li = 0; li < groups; li++) {
                        var count = br.uint(),
                            lt = valueType(br);
                        if (count > 1000000 - locals.length)
                            w.fail("too many WebAssembly locals");
                        for (var l = 0; l < count; l++) locals.push(lt);
                    }
                    f.locals = locals;
                    f.bytes = br.take(br.bytes.length - br.pos);
                }
            } else if (id === 11)
                m.data = s.vector(function (rr) {
                    var flag = rr.uint();
                    if (flag > 2) w.fail("invalid data flags");
                    var mem = flag === 2 ? rr.uint() : 0,
                        offset = null;
                    if (flag !== 1) {
                        at(m.memories, mem, "data memory");
                        offset = constant(rr, m, 127);
                    }
                    var b = rr.take(rr.uint());
                    return {
                        active: flag !== 1,
                        memory: mem,
                        offset: offset,
                        bytes: b,
                    };
                });
            if (s.pos !== s.bytes.length) w.fail("trailing section bytes");
        }
        if (m.memories.length > 1) w.fail("multiple memories unsupported");
        if (bodies !== defined.length) w.fail("missing code section");
        if (m.dataCount !== null && m.dataCount !== m.data.length)
            w.fail("data count mismatch");
        for (var j = 0; j < defined.length; j++)
            validate(m, defined[j], w.decodeFunction(m, defined[j]));
        return m;
    };
})();
