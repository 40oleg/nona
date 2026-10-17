// nona:internal/tls-crypto: the cryptographic primitives of the TLS client
// (issue #301), in plain JavaScript: HKDF and the TLS 1.3 key schedule
// helpers, the AES-GCM and ChaCha20-Poly1305 AEADs, X25519 and P-256/P-384
// key exchange, ECDSA and RSA (PKCS#1 v1.5, PSS) signature verification, and
// a DER reader with SubjectPublicKeyInfo parsing for the X.509 code.
//
// Inputs and outputs are Uint8Arrays (Buffers work too). Hashing and HMAC
// come from node:crypto. The table-based AES and the limb arithmetic of the
// NIST curves and RSA do not run in constant time; X25519, Poly1305 and the
// tag comparison do not branch on secret data.
import { createHash, createHmac, randomBytes } from "node:crypto";

// ---------------------------------------------------------------- helpers

function bytesOf(value) {
    if (value === undefined || value === null) return new Uint8Array(0);
    if (typeof value === "string") return new TextEncoder().encode(value);
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value))
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    throw new TypeError("Expected a string, ArrayBuffer or typed array");
}
export function concatBytes(...parts) {
    let length = 0;
    for (let i = 0; i < parts.length; i++) length += parts[i].length;
    const out = new Uint8Array(length);
    let at = 0;
    for (let i = 0; i < parts.length; i++) {
        out.set(parts[i], at);
        at += parts[i].length;
    }
    return out;
}
/** Compare two byte arrays in time that depends only on their lengths. */
export function constantTimeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
}
function cryptoError(message, code) {
    const error = new Error(message);
    error.code = code;
    return error;
}
function bytesToBigInt(bytes) {
    let hex = "";
    for (let i = 0; i < bytes.length; i++)
        hex += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
    return hex ? BigInt("0x" + hex) : 0n;
}
// ------------------------------------------------------- hashes and HKDF

const hashLengths = { sha1: 20, sha256: 32, sha384: 48, sha512: 64 };
export function hashLength(hash) {
    const length = hashLengths[hash];
    if (!length)
        throw cryptoError(
            "Unsupported hash " + hash,
            "ERR_CRYPTO_INVALID_DIGEST",
        );
    return length;
}
export function digest(hash, data) {
    return new Uint8Array(createHash(hash).update(bytesOf(data)).digest());
}
export function hmac(hash, key, data) {
    return new Uint8Array(
        createHmac(hash, bytesOf(key)).update(bytesOf(data)).digest(),
    );
}
/** HKDF-Extract (RFC 5869); an empty salt stands for HashLen zero bytes. */
export function hkdfExtract(hash, salt, ikm) {
    salt = bytesOf(salt);
    return hmac(
        hash,
        salt.length ? salt : new Uint8Array(hashLength(hash)),
        ikm,
    );
}
/** HKDF-Expand (RFC 5869). */
export function hkdfExpand(hash, prk, info, length) {
    const hashLen = hashLength(hash);
    if (length > 255 * hashLen)
        throw cryptoError("Invalid key length", "ERR_CRYPTO_INVALID_KEYLEN");
    info = bytesOf(info);
    const out = new Uint8Array(length);
    let previous = new Uint8Array(0);
    for (let i = 0, at = 0; at < length; i++) {
        previous = hmac(
            hash,
            prk,
            concatBytes(previous, info, new Uint8Array([i + 1])),
        );
        out.set(previous.subarray(0, Math.min(hashLen, length - at)), at);
        at += hashLen;
    }
    return out;
}
const tls13Prefix = new TextEncoder().encode("tls13 ");
/** HKDF-Expand-Label of TLS 1.3 (RFC 8446 §7.1); the label omits "tls13 ". */
export function hkdfExpandLabel(hash, secret, label, context, length) {
    const labelBytes = concatBytes(tls13Prefix, bytesOf(label)),
        contextBytes = bytesOf(context);
    const info = concatBytes(
        new Uint8Array([length >> 8, length & 255, labelBytes.length]),
        labelBytes,
        new Uint8Array([contextBytes.length]),
        contextBytes,
    );
    return hkdfExpand(hash, secret, info, length);
}
/** Derive-Secret(Secret, Label, Messages) of RFC 8446 §7.1. */
export function deriveSecret(hash, secret, label, messages) {
    return hkdfExpandLabel(
        hash,
        secret,
        label,
        digest(hash, messages),
        hashLength(hash),
    );
}

// -------------------------------------------------------------- AES-GCM

// The S-box and the four encryption T-tables, computed once.
const aesSbox = new Uint8Array(256);
const aesT0 = new Int32Array(256),
    aesT1 = new Int32Array(256),
    aesT2 = new Int32Array(256),
    aesT3 = new Int32Array(256);
(function () {
    const exp = new Uint8Array(256),
        log = new Uint8Array(256);
    for (let i = 0, x = 1; i < 255; i++) {
        exp[i] = x;
        log[x] = i;
        x ^= (x << 1) ^ (x & 0x80 ? 0x11b : 0); // x *= 3
        x &= 255;
    }
    for (let i = 0; i < 256; i++) {
        let b = i === 0 ? 0 : exp[(255 - log[i]) % 255];
        let s = b;
        for (let r = 0; r < 4; r++) {
            b = ((b << 1) | (b >> 7)) & 255;
            s ^= b;
        }
        aesSbox[i] = s ^ 0x63;
    }
    for (let i = 0; i < 256; i++) {
        const s = aesSbox[i],
            s2 = ((s << 1) ^ (s & 0x80 ? 0x11b : 0)) & 255,
            s3 = s2 ^ s;
        const t = (s2 << 24) | (s << 16) | (s << 8) | s3;
        aesT0[i] = t;
        aesT1[i] = (t >>> 8) | (t << 24);
        aesT2[i] = (t >>> 16) | (t << 16);
        aesT3[i] = (t >>> 24) | (t << 8);
    }
})();

