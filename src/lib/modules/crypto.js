// node:crypto, the part npm packages use most (issue #249): OS random bytes,
// random UUIDs and integers, the MD5/SHA-1/SHA-256/SHA-512 hashes and HMAC,
// and timingSafeEqual. Ciphers, key pairs, signatures and the subtle API
// are not provided. The module that includes this text defines
// randomBytes(size) on top of the OS entropy source (entropySource).
const nativeRandomBytes = randomBytes;
const encoder = new TextEncoder();

function toBytes(value, encoding, name) {
    if (typeof value === "string")
        return encoding && encoding !== "utf8" && encoding !== "utf-8"
            ? new Uint8Array(Buffer.from(value, encoding))
            : encoder.encode(value);
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value))
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    const error = new TypeError(
        'The "' +
            name +
            '" argument must be of type string or an instance of Buffer, TypedArray, or DataView.',
    );
    error.code = "ERR_INVALID_ARG_TYPE";
    throw error;
}
function concat(chunks, length) {
    const out = new Uint8Array(length);
    let at = 0;
    for (const chunk of chunks) {
        out.set(chunk, at);
        at += chunk.length;
    }
    return out;
}
function pad(input, littleEndian, block) {
    const lengthBytes = block === 128 ? 16 : 8;
    const total = Math.ceil((input.length + 1 + lengthBytes) / block) * block;
    const out = new Uint8Array(total);
    out.set(input);
    out[input.length] = 0x80;
    const bits = input.length * 8,
        low = bits >>> 0,
        high = Math.floor(bits / 0x100000000) >>> 0;
    const view = new DataView(out.buffer);
    if (littleEndian) {
        view.setUint32(total - 8, low, true);
        view.setUint32(total - 4, high, true);
    } else {
        view.setUint32(total - 8, high);
        view.setUint32(total - 4, low);
    }
    return out;
}

const md5Shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
    9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
    16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10,
    15, 21,
];
const md5Table = [];
for (let i = 0; i < 64; i++)
    md5Table.push(Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0);
