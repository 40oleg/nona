import { test } from "node:test";
import assert from "node:assert/strict";
import {
    constants,
    createCipheriv,
    createECDH,
    createHash,
    createHmac,
    createPrivateKey,
    createPublicKey,
    diffieHellman,
    generateKeyPairSync,
    hkdfSync,
    randomBytes,
    sign,
    type KeyObject,
} from "node:crypto";
import { runModulesOnHost } from "./helpers/host.js";

// The cryptographic primitives of the TLS client (nona:internal/tls-crypto,
// issue #301). Node.js has no such module, so each test runs a program in
// Nona that prints its results as JSON and compares them with published
// test vectors and with values computed here by Node's crypto.

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const unhex = (text: string) => Buffer.from(text, "hex");
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const range = (from: number, to: number) =>
    hex(Uint8Array.from({ length: to - from + 1 }, (_, i) => from + i));

/** Run a module program that imports the primitives as `t` and prints one JSON value. */
// The programs run without gcStress: the arithmetic allocates field
// elements in its inner loops and would take minutes.
function runTls(body: string): any {
    const source =
        "import * as t from 'nona:internal/tls-crypto';\n" +
        "const hex = (b) => Array.from(b, (x) => (x < 16 ? '0' : '') + x.toString(16)).join('');\n" +
        "const unhex = (s) => new Uint8Array((s.match(/../g) || []).map((x) => parseInt(x, 16)));\n" +
        body;
    const { native } = runModulesOnHost({ "main.mjs": source }, "main.mjs", {
        gcStress: false,
        oracleSource: "",
    });
    assert.equal(native.status, 0, native.stderr + String(native.error));
    return JSON.parse(native.stdout);
}

/** HKDF-Expand-Label (RFC 8446 §7.1) computed with Node's HMAC, as a reference. */
function expandLabel(
    hash: string,
    secret: Uint8Array,
    label: string,
    context: Uint8Array,
    length: number,
) {
    const full = Buffer.from("tls13 " + label);
    const info = Buffer.concat([
        Buffer.from([length >> 8, length & 255, full.length]),
        full,
        Buffer.from([context.length]),
        context,
    ]);
    let okm = Buffer.alloc(0),
        previous = Buffer.alloc(0);
    for (let i = 1; okm.length < length; i++) {
        previous = createHmac(hash, secret)
            .update(Buffer.concat([previous, info, Buffer.from([i])]))
            .digest();
        okm = Buffer.concat([okm, previous]);
    }
    return okm.subarray(0, length);
}