function aesExpandKey(key) {
    const nk = key.length / 4;
    if (nk !== 4 && nk !== 6 && nk !== 8)
        throw new RangeError("Invalid AES key length");
    const rounds = nk + 6,
        words = new Int32Array(4 * (rounds + 1));
    for (let i = 0; i < nk; i++)
        words[i] =
            (key[4 * i] << 24) |
            (key[4 * i + 1] << 16) |
            (key[4 * i + 2] << 8) |
            key[4 * i + 3];
    let rcon = 1;
    for (let i = nk; i < words.length; i++) {
        let t = words[i - 1];
        if (i % nk === 0) {
            t =
                ((aesSbox[(t >>> 16) & 255] << 24) |
                    (aesSbox[(t >>> 8) & 255] << 16) |
                    (aesSbox[t & 255] << 8) |
                    aesSbox[t >>> 24]) ^
                (rcon << 24);
            rcon = ((rcon << 1) ^ (rcon & 0x80 ? 0x11b : 0)) & 255;
        } else if (nk > 6 && i % nk === 4) {
            t =
                (aesSbox[t >>> 24] << 24) |
                (aesSbox[(t >>> 16) & 255] << 16) |
                (aesSbox[(t >>> 8) & 255] << 8) |
                aesSbox[t & 255];
        }
        words[i] = words[i - nk] ^ t;
    }
    return { words, rounds };
}
/** Encrypt the block in state (four big-endian words) in place. */
function aesEncryptBlock(schedule, state) {
    const rk = schedule.words,
        rounds = schedule.rounds;
    let s0 = state[0] ^ rk[0],
        s1 = state[1] ^ rk[1],
        s2 = state[2] ^ rk[2],
        s3 = state[3] ^ rk[3];
    let k = 4;
    for (let r = 1; r < rounds; r++) {
        const t0 =
                aesT0[s0 >>> 24] ^
                aesT1[(s1 >>> 16) & 255] ^
                aesT2[(s2 >>> 8) & 255] ^
                aesT3[s3 & 255] ^
                rk[k],
            t1 =
                aesT0[s1 >>> 24] ^
                aesT1[(s2 >>> 16) & 255] ^
                aesT2[(s3 >>> 8) & 255] ^
                aesT3[s0 & 255] ^
                rk[k + 1],
            t2 =
                aesT0[s2 >>> 24] ^
                aesT1[(s3 >>> 16) & 255] ^
                aesT2[(s0 >>> 8) & 255] ^
                aesT3[s1 & 255] ^
                rk[k + 2],
            t3 =
                aesT0[s3 >>> 24] ^
                aesT1[(s0 >>> 16) & 255] ^
                aesT2[(s1 >>> 8) & 255] ^
                aesT3[s2 & 255] ^
                rk[k + 3];
        s0 = t0;
        s1 = t1;
        s2 = t2;
        s3 = t3;
        k += 4;
    }
    const S = aesSbox;
    state[0] =
        ((S[s0 >>> 24] << 24) |
            (S[(s1 >>> 16) & 255] << 16) |
            (S[(s2 >>> 8) & 255] << 8) |
            S[s3 & 255]) ^
        rk[k];
    state[1] =
        ((S[s1 >>> 24] << 24) |
            (S[(s2 >>> 16) & 255] << 16) |
            (S[(s3 >>> 8) & 255] << 8) |
            S[s0 & 255]) ^
        rk[k + 1];
    state[2] =
        ((S[s2 >>> 24] << 24) |
            (S[(s3 >>> 16) & 255] << 16) |
            (S[(s0 >>> 8) & 255] << 8) |
            S[s1 & 255]) ^
        rk[k + 2];
    state[3] =
        ((S[s3 >>> 24] << 24) |
            (S[(s0 >>> 16) & 255] << 16) |
            (S[(s1 >>> 8) & 255] << 8) |
            S[s2 & 255]) ^
        rk[k + 3];
}
/** Encrypt one 16-byte block (exported for the FIPS-197 test vectors). */
export function aesEncrypt(key, block) {
    const state = new Int32Array(4);
    for (let i = 0; i < 4; i++)
        state[i] =
            (block[4 * i] << 24) |
            (block[4 * i + 1] << 16) |
            (block[4 * i + 2] << 8) |
            block[4 * i + 3];
    aesEncryptBlock(aesExpandKey(bytesOf(key)), state);
    const out = new Uint8Array(16);
    for (let i = 0; i < 4; i++) {
        out[4 * i] = state[i] >>> 24;
        out[4 * i + 1] = state[i] >>> 16;
        out[4 * i + 2] = state[i] >>> 8;
        out[4 * i + 3] = state[i];
    }
    return out;
}

// GHASH with 4-bit tables (Shoup's method). A field element is four
// big-endian words; table[16 * 4] holds the multiples of H by the nibbles in
// reversed bit order.
const ghashReduction = [
    0x0000, 0x1c20, 0x3840, 0x2460, 0x7080, 0x6ca0, 0x48c0, 0x54e0, 0xe100,
    0xfd20, 0xd940, 0xc560, 0x9180, 0x8da0, 0xa9c0, 0xb5e0,
];
function reverse4(i) {
    return ((i & 1) << 3) | ((i & 2) << 1) | ((i & 4) >> 1) | ((i & 8) >> 3);
}
function ghashTable(h) {
    const table = new Int32Array(64);
    const at = reverse4(1) * 4;
    table.set(h, at);
    for (let i = 2; i < 16; i += 2) {
        const half = reverse4(i >> 1) * 4,
            dbl = reverse4(i) * 4,
            next = reverse4(i + 1) * 4;
        const lsb = table[half + 3] & 1;
        table[dbl + 3] = (table[half + 3] >>> 1) | (table[half + 2] << 31);
        table[dbl + 2] = (table[half + 2] >>> 1) | (table[half + 1] << 31);
        table[dbl + 1] = (table[half + 1] >>> 1) | (table[half] << 31);
        table[dbl] = (table[half] >>> 1) ^ (lsb ? 0xe1000000 : 0);
        for (let j = 0; j < 4; j++) table[next + j] = table[dbl + j] ^ h[j];
    }
    return table;
}
/** y = y * H in GF(2^128). */
function ghashMultiply(table, y) {
    let z0 = 0,
        z1 = 0,
        z2 = 0,
        z3 = 0;
    for (let w = 3; w >= 0; w--) {
        let word = y[w];
        for (let j = 0; j < 8; j++) {
            const msw = z3 & 15;
            z3 = (z3 >>> 4) | (z2 << 28);
            z2 = (z2 >>> 4) | (z1 << 28);
            z1 = (z1 >>> 4) | (z0 << 28);
            z0 = (z0 >>> 4) ^ (ghashReduction[msw] << 16);
            const t = (word & 15) * 4;
            z0 ^= table[t];
            z1 ^= table[t + 1];
            z2 ^= table[t + 2];
            z3 ^= table[t + 3];
            word >>>= 4;
        }
    }
    y[0] = z0;
    y[1] = z1;
    y[2] = z2;
    y[3] = z3;
}
/** Absorb data, zero-padded to whole blocks, into the GHASH state y. */
function ghashUpdate(table, y, data) {
    const length = data.length;
    for (let at = 0; at < length; at += 16) {
        for (let i = 0; i < 4; i++) {
            const o = at + 4 * i;
            y[i] ^=
                ((o < length ? data[o] : 0) << 24) |
                ((o + 1 < length ? data[o + 1] : 0) << 16) |
                ((o + 2 < length ? data[o + 2] : 0) << 8) |
                (o + 3 < length ? data[o + 3] : 0);
        }
        ghashMultiply(table, y);
    }
}
function ghashLengths(table, y, aadLength, dataLength) {
    const aadBits = aadLength * 8,
        dataBits = dataLength * 8;
    y[0] ^= Math.floor(aadBits / 0x100000000);
    y[1] ^= aadBits >>> 0;
    y[2] ^= Math.floor(dataBits / 0x100000000);
    y[3] ^= dataBits >>> 0;
    ghashMultiply(table, y);
}

class AesGcm {
    constructor(key) {
        key = bytesOf(key);
        this.keyLength = key.length;
        this._schedule = aesExpandKey(key);
        const h = new Int32Array(4);
        aesEncryptBlock(this._schedule, h);
        this._table = ghashTable(h);
    }
    _counter(nonce) {
        const j0 = new Int32Array(4);
        if (nonce.length === 12) {
            for (let i = 0; i < 3; i++)
                j0[i] =
                    (nonce[4 * i] << 24) |
                    (nonce[4 * i + 1] << 16) |
                    (nonce[4 * i + 2] << 8) |
                    nonce[4 * i + 3];
            j0[3] = 1;
        } else {
            if (nonce.length === 0)
                throw new RangeError("Invalid GCM nonce length");
            ghashUpdate(this._table, j0, nonce);
            ghashLengths(this._table, j0, 0, nonce.length);
        }
        return j0;
    }
    /** XOR input with the key stream that starts at counter j0 + 1. */
    _ctr(j0, input) {
        const out = new Uint8Array(input.length),
            block = new Int32Array(4);
        let counter = j0[3];
        for (let at = 0; at < input.length; at += 16) {
            counter = (counter + 1) | 0;
            block[0] = j0[0];
            block[1] = j0[1];
            block[2] = j0[2];
            block[3] = counter;
            aesEncryptBlock(this._schedule, block);
            const end = Math.min(16, input.length - at);
            for (let i = 0; i < end; i++)
                out[at + i] =
                    input[at + i] ^ (block[i >> 2] >>> (24 - 8 * (i & 3)));
        }
        return out;
    }
    _tag(j0, aad, ciphertext) {
        const y = new Int32Array(4);
        ghashUpdate(this._table, y, aad);
        ghashUpdate(this._table, y, ciphertext);
        ghashLengths(this._table, y, aad.length, ciphertext.length);
        const mask = new Int32Array(j0);
        aesEncryptBlock(this._schedule, mask);
        const tag = new Uint8Array(16);
        for (let i = 0; i < 16; i++)
            tag[i] = (y[i >> 2] ^ mask[i >> 2]) >>> (24 - 8 * (i & 3));
        return tag;
    }
    /** Encrypt; returns ciphertext || 16-byte tag. */
    seal(nonce, plaintext, aad) {
        nonce = bytesOf(nonce);
        aad = bytesOf(aad);
        const j0 = this._counter(nonce),
            ciphertext = this._ctr(j0, bytesOf(plaintext));
        return concatBytes(ciphertext, this._tag(j0, aad, ciphertext));
    }
    /** Decrypt ciphertext || tag; returns null when the tag does not match. */
    open(nonce, sealed, aad) {
        nonce = bytesOf(nonce);
        aad = bytesOf(aad);
        sealed = bytesOf(sealed);
        if (sealed.length < 16) return null;
        const ciphertext = sealed.subarray(0, sealed.length - 16),
            j0 = this._counter(nonce);
        if (
            !constantTimeEqual(
                this._tag(j0, aad, ciphertext),
                sealed.subarray(sealed.length - 16),
            )
        )
            return null;
        return this._ctr(j0, ciphertext);
    }
}