function md5(input) {
    const data = pad(input, true, 64),
        view = new DataView(data.buffer);
    let a0 = 0x67452301,
        b0 = 0xefcdab89,
        c0 = 0x98badcfe,
        d0 = 0x10325476;
    const m = new Array(16);
    for (let offset = 0; offset < data.length; offset += 64) {
        for (let i = 0; i < 16; i++)
            m[i] = view.getUint32(offset + i * 4, true);
        let a = a0,
            b = b0,
            c = c0,
            d = d0;
        for (let i = 0; i < 64; i++) {
            let f, g;
            if (i < 16) {
                f = (b & c) | (~b & d);
                g = i;
            } else if (i < 32) {
                f = (d & b) | (~d & c);
                g = (5 * i + 1) % 16;
            } else if (i < 48) {
                f = b ^ c ^ d;
                g = (3 * i + 5) % 16;
            } else {
                f = c ^ (b | ~d);
                g = (7 * i) % 16;
            }
            const sum = (a + f + md5Table[i] + m[g]) | 0,
                s = md5Shifts[i];
            a = d;
            d = c;
            c = b;
            b = (b + ((sum << s) | (sum >>> (32 - s)))) | 0;
        }
        a0 = (a0 + a) | 0;
        b0 = (b0 + b) | 0;
        c0 = (c0 + c) | 0;
        d0 = (d0 + d) | 0;
    }
    const out = new Uint8Array(16),
        outView = new DataView(out.buffer);
    outView.setUint32(0, a0, true);
    outView.setUint32(4, b0, true);
    outView.setUint32(8, c0, true);
    outView.setUint32(12, d0, true);
    return out;
}
function sha1(input) {
    const data = pad(input, false, 64),
        view = new DataView(data.buffer);
    let h0 = 0x67452301,
        h1 = 0xefcdab89,
        h2 = 0x98badcfe,
        h3 = 0x10325476,
        h4 = 0xc3d2e1f0;
    const w = new Int32Array(80);
    for (let offset = 0; offset < data.length; offset += 64) {
        for (let i = 0; i < 16; i++) w[i] = view.getInt32(offset + i * 4);
        for (let i = 16; i < 80; i++) {
            const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
            w[i] = (x << 1) | (x >>> 31);
        }
        let a = h0,
            b = h1,
            c = h2,
            d = h3,
            e = h4;
        for (let i = 0; i < 80; i++) {
            const f =
                i < 20
                    ? (b & c) | (~b & d)
                    : i < 40
                      ? b ^ c ^ d
                      : i < 60
                        ? (b & c) | (b & d) | (c & d)
                        : b ^ c ^ d;
            const k =
                i < 20
                    ? 0x5a827999
                    : i < 40
                      ? 0x6ed9eba1
                      : i < 60
                        ? 0x8f1bbcdc
                        : 0xca62c1d6;
            const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) | 0;
            e = d;
            d = c;
            c = (b << 30) | (b >>> 2);
            b = a;
            a = t;
        }
        h0 = (h0 + a) | 0;
        h1 = (h1 + b) | 0;
        h2 = (h2 + c) | 0;
        h3 = (h3 + d) | 0;
        h4 = (h4 + e) | 0;
    }
    const out = new Uint8Array(20),
        outView = new DataView(out.buffer);
    [h0, h1, h2, h3, h4].forEach((h, i) => outView.setInt32(i * 4, h));
    return out;
}
const sha256K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
function sha256(input) {
    const data = pad(input, false, 64),
        view = new DataView(data.buffer);
    const h = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
        0x1f83d9ab, 0x5be0cd19,
    ];
    const w = new Int32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let offset = 0; offset < data.length; offset += 64) {
        for (let i = 0; i < 16; i++) w[i] = view.getInt32(offset + i * 4);
        for (let i = 16; i < 64; i++) {
            const s0 =
                    rotr(w[i - 15], 7) ^
                    rotr(w[i - 15], 18) ^
                    (w[i - 15] >>> 3),
                s1 =
                    rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }
        let [a, b, c, d, e, f, g, hh] = h;
        for (let i = 0; i < 64; i++) {
            const t1 =
                (hh +
                    (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) +
                    ((e & f) ^ (~e & g)) +
                    sha256K[i] +
                    w[i]) |
                0;
            const t2 =
                ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) +
                    ((a & b) ^ (a & c) ^ (b & c))) |
                0;
            hh = g;
            g = f;
            f = e;
            e = (d + t1) | 0;
            d = c;
            c = b;
            b = a;
            a = (t1 + t2) | 0;
        }
        h[0] = (h[0] + a) | 0;
        h[1] = (h[1] + b) | 0;
        h[2] = (h[2] + c) | 0;
        h[3] = (h[3] + d) | 0;
        h[4] = (h[4] + e) | 0;
        h[5] = (h[5] + f) | 0;
        h[6] = (h[6] + g) | 0;
        h[7] = (h[7] + hh) | 0;
    }
    const out = new Uint8Array(32),
        outView = new DataView(out.buffer);
    h.forEach((value, i) => outView.setInt32(i * 4, value));
    return out;
}
// SHA-512 on pairs of 32-bit halves (hi, lo).
const sha512K = [
    0x428a2f98, 0xd728ae22, 0x71374491, 0x23ef65cd, 0xb5c0fbcf, 0xec4d3b2f,
    0xe9b5dba5, 0x8189dbbc, 0x3956c25b, 0xf348b538, 0x59f111f1, 0xb605d019,
    0x923f82a4, 0xaf194f9b, 0xab1c5ed5, 0xda6d8118, 0xd807aa98, 0xa3030242,
    0x12835b01, 0x45706fbe, 0x243185be, 0x4ee4b28c, 0x550c7dc3, 0xd5ffb4e2,
    0x72be5d74, 0xf27b896f, 0x80deb1fe, 0x3b1696b1, 0x9bdc06a7, 0x25c71235,
    0xc19bf174, 0xcf692694, 0xe49b69c1, 0x9ef14ad2, 0xefbe4786, 0x384f25e3,
    0x0fc19dc6, 0x8b8cd5b5, 0x240ca1cc, 0x77ac9c65, 0x2de92c6f, 0x592b0275,
    0x4a7484aa, 0x6ea6e483, 0x5cb0a9dc, 0xbd41fbd4, 0x76f988da, 0x831153b5,
    0x983e5152, 0xee66dfab, 0xa831c66d, 0x2db43210, 0xb00327c8, 0x98fb213f,
    0xbf597fc7, 0xbeef0ee4, 0xc6e00bf3, 0x3da88fc2, 0xd5a79147, 0x930aa725,
    0x06ca6351, 0xe003826f, 0x14292967, 0x0a0e6e70, 0x27b70a85, 0x46d22ffc,
    0x2e1b2138, 0x5c26c926, 0x4d2c6dfc, 0x5ac42aed, 0x53380d13, 0x9d95b3df,
    0x650a7354, 0x8baf63de, 0x766a0abb, 0x3c77b2a8, 0x81c2c92e, 0x47edaee6,
    0x92722c85, 0x1482353b, 0xa2bfe8a1, 0x4cf10364, 0xa81a664b, 0xbc423001,
    0xc24b8b70, 0xd0f89791, 0xc76c51a3, 0x0654be30, 0xd192e819, 0xd6ef5218,
    0xd6990624, 0x5565a910, 0xf40e3585, 0x5771202a, 0x106aa070, 0x32bbd1b8,
    0x19a4c116, 0xb8d2d0c8, 0x1e376c08, 0x5141ab53, 0x2748774c, 0xdf8eeb99,
    0x34b0bcb5, 0xe19b48a8, 0x391c0cb3, 0xc5c95a63, 0x4ed8aa4a, 0xe3418acb,
    0x5b9cca4f, 0x7763e373, 0x682e6ff3, 0xd6b2b8a3, 0x748f82ee, 0x5defb2fc,
    0x78a5636f, 0x43172f60, 0x84c87814, 0xa1f0ab72, 0x8cc70208, 0x1a6439ec,
    0x90befffa, 0x23631e28, 0xa4506ceb, 0xde82bde9, 0xbef9a3f7, 0xb2c67915,
    0xc67178f2, 0xe372532b, 0xca273ece, 0xea26619c, 0xd186b8c7, 0x21c0c207,
    0xeada7dd6, 0xcde0eb1e, 0xf57d4f7f, 0xee6ed178, 0x06f067aa, 0x72176fba,
    0x0a637dc5, 0xa2c898a6, 0x113f9804, 0xbef90dae, 0x1b710b35, 0x131c471b,
    0x28db77f5, 0x23047d84, 0x32caab7b, 0x40c72493, 0x3c9ebe0a, 0x15c9bebc,
    0x431d67c4, 0x9c100d4c, 0x4cc5d4be, 0xcb3e42b6, 0x597f299c, 0xfc657e2a,
    0x5fcb6fab, 0x3ad6faec, 0x6c44198c, 0x4a475817,
];
function sha512Like(input, initial, outputLength) {
    const data = pad(input, false, 128),
        view = new DataView(data.buffer);
    const h = initial.slice();
    const w = new Int32Array(160);
    // 64-bit helpers on (hi, lo) pairs; results through the temporaries rh/rl.
    let rh = 0,
        rl = 0;
    function add(ah, al, bh, bl) {
        const l = (al >>> 0) + (bl >>> 0);
        rh = (ah + bh + Math.floor(l / 0x100000000)) | 0;
        rl = l | 0;
    }
    function rotrH(h, l, n) {
        return n < 32
            ? (h >>> n) | (l << (32 - n))
            : (l >>> (n - 32)) | (h << (64 - n));
    }
    function rotrL(h, l, n) {
        return n < 32
            ? (l >>> n) | (h << (32 - n))
            : (h >>> (n - 32)) | (l << (64 - n));
    }
    for (let offset = 0; offset < data.length; offset += 128) {
        for (let i = 0; i < 32; i++) w[i] = view.getInt32(offset + i * 4);
        for (let i = 16; i < 80; i++) {
            const xh = w[(i - 15) * 2],
                xl = w[(i - 15) * 2 + 1],
                yh = w[(i - 2) * 2],
                yl = w[(i - 2) * 2 + 1];
            const s0h = rotrH(xh, xl, 1) ^ rotrH(xh, xl, 8) ^ (xh >>> 7),
                s0l =
                    rotrL(xh, xl, 1) ^
                    rotrL(xh, xl, 8) ^
                    ((xl >>> 7) | (xh << 25));
            const s1h = rotrH(yh, yl, 19) ^ rotrH(yh, yl, 61) ^ (yh >>> 6),
                s1l =
                    rotrL(yh, yl, 19) ^
                    rotrL(yh, yl, 61) ^
                    ((yl >>> 6) | (yh << 26));
            add(w[(i - 16) * 2], w[(i - 16) * 2 + 1], s0h, s0l);
            add(rh, rl, w[(i - 7) * 2], w[(i - 7) * 2 + 1]);
            add(rh, rl, s1h, s1l);
            w[i * 2] = rh;
            w[i * 2 + 1] = rl;
        }
        let ah = h[0],
            al = h[1],
            bh = h[2],
            bl = h[3],
            ch = h[4],
            cl = h[5],
            dh = h[6],
            dl = h[7],
            eh = h[8],
            el = h[9],
            fh = h[10],
            fl = h[11],
            gh = h[12],
            gl = h[13],
            hh = h[14],
            hl = h[15];
        for (let i = 0; i < 80; i++) {
            const S1h =
                    rotrH(eh, el, 14) ^ rotrH(eh, el, 18) ^ rotrH(eh, el, 41),
                S1l = rotrL(eh, el, 14) ^ rotrL(eh, el, 18) ^ rotrL(eh, el, 41);
            const chh = (eh & fh) ^ (~eh & gh),
                chl = (el & fl) ^ (~el & gl);
            add(hh, hl, S1h, S1l);
            add(rh, rl, chh, chl);
            add(rh, rl, sha512K[i * 2], sha512K[i * 2 + 1]);
            add(rh, rl, w[i * 2], w[i * 2 + 1]);
            const t1h = rh,
                t1l = rl;
            const S0h =
                    rotrH(ah, al, 28) ^ rotrH(ah, al, 34) ^ rotrH(ah, al, 39),
                S0l = rotrL(ah, al, 28) ^ rotrL(ah, al, 34) ^ rotrL(ah, al, 39);
            const majh = (ah & bh) ^ (ah & ch) ^ (bh & ch),
                majl = (al & bl) ^ (al & cl) ^ (bl & cl);
            add(S0h, S0l, majh, majl);
            const t2h = rh,
                t2l = rl;
            hh = gh;
            hl = gl;
            gh = fh;
            gl = fl;
            fh = eh;
            fl = el;
            add(dh, dl, t1h, t1l);
            eh = rh;
            el = rl;
            dh = ch;
            dl = cl;
            ch = bh;
            cl = bl;
            bh = ah;
            bl = al;
            add(t1h, t1l, t2h, t2l);
            ah = rh;
            al = rl;
        }
        const v = [
            ah,
            al,
            bh,
            bl,
            ch,
            cl,
            dh,
            dl,
            eh,
            el,
            fh,
            fl,
            gh,
            gl,
            hh,
            hl,
        ];
        for (let i = 0; i < 16; i += 2) {
            add(h[i], h[i + 1], v[i], v[i + 1]);
            h[i] = rh;
            h[i + 1] = rl;
        }
    }
    const out = new Uint8Array(64),
        outView = new DataView(out.buffer);
    h.forEach((value, i) => outView.setInt32(i * 4, value));
    return out.slice(0, outputLength);
}
const sha512Initial = [
    0x6a09e667, 0xf3bcc908, 0xbb67ae85, 0x84caa73b, 0x3c6ef372, 0xfe94f82b,
    0xa54ff53a, 0x5f1d36f1, 0x510e527f, 0xade682d1, 0x9b05688c, 0x2b3e6c1f,
    0x1f83d9ab, 0xfb41bd6b, 0x5be0cd19, 0x137e2179,
];
const sha384Initial = [
    0xcbbb9d5d, 0xc1059ed8, 0x629a292a, 0x367cd507, 0x9159015a, 0x3070dd17,
    0x152fecd8, 0xf70e5939, 0x67332667, 0xffc00b31, 0x8eb44a87, 0x68581511,
    0xdb0c2e0d, 0x64f98fa7, 0x47b5481d, 0xbefa4fa4,
];
const algorithms = {
    md5: { hash: md5, block: 64 },
    sha1: { hash: sha1, block: 64 },
    sha256: { hash: sha256, block: 64 },
    sha384: {
        hash: (input) => sha512Like(input, sha384Initial, 48),
        block: 128,
    },
    sha512: {
        hash: (input) => sha512Like(input, sha512Initial, 64),
        block: 128,
    },
};
const aliases = {
    "rsa-md5": "md5",
    "rsa-sha1": "sha1",
    "sha-1": "sha1",
    "rsa-sha256": "sha256",
    "sha-256": "sha256",
    "sha-384": "sha384",
    "rsa-sha512": "sha512",
    "sha-512": "sha512",
};
function algorithmOf(name) {
    const key = String(name).toLowerCase();
    const found = algorithms[aliases[key] || key];
    if (!found) {
        const error = new Error("Digest method not supported");
        error.code = "ERR_CRYPTO_INVALID_DIGEST";
        throw error;
    }
    return found;
}
function output(bytes, encoding) {
    const buffer = Buffer.from(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
    );
    return encoding === undefined || encoding === "buffer"
        ? buffer
        : buffer.toString(encoding);
}

