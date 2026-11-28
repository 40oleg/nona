// Original scalar WebAssembly operations. All i64 intermediates stay BigInts.
(function () {
    var w = {};
    __nonaRegexpVm.wasm = w;
    var scratch = new DataView(new ArrayBuffer(16));
    w.signed = function (n) {
        return BigInt.asIntN(64, n);
    };
    w.unsigned = function (n) {
        return BigInt.asUintN(64, n);
    };
    w.trap = function (message) {
        throw new w.RuntimeError(message);
    };
    w.fail = function (message) {
        throw new w.CompileError(message);
    };
    // Validation and execution only read these signatures. Rebuilding their
    // arrays for every arithmetic instruction makes real workloads allocate
    // billions of short-lived objects (notably PostgreSQL initialization).
    // Own, dense byte-indexed slots also avoid inherited numeric properties.
    var signatures = new Array(256).fill(null);
    w.signature = function (op) {
        if (signatures[op]) return signatures[op];
        var t,
            n = 1,
            r;
        if (op >= 0x45 && op <= 0x4f) {
            t = 127;
            r = 127;
            n = op === 0x45 ? 1 : 2;
        } else if (op >= 0x50 && op <= 0x5a) {
            t = 126;
            r = 127;
            n = op === 0x50 ? 1 : 2;
        } else if (op >= 0x5b && op <= 0x60) {
            t = 125;
            r = 127;
            n = 2;
        } else if (op >= 0x61 && op <= 0x66) {
            t = 124;
            r = 127;
            n = 2;
        } else if (op >= 0x67 && op <= 0x78) {
            t = r = 127;
            n = op <= 0x69 ? 1 : 2;
        } else if (op >= 0x79 && op <= 0x8a) {
            t = r = 126;
            n = op <= 0x7b ? 1 : 2;
        } else if (op >= 0x8b && op <= 0x98) {
            t = r = 125;
            n = op <= 0x91 ? 1 : 2;
        } else if (op >= 0x99 && op <= 0xa6) {
            t = r = 124;
            n = op <= 0x9f ? 1 : 2;
        } else {
            var from = [
                126, 125, 125, 124, 124, 127, 127, 125, 125, 124, 124, 127, 127,
                126, 126, 124, 127, 127, 126, 126, 125, 125, 124, 127, 126, 127,
                127, 126, 126, 126,
            ];
            var to = [
                127, 127, 127, 127, 127, 126, 126, 126, 126, 126, 126, 125, 125,
                125, 125, 125, 124, 124, 124, 124, 124, 127, 126, 125, 124, 127,
                127, 126, 126, 126,
            ];
            if (op < 0xa7 || op > 0xc4) return null;
            t = from[op - 0xa7];
            r = to[op - 0xa7];
        }
        return (signatures[op] = { params: n === 1 ? [t] : [t, t], results: [r] });
    };
    function nearest(x) {
        if (!Number.isFinite(x) || x === 0) return x;
        var a = Math.floor(x),
            d = x - a;
        var r = d < 0.5 ? a : d > 0.5 ? a + 1 : a % 2 === 0 ? a : a + 1;
        return r === 0 && x < 0 ? -0 : r;
    }
    function count(x, bits, kind) {
        var n = 0;
        x = bits === 64 ? w.unsigned(x) : BigInt(x >>> 0);
        if (kind === 0) {
            if (x === 0n) return bits;
            while (x) {
                n++;
                x >>= 1n;
            }
            return bits - n;
        }
        if (kind === 1) {
            if (x === 0n) return bits;
            while (!(x & 1n)) {
                n++;
                x >>= 1n;
            }
            return n;
        }
        while (x) {
            n += Number(x & 1n);
            x >>= 1n;
        }
        return n;
    }
    function trunc(x, bits, signed, saturate) {
        var low = signed ? -Math.pow(2, bits - 1) : 0;
        var high = Math.pow(2, signed ? bits - 1 : bits);
        x = Math.trunc(x);
        if (x !== x) {
            if (!saturate) w.trap("invalid conversion to integer");
            x = 0;
        }
        if (x < low || x >= high) {
            if (!saturate) w.trap("integer overflow");
            if (bits === 64)
                return x < low
                    ? signed
                        ? -9223372036854775808n
                        : 0n
                    : signed
                      ? 9223372036854775807n
                      : -1n;
            x = x < low ? low : high - 1;
        }
        return bits === 64 ? w.signed(BigInt(x)) : x | 0;
    }
    w.saturate = function (op, x) {
        return trunc(x, op < 4 ? 32 : 64, (op & 1) === 0, true);
    };
    function i64float(x, unsigned, single) {
        x = unsigned ? w.unsigned(x) : x;
        // Round directly to 24 significant bits, avoiding i64 -> f64 -> f32
        // double rounding for values just beyond a single-precision midpoint.
        if (!single) return Number(x);
        var negative = x < 0n;
        if (negative) x = -x;
        var bits = 64 - count(x, 64, 0),
            shift = bits - 24;
        if (shift > 0) {
            var s = BigInt(shift),
                top = x >> s,
                rest = x - (top << s),
                half = 1n << (s - 1n);
            if (rest > half || (rest === half && top & 1n)) top++;
            var v = Number(top) * Math.pow(2, shift);
            return negative ? -v : v;
        }
        return Number(negative ? -x : x);
    }
    w.numeric = function (op, a, b) {
        var k, unsigned, bits, shift, u, v, r;
        if (op >= 0x45 && op <= 0x66) {
            if (op === 0x45) return a === 0 ? 1 : 0;
            if (op === 0x50) return a === 0n ? 1 : 0;
            if (op <= 0x5a) {
                bits = op < 0x50 ? 32 : 64;
                k = op - (bits === 32 ? 0x46 : 0x51);
                if (k >= 2 && k & 1) {
                    a = bits === 32 ? a >>> 0 : w.unsigned(a);
                    b = bits === 32 ? b >>> 0 : w.unsigned(b);
                }
                r =
                    k === 0
                        ? a === b
                        : k === 1
                          ? a !== b
                          : k <= 3
                            ? a < b
                            : k <= 5
                              ? a > b
                              : k <= 7
                                ? a <= b
                                : a >= b;
            } else {
                k = op - (op <= 0x60 ? 0x5b : 0x61);
                r =
                    k === 0
                        ? a === b
                        : k === 1
                          ? a !== b
                          : k === 2
                            ? a < b
                            : k === 3
                              ? a > b
                              : k === 4
                                ? a <= b
                                : a >= b;
            }
            return r ? 1 : 0;
        }
        if (op >= 0x67 && op <= 0x8a) {
            bits = op < 0x79 ? 32 : 64;
            k = op - (bits === 32 ? 0x67 : 0x79);
            if (k < 3) {
                r = count(a, bits, k);
                return bits === 32 ? r : BigInt(r);
            }
            unsigned = k === 7 || k === 9 || k === 14;
            u = unsigned ? (bits === 32 ? a >>> 0 : w.unsigned(a)) : a;
            v = unsigned ? (bits === 32 ? b >>> 0 : w.unsigned(b)) : b;
            if (k === 3) r = a + b;
            else if (k === 4) r = a - b;
            else if (k === 5) r = bits === 32 ? Math.imul(a, b) : a * b;
            else if (k <= 9) {
                if (b === 0 || b === 0n) w.trap("integer divide by zero");
                if (
                    k === 6 &&
                    a === (bits === 32 ? -2147483648 : -9223372036854775808n) &&
                    b === (bits === 32 ? -1 : -1n)
                )
                    w.trap("integer overflow");
                r = k <= 7 ? (bits === 32 ? Math.trunc(u / v) : u / v) : u % v;
            } else if (k === 10) r = a & b;
            else if (k === 11) r = a | b;
            else if (k === 12) r = a ^ b;
            else if (bits === 32) {
                shift = b & 31;
                r =
                    k === 13
                        ? a << shift
                        : k === 14
                          ? a >> shift
                          : k === 15
                            ? a >>> shift
                            : k === 16
                              ? (a << shift) | (a >>> ((32 - shift) & 31))
                              : (a >>> shift) | (a << ((32 - shift) & 31));
            } else {
                shift = b & 63n;
                r =
                    k === 13
                        ? a << shift
                        : k === 14
                          ? a >> shift
                          : k === 15
                            ? w.unsigned(a) >> shift
                            : k === 16
                              ? (a << shift) |
                                (w.unsigned(a) >> ((64n - shift) & 63n))
                              : (w.unsigned(a) >> shift) |
                                (a << ((64n - shift) & 63n));
            }
            return bits === 32 ? r | 0 : w.signed(r);
        }
        if (op >= 0x8b && op <= 0xa6) {
            var single = op <= 0x98;
            k = op - (single ? 0x8b : 0x99);
            if (k === 0) r = Math.abs(a);
            else if (k === 1) r = -a;
            else if (k === 2) r = Math.ceil(a);
            else if (k === 3) r = Math.floor(a);
            else if (k === 4) r = Math.trunc(a);
            else if (k === 5) r = nearest(a);
            else if (k === 6) r = Math.sqrt(a);
            else if (k === 7) r = a + b;
            else if (k === 8) r = a - b;
            else if (k === 9) r = a * b;
            else if (k === 10) r = a / b;
            else if (k === 11) r = Math.min(a, b);
            else if (k === 12) r = Math.max(a, b);
            else {
                scratch.setFloat64(0, a, true);
                scratch.setFloat64(8, b, true);
                scratch.setUint32(
                    4,
                    (scratch.getUint32(4, true) & 0x7fffffff) |
                        (scratch.getUint32(12, true) & 0x80000000),
                    true,
                );
                r = scratch.getFloat64(0, true);
            }
            return single ? Math.fround(r) : r;
        }
        switch (op) {
            case 0xa7:
                return Number(BigInt.asIntN(32, a));
            case 0xa8:
            case 0xaa:
                return trunc(a, 32, true, false);
            case 0xa9:
            case 0xab:
                return trunc(a, 32, false, false);
            case 0xac:
                return BigInt(a);
            case 0xad:
                return BigInt(a >>> 0);
            case 0xae:
            case 0xb0:
                return trunc(a, 64, true, false);
            case 0xaf:
            case 0xb1:
                return trunc(a, 64, false, false);
            case 0xb2:
                return Math.fround(a);
            case 0xb3:
                return Math.fround(a >>> 0);
            case 0xb4:
                return i64float(a, false, true);
            case 0xb5:
                return i64float(a, true, true);
            case 0xb6:
                return Math.fround(a);
            case 0xb7:
                return a;
            case 0xb8:
                return a >>> 0;
            case 0xb9:
                return i64float(a, false, false);
            case 0xba:
                return i64float(a, true, false);
            case 0xbb:
                return a;
            case 0xbc:
                scratch.setFloat32(0, a, true);
                return scratch.getInt32(0, true);
            case 0xbd:
                scratch.setFloat64(0, a, true);
                return scratch.getBigInt64(0, true);
            case 0xbe:
                scratch.setInt32(0, a, true);
                return scratch.getFloat32(0, true);
            case 0xbf:
                scratch.setBigInt64(0, a, true);
                return scratch.getFloat64(0, true);
            case 0xc0:
                return (a << 24) >> 24;
            case 0xc1:
                return (a << 16) >> 16;
            case 0xc2:
                return BigInt.asIntN(8, a);
            case 0xc3:
                return BigInt.asIntN(16, a);
            case 0xc4:
                return BigInt.asIntN(32, a);
        }
        w.trap("unsupported numeric opcode");
    };
})();