// ---------------------------------------------------- ChaCha20-Poly1305

function quarterRound(x, a, b, c, d) {
    x[a] = (x[a] + x[b]) | 0;
    x[d] ^= x[a];
    x[d] = (x[d] << 16) | (x[d] >>> 16);
    x[c] = (x[c] + x[d]) | 0;
    x[b] ^= x[c];
    x[b] = (x[b] << 12) | (x[b] >>> 20);
    x[a] = (x[a] + x[b]) | 0;
    x[d] ^= x[a];
    x[d] = (x[d] << 8) | (x[d] >>> 24);
    x[c] = (x[c] + x[d]) | 0;
    x[b] ^= x[c];
    x[b] = (x[b] << 7) | (x[b] >>> 25);
}
function readLE32(bytes, at) {
    return (
        bytes[at] |
        (bytes[at + 1] << 8) |
        (bytes[at + 2] << 16) |
        (bytes[at + 3] << 24)
    );
}
/** The ChaCha20 block function (RFC 8439 §2.3) into out (64 bytes). */
function chachaBlock(key, counter, nonce, out, state, work) {
    state[0] = 0x61707865;
    state[1] = 0x3320646e;
    state[2] = 0x79622d32;
    state[3] = 0x6b206574;
    for (let i = 0; i < 8; i++) state[4 + i] = readLE32(key, 4 * i);
    state[12] = counter;
    for (let i = 0; i < 3; i++) state[13 + i] = readLE32(nonce, 4 * i);
    work.set(state);
    for (let i = 0; i < 10; i++) {
        quarterRound(work, 0, 4, 8, 12);
        quarterRound(work, 1, 5, 9, 13);
        quarterRound(work, 2, 6, 10, 14);
        quarterRound(work, 3, 7, 11, 15);
        quarterRound(work, 0, 5, 10, 15);
        quarterRound(work, 1, 6, 11, 12);
        quarterRound(work, 2, 7, 8, 13);
        quarterRound(work, 3, 4, 9, 14);
    }
    for (let i = 0; i < 16; i++) {
        const v = (work[i] + state[i]) | 0;
        out[4 * i] = v;
        out[4 * i + 1] = v >>> 8;
        out[4 * i + 2] = v >>> 16;
        out[4 * i + 3] = v >>> 24;
    }
}
/** ChaCha20 encryption (RFC 8439 §2.4) starting at the given block counter. */
export function chacha20(key, nonce, counter, input) {
    key = bytesOf(key);
    nonce = bytesOf(nonce);
    input = bytesOf(input);
    if (key.length !== 32 || nonce.length !== 12)
        throw new RangeError("Invalid ChaCha20 key or nonce");
    const out = new Uint8Array(input.length),
        block = new Uint8Array(64),
        state = new Int32Array(16),
        work = new Int32Array(16);
    for (let at = 0; at < input.length; at += 64) {
        chachaBlock(key, counter | 0, nonce, block, state, work);
        counter++;
        const end = Math.min(64, input.length - at);
        for (let i = 0; i < end; i++) out[at + i] = input[at + i] ^ block[i];
    }
    return out;
}

// Poly1305 (RFC 8439 §2.5) on ten 13-bit limbs, so that every product and
// sum stays an exact double.
function limbs13(bytes, out) {
    for (let i = 0; i < 10; i++) {
        const bit = 13 * i,
            at = bit >> 3;
        out[i] =
            ((bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16)) >>>
                (bit & 7)) &
            0x1fff;
    }
}
function poly1305Carry(h) {
    let c = 0;
    for (let i = 0; i < 10; i++) {
        const v = h[i] + c,
            low = v & 0x1fff;
        c = (v - low) / 8192;
        h[i] = low;
    }
    h[0] += c * 5;
}
export function poly1305(key, message) {
    key = bytesOf(key);
    message = bytesOf(message);
    const rBytes = new Uint8Array(19);
    rBytes.set(key.subarray(0, 16));
    rBytes[3] &= 15;
    rBytes[7] &= 15;
    rBytes[11] &= 15;
    rBytes[15] &= 15;
    rBytes[4] &= 252;
    rBytes[8] &= 252;
    rBytes[12] &= 252;
    const r = new Float64Array(10),
        r5 = new Float64Array(10),
        h = new Float64Array(10),
        m = new Float64Array(10),
        d = new Float64Array(10),
        block = new Uint8Array(19);
    limbs13(rBytes, r);
    for (let i = 0; i < 10; i++) r5[i] = r[i] * 5;
    for (let at = 0; at < message.length; at += 16) {
        const end = Math.min(16, message.length - at);
        block.fill(0);
        block.set(message.subarray(at, at + end));
        block[end] = 1;
        limbs13(block, m);
        for (let i = 0; i < 10; i++) h[i] += m[i];
        for (let i = 0; i < 10; i++) {
            let sum = 0;
            for (let j = 0; j <= i; j++) sum += h[j] * r[i - j];
            for (let j = i + 1; j < 10; j++) sum += h[j] * r5[i + 10 - j];
            d[i] = sum;
        }
        h.set(d);
        poly1305Carry(h);
        poly1305Carry(h);
    }
    poly1305Carry(h);
    poly1305Carry(h);
    poly1305Carry(h);
    // Subtract p = 2^130 - 5 when h >= p: g = h + 5 - 2^130.
    const g = new Float64Array(10);
    let c = 5;
    for (let i = 0; i < 10; i++) {
        const v = h[i] + c;
        g[i] = v & 0x1fff;
        c = v >>> 13;
    }
    const mask = -c; // all ones when h + 5 >= 2^130
    for (let i = 0; i < 10; i++) h[i] = (h[i] & ~mask) | (g[i] & mask);
    // h mod 2^128 + s.
    const tag = new Uint8Array(16);
    let acc = 0,
        bits = 0,
        o = 0;
    for (let i = 0; i < 10 && o < 16; i++) {
        acc |= h[i] << bits;
        bits += 13;
        while (bits >= 8 && o < 16) {
            tag[o++] = acc & 255;
            acc >>>= 8;
            bits -= 8;
        }
    }
    let carry = 0;
    for (let i = 0; i < 16; i++) {
        const v = tag[i] + key[16 + i] + carry;
        tag[i] = v;
        carry = v >> 8;
    }
    return tag;
}
function poly1305Input(aad, ciphertext) {
    const pad = (n) => (16 - (n % 16)) % 16;
    const input = new Uint8Array(
        aad.length +
            pad(aad.length) +
            ciphertext.length +
            pad(ciphertext.length) +
            16,
    );
    input.set(aad);
    const at = aad.length + pad(aad.length);
    input.set(ciphertext, at);
    const lengths = input.length - 16;
    for (const [offset, value] of [
        [0, aad.length],
        [8, ciphertext.length],
    ]) {
        input[lengths + offset] = value;
        input[lengths + offset + 1] = value >>> 8;
        input[lengths + offset + 2] = value >>> 16;
        input[lengths + offset + 3] = value >>> 24;
    }
    return input;
}
class ChaCha20Poly1305 {
    constructor(key) {
        key = bytesOf(key);
        if (key.length !== 32)
            throw new RangeError("Invalid ChaCha20-Poly1305 key length");
        this.keyLength = 32;
        this._key = new Uint8Array(key);
    }
    _tag(nonce, aad, ciphertext) {
        const polyKey = chacha20(this._key, nonce, 0, new Uint8Array(32));
        return poly1305(polyKey, poly1305Input(aad, ciphertext));
    }
    seal(nonce, plaintext, aad) {
        nonce = bytesOf(nonce);
        aad = bytesOf(aad);
        const ciphertext = chacha20(this._key, nonce, 1, plaintext);
        return concatBytes(ciphertext, this._tag(nonce, aad, ciphertext));
    }
    open(nonce, sealed, aad) {
        nonce = bytesOf(nonce);
        aad = bytesOf(aad);
        sealed = bytesOf(sealed);
        if (sealed.length < 16) return null;
        const ciphertext = sealed.subarray(0, sealed.length - 16);
        if (
            !constantTimeEqual(
                this._tag(nonce, aad, ciphertext),
                sealed.subarray(sealed.length - 16),
            )
        )
            return null;
        return chacha20(this._key, nonce, 1, ciphertext);
    }
}