class Hash {
    constructor(algorithm, chunks, length) {
        this._algorithm = algorithmOf(algorithm);
        this._name = algorithm;
        this._chunks = chunks || [];
        this._length = length || 0;
        this._finished = false;
    }
    update(data, encoding) {
        if (this._finished) {
            const error = new Error("Digest already called");
            error.code = "ERR_CRYPTO_HASH_FINALIZED";
            throw error;
        }
        const bytes = toBytes(data, encoding, "data").slice();
        this._chunks.push(bytes);
        this._length += bytes.length;
        return this;
    }
    digest(encoding) {
        if (this._finished) {
            const error = new Error("Digest already called");
            error.code = "ERR_CRYPTO_HASH_FINALIZED";
            throw error;
        }
        this._finished = true;
        return output(
            this._algorithm.hash(concat(this._chunks, this._length)),
            encoding,
        );
    }
    copy() {
        if (this._finished) {
            const error = new Error("Digest already called");
            error.code = "ERR_CRYPTO_HASH_FINALIZED";
            throw error;
        }
        return new Hash(this._name, this._chunks.slice(), this._length);
    }
}
class Hmac {
    constructor(algorithm, key) {
        const spec = algorithmOf(algorithm);
        let keyBytes = toBytes(
            key && typeof key === "object" && typeof key.export === "function"
                ? key.export()
                : key,
            undefined,
            "key",
        );
        if (keyBytes.length > spec.block) keyBytes = spec.hash(keyBytes);
        const padded = new Uint8Array(spec.block);
        padded.set(keyBytes);
        this._spec = spec;
        this._outer = padded.map((b) => b ^ 0x5c);
        this._inner = new Hash(algorithm).update(padded.map((b) => b ^ 0x36));
        this._finished = false;
    }
    update(data, encoding) {
        this._inner.update(data, encoding);
        return this;
    }
    digest(encoding) {
        if (this._finished) return output(new Uint8Array(0), encoding);
        this._finished = true;
        const inner = this._inner.digest();
        const outer = new Uint8Array(this._outer.length + inner.length);
        outer.set(this._outer);
        outer.set(inner, this._outer.length);
        return output(this._spec.hash(outer), encoding);
    }
}