test("HKDF: RFC 5869 vectors, TLS 1.3 HKDF-Expand-Label and Derive-Secret", () => {
    const rfc5869 = [
        {
            ikm: "0b".repeat(22),
            salt: range(0, 12),
            info: range(0xf0, 0xf9),
            length: 42,
            prk: "077709362c2e32df0ddc3f0dc47bba6390b6c73bb50f9c3122ec844ad7c2b3e5",
            okm: "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865",
        },
        {
            ikm: range(0, 0x4f),
            salt: range(0x60, 0xaf),
            info: range(0xb0, 0xff),
            length: 82,
            prk: "06a6b88c5853361a06104c9ceb35b45cef760014904671014a193f40c15fc244",
            okm: "b11e398dc80327a1c8e7f78c596a49344f012eda2d4efad8a050cc4c19afa97c59045a99cac7827271cb41c65e590e09da3275600c2f09b8367793a9aca3db71cc30c58179ec3e87c14c01d5c1f3434f1d87",
        },
        {
            ikm: "0b".repeat(22),
            salt: "",
            info: "",
            length: 42,
            prk: "19ef24a32c717b167f33a91d6f648bdf96596776afdb6377ac434c1c293ccb04",
            okm: "8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8",
        },
    ];
    // The published vectors agree with Node.
    for (const v of rfc5869)
        assert.equal(
            hex(
                new Uint8Array(
                    hkdfSync(
                        "sha256",
                        unhex(v.ikm),
                        unhex(v.salt),
                        unhex(v.info),
                        v.length,
                    ),
                ),
            ),
            v.okm,
        );
    const secret = randomBytes(48),
        context = randomBytes(48);
    const result = runTls(`
const vectors = ${JSON.stringify(rfc5869)};
const out = { rfc5869: [] };
for (const v of vectors) {
  const prk = t.hkdfExtract('sha256', unhex(v.salt), unhex(v.ikm));
  out.rfc5869.push([hex(prk), hex(t.hkdfExpand('sha256', prk, unhex(v.info), v.length))]);
}
// RFC 8448 §3: the early secret without a PSK and the "derived" secret.
const early = t.hkdfExtract('sha256', new Uint8Array(0), new Uint8Array(32));
out.early = hex(early);
out.derived = hex(t.deriveSecret('sha256', early, 'derived', new Uint8Array(0)));
out.label256 = hex(t.hkdfExpandLabel('sha256', unhex('${hex(secret.subarray(0, 32))}'), 'key', new Uint8Array(0), 16));
out.label384 = hex(t.hkdfExpandLabel('sha384', unhex('${hex(secret)}'), 'c hs traffic', unhex('${hex(context)}'), 48));
out.secret384 = hex(t.deriveSecret('sha384', unhex('${hex(secret)}'), 's ap traffic', t.concatBytes(unhex('01'), unhex('0203'))));
try { t.hkdfExpand('sha256', early, '', 255 * 32 + 1); } catch (e) { out.tooLong = e.code; }
console.log(JSON.stringify(out));
`);
    assert.deepEqual(
        result.rfc5869,
        rfc5869.map((v) => [v.prk, v.okm]),
    );
    assert.equal(
        result.early,
        "33ad0a1c607ec03b09e6cd9893680ce210adf300aa1f2660e1b22e10f170f92a",
    );
    assert.equal(
        result.derived,
        "6f2615a108c702c5678f54fc9dbab69716c076189c48250cebeac3576c3611ba",
    );
    assert.equal(
        result.label256,
        hex(
            expandLabel(
                "sha256",
                secret.subarray(0, 32),
                "key",
                Buffer.alloc(0),
                16,
            ),
        ),
    );
    assert.equal(
        result.label384,
        hex(expandLabel("sha384", secret, "c hs traffic", context, 48)),
    );
    const transcript = createHash("sha384")
        .update(Buffer.from([1, 2, 3]))
        .digest();
    assert.equal(
        result.secret384,
        hex(expandLabel("sha384", secret, "s ap traffic", transcript, 48)),
    );
    assert.equal(result.tooLong, "ERR_CRYPTO_INVALID_KEYLEN");
});

test("node:crypto hkdfSync and hkdf match Node.js", () => {
    const source = String.raw`
import crypto from 'node:crypto';
const show = (value) => console.log(Buffer.from(value).toString('hex'), value instanceof ArrayBuffer);
show(crypto.hkdfSync('sha256', 'secret', 'salt', 'info', 64));
show(crypto.hkdfSync('sha384', Buffer.from('ikm'), new Uint8Array(0), '', 100));
show(crypto.hkdfSync('sha512', new Uint8Array([1, 2, 3]).buffer, 'salt', Buffer.from('ctx'), 16));
show(crypto.hkdfSync('SHA1', 'k', 's', 'i', 20));
for (const args of [['nope', 'a', 'b', 'c', 10], ['sha256', 'a', 'b', 'c', 255 * 32 + 1], ['sha256', 'a', 'b', 'x'.repeat(1025), 10], ['sha256', 'a', 'b', 'c', -1], ['sha256', 1, 'b', 'c', 1], ['sha256', 'a', 'b', 'c', '1']])
  try { crypto.hkdfSync(...args); } catch (e) { console.log(e.name, e.code, e.message); }
try { crypto.hkdf('sha256', 'a', 'b', 'c', 1); } catch (e) { console.log(e.name, e.code); }
crypto.hkdf('sha256', 'key', 'salt', 'info', 33, (error, key) => { console.log('async', error, Buffer.from(key).toString('hex')); });
console.log('sync first');
`;
    const { native, oracle } = runModulesOnHost(
        { "main.mjs": source },
        "main.mjs",
        // Hashing allocates on every block, far too slow under gcStress.
        { gcStress: false },
    );
    assert.equal(native.status, 0, native.stderr);
    assert.equal(native.stdout, oracle);
});