const aeads = {
    "aes-128-gcm": [16, (key) => new AesGcm(key)],
    "aes-256-gcm": [32, (key) => new AesGcm(key)],
    "chacha20-poly1305": [32, (key) => new ChaCha20Poly1305(key)],
};
/**
 * An AEAD with a fixed key: seal(nonce, plaintext, aad) returns ciphertext
 * followed by the 16-byte tag, open(nonce, sealed, aad) returns the
 * plaintext or null when authentication fails.
 */
export function createAead(name, key) {
    const spec = aeads[name];
    if (!spec)
        throw cryptoError(
            "Unsupported AEAD " + name,
            "ERR_CRYPTO_UNKNOWN_CIPHER",
        );
    key = bytesOf(key);
    if (key.length !== spec[0])
        throw new RangeError("Invalid key length for " + name);
    const aead = spec[1](key);
    aead.name = name;
    aead.nonceLength = 12;
    aead.tagLength = 16;
    return aead;
}
export function aeadSeal(name, key, nonce, plaintext, aad) {
    return createAead(name, key).seal(nonce, plaintext, aad);
}
export function aeadOpen(name, key, nonce, sealed, aad) {
    return createAead(name, key).open(nonce, sealed, aad);
}

// ---------------------------------------------------------------- X25519

// Field elements mod 2^255 - 19 as sixteen 16-bit limbs in a Float64Array
// (the representation of TweetNaCl); all arithmetic is branch-free.
function fe(init) {
    const r = new Float64Array(16);
    if (init) for (let i = 0; i < init.length; i++) r[i] = init[i];
    return r;
}
const fe121665 = fe([0xdb41, 1]);
const feProduct = new Float64Array(31);
function feCarry(o) {
    let c = 1;
    for (let i = 0; i < 16; i++) {
        const v = o[i] + c + 65535;
        c = Math.floor(v / 65536);
        o[i] = v - c * 65536;
    }
    o[0] += 38 * (c - 1);
}
function feSelect(p, q, bit) {
    const mask = -bit;
    for (let i = 0; i < 16; i++) {
        const t = mask & (p[i] ^ q[i]);
        p[i] ^= t;
        q[i] ^= t;
    }
}
function fePack(o, n) {
    const m = fe(),
        t = fe(n);
    feCarry(t);
    feCarry(t);
    feCarry(t);
    for (let j = 0; j < 2; j++) {
        m[0] = t[0] - 0xffed;
        for (let i = 1; i < 15; i++) {
            m[i] = t[i] - 0xffff - ((m[i - 1] >> 16) & 1);
            m[i - 1] &= 0xffff;
        }
        m[15] = t[15] - 0x7fff - ((m[14] >> 16) & 1);
        const b = (m[15] >> 16) & 1;
        m[14] &= 0xffff;
        feSelect(t, m, 1 - b);
    }
    for (let i = 0; i < 16; i++) {
        o[2 * i] = t[i] & 0xff;
        o[2 * i + 1] = t[i] >> 8;
    }
}
function feUnpack(o, n) {
    for (let i = 0; i < 16; i++) o[i] = n[2 * i] + (n[2 * i + 1] << 8);
    o[15] &= 0x7fff;
}
function feAdd(o, a, b) {
    for (let i = 0; i < 16; i++) o[i] = a[i] + b[i];
}
function feSub(o, a, b) {
    for (let i = 0; i < 16; i++) o[i] = a[i] - b[i];
}
function feMul(o, a, b) {
    const t = feProduct;
    t.fill(0);
    for (let i = 0; i < 16; i++) {
        const ai = a[i];
        for (let j = 0; j < 16; j++) t[i + j] += ai * b[j];
    }
    for (let i = 0; i < 15; i++) t[i] += 38 * t[i + 16];
    for (let i = 0; i < 16; i++) o[i] = t[i];
    feCarry(o);
    feCarry(o);
}
function feInverse(o, i) {
    const c = fe(i);
    for (let a = 253; a >= 0; a--) {
        feMul(c, c, c);
        if (a !== 2 && a !== 4) feMul(c, c, i);
    }
    o.set(c);
}
/** X25519(k, u) of RFC 7748 §5: the Montgomery ladder over 255 bits. */
export function x25519(scalar, u) {
    scalar = bytesOf(scalar);
    u = bytesOf(u);
    if (scalar.length !== 32 || u.length !== 32)
        throw new RangeError("X25519 inputs must be 32 bytes");
    const z = new Uint8Array(scalar);
    z[31] = (z[31] & 127) | 64;
    z[0] &= 248;
    const x = fe();
    feUnpack(x, u);
    const a = fe([1]),
        b = fe(x),
        c = fe(),
        d = fe([1]),
        e = fe(),
        f = fe();
    for (let i = 254; i >= 0; i--) {
        const bit = (z[i >>> 3] >>> (i & 7)) & 1;
        feSelect(a, b, bit);
        feSelect(c, d, bit);
        feAdd(e, a, c);
        feSub(a, a, c);
        feAdd(c, b, d);
        feSub(b, b, d);
        feMul(d, e, e);
        feMul(f, a, a);
        feMul(a, c, a);
        feMul(c, b, e);
        feAdd(e, a, c);
        feSub(a, a, c);
        feMul(b, a, a);
        feSub(c, d, f);
        feMul(a, c, fe121665);
        feAdd(a, a, d);
        feMul(c, c, a);
        feMul(a, d, f);
        feMul(d, b, x);
        feMul(b, e, e);
        feSelect(a, b, bit);
        feSelect(c, d, bit);
    }
    feInverse(c, c);
    feMul(a, a, c);
    const out = new Uint8Array(32);
    fePack(out, a);
    return out;
}
const x25519BasePoint = new Uint8Array(32);
x25519BasePoint[0] = 9;
export function x25519PublicKey(privateKey) {
    return x25519(privateKey, x25519BasePoint);
}
export function x25519GenerateKeyPair() {
    const privateKey = new Uint8Array(randomBytes(32));
    return { privateKey, publicKey: x25519PublicKey(privateKey) };
}
/** The shared secret; throws for a peer key of small order (all-zero result, RFC 8446 §7.4.2). */
export function x25519SharedSecret(privateKey, peerPublicKey) {
    const secret = x25519(privateKey, peerPublicKey);
    let any = 0;
    for (let i = 0; i < 32; i++) any |= secret[i];
    if (any === 0)
        throw cryptoError(
            "Invalid X25519 public key",
            "ERR_CRYPTO_INVALID_KEY",
        );
    return secret;
}

// ------------------------------------------------ Montgomery arithmetic