export function createHash(algorithm, options) {
    return new Hash(algorithm);
}
export function createHmac(algorithm, key, options) {
    return new Hmac(algorithm, key);
}
export function hash(algorithm, data, encoding = "hex") {
    return new Hash(algorithm).update(data).digest(encoding);
}
export function getHashes() {
    return [
        "md5",
        "rsa-md5",
        "rsa-sha1",
        "rsa-sha256",
        "rsa-sha512",
        "sha1",
        "sha256",
        "sha384",
        "sha512",
    ];
}

function checkSize(size, name) {
    if (typeof size !== "number") {
        const error = new TypeError(
            'The "' +
                name +
                '" argument must be of type number. Received type ' +
                typeof size,
        );
        error.code = "ERR_INVALID_ARG_TYPE";
        throw error;
    }
    if (!(size >= 0 && size <= 2147483647) || size !== Math.floor(size)) {
        const error = new RangeError(
            'The value of "' +
                name +
                '" is out of range. It must be >= 0 && <= 2147483647. Received ' +
                size,
        );
        error.code = "ERR_OUT_OF_RANGE";
        throw error;
    }
}
function randomBytes_(size, callback) {
    checkSize(size, "size");
    const bytes = nativeRandomBytes(size);
    const buffer = Buffer.from(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
    );
    if (typeof callback === "function") {
        queueMicrotask(() => callback(null, buffer));
        return;
    }
    return buffer;
}
export { randomBytes_ as randomBytes, randomBytes_ as pseudoRandomBytes };
export function randomFillSync(target, offset = 0, size) {
    const view = toBytes(target, undefined, "buf");
    if (size === undefined) size = view.length - offset;
    view.set(nativeRandomBytes(size), offset);
    return target;
}
export function randomFill(target, offset, size, callback) {
    if (typeof offset === "function") {
        callback = offset;
        offset = 0;
        size = undefined;
    } else if (typeof size === "function") {
        callback = size;
        size = undefined;
    }
    randomFillSync(target, offset, size);
    queueMicrotask(() => callback(null, target));
}
export function getRandomValues(array) {
    if (
        !ArrayBuffer.isView(array) ||
        array instanceof Float32Array ||
        array instanceof Float64Array ||
        array instanceof DataView
    ) {
        const error = new TypeError(
            "The data argument must be an integer-type TypedArray",
        );
        error.name = "TypeMismatchError";
        error.code = 17;
        throw error;
    }
    if (array.byteLength > 65536) {
        const error = new RangeError(
            "The ArrayBufferView's byte length (" +
                array.byteLength +
                ") exceeds the number of bytes of entropy available via this API (65536)",
        );
        error.name = "QuotaExceededError";
        throw error;
    }
    new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(
        nativeRandomBytes(array.byteLength),
    );
    return array;
}
export function randomUUID() {
    const bytes = nativeRandomBytes(16);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    let text = "";
    for (let i = 0; i < 16; i++) {
        text += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
        if (i === 3 || i === 5 || i === 7 || i === 9) text += "-";
    }
    return text;
}
export function randomInt(min, max, callback) {
    if (max === undefined || typeof max === "function") {
        callback = max;
        max = min;
        min = 0;
    }
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
        const error = new TypeError(
            'The "min" and "max" arguments must be safe integers',
        );
        error.code = "ERR_INVALID_ARG_TYPE";
        throw error;
    }
    if (!(max > min)) {
        const error = new RangeError(
            'The value of "max" is out of range. It must be greater than the value of "min" (' +
                min +
                "). Received " +
                max,
        );
        error.code = "ERR_OUT_OF_RANGE";
        throw error;
    }
    const range = max - min;
    if (range > 0xffffffffffff) {
        const error = new RangeError(
            'The value of "max - min" is out of range. It must be <= 281474976710655. Received ' +
                range,
        );
        error.code = "ERR_OUT_OF_RANGE";
        throw error;
    }
    // Rejection sampling over 48 random bits.
    const limit = 0x1000000000000 - (0x1000000000000 % range);
    let value;
    do {
        const b = nativeRandomBytes(6);
        value =
            b[0] * 0x10000000000 +
            b[1] * 0x100000000 +
            b[2] * 0x1000000 +
            b[3] * 0x10000 +
            b[4] * 0x100 +
            b[5];
    } while (value >= limit);
    const result = min + (value % range);
    if (typeof callback === "function") {
        queueMicrotask(() => callback(null, result));
        return;
    }
    return result;
}
export function timingSafeEqual(a, b) {
    const x = toBytes(a, undefined, "buf1"),
        y = toBytes(b, undefined, "buf2");
    if (x.length !== y.length) {
        const error = new RangeError(
            "Input buffers must have the same byte length",
        );
        error.code = "ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH";
        throw error;
    }
    let diff = 0;
    for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
    return diff === 0;
}
export const webcrypto = { getRandomValues, randomUUID };
export const constants = {};
export { Hash, Hmac };
export default {
    createHash,
    createHmac,
    hash,
    getHashes,
    randomBytes: randomBytes_,
    pseudoRandomBytes: randomBytes_,
    randomFillSync,
    randomFill,
    getRandomValues,
    randomUUID,
    randomInt,
    timingSafeEqual,
    webcrypto,
    constants,
    Hash,
    Hmac,
};