const nistGcm = (() => {
    const p =
        "d9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b391aafd255";
    const k = "feffe9928665731c6d6a8f9467308308",
        iv = "cafebabefacedbaddecaf888",
        aad = "feedfacedeadbeeffeedfacedeadbeefabaddad2";
    return [
        // The AES-128 and AES-256 test cases 1-4 and 13-16 of the GCM specification.
        [
            "aes-128-gcm",
            "00".repeat(16),
            "00".repeat(12),
            "",
            "",
            "58e2fccefa7e3061367f1d57a4e7455a",
        ],
        [
            "aes-128-gcm",
            "00".repeat(16),
            "00".repeat(12),
            "00".repeat(16),
            "",
            "ab6e47d42cec13bdf53a67b21257bddf",
        ],
        ["aes-128-gcm", k, iv, p, "", "4d5c2af327cd64a62cf35abd2ba6fab4"],
        [
            "aes-128-gcm",
            k,
            iv,
            p.slice(0, 120),
            aad,
            "5bc94fbc3221a5db94fae95ae7121a47",
        ],
        [
            "aes-256-gcm",
            "00".repeat(32),
            "00".repeat(12),
            "",
            "",
            "530f8afbc74536b9a963b4f1c4cb738b",
        ],
        [
            "aes-256-gcm",
            "00".repeat(32),
            "00".repeat(12),
            "00".repeat(16),
            "",
            "d0d1c8a799996bf0265b98b5d48ab919",
        ],
        ["aes-256-gcm", k + k, iv, p, "", "b094dac5d93471bdec1a502270e3cc6c"],
        [
            "aes-256-gcm",
            k + k,
            iv,
            p.slice(0, 120),
            aad,
            "76fc6ece0f4e1768cddf8853bb2d551b",
        ],
    ];
})();

function nodeSeal(
    name: string,
    key: Uint8Array,
    iv: Uint8Array,
    plaintext: Uint8Array,
    aad: Uint8Array,
) {
    const cipher = createCipheriv(name as "aes-128-gcm", key, iv, {
        authTagLength: 16,
    });
    cipher.setAAD(aad);
    return hex(
        Buffer.concat([
            cipher.update(plaintext),
            cipher.final(),
            cipher.getAuthTag(),
        ]),
    );
}

test("AEADs: GCM spec, RFC 8439 and Node vectors; open rejects a bad tag", () => {
    const vectors: {
        name: string;
        key: string;
        iv: string;
        plaintext: string;
        aad: string;
    }[] = [];
    for (const [name, key, iv, plaintext, aad, tag] of nistGcm) {
        vectors.push({
            name: name!,
            key: key!,
            iv: iv!,
            plaintext: plaintext!,
            aad: aad!,
        });
        // The published tag agrees with Node.
        assert.equal(
            nodeSeal(
                name!,
                unhex(key!),
                unhex(iv!),
                unhex(plaintext!),
                unhex(aad!),
            ).slice(-32),
            tag,
        );
    }
    // RFC 8439 §2.8.2.
    const sunscreen = Buffer.from(
        "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.",
    );
    vectors.push({
        name: "chacha20-poly1305",
        key: range(0x80, 0x9f),
        iv: "070000004041424344454647",
        plaintext: hex(sunscreen),
        aad: "50515253c0c1c2c3c4c5c6c7",
    });
    for (const name of ["aes-128-gcm", "aes-256-gcm", "chacha20-poly1305"])
        for (const length of [0, 1, 15, 16, 17, 63, 64, 65, 255, 1000, 16400]) {
            const ivLength =
                name.startsWith("aes") && length === 17
                    ? 8
                    : name.startsWith("aes") && length === 65
                      ? 60
                      : 12;
            vectors.push({
                name,
                key: hex(randomBytes(name === "aes-128-gcm" ? 16 : 32)),
                iv: hex(randomBytes(ivLength)),
                plaintext: hex(randomBytes(length)),
                aad: hex(randomBytes(length % 29)),
            });
        }
    const expected = vectors.map((v) =>
        nodeSeal(
            v.name,
            unhex(v.key),
            unhex(v.iv),
            unhex(v.plaintext),
            unhex(v.aad),
        ),
    );
    assert.equal(
        expected[nistGcm.length]!.slice(-32),
        "1ae10b594f09e26a7e902ecbd0600691",
    );
    const result = runTls(`
const vectors = ${JSON.stringify(vectors)};
const out = { sealed: [], opened: [], tampered: [] };
for (const v of vectors) {
  const aead = t.createAead(v.name, unhex(v.key));
  const sealed = aead.seal(unhex(v.iv), unhex(v.plaintext), unhex(v.aad));
  out.sealed.push(hex(sealed));
  const opened = aead.open(unhex(v.iv), sealed, unhex(v.aad));
  out.opened.push(opened !== null && hex(opened) === v.plaintext);
  const bad = sealed.slice();
  bad[bad.length - 1 - (v.plaintext.length % 16)] ^= 0x10;
  const badAad = unhex(v.aad + '00');
  out.tampered.push([aead.open(unhex(v.iv), bad, unhex(v.aad)), aead.open(unhex(v.iv), sealed, badAad), aead.open(unhex(v.iv), sealed.subarray(0, 15), unhex(v.aad))]);
}
// FIPS-197 C.1 and C.3, and RFC 8439 §2.5.2.
out.aes128 = hex(t.aesEncrypt(unhex('${range(0, 15)}'), unhex('00112233445566778899aabbccddeeff')));
out.aes256 = hex(t.aesEncrypt(unhex('${range(0, 31)}'), unhex('00112233445566778899aabbccddeeff')));
out.poly1305 = hex(t.poly1305(unhex('85d6be7857556d337f4452fe42d506a80103808afb0db2fd4abff6af4149f51b'), 'Cryptographic Forum Research Group'));
try { t.createAead('aes-128-gcm', new Uint8Array(15)); } catch (e) { out.badKey = e.name; }
console.log(JSON.stringify(out));
`);
    assert.deepEqual(result.sealed, expected);
    assert.ok(result.opened.every(Boolean));
    assert.ok(
        result.tampered.every((row: unknown[]) =>
            row.every((value) => value === null),
        ),
    );
    assert.equal(result.aes128, "69c4e0d86a7b0430d8cdb78070b4c55a");
    assert.equal(result.aes256, "8ea2b7ca516745bfeafc49904b496089");
    assert.equal(result.poly1305, "a8061dc1305136c6c22b8baf0c0127a9");
    assert.equal(result.badKey, "RangeError");
});