// Residues modulo an odd number on 24-bit limbs (little-endian) in
// Float64Arrays: a product of two limbs stays below 2^48, so every sum in
// the Montgomery multiplication is an exact double. (BigInt division is
// slow in Nona, so the NIST curves and RSA do not use BigInt.)
const LIMB = 16777216;
function limbsFromBytes(bytes, n) {
    const out = new Float64Array(n);
    for (let k = 0; k < bytes.length; k++) {
        const value = bytes[bytes.length - 1 - k];
        if (value) out[(k / 3) | 0] += value * (1 << (8 * (k % 3)));
    }
    return out;
}
function limbsToBytes(limbs, length) {
    const out = new Uint8Array(length);
    for (let k = 0; k < length; k++)
        out[length - 1 - k] = (limbs[(k / 3) | 0] >>> (8 * (k % 3))) & 255;
    return out;
}
function limbsCompare(a, b, n) {
    for (let i = n - 1; i >= 0; i--)
        if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
    return 0;
}
function limbsIsZero(a) {
    for (let i = 0; i < a.length; i++) if (a[i] !== 0) return false;
    return true;
}
/** out = a - b over n limbs; returns the borrow (0 or 1). */
function limbsSub(a, b, out, n) {
    let borrow = 0;
    for (let i = 0; i < n; i++) {
        const v = a[i] - b[i] - borrow;
        borrow = v < 0 ? 1 : 0;
        out[i] = v + borrow * LIMB;
    }
    return borrow;
}
function limbsAdd(a, b, out, n) {
    let carry = 0;
    for (let i = 0; i < n; i++) {
        const v = a[i] + b[i] + carry;
        carry = v >= LIMB ? 1 : 0;
        out[i] = v - carry * LIMB;
    }
    return carry;
}
/** The big-endian bytes without leading zeros. */
function stripZeros(bytes) {
    let i = 0;
    while (i < bytes.length - 1 && bytes[i] === 0) i++;
    return bytes.subarray(i);
}
function bytesBitLength(bytes) {
    bytes = stripZeros(bytes);
    let top = bytes[0],
        bits = 0;
    while (top) {
        bits++;
        top >>= 1;
    }
    return (bytes.length - 1) * 8 + bits;
}
/** Big-endian bytes minus a small number (the value must be larger). */
function bytesMinus(bytes, small) {
    const out = new Uint8Array(bytes);
    for (let i = out.length - 1; i >= 0 && small; i--) {
        const v = out[i] - small;
        out[i] = v;
        small = v < 0 ? 1 : 0;
    }
    return out;
}
function bitOf(bytes, i) {
    const at = bytes.length - 1 - (i >> 3);
    return at < 0 ? 0 : (bytes[at] >> (i & 7)) & 1;
}

class MontgomeryField {
    constructor(modulus) {
        modulus = stripZeros(bytesOf(modulus));
        if (!(modulus[modulus.length - 1] & 1) || bytesBitLength(modulus) < 2)
            throw new RangeError("Montgomery modulus must be odd");
        const n = Math.ceil(modulus.length / 3);
        this.n = n;
        this.modulus = modulus;
        this.byteLength = modulus.length;
        this.m = limbsFromBytes(modulus, n);
        // mPrime = -m^-1 mod 2^24 (Newton iteration doubles the correct bits).
        const m0 = this.m[0];
        let x = 1;
        for (let i = 0; i < 5; i++) {
            const p = (m0 * x) % LIMB;
            x = (x * ((2 - p + LIMB) % LIMB)) % LIMB;
        }
        this.mPrime = (LIMB - x) % LIMB;
        this.t = new Float64Array(n + 2);
        // R^2 mod m, R = 2^(24n), by doubling 1.
        const r2 = new Float64Array(n);
        r2[0] = 1;
        for (let i = 0; i < 48 * n; i++) this.add(r2, r2, r2);
        this.r2 = r2;
        this.unit = new Float64Array(n);
        this.unit[0] = 1;
        this.one = this.toMont(this.unit);
    }
    element() {
        return new Float64Array(this.n);
    }
    /** out = a * b / R mod m (inputs below m; out may alias them). */
    mul(a, b, out) {
        const n = this.n,
            m = this.m,
            t = this.t,
            mp = this.mPrime;
        t.fill(0);
        for (let i = 0; i < n; i++) {
            const ai = a[i];
            let c = 0,
                v;
            if (ai !== 0) {
                for (let j = 0; j < n; j++) {
                    v = t[j] + ai * b[j] + c;
                    c = Math.floor(v / LIMB);
                    t[j] = v - c * LIMB;
                }
                v = t[n] + c;
                c = Math.floor(v / LIMB);
                t[n] = v - c * LIMB;
                t[n + 1] += c;
            }
            v = t[0] * mp;
            const q = v - Math.floor(v / LIMB) * LIMB;
            v = t[0] + q * m[0];
            c = Math.floor(v / LIMB);
            for (let j = 1; j < n; j++) {
                v = t[j] + q * m[j] + c;
                c = Math.floor(v / LIMB);
                t[j - 1] = v - c * LIMB;
            }
            v = t[n] + c;
            c = Math.floor(v / LIMB);
            t[n - 1] = v - c * LIMB;
            t[n] = t[n + 1] + c;
            t[n + 1] = 0;
        }
        if (t[n] !== 0 || limbsCompare(t, m, n) >= 0) limbsSub(t, m, out, n);
        else for (let i = 0; i < n; i++) out[i] = t[i];
        return out;
    }
    add(a, b, out) {
        if (
            limbsAdd(a, b, out, this.n) ||
            limbsCompare(out, this.m, this.n) >= 0
        )
            limbsSub(out, this.m, out, this.n);
        return out;
    }
    sub(a, b, out) {
        if (limbsSub(a, b, out, this.n)) limbsAdd(out, this.m, out, this.n);
        return out;
    }
    toMont(a) {
        return this.mul(a, this.r2, this.element());
    }
    fromMont(a) {
        return this.mul(a, this.unit, this.element());
    }
    /** base^exponent for a Montgomery-form base and big-endian exponent bytes. */
    pow(base, exponent) {
        const result = new Float64Array(this.one);
        for (let i = exponent.length * 8 - 1, started = false; i >= 0; i--) {
            if (started) this.mul(result, result, result);
            if (bitOf(exponent, i)) {
                this.mul(result, base, result);
                started = true;
            }
        }
        return result;
    }
    /** a^-1 for a prime modulus (Fermat), in Montgomery form. */
    invert(a) {
        if (!this._minusTwo) this._minusTwo = bytesMinus(this.modulus, 2);
        return this.pow(a, this._minusTwo);
    }
    /** The limbs of big-endian bytes, or null when the value is not below the modulus. */
    fromBytes(bytes) {
        bytes = stripZeros(bytesOf(bytes));
        if (bytes.length > this.byteLength) return null;
        const limbs = limbsFromBytes(bytes, this.n);
        return limbsCompare(limbs, this.m, this.n) < 0 ? limbs : null;
    }
    toBytes(limbs) {
        return limbsToBytes(limbs, this.byteLength);
    }
}

// ------------------------------------------------------ NIST P-256, P-384

// Short Weierstrass curves y^2 = x^3 - 3x + b in Jacobian coordinates with
// coordinates in Montgomery form. A point is [X, Y, Z]; Z = 0 is the point
// at infinity. The ladder and the field operations branch on data, so this
// code does not run in constant time.
function curve(name, size, p, n, b, gx, gy) {
    const F = new MontgomeryField(hexBytes(p)),
        N = new MontgomeryField(hexBytes(n));
    const c = { name, size, F, N, b: F.toMont(F.fromBytes(hexBytes(b))) };
    c.g = [
        F.toMont(F.fromBytes(hexBytes(gx))),
        F.toMont(F.fromBytes(hexBytes(gy))),
        new Float64Array(F.one),
    ];
    // p = 3 (mod 4) for both curves, so a square root is a^((p+1)/4).
    const p1 = new Uint8Array(size + 1);
    p1.set(F.modulus, 1);
    for (let i = p1.length - 1, carry = 1; i >= 0 && carry; i--) {
        const v = p1[i] + carry;
        p1[i] = v;
        carry = v >> 8;
    }
    for (let i = p1.length - 1; i >= 0; i--)
        p1[i] = (p1[i] >> 2) | (i > 0 ? (p1[i - 1] & 3) << 6 : 0);
    c.sqrtExponent = p1;
    return c;
}
let curveTable = null;
function curveOf(name) {
    if (!curveTable) {
        const p256 = curve(
            "P-256",
            32,
            "ffffffff00000001000000000000000000000000ffffffffffffffffffffffff",
            "ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551",
            "5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b",
            "6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296",
            "4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5",
        );
        const p384 = curve(
            "P-384",
            48,
            "fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffeffffffff0000000000000000ffffffff",
            "ffffffffffffffffffffffffffffffffffffffffffffffffc7634d81f4372ddf581a0db248b0a77aecec196accc52973",
            "b3312fa7e23ee7e4988e056be3f82d19181d9c6efe8141120314088f5013875ac656398d8a2ed19d2a85c8edd3ec2aef",
            "aa87ca22be8b05378eb1c71ef320ad746e1d3b628ba79b9859f741e082542a385502f25dbf55296c3a545e3872760ab7",
            "3617de4a96262c6f5d9e98bf9292dc29f8f41dbd289a147ce9da3113b5f0b8c00a60b1ce1d7e819d7a431d7c90ea0e5f",
        );
        curveTable = {
            "P-256": p256,
            prime256v1: p256,
            secp256r1: p256,
            "P-384": p384,
            secp384r1: p384,
        };
    }
    const c = curveTable[name];
    if (!c)
        throw cryptoError(
            "Unsupported curve " + name,
            "ERR_CRYPTO_INVALID_CURVE",
        );
    return c;
}
function infinity(c) {
    return [c.F.element(), c.F.element(), c.F.element()];
}
function pointDouble(c, P) {
    const F = c.F,
        [X, Y, Z] = P;
    if (limbsIsZero(Z)) return infinity(c);
    const zz = F.mul(Z, Z, F.element()),
        yy = F.mul(Y, Y, F.element());
    const s = F.mul(X, yy, F.element());
    F.add(s, s, s);
    F.add(s, s, s); // 4 X Y^2
    const u = F.sub(X, zz, F.element()),
        m = F.add(X, zz, F.element());
    F.mul(u, m, m);
    F.add(m, F.add(m, m, u), m); // 3 (X - Z^2)(X + Z^2)
    const x3 = F.mul(m, m, F.element());
    F.sub(x3, s, x3);
    F.sub(x3, s, x3);
    const y3 = F.sub(s, x3, F.element());
    F.mul(m, y3, y3);
    F.mul(yy, yy, yy);
    F.add(yy, yy, yy);
    F.add(yy, yy, yy);
    F.add(yy, yy, yy); // 8 Y^4
    F.sub(y3, yy, y3);
    const z3 = F.mul(Y, Z, F.element());
    F.add(z3, z3, z3);
    return [x3, y3, z3];
}
function pointAdd(c, P, Q) {
    const F = c.F;
    if (limbsIsZero(P[2])) return Q;
    if (limbsIsZero(Q[2])) return P;
    const z1z1 = F.mul(P[2], P[2], F.element()),
        z2z2 = F.mul(Q[2], Q[2], F.element());
    const u1 = F.mul(P[0], z2z2, F.element()),
        u2 = F.mul(Q[0], z1z1, F.element());
    const s1 = F.mul(F.mul(P[1], Q[2], F.element()), z2z2, F.element()),
        s2 = F.mul(F.mul(Q[1], P[2], F.element()), z1z1, F.element());
    if (limbsCompare(u1, u2, F.n) === 0)
        return limbsCompare(s1, s2, F.n) === 0
            ? pointDouble(c, P)
            : infinity(c);
    const h = F.sub(u2, u1, F.element()),
        r = F.sub(s2, s1, F.element());
    const hh = F.mul(h, h, F.element()),
        hhh = F.mul(h, hh, F.element()),
        v = F.mul(u1, hh, F.element());
    const x3 = F.mul(r, r, F.element());
    F.sub(x3, hhh, x3);
    F.sub(x3, v, x3);
    F.sub(x3, v, x3);
    const y3 = F.sub(v, x3, F.element());
    F.mul(r, y3, y3);
    F.sub(y3, F.mul(s1, hhh, hhh), y3);
    const z3 = F.mul(P[2], Q[2], F.element());
    F.mul(z3, h, z3);
    return [x3, y3, z3];
}
/** Affine [x, y] in normal (not Montgomery) form, or null for infinity. */
function pointAffine(c, P) {
    const F = c.F;
    if (limbsIsZero(P[2])) return null;
    const zi = F.invert(P[2]),
        zi2 = F.mul(zi, zi, F.element());
    const x = F.mul(P[0], zi2, F.element()),
        y = F.mul(P[1], F.mul(zi2, zi, zi), F.element());
    return [F.fromMont(x), F.fromMont(y)];
}
/** k * P for big-endian scalar bytes (Montgomery ladder). */
function pointMultiply(c, k, P) {
    let r0 = infinity(c),
        r1 = P;
    for (let i = k.length * 8 - 1; i >= 0; i--) {
        if (bitOf(k, i)) {
            r0 = pointAdd(c, r0, r1);
            r1 = pointDouble(c, r1);
        } else {
            r1 = pointAdd(c, r0, r1);
            r0 = pointDouble(c, r0);
        }
    }
    return r0;
}
/** u1 * G + u2 * Q (Shamir's trick, for public inputs only). */
function pointMultiplyTwo(c, u1, u2, Q) {
    const GQ = pointAdd(c, c.g, Q);
    let r = infinity(c);
    for (let i = Math.max(u1.length, u2.length) * 8 - 1; i >= 0; i--) {
        r = pointDouble(c, r);
        const a = bitOf(u1, i),
            b = bitOf(u2, i);
        if (a && b) r = pointAdd(c, r, GQ);
        else if (a) r = pointAdd(c, r, c.g);
        else if (b) r = pointAdd(c, r, Q);
    }
    return r;
}
/** x^3 - 3x + b for a Montgomery-form x. */
function curveRight(c, x) {
    const F = c.F,
        r = F.mul(x, x, F.element());
    F.mul(r, x, r);
    const x3 = F.add(x, F.add(x, x, F.element()), F.element());
    F.sub(r, x3, r);
    return F.add(r, c.b, r);
}
function invalidPoint(message) {
    return cryptoError(message, "ERR_CRYPTO_INVALID_KEY");
}
/** Decode an uncompressed (04) or compressed (02/03) point, check that it lies on the curve, and return it in Jacobian form. */
function decodePointOn(c, bytes) {
    const F = c.F,
        size = c.size;
    bytes = bytesOf(bytes);
    let x, y;
    if (bytes.length === 1 + 2 * size && bytes[0] === 4) {
        x = F.fromBytes(bytes.subarray(1, 1 + size));
        y = F.fromBytes(bytes.subarray(1 + size));
        if (!x || !y) throw invalidPoint("Invalid EC point");
        x = F.toMont(x);
        y = F.toMont(y);
        if (limbsCompare(F.mul(y, y, F.element()), curveRight(c, x), F.n))
            throw invalidPoint("EC point is not on the curve");
    } else if (
        bytes.length === 1 + size &&
        (bytes[0] === 2 || bytes[0] === 3)
    ) {
        x = F.fromBytes(bytes.subarray(1));
        if (!x) throw invalidPoint("Invalid EC point");
        x = F.toMont(x);
        const right = curveRight(c, x);
        y = F.pow(right, c.sqrtExponent);
        if (limbsCompare(F.mul(y, y, F.element()), right, F.n))
            throw invalidPoint("EC point is not on the curve");
        if ((F.fromMont(y)[0] & 1) !== (bytes[0] & 1))
            y = F.sub(F.element(), y, y);
    } else throw invalidPoint("Invalid EC point encoding");
    return [x, y, new Float64Array(F.one)];
}
/** Validate an encoded EC point; returns its uncompressed encoding. */
export function decodePoint(curveName, bytes) {
    const c = curveOf(curveName),
        P = decodePointOn(c, bytes);
    return encodePoint(c, [c.F.fromMont(P[0]), c.F.fromMont(P[1])]);
}
function encodePoint(c, affine) {
    return concatBytes(
        new Uint8Array([4]),
        c.F.toBytes(affine[0]),
        c.F.toBytes(affine[1]),
    );
}
function scalarOf(c, privateKey) {
    const d = c.N.fromBytes(privateKey);
    if (!d || limbsIsZero(d))
        throw cryptoError("Invalid EC private key", "ERR_CRYPTO_INVALID_KEY");
    return c.N.toBytes(d);
}
/** The uncompressed public point of a private scalar (big-endian bytes). */
export function ecdhPublicKey(curveName, privateKey) {
    const c = curveOf(curveName);
    return encodePoint(
        c,
        pointAffine(c, pointMultiply(c, scalarOf(c, privateKey), c.g)),
    );
}
export function ecdhGenerateKeyPair(curveName) {
    const c = curveOf(curveName);
    for (;;) {
        const privateKey = new Uint8Array(randomBytes(c.size));
        const d = c.N.fromBytes(privateKey);
        if (d && !limbsIsZero(d))
            return {
                privateKey,
                publicKey: ecdhPublicKey(curveName, privateKey),
            };
    }
}
/** The x coordinate of d * Q; throws when the peer point is invalid. */
export function ecdhSharedSecret(curveName, privateKey, peerPublicKey) {
    const c = curveOf(curveName);
    const shared = pointAffine(
        c,
        pointMultiply(
            c,
            scalarOf(c, privateKey),
            decodePointOn(c, peerPublicKey),
        ),
    );
    if (!shared) throw invalidPoint("Invalid EC public key");
    return c.F.toBytes(shared[0]);
}
/** Parse a DER ECDSA-Sig-Value (SEQUENCE of two positive INTEGERs) into [r, s] bytes, or null. */
function ecdsaSignature(bytes) {
    try {
        const sequence = derRead(bytes);
        if (sequence.tag !== 0x30 || sequence.end !== bytes.length) return null;
        const items = derChildren(bytes, sequence);
        if (items.length !== 2 || items[0].tag !== 2 || items[1].tag !== 2)
            return null;
        return [derPositive(bytes, items[0]), derPositive(bytes, items[1])];
    } catch {
        return null;
    }
}
/** Verify a DER-encoded ECDSA signature over message; publicKey is the encoded point. */
export function verifyEcdsa(curveName, publicKey, hash, message, signature) {
    const c = curveOf(curveName),
        N = c.N;
    let Q;
    try {
        Q = decodePointOn(c, publicKey);
    } catch {
        return false;
    }
    const rs = ecdsaSignature(bytesOf(signature));
    if (!rs) return false;
    const r = N.fromBytes(rs[0]),
        s = N.fromBytes(rs[1]);
    if (!r || !s || limbsIsZero(r) || limbsIsZero(s)) return false;
    // The leftmost bits of the hash (both orders have a whole number of bytes).
    const h = digest(hash, message);
    const e = limbsFromBytes(h.subarray(0, Math.min(h.length, c.size)), N.n);
    if (limbsCompare(e, N.m, N.n) >= 0) limbsSub(e, N.m, e, N.n);
    // mul(normal, Montgomery form) yields the normal product.
    const w = N.invert(N.toMont(s));
    const u1 = N.toBytes(N.mul(e, w, N.element())),
        u2 = N.toBytes(N.mul(r, w, N.element()));
    const R = pointAffine(c, pointMultiplyTwo(c, u1, u2, Q));
    if (!R) return false;
    const x = R[0];
    if (limbsCompare(x, N.m, N.n) >= 0) limbsSub(x, N.m, x, N.n);
    return limbsCompare(x, r, N.n) === 0;
}