/** X25519 through Node's KeyObjects, from raw little-endian keys. */
function nodeX25519(privateKey: Uint8Array, publicKey: Uint8Array) {
    const peer = createPublicKey({
        key: { kty: "OKP", crv: "X25519", x: b64(publicKey) },
        format: "jwk",
    });
    const own = generateKeyPairSync("x25519").privateKey.export({
        format: "jwk",
    });
    const key = createPrivateKey({
        key: { ...own, d: b64(privateKey), x: own.x },
        format: "jwk",
    });
    return hex(diffieHellman({ privateKey: key, publicKey: peer }));
}

test("X25519 (RFC 7748) and P-256/P-384 ECDH match the RFC vectors and Node", () => {
    const rfc = {
        k1: "a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4",
        u1: "e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c",
        r1: "c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552",
        k2: "4b66e9d4d1b4673c5ad22691957d6af5c11b6421e0ea01d42ca4169e7918ba0d",
        u2: "e5210f12786811d3f4b7959d0538ae2c31dbe7106fc03c3efc4cd549c715a493",
        r2: "95cbde9476e8907d7aade45cb4b873f88b595a68799fa152e6f8f7647aac7957",
        alice: "77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a",
        alicePublic:
            "8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a",
        bob: "5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb",
        bobPublic:
            "de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f",
        shared: "4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742",
        once: "422c8e7a6227d7bca1350b3e2bb7279f7897b87bb6854b783c60e80311ae3079",
    };
    assert.equal(nodeX25519(unhex(rfc.k1), unhex(rfc.u1)), rfc.r1);
    assert.equal(nodeX25519(unhex(rfc.k2), unhex(rfc.u2)), rfc.r2);
    assert.equal(
        nodeX25519(unhex(rfc.alice), unhex(rfc.bobPublic)),
        rfc.shared,
    );
    const random = Array.from({ length: 4 }, (_, i) => {
        const k = randomBytes(32),
            u = randomBytes(32);
        if (i === 1) u[31]! |= 0x80; // the top bit is ignored
        return { k: hex(k), u: hex(u), r: nodeX25519(k, u) };
    });
    const ecdh = ["P-256", "P-384"].map((curve) => {
        const node = createECDH(curve === "P-256" ? "prime256v1" : "secp384r1");
        node.generateKeys();
        const notOnCurve = Buffer.from(node.getPublicKey());
        notOnCurve[notOnCurve.length - 1]! ^= 1;
        return {
            curve,
            privateKey: hex(node.getPrivateKey()),
            publicKey: hex(node.getPublicKey()),
            compressed: hex(node.getPublicKey(null, "compressed")),
            notOnCurve: hex(notOnCurve),
            node,
        };
    });
    const result = runTls(`
const rfc = ${JSON.stringify(rfc)}, random = ${JSON.stringify(random)};
const ecdh = ${JSON.stringify(ecdh.map(({ node, ...rest }) => rest))};
const out = {};
out.r1 = hex(t.x25519(unhex(rfc.k1), unhex(rfc.u1)));
out.r2 = hex(t.x25519(unhex(rfc.k2), unhex(rfc.u2)));
out.alicePublic = hex(t.x25519PublicKey(unhex(rfc.alice)));
out.bobPublic = hex(t.x25519PublicKey(unhex(rfc.bob)));
out.shared = [hex(t.x25519SharedSecret(unhex(rfc.alice), unhex(rfc.bobPublic))), hex(t.x25519SharedSecret(unhex(rfc.bob), unhex(rfc.alicePublic)))];
const nine = new Uint8Array(32); nine[0] = 9;
out.once = hex(t.x25519(nine, nine));
out.random = random.map((v) => hex(t.x25519(unhex(v.k), unhex(v.u))));
try { t.x25519SharedSecret(unhex(rfc.alice), new Uint8Array(32)); } catch (e) { out.smallOrder = e.code; }
const pair = t.x25519GenerateKeyPair();
out.pair = [pair.privateKey.length, hex(pair.publicKey) === hex(t.x25519PublicKey(pair.privateKey))];
out.ecdh = ecdh.map((v) => {
  const own = t.ecdhGenerateKeyPair(v.curve);
  const r = {
    publicKey: hex(t.ecdhPublicKey(v.curve, unhex(v.privateKey))),
    ownPublic: hex(own.publicKey),
    shared: hex(t.ecdhSharedSecret(v.curve, own.privateKey, unhex(v.publicKey))),
    sharedCompressed: hex(t.ecdhSharedSecret(v.curve, own.privateKey, unhex(v.compressed))),
    decoded: hex(t.decodePoint(v.curve, unhex(v.compressed))),
  };
  for (const [name, key] of [['notOnCurve', v.notOnCurve], ['infinity', '00'], ['short', v.publicKey.slice(0, -2)], ['xTooLarge', '04' + 'ff'.repeat(v.publicKey.length / 2 - 1)]])
    try { t.ecdhSharedSecret(v.curve, own.privateKey, unhex(key)); r[name] = 'accepted'; } catch (e) { r[name] = e.code; }
  try { t.ecdhPublicKey(v.curve, new Uint8Array(v.privateKey.length / 2)); } catch (e) { r.zeroKey = e.code; }
  return r;
});
console.log(JSON.stringify(out));
`);
    assert.equal(result.r1, rfc.r1);
    assert.equal(result.r2, rfc.r2);
    assert.equal(result.alicePublic, rfc.alicePublic);
    assert.equal(result.bobPublic, rfc.bobPublic);
    assert.deepEqual(result.shared, [rfc.shared, rfc.shared]);
    assert.equal(result.once, rfc.once);
    assert.deepEqual(
        result.random,
        random.map((v) => v.r),
    );
    assert.equal(result.smallOrder, "ERR_CRYPTO_INVALID_KEY");
    assert.deepEqual(result.pair, [32, true]);
    ecdh.forEach((v, i) => {
        const r = result.ecdh[i];
        assert.equal(r.publicKey, v.publicKey, v.curve);
        const secret = hex(v.node.computeSecret(unhex(r.ownPublic)));
        assert.equal(r.shared, secret, v.curve);
        assert.equal(r.sharedCompressed, secret, v.curve);
        assert.equal(r.decoded, v.publicKey, v.curve);
        for (const name of [
            "notOnCurve",
            "infinity",
            "short",
            "xTooLarge",
            "zeroKey",
        ])
            assert.equal(
                r[name],
                "ERR_CRYPTO_INVALID_KEY",
                v.curve + " " + name,
            );
    });
});