// -------------------------------------------------------------------- RSA

const digestInfoPrefixes = {
    sha256: "3031300d060960864801650304020105000420",
    sha384: "3041300d060960864801650304020205000430",
    sha512: "3051300d060960864801650304020305000440",
};
function hexBytes(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++)
        out[i] = parseInt(hex.substr(2 * i, 2), 16);
    return out;
}
/** RSAVP1 (s^e mod n) for publicKey { n, e } as big-endian bytes; null when the signature is out of range. */
function rsaOpen(publicKey, signature) {
    const n = stripZeros(bytesOf(publicKey.n)),
        e = stripZeros(bytesOf(publicKey.e));
    signature = bytesOf(signature);
    if (
        !(n[n.length - 1] & 1) ||
        n.length < 64 ||
        signature.length !== n.length
    )
        return null;
    const F = new MontgomeryField(n),
        s = F.fromBytes(signature);
    if (!s) return null;
    return F.toBytes(F.fromMont(F.pow(F.toMont(s), e)));
}
/** RSASSA-PKCS1-v1_5 verification (RFC 8017 §8.2.2); publicKey is { n, e }. */
export function verifyRsaPkcs1(publicKey, hash, message, signature) {
    const prefix = digestInfoPrefixes[hash];
    if (!prefix) return false;
    const em = rsaOpen(publicKey, signature);
    if (em === null) return false;
    const k = em.length,
        t = concatBytes(hexBytes(prefix), digest(hash, message));
    if (k < t.length + 11) return false;
    const expected = new Uint8Array(k);
    expected[1] = 1;
    expected.fill(0xff, 2, k - t.length - 1);
    expected.set(t, k - t.length);
    return constantTimeEqual(em, expected);
}
function mgf1(hash, seed, length) {
    const out = new Uint8Array(length),
        hashLen = hashLength(hash);
    for (let counter = 0, at = 0; at < length; counter++, at += hashLen) {
        const block = digest(
            hash,
            concatBytes(
                seed,
                new Uint8Array([
                    counter >>> 24,
                    counter >>> 16,
                    counter >>> 8,
                    counter,
                ]),
            ),
        );
        out.set(block.subarray(0, Math.min(hashLen, length - at)), at);
    }
    return out;
}
/** RSASSA-PSS verification with MGF1 over the same hash (RFC 8017 §8.1.2, §9.1.2). */
export function verifyRsaPss(publicKey, hash, message, signature, saltLength) {
    const hLen = hashLength(hash);
    if (saltLength === undefined) saltLength = hLen;
    const em0 = rsaOpen(publicKey, signature);
    if (em0 === null) return false;
    const emBits = bytesBitLength(stripZeros(bytesOf(publicKey.n))) - 1,
        emLen = Math.ceil(emBits / 8);
    if (emLen < hLen + saltLength + 2) return false;
    if (em0.length > emLen && em0[0] !== 0) return false;
    const em = em0.subarray(em0.length - emLen);
    if (em[emLen - 1] !== 0xbc) return false;
    const maskedDb = em.subarray(0, emLen - hLen - 1),
        h = em.subarray(emLen - hLen - 1, emLen - 1);
    const topMask = 0xff >> (8 * emLen - emBits);
    if (maskedDb[0] & ~topMask & 0xff) return false;
    const db = mgf1(hash, h, maskedDb.length);
    for (let i = 0; i < db.length; i++) db[i] ^= maskedDb[i];
    db[0] &= topMask;
    const psLength = emLen - hLen - saltLength - 2;
    for (let i = 0; i < psLength; i++) if (db[i] !== 0) return false;
    if (db[psLength] !== 1) return false;
    const salt = db.subarray(db.length - saltLength);
    const mHash = digest(hash, message);
    const hPrime = digest(hash, concatBytes(new Uint8Array(8), mHash, salt));
    return constantTimeEqual(hPrime, h);
}

/**
 * Verify a TLS 1.3 handshake signature (RFC 8446 §4.2.3) with a key parsed by
 * parseSubjectPublicKeyInfo. Returns false for unknown schemes or a scheme
 * that does not match the key.
 */
export function verifyTlsSignature(publicKey, scheme, message, signature) {
    const ecdsa = { 0x0403: ["P-256", "sha256"], 0x0503: ["P-384", "sha384"] }[
        scheme
    ];
    if (ecdsa)
        return (
            publicKey.type === "ec" &&
            publicKey.curve === ecdsa[0] &&
            verifyEcdsa(ecdsa[0], publicKey.key, ecdsa[1], message, signature)
        );
    const pss = {
        0x0804: "sha256",
        0x0805: "sha384",
        0x0806: "sha512",
        0x0809: "sha256",
        0x080a: "sha384",
        0x080b: "sha512",
    }[scheme];
    if (pss) {
        const wanted = scheme < 0x0809 ? "rsa" : "rsa-pss";
        return (
            publicKey.type === wanted &&
            verifyRsaPss(publicKey, pss, message, signature)
        );
    }
    const pkcs1 = { 0x0401: "sha256", 0x0501: "sha384", 0x0601: "sha512" }[
        scheme
    ];
    if (pkcs1)
        return (
            publicKey.type === "rsa" &&
            verifyRsaPkcs1(publicKey, pkcs1, message, signature)
        );
    return false;
}

// -------------------------------------------------------------------- DER

function derError(message) {
    return cryptoError("Invalid DER: " + message, "ERR_NONA_DER");
}
/**
 * Read the TLV that starts at offset: { tag (first identifier byte), cls,
 * constructed, number, offset, start (of the value), length, end }.
 */
export function derRead(bytes, offset = 0, limit = bytes.length) {
    if (offset >= limit) throw derError("truncated");
    const tag = bytes[offset];
    let at = offset + 1,
        number = tag & 0x1f;
    if (number === 0x1f) {
        number = 0;
        let b;
        do {
            if (at >= limit) throw derError("truncated tag");
            b = bytes[at++];
            number = number * 128 + (b & 0x7f);
        } while (b & 0x80);
    }
    if (at >= limit) throw derError("truncated length");
    let length = bytes[at++];
    if (length & 0x80) {
        const count = length & 0x7f;
        if (count === 0 || count > 4) throw derError("unsupported length");
        if (at + count > limit) throw derError("truncated length");
        length = 0;
        for (let i = 0; i < count; i++) length = length * 256 + bytes[at++];
        if (length < 128 || (count > 1 && bytes[at - count] === 0))
            throw derError("non-minimal length");
    }
    if (at + length > limit) throw derError("value runs past its container");
    return {
        tag,
        cls: tag >> 6,
        constructed: (tag & 0x20) !== 0,
        number,
        offset,
        start: at,
        length,
        end: at + length,
    };
}
/** The TLVs inside a constructed value. */
export function derChildren(bytes, node) {
    const items = [];
    for (let at = node.start; at < node.end;) {
        const item = derRead(bytes, at, node.end);
        items.push(item);
        at = item.end;
    }
    return items;
}
export function derValue(bytes, node) {
    return bytes.subarray(node.start, node.end);
}
/** The whole encoding of a TLV (header included), for example to hash a TBSCertificate. */
export function derEncoding(bytes, node) {
    return bytes.subarray(node.offset, node.end);
}
/** A two's-complement INTEGER as a BigInt. */
export function derInteger(bytes, node) {
    const value = derValue(bytes, node);
    if (value.length === 0) throw derError("empty INTEGER");
    if (
        value.length > 1 &&
        ((value[0] === 0 && !(value[1] & 0x80)) ||
            (value[0] === 0xff && value[1] & 0x80))
    )
        throw derError("non-minimal INTEGER");
    const magnitude = bytesToBigInt(value);
    return value[0] & 0x80
        ? magnitude - (1n << BigInt(value.length * 8))
        : magnitude;
}
/** The bytes of a non-negative INTEGER without the leading zero. */
export function derUnsigned(bytes, node) {
    return stripZeros(derValue(bytes, node));
}
/** The magnitude bytes of a minimally encoded positive INTEGER; throws otherwise. */
export function derPositive(bytes, node) {
    const value = derValue(bytes, node);
    if (
        node.tag !== 2 ||
        value.length === 0 ||
        value[0] & 0x80 ||
        (value.length > 1 && value[0] === 0 && !(value[1] & 0x80))
    )
        throw derError("expected a positive INTEGER");
    const magnitude = stripZeros(value);
    if (magnitude.length === 1 && magnitude[0] === 0)
        throw derError("expected a positive INTEGER");
    return magnitude;
}
export function derBoolean(bytes, node) {
    if (node.length !== 1) throw derError("bad BOOLEAN");
    return bytes[node.start] !== 0;
}
export function derOid(bytes, node) {
    const value = derValue(bytes, node);
    if (value.length === 0) throw derError("empty OBJECT IDENTIFIER");
    const parts = [];
    let n = 0;
    for (let i = 0; i < value.length; i++) {
        n = n * 128 + (value[i] & 0x7f);
        if (!(value[i] & 0x80)) {
            if (parts.length === 0) {
                const first = n < 40 ? 0 : n < 80 ? 1 : 2;
                parts.push(first, n - 40 * first);
            } else parts.push(n);
            n = 0;
        } else if (i === value.length - 1)
            throw derError("truncated OBJECT IDENTIFIER");
    }
    return parts.join(".");
}
/** A BIT STRING as { unusedBits, bytes }. */
export function derBitString(bytes, node) {
    const value = derValue(bytes, node);
    if (value.length === 0 || value[0] > 7) throw derError("bad BIT STRING");
    return { unusedBits: value[0], bytes: value.subarray(1) };
}
/** UTCTime or GeneralizedTime (Z form) as milliseconds since the epoch. */
export function derTime(bytes, node) {
    let text = "";
    for (let i = node.start; i < node.end; i++)
        text += String.fromCharCode(bytes[i]);
    let match, year;
    if (node.tag === 0x17) {
        match = /^(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?Z$/.exec(text);
        if (!match) throw derError("bad UTCTime");
        year = Number(match[1]);
        year += year < 50 ? 2000 : 1900;
    } else if (node.tag === 0x18) {
        match = /^(\d\d\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(?:\.\d+)?Z$/.exec(
            text,
        );
        if (!match) throw derError("bad GeneralizedTime");
        year = Number(match[1]);
    } else throw derError("not a time");
    return Date.UTC(
        year,
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        Number(match[6] || 0),
    );
}
/** The text of a string type (UTF8String, PrintableString, IA5String, BMPString, ...). */
export function derString(bytes, node) {
    const value = derValue(bytes, node);
    if (node.tag === 0x0c) return new TextDecoder().decode(value);
    let text = "";
    if (node.tag === 0x1e) {
        for (let i = 0; i + 1 < value.length; i += 2)
            text += String.fromCharCode((value[i] << 8) | value[i + 1]);
        return text;
    }
    for (let i = 0; i < value.length; i++)
        text += String.fromCharCode(value[i]);
    return text;
}

const curveOids = {
    "1.2.840.10045.3.1.7": "P-256",
    "1.3.132.0.34": "P-384",
    "1.3.132.0.35": "P-521",
};
/**
 * Parse a DER SubjectPublicKeyInfo. Returns { type: "rsa" | "rsa-pss", n, e,
 * bits } (n and e as big-endian bytes), { type: "ec", curve, point } (the
 * uncompressed point, validated on the curve for P-256 and P-384), or
 * { type } for other algorithms; every result has the algorithm OID and the
 * raw key bits (key).
 */
export function parseSubjectPublicKeyInfo(der) {
    der = bytesOf(der);
    const spki = derRead(der);
    if (spki.tag !== 0x30)
        throw derError("SubjectPublicKeyInfo is not a SEQUENCE");
    const [algorithm, keyBits] = derChildren(der, spki);
    if (
        !algorithm ||
        algorithm.tag !== 0x30 ||
        !keyBits ||
        keyBits.tag !== 0x03
    )
        throw derError("bad SubjectPublicKeyInfo");
    const params = derChildren(der, algorithm);
    if (params[0]?.tag !== 0x06) throw derError("bad AlgorithmIdentifier");
    const oid = derOid(der, params[0]);
    const bits = derBitString(der, keyBits);
    if (bits.unusedBits !== 0) throw derError("public key has unused bits");
    const key = bits.bytes;
    if (oid === "1.2.840.113549.1.1.1" || oid === "1.2.840.113549.1.1.10") {
        const sequence = derRead(key);
        const [n, e] = sequence.tag === 0x30 ? derChildren(key, sequence) : [];
        if (!n || !e || n.tag !== 2 || e.tag !== 2)
            throw derError("bad RSAPublicKey");
        const modulus = derPositive(key, n);
        return {
            type: oid.endsWith(".1") ? "rsa" : "rsa-pss",
            algorithm: oid,
            n: modulus,
            e: derPositive(key, e),
            bits: bytesBitLength(modulus),
            key,
        };
    }
    if (oid === "1.2.840.10045.2.1") {
        if (params[1]?.tag !== 0x06)
            throw derError("EC parameters must be a named curve");
        const curveOid = derOid(der, params[1]),
            curveName = curveOids[curveOid];
        const result = {
            type: "ec",
            algorithm: oid,
            curve: curveName || curveOid,
            key,
        };
        if (curveName === "P-256" || curveName === "P-384")
            result.point = decodePoint(curveName, key);
        return result;
    }
    const names = { "1.3.101.112": "ed25519", "1.3.101.113": "ed448" };
    return { type: names[oid] || "unknown", algorithm: oid, key };
}