test("ECDSA and RSA (PKCS#1 v1.5, PSS) verification, SPKI parsing and the DER reader", () => {
    const message = Buffer.from("TLS 1.3, server CertificateVerify");
    const spki = (key: KeyObject) =>
        hex(key.export({ type: "spki", format: "der" }));
    const cases: {
        kind: string;
        spki: string;
        curve?: string;
        hash: string;
        scheme: number;
        signature: string;
    }[] = [];
    for (const [curve, hashes] of [
        ["P-256", ["sha256", "sha384"]],
        ["P-384", ["sha384", "sha256"]],
    ] as const) {
        const { publicKey, privateKey } = generateKeyPairSync("ec", {
            namedCurve: curve,
        });
        for (const hash of hashes)
            cases.push({
                kind: "ecdsa",
                spki: spki(publicKey),
                curve,
                hash,
                scheme:
                    curve === "P-256" && hash === "sha256"
                        ? 0x0403
                        : curve === "P-384" && hash === "sha384"
                          ? 0x0503
                          : 0,
                signature: hex(sign(hash, message, privateKey)),
            });
    }
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
    for (const [hash, pkcs1, pss] of [
        ["sha256", 0x0401, 0x0804],
        ["sha384", 0x0501, 0x0805],
        ["sha512", 0x0601, 0x0806],
    ] as const) {
        cases.push({
            kind: "pkcs1",
            spki: spki(rsa.publicKey),
            hash,
            scheme: pkcs1,
            signature: hex(sign(hash, message, rsa.privateKey)),
        });
        cases.push({
            kind: "pss",
            spki: spki(rsa.publicKey),
            hash,
            scheme: pss,
            signature: hex(
                sign(hash, message, {
                    key: rsa.privateKey,
                    padding: constants.RSA_PKCS1_PSS_PADDING,
                    saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
                }),
            ),
        });
    }
    const rsaPss = (generateKeyPairSync as Function)("rsa-pss", {
        modulusLength: 2048,
        hashAlgorithm: "sha256",
        mgf1HashAlgorithm: "sha256",
        saltLength: 32,
    }) as { publicKey: KeyObject; privateKey: KeyObject };
    cases.push({
        kind: "pss",
        spki: spki(rsaPss.publicKey),
        hash: "sha256",
        scheme: 0x0809,
        signature: hex(
            sign("sha256", message, {
                key: rsaPss.privateKey,
                padding: constants.RSA_PKCS1_PSS_PADDING,
                saltLength: 32,
            }),
        ),
    });
    const rsaJwk = rsa.publicKey.export({ format: "jwk" });
    // SEQUENCE { INTEGER -129, INTEGER 2^63, OID sha256WithRSAEncryption,
    // BIT STRING (4 unused bits), UTCTime, GeneralizedTime, UTF8String,
    // PrintableString, BOOLEAN TRUE, [0] { NULL }, [31] (high tag number) }.
    const der =
        "3051" +
        "0202ff7f" +
        "0209008000000000000000" +
        "06092a864886f70d01010b" +
        "030204f0" +
        "170d3439313233313233353935395a" +
        "180f32303530303130313030303030305a" +
        "0c03c3a978" +
        "13024e6f" +
        "0101ff" +
        "a0020500" +
        "9f1f00";
    const result = runTls(`
const cases = ${JSON.stringify(cases)};
const message = ${JSON.stringify(message.toString())};
const out = { valid: [], tampered: [], wrongKey: [], tls: [], keys: [] };
for (const c of cases) {
  const key = t.parseSubjectPublicKeyInfo(unhex(c.spki));
  out.keys.push(key.type + ' ' + (key.curve || key.bits));
  const sig = unhex(c.signature), bad = sig.slice();
  bad[bad.length >> 1] ^= 1;
  const verify = (m, s, k = key) => c.kind === 'ecdsa' ? t.verifyEcdsa(c.curve, k.point, c.hash, m, s) : c.kind === 'pkcs1' ? t.verifyRsaPkcs1(k, c.hash, m, s) : t.verifyRsaPss(k, c.hash, m, s);
  out.valid.push(verify(message, sig));
  out.tampered.push([verify(message + '.', sig), verify(message, bad), verify(message, sig.subarray(1))]);
  out.tls.push(c.scheme ? [t.verifyTlsSignature(key, c.scheme, message, sig), t.verifyTlsSignature(key, c.scheme, message + '.', sig)] : null);
}
// The scheme must match the key type and curve.
const p256 = t.parseSubjectPublicKeyInfo(unhex(cases[0].spki)), rsa = t.parseSubjectPublicKeyInfo(unhex(cases[4].spki));
out.mismatch = [t.verifyTlsSignature(p256, 0x0503, message, unhex(cases[0].signature)), t.verifyTlsSignature(rsa, 0x0809, message, unhex(cases[5].signature)), t.verifyTlsSignature(rsa, 0x0201, message, unhex(cases[4].signature)), t.verifyEcdsa('P-256', p256.point, 'sha384', message, unhex(cases[0].signature))];
out.rsaKey = [hex(rsa.n), hex(rsa.e)];
// DER reader.
const der = unhex('${der}');
const root = t.derRead(der), items = t.derChildren(der, root);
out.der = [root.tag, root.length, items.length,
  String(t.derInteger(der, items[0])), String(t.derInteger(der, items[1])), hex(t.derPositive(der, items[1])),
  t.derOid(der, items[2]), t.derBitString(der, items[3]).unusedBits, hex(t.derBitString(der, items[3]).bytes),
  new Date(t.derTime(der, items[4])).toISOString(), new Date(t.derTime(der, items[5])).toISOString(),
  t.derString(der, items[6]), t.derString(der, items[7]), t.derBoolean(der, items[8]),
  items[9].cls, items[9].constructed, items[9].number, t.derChildren(der, items[9])[0].tag,
  items[10].cls, items[10].number, items[10].length, hex(t.derEncoding(der, items[2]))];
out.derErrors = [];
for (const bad of ['30', '3003020201', '308100', '3084ffffffff', '02020001', '0201', '3080020101']) {
  try { const n = t.derRead(unhex(bad)); t.derChildren(unhex(bad), n); if (n.tag === 2) t.derInteger(unhex(bad), n); out.derErrors.push('accepted'); } catch (e) { out.derErrors.push(e.code); }
}
try { t.derPositive(der, items[0]); } catch (e) { out.negative = e.code; }
console.log(JSON.stringify(out));
`);
    assert.deepEqual(
        result.keys,
        cases.map((c) =>
            c.kind === "ecdsa"
                ? "ec " + c.curve
                : (c.scheme === 0x0809 ? "rsa-pss" : "rsa") + " 2048",
        ),
    );
    assert.ok(result.valid.every(Boolean), JSON.stringify(result.valid));
    assert.ok(
        result.tampered.every((row: boolean[]) => row.every((v) => !v)),
        JSON.stringify(result.tampered),
    );
    result.tls.forEach((row: boolean[] | null, i: number) =>
        assert.deepEqual(row, cases[i]!.scheme ? [true, false] : null),
    );
    assert.deepEqual(result.mismatch, [false, false, false, false]);
    assert.deepEqual(result.rsaKey, [
        hex(Buffer.from(rsaJwk.n!, "base64url")),
        hex(Buffer.from(rsaJwk.e!, "base64url")),
    ]);
    assert.deepEqual(result.der, [
        0x30,
        0x51,
        11,
        "-129",
        "9223372036854775808",
        "8000000000000000",
        "1.2.840.113549.1.1.11",
        4,
        "f0",
        "2049-12-31T23:59:59.000Z",
        "2050-01-01T00:00:00.000Z",
        "éx",
        "No",
        true,
        2,
        true,
        0,
        5,
        2,
        31,
        0,
        "06092a864886f70d01010b",
    ]);
    assert.deepEqual(result.derErrors, Array(7).fill("ERR_NONA_DER"));
    assert.equal(result.negative, "ERR_NONA_DER");
});

test("100 X25519 and 10 P-256 key exchanges finish in a few seconds", () => {
    const result = runTls(`
let start = Date.now(), key = new Uint8Array(32), point = new Uint8Array(32);
point[0] = 9;
for (let i = 0; i < 100; i++) { key[i & 31] ^= i + 1; point = t.x25519(key, point); }
const x25519 = Date.now() - start;
start = Date.now();
const a = t.ecdhGenerateKeyPair('P-256');
for (let i = 0; i < 9; i++) t.ecdhSharedSecret('P-256', a.privateKey, t.ecdhGenerateKeyPair('P-256').publicKey);
console.log(JSON.stringify({ x25519, p256: Date.now() - start, point: hex(point) }));
`);
    assert.match(result.point, /^[0-9a-f]{64}$/);
    // About 2 s and 1.5 s on a desktop machine; the bound leaves room for a busy CI runner.
    assert.ok(result.x25519 < 20000, "100 X25519: " + result.x25519 + " ms");
    assert.ok(result.p256 < 20000, "10 P-256 ECDH: " + result.p256 + " ms");
});
