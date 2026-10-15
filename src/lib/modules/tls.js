// node:tls (issue #301): a TLS 1.3 client (RFC 8446) written for Nona, over
// node:net and the primitives of nona:internal/tls-crypto. No TLS library is
// linked into the executable.
//
// The protocol runs in ClientEngine, which knows nothing about sockets: it
// takes the bytes received from the peer (receive) and hands the records to
// send to its send callback, so the RFC 8448 traces can be replayed with
// injected randomness and key shares (tests/tls-handshake.test.ts). TLSSocket
// puts an engine between a net.Socket and the program.
//
// TLS 1.2 and older are not implemented: a server limited to them fails the
// connection with ERR_SSL_UNSUPPORTED_PROTOCOL. A server that knows TLS 1.3
// answers the ClientHello (supported_versions lists only TLS 1.3) with a
// protocol_version alert. The ClientHello also offers two TLS 1.2 suites, so
// that a server older than TLS 1.3 (which ignores supported_versions) answers
// with a TLS 1.2 ServerHello rather than an unexplained handshake_failure;
// the client then aborts.
//
// Certificates go through verifyPeer. It parses the X.509 certificates and,
// for now, only trusts the certificates given in the ca option (the
// operating system's trust store is not read yet), so connections to public
// servers fail closed unless rejectUnauthorized is false.
import { Buffer } from "node:buffer";
import * as net from "node:net";
import { randomBytes as osRandomBytes } from "node:crypto";
import * as t from "nona:internal/tls-crypto";

const randomBytes = (n) => new Uint8Array(osRandomBytes(n));

const RECORD_CHANGE_CIPHER_SPEC = 20,
    RECORD_ALERT = 21,
    RECORD_HANDSHAKE = 22,
    RECORD_APPLICATION_DATA = 23;
const CLIENT_HELLO = 1,
    SERVER_HELLO = 2,
    NEW_SESSION_TICKET = 4,
    ENCRYPTED_EXTENSIONS = 8,
    CERTIFICATE = 11,
    CERTIFICATE_REQUEST = 13,
    CERTIFICATE_VERIFY = 15,
    FINISHED = 20,
    KEY_UPDATE = 24,
    MESSAGE_HASH = 254;
const EXT_SERVER_NAME = 0,
    EXT_SUPPORTED_GROUPS = 10,
    EXT_SIGNATURE_ALGORITHMS = 13,
    EXT_ALPN = 16,
    EXT_PRE_SHARED_KEY = 41,
    EXT_SUPPORTED_VERSIONS = 43,
    EXT_COOKIE = 44,
    EXT_KEY_SHARE = 51;
const MAX_PLAINTEXT = 16384,
    MAX_CIPHERTEXT = MAX_PLAINTEXT + 256,
    MAX_HANDSHAKE_MESSAGE = 262144;
// Records sent under one key before a KeyUpdate (far below the AES-GCM limit).
const KEY_UPDATE_RECORDS = 8388608;
const GROUP_X25519 = 0x001d,
    GROUP_P256 = 0x0017;
const groupNames = { [GROUP_X25519]: "X25519", [GROUP_P256]: "prime256v1" };
const suites = {
    0x1301: {
        name: "TLS_AES_128_GCM_SHA256",
        aead: "aes-128-gcm",
        keyLength: 16,
        hash: "sha256",
    },
    0x1302: {
        name: "TLS_AES_256_GCM_SHA384",
        aead: "aes-256-gcm",
        keyLength: 32,
        hash: "sha384",
    },
    0x1303: {
        name: "TLS_CHACHA20_POLY1305_SHA256",
        aead: "chacha20-poly1305",
        keyLength: 32,
        hash: "sha256",
    },
};
const offeredSuites = [0x1301, 0x1302, 0x1303];
// TLS_ECDHE_ECDSA/RSA_WITH_AES_128_GCM_SHA256: never used (see above).
const tls12Suites = [0xc02b, 0xc02f];
// ecdsa_secp256r1_sha256, ecdsa_secp384r1_sha384, rsa_pss_rsae_sha256/384/512,
// rsa_pkcs1_sha256/384. The PKCS#1 schemes are for certificate signatures
// only: RFC 8446 §4.2.3 forbids them in CertificateVerify.
const signatureSchemes = [
    0x0403, 0x0503, 0x0804, 0x0805, 0x0806, 0x0401, 0x0501,
];
const certificateVerifySchemes = [0x0403, 0x0503, 0x0804, 0x0805, 0x0806];
// The ServerHello.random of a HelloRetryRequest (RFC 8446 §4.1.3).
const helloRetryRandom = hexBytes(
    "cf21ad74e59a6111be1d8c021e65b891c2a211167abb8c5e079e09e2c8a8339c",
);
const encoder = new TextEncoder();
const serverSignatureContext = t.concatBytes(
    new Uint8Array(64).fill(0x20),
    encoder.encode("TLS 1.3, server CertificateVerify"),
    new Uint8Array(1),
);

const alertNames = {
    0: "close_notify",
    10: "unexpected_message",
    20: "bad_record_mac",
    22: "record_overflow",
    40: "handshake_failure",
    42: "bad_certificate",
    43: "unsupported_certificate",
    44: "certificate_revoked",
    45: "certificate_expired",
    46: "certificate_unknown",
    47: "illegal_parameter",
    48: "unknown_ca",
    49: "access_denied",
    50: "decode_error",
    51: "decrypt_error",
    70: "protocol_version",
    71: "insufficient_security",
    80: "internal_error",
    86: "inappropriate_fallback",
    90: "user_canceled",
    109: "missing_extension",
    110: "unsupported_extension",
    112: "unrecognized_name",
    113: "bad_certificate_status_response",
    115: "unknown_psk_identity",
    116: "certificate_required",
    120: "no_application_protocol",
};
// Alerts that SSL 3.0 already had: OpenSSL 3 (Node.js 17 and later) names them SSL/TLS_ALERT_*.
const sslv3Alerts = [10, 20, 40, 42, 43, 44, 45, 46, 47];

function hexBytes(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++)
        out[i] = parseInt(hex.substr(2 * i, 2), 16);
    return out;
}
function toHex(bytes, separator) {
    let text = "";
    for (let i = 0; i < bytes.length; i++) {
        if (separator && i > 0) text += separator;
        text += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
    }
    return text;
}
function equalBytes(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}
function tlsError(code, message, alert) {
    const error = new Error(message);
    error.code = code;
    // The alert to send; not a property of the error the program sees.
    if (alert !== undefined) alertFor.set(error, alert);
    return error;
}
const alertFor = new WeakMap();
const decodeError = () =>
    tlsError("ERR_SSL_DECODE_ERROR", "TLS message could not be decoded", 50);
const unexpectedMessage = (what) =>
    tlsError("ERR_SSL_UNEXPECTED_MESSAGE", "unexpected message: " + what, 10);
const illegalParameter = (what) =>
    tlsError("ERR_SSL_ILLEGAL_PARAMETER", "illegal parameter: " + what, 47);
function codedError(code, message, Type) {
    const error = new (Type || Error)(message);
    error.code = code;
    return error;
}

// ---- Encoding --------------------------------------------------------------
class Writer {
    constructor() {
        this.bytes = [];
    }
    u8(n) {
        this.bytes.push(n & 255);
        return this;
    }
    u16(n) {
        this.bytes.push((n >> 8) & 255, n & 255);
        return this;
    }
    raw(data) {
        for (let i = 0; i < data.length; i++) this.bytes.push(data[i]);
        return this;
    }
    /** A vector with a size-byte length prefix; body(writer) writes its contents. */
    vector(size, body) {
        const at = this.bytes.length;
        for (let i = 0; i < size; i++) this.bytes.push(0);
        body(this);
        const length = this.bytes.length - at - size;
        for (let i = 0; i < size; i++)
            this.bytes[at + i] = (length >> (8 * (size - 1 - i))) & 255;
        return this;
    }
    done() {
        return new Uint8Array(this.bytes);
    }
}
class Reader {
    constructor(bytes, start, end) {
        this.bytes = bytes;
        this.at = start;
        this.end = end;
    }
    need(n) {
        if (this.at + n > this.end) throw decodeError();
    }
    u8() {
        this.need(1);
        return this.bytes[this.at++];
    }
    u16() {
        this.need(2);
        const value = (this.bytes[this.at] << 8) | this.bytes[this.at + 1];
        this.at += 2;
        return value;
    }
    u24() {
        this.need(3);
        const b = this.bytes,
            value = (b[this.at] << 16) | (b[this.at + 1] << 8) | b[this.at + 2];
        this.at += 3;
        return value;
    }
    take(n) {
        this.need(n);
        const value = this.bytes.subarray(this.at, this.at + n);
        this.at += n;
        return value;
    }
    /** The contents of a vector with a size-byte length prefix. */
    vector(size) {
        const length =
            size === 1 ? this.u8() : size === 2 ? this.u16() : this.u24();
        return this.take(length);
    }
    /** A Reader over the contents of a vector. */
    sub(size) {
        const bytes = this.vector(size);
        return new Reader(bytes, 0, bytes.length);
    }
    get remaining() {
        return this.end - this.at;
    }
    finish() {
        if (this.at !== this.end) throw decodeError();
    }
}
/** Extensions as a Map from type to a Reader over the data; rejects duplicates. */
function readExtensions(reader) {
    const list = reader.sub(2),
        extensions = new Map();
    while (list.remaining > 0) {
        const type = list.u16(),
            data = list.vector(2);
        if (extensions.has(type))
            throw illegalParameter("duplicate extension " + type);
        extensions.set(type, new Reader(data, 0, data.length));
    }
    return extensions;
}
function handshakeMessage(type, body) {
    const out = new Uint8Array(4 + body.length);
    out[0] = type;
    out[1] = body.length >> 16;
    out[2] = (body.length >> 8) & 255;
    out[3] = body.length & 255;
    out.set(body, 4);
    return out;
}
function plainRecord(type, data, version) {
    const records = [];
    for (let at = 0; at < data.length || at === 0; at += MAX_PLAINTEXT) {
        const end = Math.min(data.length, at + MAX_PLAINTEXT),
            record = new Uint8Array(5 + end - at);
        record[0] = type;
        record[1] = 3;
        record[2] = version & 255;
        record[3] = (end - at) >> 8;
        record[4] = (end - at) & 255;
        record.set(data.subarray(at, end), 5);
        records.push(record);
        if (end === data.length) break;
    }
    return records.length === 1 ? records[0] : t.concatBytes(...records);
}

// ---- Record protection -----------------------------------------------------
class TrafficKeys {
    constructor(suite, secret) {
        this.secret = secret;
        this.key = t.hkdfExpandLabel(
            suite.hash,
            secret,
            "key",
            "",
            suite.keyLength,
        );
        this.iv = t.hkdfExpandLabel(suite.hash, secret, "iv", "", 12);
        this.aead = t.createAead(suite.aead, this.key);
        this.seq = 0;
    }
    /** The per-record nonce: the IV xor the 64-bit sequence number (RFC 8446 §5.3). */
    nonce() {
        const nonce = this.iv.slice();
        let seq = this.seq;
        for (let i = 11; i >= 4 && seq > 0; i--) {
            nonce[i] ^= seq % 256;
            seq = Math.floor(seq / 256);
        }
        return nonce;
    }
}

// ---- The client state machine ----------------------------------------------
/**
 * A TLS 1.3 client connection without I/O. The owner sets the callbacks
 * send(bytes), onSecure(), onData(bytes), onCloseNotify(), onError(error)
 * and verify(chain) (returns null to accept the server's certificates or an
 * error to abort), calls start(), then feeds received bytes to receive().
 *
 * options: servername (SNI, omitted when empty), ALPNProtocols (an array of
 * Uint8Arrays). For deterministic tests: random, sessionId, keyShares
 * ({ x25519, p256 } private keys) and clientHello (a complete ClientHello
 * message to send instead of the generated one; its key share must be the
 * keyShares.x25519 private key).
 */
export class ClientEngine {
    constructor(options) {
        options = options || {};
        this.servername = options.servername || "";
        this.alpnProtocols = options.ALPNProtocols || [];
        this.random = options.random || randomBytes(32);
        this.sessionId = options.sessionId || randomBytes(32);
        this.injectedKeys = options.keyShares || {};
        this.clientHelloOverride = options.clientHello || null;
        this.state = "start";
        this.transcript = [];
        this.shares = []; // [{ group, privateKey, publicKey }]
        this.suite = null;
        this.suiteId = 0;
        this.group = 0;
        this.read = null;
        this.write = null;
        this.input = null;
        this.handshake = null;
        this.retried = false;
        this.retrySuite = 0;
        this.changeCipherSpecSent = false;
        this.certificateRequestContext = null;
        this.peerCertificates = null;
        this.peerKey = null;
        this.alpnProtocol = null;
        this.readClosed = false;
        this.writeClosed = false;
        this.secrets = {};
        this.send = () => {};
        this.onSecure = () => {};
        this.onData = () => {};
        this.onCloseNotify = () => {};
        this.onError = () => {};
        this.verify = () => null;
    }
    start() {
        let hello;
        if (this.clientHelloOverride !== null) {
            hello = this.clientHelloOverride;
            const sessionIdLength = hello[38];
            this.sessionId = hello.slice(39, 39 + sessionIdLength);
            this.shares = [
                { group: GROUP_X25519, privateKey: this.injectedKeys.x25519 },
            ];
        } else {
            this.shares = [this.keyShare(GROUP_X25519)];
            hello = this.clientHello(null);
        }
        this.transcript.push(hello);
        this.state = "wait_server_hello";
        this.send(plainRecord(RECORD_HANDSHAKE, hello, 1));
    }
    keyShare(group) {
        if (group === GROUP_X25519) {
            const privateKey = this.injectedKeys.x25519 || randomBytes(32);
            return {
                group,
                privateKey,
                publicKey: t.x25519PublicKey(privateKey),
            };
        }
        if (this.injectedKeys.p256)
            return {
                group,
                privateKey: this.injectedKeys.p256,
                publicKey: t.ecdhPublicKey("P-256", this.injectedKeys.p256),
            };
        const pair = t.ecdhGenerateKeyPair("P-256");
        return {
            group,
            privateKey: pair.privateKey,
            publicKey: pair.publicKey,
        };
    }
    clientHello(cookie) {
        const w = new Writer();
        w.u16(0x0303).raw(this.random);
        w.vector(1, (w) => w.raw(this.sessionId));
        w.vector(2, (w) => {
            for (const suite of offeredSuites.concat(tls12Suites)) w.u16(suite);
        });
        w.vector(1, (w) => w.u8(0));
        w.vector(2, (w) => {
            if (this.servername !== "")
                w.u16(EXT_SERVER_NAME).vector(2, (w) =>
                    w.vector(2, (w) =>
                        w
                            .u8(0)
                            .vector(2, (w) =>
                                w.raw(encoder.encode(this.servername)),
                            ),
                    ),
                );
            w.u16(EXT_SUPPORTED_GROUPS).vector(2, (w) =>
                w.vector(2, (w) => w.u16(GROUP_X25519).u16(GROUP_P256)),
            );
            w.u16(EXT_SIGNATURE_ALGORITHMS).vector(2, (w) =>
                w.vector(2, (w) => {
                    for (const scheme of signatureSchemes) w.u16(scheme);
                }),
            );
            if (this.alpnProtocols.length > 0)
                w.u16(EXT_ALPN).vector(2, (w) =>
                    w.vector(2, (w) => {
                        for (const protocol of this.alpnProtocols)
                            w.vector(1, (w) => w.raw(protocol));
                    }),
                );
            w.u16(EXT_SUPPORTED_VERSIONS).vector(2, (w) =>
                w.vector(1, (w) => w.u16(0x0304)),
            );
            if (cookie !== null)
                w.u16(EXT_COOKIE).vector(2, (w) =>
                    w.vector(2, (w) => w.raw(cookie)),
                );
            w.u16(EXT_KEY_SHARE).vector(2, (w) =>
                w.vector(2, (w) => {
                    for (const share of this.shares)
                        w.u16(share.group).vector(2, (w) =>
                            w.raw(share.publicKey),
                        );
                }),
            );
        });
        return handshakeMessage(CLIENT_HELLO, w.done());
    }
    transcriptHash() {
        return t.digest(this.suite.hash, t.concatBytes(...this.transcript));
    }
    expand(secret, label, context) {
        const hash = this.suite.hash;
        return t.hkdfExpandLabel(
            hash,
            secret,
            label,
            context,
            t.hashLength(hash),
        );
    }

    // -- input --
    /** Process bytes received from the peer. Errors go to onError. */
    receive(data) {
        if (this.state === "closed") return;
        let input =
            this.input === null
                ? data.slice()
                : t.concatBytes(this.input, data);
        this.input = null;
        let at = 0;
        try {
            while (input.length - at >= 5 && this.state !== "closed") {
                const type = input[at],
                    length = (input[at + 3] << 8) | input[at + 4];
                if (type < 20 || type > 23 || input[at + 1] !== 3)
                    throw tlsError(
                        "ERR_SSL_WRONG_VERSION_NUMBER",
                        "wrong version number (the peer does not speak TLS)",
                        70,
                    );
                if (length > MAX_CIPHERTEXT)
                    throw tlsError(
                        "ERR_SSL_RECORD_OVERFLOW",
                        "record overflow",
                        22,
                    );
                if (input.length - at - 5 < length) break;
                const header = input.subarray(at, at + 5),
                    body = input.subarray(at + 5, at + 5 + length);
                at += 5 + length;
                this.record(type, header, body);
            }
        } catch (error) {
            // An exception from a callback (program code) is not a TLS error.
            if (!alertFor.has(error)) {
                if (at < input.length) this.input = input.slice(at);
                throw error;
            }
            this.fail(error);
            return;
        }
        if (at < input.length && this.state !== "closed")
            this.input = input.slice(at);
    }
    record(type, header, body) {
        if (type === RECORD_CHANGE_CIPHER_SPEC) {
            // Middlebox compatibility (RFC 8446 §5): ignored until the handshake ends.
            if (
                this.state === "connected" ||
                body.length !== 1 ||
                body[0] !== 1
            )
                throw unexpectedMessage("change_cipher_spec");
            return;
        }
        if (this.read !== null) {
            if (type !== RECORD_APPLICATION_DATA)
                throw unexpectedMessage(
                    "plaintext record after the key exchange",
                );
            const inner = this.read.aead.open(this.read.nonce(), body, header);
            if (inner === null)
                throw tlsError(
                    "ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC",
                    "decryption failed or bad record mac",
                    20,
                );
            this.read.seq++;
            let end = inner.length;
            while (end > 0 && inner[end - 1] === 0) end--;
            if (end === 0)
                throw unexpectedMessage("record without a content type");
            type = inner[end - 1];
            body = inner.subarray(0, end - 1);
            if (body.length > MAX_PLAINTEXT)
                throw tlsError(
                    "ERR_SSL_RECORD_OVERFLOW",
                    "record overflow",
                    22,
                );
        } else if (type === RECORD_APPLICATION_DATA)
            throw unexpectedMessage("application data before the key exchange");
        if (this.handshake !== null && type !== RECORD_HANDSHAKE)
            throw unexpectedMessage("record inside a handshake message");
        if (type === RECORD_ALERT) this.alert(body);
        else if (type === RECORD_HANDSHAKE) this.handshakeBytes(body);
        else if (type === RECORD_APPLICATION_DATA) {
            if (this.state !== "connected")
                throw unexpectedMessage(
                    "application data during the handshake",
                );
            if (!this.readClosed && body.length > 0) this.onData(body);
        } else throw unexpectedMessage("record type " + type);
    }
    alert(body) {
        if (body.length !== 2) throw decodeError();
        const description = body[1];
        if (description === 0) {
            this.readClosed = true;
            this.onCloseNotify();
            return;
        }
        if (description === 90) return; // user_canceled: a warning
        const name = alertNames[description] || "unknown (" + description + ")";
        // A server that knows TLS 1.3 but has it disabled answers the
        // ClientHello (which offers only TLS 1.3) with protocol_version.
        const error =
            description === 70 && this.state === "wait_server_hello"
                ? tlsError(
                      "ERR_SSL_UNSUPPORTED_PROTOCOL",
                      "The server does not support TLSv1.3 (it sent the alert protocol_version); the Nona TLS client supports only TLSv1.3",
                  )
                : tlsError(
                      "ERR_SSL_" +
                          (sslv3Alerts.includes(description)
                              ? "SSL/TLS"
                              : "TLSV1") +
                          "_ALERT_" +
                          name.toUpperCase(),
                      (this.state === "connected"
                          ? ""
                          : "TLS handshake failed: ") +
                          "the server sent the alert " +
                          name,
                  );
        this.state = "closed";
        this.onError(error);
    }
    handshakeBytes(data) {
        if (data.length === 0)
            throw unexpectedMessage("empty handshake record");
        const buffer =
            this.handshake === null
                ? data
                : t.concatBytes(this.handshake, data);
        this.handshake = null;
        let at = 0;
        while (buffer.length - at >= 4 && this.state !== "closed") {
            const length =
                (buffer[at + 1] << 16) | (buffer[at + 2] << 8) | buffer[at + 3];
            if (length > MAX_HANDSHAKE_MESSAGE)
                throw tlsError(
                    "ERR_SSL_EXCESSIVE_MESSAGE_SIZE",
                    "excessive message size",
                    50,
                );
            if (buffer.length - at - 4 < length) break;
            const message = buffer.slice(at, at + 4 + length);
            at += 4 + length;
            // A key change must fall on a record boundary (RFC 8446 §5.1).
            if (this.message(message) && at < buffer.length)
                throw unexpectedMessage("data after a key change");
        }
        if (at < buffer.length && this.state !== "closed")
            this.handshake = buffer.slice(at);
    }
    /** Handle one handshake message; returns true when the read key changed. */
    message(message) {
        const type = message[0],
            reader = new Reader(message, 4, message.length);
        switch (this.state) {
            case "wait_server_hello":
                if (type !== SERVER_HELLO) break;
                return this.serverHello(message, reader);
            case "wait_encrypted_extensions":
                if (type !== ENCRYPTED_EXTENSIONS) break;
                this.encryptedExtensions(reader);
                this.transcript.push(message);
                this.state = "wait_certificate_request";
                return false;
            case "wait_certificate_request":
                if (type === CERTIFICATE_REQUEST) {
                    this.certificateRequest(reader);
                    this.transcript.push(message);
                    this.state = "wait_certificate";
                    return false;
                }
            // falls through
            case "wait_certificate":
                if (type !== CERTIFICATE) break;
                this.certificate(reader);
                this.transcript.push(message);
                this.state = "wait_certificate_verify";
                return false;
            case "wait_certificate_verify":
                if (type !== CERTIFICATE_VERIFY) break;
                this.certificateVerify(reader);
                this.transcript.push(message);
                this.state = "wait_finished";
                return false;
            case "wait_finished":
                if (type !== FINISHED) break;
                this.finished(message, reader);
                return true;
            case "connected":
                // Session tickets are not used: the client does not resume sessions.
                if (type === NEW_SESSION_TICKET) return false;
                if (type === KEY_UPDATE) return this.keyUpdate(reader);
                break;
        }
        throw unexpectedMessage(
            "handshake message " + type + " in " + this.state,
        );
    }
    serverHello(message, reader) {
        const version = reader.u16(),
            random = reader.take(32),
            sessionId = reader.vector(1),
            suiteId = reader.u16(),
            compression = reader.u8(),
            extensions = readExtensions(reader);
        reader.finish();
        const supportedVersions = extensions.get(EXT_SUPPORTED_VERSIONS);
        if (supportedVersions === undefined) {
            const name =
                {
                    0x0300: "SSLv3",
                    0x0301: "TLSv1",
                    0x0302: "TLSv1.1",
                    0x0303: "TLSv1.2",
                }[version] || "version 0x" + version.toString(16);
            throw tlsError(
                "ERR_SSL_UNSUPPORTED_PROTOCOL",
                "The server selected " +
                    name +
                    "; the Nona TLS client supports only TLSv1.3",
                70,
            );
        }
        const selected = supportedVersions.u16();
        supportedVersions.finish();
        if (selected !== 0x0304)
            throw tlsError(
                "ERR_SSL_UNSUPPORTED_PROTOCOL",
                "The server selected an unsupported TLS version 0x" +
                    selected.toString(16),
                47,
            );
        if (version !== 0x0303) throw illegalParameter("legacy_version");
        if (!equalBytes(sessionId, this.sessionId))
            throw illegalParameter("legacy_session_id_echo");
        if (!offeredSuites.includes(suiteId))
            throw illegalParameter("cipher suite");
        if (compression !== 0) throw illegalParameter("compression method");
        if (equalBytes(random, helloRetryRandom))
            return this.helloRetryRequest(message, suiteId, extensions);
        if (this.retried && suiteId !== this.retrySuite)
            throw illegalParameter(
                "cipher suite changed after HelloRetryRequest",
            );
        for (const type of extensions.keys())
            if (type !== EXT_SUPPORTED_VERSIONS && type !== EXT_KEY_SHARE)
                throw tlsError(
                    "ERR_SSL_UNSUPPORTED_EXTENSION",
                    "unsupported extension " + type + " in ServerHello",
                    110,
                );
        const keyShare = extensions.get(EXT_KEY_SHARE);
        if (keyShare === undefined)
            throw tlsError(
                "ERR_SSL_MISSING_EXTENSION",
                "missing key_share",
                109,
            );
        const group = keyShare.u16(),
            peerKey = keyShare.vector(2);
        keyShare.finish();
        const share = this.shares.find((share) => share.group === group);
        if (share === undefined) throw illegalParameter("key share group");
        let shared;
        try {
            shared =
                group === GROUP_X25519
                    ? t.x25519SharedSecret(share.privateKey, peerKey)
                    : t.ecdhSharedSecret("P-256", share.privateKey, peerKey);
        } catch {
            throw illegalParameter("server key share");
        }
        this.suite = suites[suiteId];
        this.suiteId = suiteId;
        this.group = group;
        this.transcript.push(message);
        // The key schedule (RFC 8446 §7.1) without a pre-shared key.
        const hash = this.suite.hash,
            zeros = new Uint8Array(t.hashLength(hash)),
            empty = new Uint8Array(0);
        const early = t.hkdfExtract(hash, empty, zeros);
        const handshake = t.hkdfExtract(
            hash,
            t.deriveSecret(hash, early, "derived", empty),
            shared,
        );
        const context = this.transcriptHash();
        const client = this.expand(handshake, "c hs traffic", context),
            server = this.expand(handshake, "s hs traffic", context);
        this.secrets.early = early;
        this.secrets.handshake = handshake;
        this.secrets.clientHandshakeTraffic = client;
        this.secrets.serverHandshakeTraffic = server;
        this.read = new TrafficKeys(this.suite, server);
        // From here on the client's alerts are encrypted too.
        this.write = new TrafficKeys(this.suite, client);
        this.state = "wait_encrypted_extensions";
        return true;
    }
    helloRetryRequest(message, suiteId, extensions) {
        if (this.retried || this.clientHelloOverride !== null)
            throw unexpectedMessage("second HelloRetryRequest");
        this.retried = true;
        this.retrySuite = suiteId;
        for (const type of extensions.keys())
            if (
                type !== EXT_SUPPORTED_VERSIONS &&
                type !== EXT_KEY_SHARE &&
                type !== EXT_COOKIE
            )
                throw tlsError(
                    "ERR_SSL_UNSUPPORTED_EXTENSION",
                    "unsupported extension " + type + " in HelloRetryRequest",
                    110,
                );
        const keyShare = extensions.get(EXT_KEY_SHARE),
            cookieExtension = extensions.get(EXT_COOKIE);
        if (keyShare === undefined && cookieExtension === undefined)
            throw illegalParameter("HelloRetryRequest changes nothing");
        let cookie = null;
        if (cookieExtension !== undefined) {
            cookie = cookieExtension.vector(2).slice();
            cookieExtension.finish();
            if (cookie.length === 0) throw decodeError();
        }
        if (keyShare !== undefined) {
            const group = keyShare.u16();
            keyShare.finish();
            if (
                (group !== GROUP_X25519 && group !== GROUP_P256) ||
                this.shares.some((share) => share.group === group)
            )
                throw illegalParameter("HelloRetryRequest group");
            this.shares = [this.keyShare(group)];
        }
        // The transcript restarts with a hash of the first ClientHello (§4.4.1).
        this.suite = suites[suiteId];
        const firstHash = t.digest(this.suite.hash, this.transcript[0]);
        this.transcript = [handshakeMessage(MESSAGE_HASH, firstHash), message];
        const hello = this.clientHello(cookie);
        this.transcript.push(hello);
        this.sendChangeCipherSpec();
        this.send(plainRecord(RECORD_HANDSHAKE, hello, 3));
        return false;
    }
    /** One dummy change_cipher_spec before the second flight (RFC 8446 §D.4). */
    sendChangeCipherSpec() {
        if (this.changeCipherSpecSent || this.sessionId.length === 0) return;
        this.changeCipherSpecSent = true;
        this.send(new Uint8Array([RECORD_CHANGE_CIPHER_SPEC, 3, 3, 0, 1, 1]));
    }
    encryptedExtensions(reader) {
        const extensions = readExtensions(reader);
        reader.finish();
        for (const type of [
            EXT_SUPPORTED_VERSIONS,
            EXT_KEY_SHARE,
            EXT_PRE_SHARED_KEY,
        ])
            if (extensions.has(type))
                throw illegalParameter(
                    "extension " + type + " in EncryptedExtensions",
                );
        const alpn = extensions.get(EXT_ALPN);
        if (alpn !== undefined) {
            const list = alpn.sub(2);
            alpn.finish();
            const protocol = list.vector(1);
            list.finish();
            if (
                !this.alpnProtocols.some((offered) =>
                    equalBytes(offered, protocol),
                )
            )
                throw illegalParameter("ALPN protocol that was not offered");
            this.alpnProtocol = Buffer.from(protocol).toString("latin1");
        }
    }
    certificateRequest(reader) {
        this.certificateRequestContext = reader.vector(1).slice();
        readExtensions(reader);
        reader.finish();
    }
    certificate(reader) {
        if (reader.vector(1).length !== 0)
            throw illegalParameter("certificate_request_context");
        const list = reader.sub(3);
        reader.finish();
        const chain = [];
        while (list.remaining > 0) {
            const data = list.vector(3);
            list.vector(2); // OCSP and SCT extensions are not used
            if (data.length === 0) throw decodeError();
            chain.push(data.slice());
        }
        if (chain.length === 0)
            throw tlsError(
                "ERR_SSL_PEER_DID_NOT_RETURN_A_CERTIFICATE",
                "the server did not send a certificate",
                50,
            );
        try {
            this.peerKey = t.parseSubjectPublicKeyInfo(
                parseCertificate(chain[0]).subjectPublicKeyInfo,
            );
        } catch {
            throw tlsError(
                "ERR_SSL_BAD_CERTIFICATE",
                "the server certificate could not be parsed",
                42,
            );
        }
        this.peerCertificates = chain;
    }
    certificateVerify(reader) {
        const scheme = reader.u16(),
            signature = reader.vector(2);
        reader.finish();
        if (!certificateVerifySchemes.includes(scheme))
            throw illegalParameter("signature scheme 0x" + scheme.toString(16));
        const content = t.concatBytes(
            serverSignatureContext,
            this.transcriptHash(),
        );
        let valid = false;
        try {
            valid = t.verifyTlsSignature(
                this.peerKey,
                scheme,
                content,
                signature,
            );
        } catch {
            valid = false;
        }
        if (!valid)
            throw tlsError(
                "ERR_SSL_BAD_SIGNATURE",
                "bad signature in the server's CertificateVerify",
                51,
            );
        // The server holds the key of its certificate; now judge the certificate.
        const rejection = this.verify(this.peerCertificates);
        if (rejection) {
            const code = rejection.code;
            alertFor.set(
                rejection,
                code === "CERT_HAS_EXPIRED" || code === "CERT_NOT_YET_VALID"
                    ? 45
                    : code === "UNABLE_TO_GET_ISSUER_CERT_LOCALLY" ||
                        code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
                        code === "SELF_SIGNED_CERT_IN_CHAIN"
                      ? 48
                      : 42,
            );
            throw rejection;
        }
    }
    finished(message, reader) {
        const hash = this.suite.hash,
            length = t.hashLength(hash);
        const verifyData = reader.take(length);
        reader.finish();
        const serverSecret = this.secrets.serverHandshakeTraffic;
        const expected = t.hmac(
            hash,
            this.expand(serverSecret, "finished", ""),
            this.transcriptHash(),
        );
        if (!t.constantTimeEqual(expected, verifyData))
            throw tlsError(
                "ERR_SSL_DIGEST_CHECK_FAILED",
                "the server's Finished message does not match the handshake",
                51,
            );
        this.transcript.push(message);
        const zeros = new Uint8Array(length);
        const master = t.hkdfExtract(
            hash,
            t.deriveSecret(
                hash,
                this.secrets.handshake,
                "derived",
                new Uint8Array(0),
            ),
            zeros,
        );
        const context = this.transcriptHash();
        this.secrets.master = master;
        this.secrets.clientApplicationTraffic = this.expand(
            master,
            "c ap traffic",
            context,
        );
        this.secrets.serverApplicationTraffic = this.expand(
            master,
            "s ap traffic",
            context,
        );
        this.secrets.exporterMaster = this.expand(
            master,
            "exp master",
            context,
        );
        this.read = new TrafficKeys(
            this.suite,
            this.secrets.serverApplicationTraffic,
        );
        this.sendChangeCipherSpec();
        const flight = [];
        if (this.certificateRequestContext !== null) {
            // No client certificate: an empty Certificate message.
            const w = new Writer();
            w.vector(1, (w) => w.raw(this.certificateRequestContext));
            w.vector(3, () => {});
            const empty = handshakeMessage(CERTIFICATE, w.done());
            this.transcript.push(empty);
            flight.push(this.encrypt(RECORD_HANDSHAKE, empty));
        }
        const clientFinished = handshakeMessage(
            FINISHED,
            t.hmac(
                hash,
                this.expand(
                    this.secrets.clientHandshakeTraffic,
                    "finished",
                    "",
                ),
                this.transcriptHash(),
            ),
        );
        this.transcript.push(clientFinished);
        this.secrets.resumptionMaster = this.expand(
            master,
            "res master",
            this.transcriptHash(),
        );
        flight.push(this.encrypt(RECORD_HANDSHAKE, clientFinished));
        this.write = new TrafficKeys(
            this.suite,
            this.secrets.clientApplicationTraffic,
        );
        this.state = "connected";
        this.transcript = null;
        this.send(flight.length === 1 ? flight[0] : t.concatBytes(...flight));
        this.onSecure();
    }
    keyUpdate(reader) {
        const request = reader.u8();
        reader.finish();
        if (request > 1) throw illegalParameter("KeyUpdate request");
        this.read = new TrafficKeys(
            this.suite,
            this.expand(this.read.secret, "traffic upd", ""),
        );
        if (request === 1 && !this.writeClosed)
            this.send(this.keyUpdateRecord());
        return true;
    }
    /** A KeyUpdate (update_not_requested) record; switches the write key after it. */
    keyUpdateRecord() {
        const record = this.encrypt(
            RECORD_HANDSHAKE,
            handshakeMessage(KEY_UPDATE, new Uint8Array([0])),
        );
        this.write = new TrafficKeys(
            this.suite,
            this.expand(this.write.secret, "traffic upd", ""),
        );
        return record;
    }

    // -- output --
    /** One protected record (RFC 8446 §5.2) of at most MAX_PLAINTEXT bytes. */
    encrypt(type, data, start = 0, end = data.length) {
        const length = end - start,
            inner = new Uint8Array(length + 1);
        inner.set(
            start === 0 && end === data.length
                ? data
                : data.subarray(start, end),
        );
        inner[length] = type;
        const size = length + 1 + 16,
            header = new Uint8Array([
                RECORD_APPLICATION_DATA,
                3,
                3,
                size >> 8,
                size & 255,
            ]);
        const sealed = this.write.aead.seal(this.write.nonce(), inner, header);
        this.write.seq++;
        const record = new Uint8Array(5 + sealed.length);
        record.set(header);
        record.set(sealed, 5);
        return record;
    }
    /** Application data as records (16 KiB fragments), ready to send. */
    seal(data) {
        if (this.state !== "connected" || this.writeClosed)
            throw codedError(
                "ERR_SSL_PROTOCOL_ERROR",
                "The TLS connection is not open for writing",
            );
        if (data.length <= MAX_PLAINTEXT && this.write.seq < KEY_UPDATE_RECORDS)
            return data.length === 0
                ? new Uint8Array(0)
                : this.encrypt(RECORD_APPLICATION_DATA, data);
        const records = [];
        for (let at = 0; at < data.length; at += MAX_PLAINTEXT) {
            if (this.write.seq >= KEY_UPDATE_RECORDS)
                records.push(this.keyUpdateRecord());
            records.push(
                this.encrypt(
                    RECORD_APPLICATION_DATA,
                    data,
                    at,
                    Math.min(data.length, at + MAX_PLAINTEXT),
                ),
            );
        }
        return t.concatBytes(...records);
    }
    /** The close_notify alert record; nothing can be written after it. */
    closeNotify() {
        if (this.writeClosed || this.state === "closed")
            return new Uint8Array(0);
        this.writeClosed = true;
        return this.alertRecord(0);
    }
    alertRecord(description) {
        const body = new Uint8Array([description === 0 ? 1 : 2, description]);
        return this.write !== null
            ? this.encrypt(RECORD_ALERT, body)
            : plainRecord(RECORD_ALERT, body, 3);
    }
    /** RFC 5705 / RFC 8446 §7.5 keying material exporter. */
    exportKeyingMaterial(length, label, context) {
        const hash = this.suite.hash;
        const secret = t.deriveSecret(
            hash,
            this.secrets.exporterMaster,
            label,
            new Uint8Array(0),
        );
        return t.hkdfExpandLabel(
            hash,
            secret,
            "exporter",
            t.digest(hash, context || new Uint8Array(0)),
            length,
        );
    }
    /** Fatal error: send its alert (unless it came from the peer) and stop. */
    fail(error, alert) {
        if (this.state === "closed") return;
        if (alert === undefined) alert = alertFor.get(error);
        if (alert === undefined) alert = 80;
        if (alert !== undefined && !this.writeClosed) {
            this.writeClosed = true;
            try {
                this.send(this.alertRecord(alert));
            } catch {}
        }
        this.state = "closed";
        this.onError(error);
    }
    /** Stop processing input (the socket was destroyed). */
    abort() {
        this.state = "closed";
    }
}

// ---- X.509 ------------------------------------------------------------------
// A minimal certificate parser: what the handshake needs (the subject public
// key), getPeerCertificate() and the placeholder verification below.
const nameKeys = {
    "2.5.4.3": "CN",
    "2.5.4.4": "SN",
    "2.5.4.5": "serialNumber",
    "2.5.4.6": "C",
    "2.5.4.7": "L",
    "2.5.4.8": "ST",
    "2.5.4.9": "street",
    "2.5.4.10": "O",
    "2.5.4.11": "OU",
    "2.5.4.42": "GN",
    "1.2.840.113549.1.9.1": "emailAddress",
    "0.9.2342.19200300.100.1.25": "DC",
};
function parseName(bytes, node) {
    const name = {};
    for (const rdn of t.derChildren(bytes, node))
        for (const attribute of t.derChildren(bytes, rdn)) {
            const [type, value] = t.derChildren(bytes, attribute);
            const oid = t.derOid(bytes, type),
                key = nameKeys[oid] || oid,
                text = t.derString(bytes, value);
            if (name[key] === undefined) name[key] = text;
            else if (Array.isArray(name[key])) name[key].push(text);
            else name[key] = [name[key], text];
        }
    return name;
}
function latin1(bytes) {
    let text = "";
    for (let i = 0; i < bytes.length; i++)
        text += String.fromCharCode(bytes[i]);
    return text;
}
function formatIP(bytes) {
    if (bytes.length === 4) return Array.from(bytes).join(".");
    const groups = [];
    for (let i = 0; i + 1 < bytes.length; i += 2)
        groups.push(
            ((bytes[i] << 8) | bytes[i + 1]).toString(16).toUpperCase(),
        );
    return groups.join(":");
}
/**
 * Parse a DER certificate: { raw, tbs, signatureAlgorithm, signature,
 * serialNumber, issuer, issuerRaw, subject, subjectRaw, notBefore, notAfter,
 * subjectPublicKeyInfo, altNames: [{ type, value }], ca, extKeyUsage }.
 */
export function parseCertificate(raw) {
    const certificate = t.derRead(raw);
    if (certificate.tag !== 0x30 || certificate.end !== raw.length)
        throw codedError("ERR_NONA_DER", "Invalid DER: not a certificate");
    const [tbsNode, algorithmNode, signatureNode] = t.derChildren(
        raw,
        certificate,
    );
    const fields = t.derChildren(raw, tbsNode);
    let i = fields[0].tag === 0xa0 ? 1 : 0;
    const serial = fields[i++],
        signatureInTbs = fields[i++],
        issuer = fields[i++],
        validity = fields[i++],
        subject = fields[i++],
        spki = fields[i++];
    void signatureInTbs;
    const [notBefore, notAfter] = t.derChildren(raw, validity);
    const result = {
        raw,
        tbs: t.derEncoding(raw, tbsNode),
        signatureAlgorithm: t.derOid(raw, t.derChildren(raw, algorithmNode)[0]),
        signatureParameters: t.derChildren(raw, algorithmNode)[1],
        signature: t.derBitString(raw, signatureNode).bytes,
        serialNumber: toHex(t.derValue(raw, serial)).toUpperCase(),
        issuer: parseName(raw, issuer),
        issuerRaw: t.derEncoding(raw, issuer),
        subject: parseName(raw, subject),
        subjectRaw: t.derEncoding(raw, subject),
        notBefore: t.derTime(raw, notBefore),
        notAfter: t.derTime(raw, notAfter),
        subjectPublicKeyInfo: t.derEncoding(raw, spki),
        altNames: [],
        ca: undefined,
        extKeyUsage: undefined,
    };
    for (; i < fields.length; i++) {
        if (fields[i].tag !== 0xa3) continue;
        const list = t.derChildren(raw, fields[i])[0];
        for (const extension of t.derChildren(raw, list)) {
            const parts = t.derChildren(raw, extension);
            const oid = t.derOid(raw, parts[0]),
                value = parts[parts.length - 1];
            const inner = t.derRead(raw, value.start, value.end);
            if (oid === "2.5.29.17") {
                for (const name of t.derChildren(raw, inner)) {
                    const data = t.derValue(raw, name);
                    if (name.number === 2)
                        result.altNames.push({
                            type: "DNS",
                            value: latin1(data),
                        });
                    else if (name.number === 7)
                        result.altNames.push({
                            type: "IP Address",
                            value: formatIP(data),
                        });
                    else if (name.number === 1)
                        result.altNames.push({
                            type: "email",
                            value: latin1(data),
                        });
                    else if (name.number === 6)
                        result.altNames.push({
                            type: "URI",
                            value: latin1(data),
                        });
                }
            } else if (oid === "2.5.29.19") {
                const items = t.derChildren(raw, inner);
                result.ca =
                    items.length > 0 &&
                    items[0].tag === 0x01 &&
                    t.derBoolean(raw, items[0]);
            } else if (oid === "2.5.29.37") {
                result.extKeyUsage = t
                    .derChildren(raw, inner)
                    .map((node) => t.derOid(raw, node));
            }
        }
    }
    return result;
}
const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];
/** OpenSSL's time format, as in Node's valid_from: "Oct  5 19:50:26 2026 GMT". */
function formatTime(ms) {
    const date = new Date(ms),
        two = (n) => (n < 10 ? "0" : "") + n,
        day = date.getUTCDate();
    return (
        months[date.getUTCMonth()] +
        " " +
        (day < 10 ? " " : "") +
        day +
        " " +
        two(date.getUTCHours()) +
        ":" +
        two(date.getUTCMinutes()) +
        ":" +
        two(date.getUTCSeconds()) +
        " " +
        date.getUTCFullYear() +
        " GMT"
    );
}
/** The object of getPeerCertificate() for chain[index]. */
function peerCertificate(chain, index, detailed, seen) {
    const parsed = parseCertificate(chain[index]);
    const result = {
        subject: parsed.subject,
        issuer: parsed.issuer,
        subjectaltname:
            parsed.altNames.length > 0
                ? parsed.altNames
                      .map((name) => name.type + ":" + name.value)
                      .join(", ")
                : undefined,
        ca: parsed.ca === true,
        valid_from: formatTime(parsed.notBefore),
        valid_to: formatTime(parsed.notAfter),
        serialNumber: parsed.serialNumber,
        fingerprint: toHex(t.digest("sha1", parsed.raw), ":").toUpperCase(),
        fingerprint256: toHex(
            t.digest("sha256", parsed.raw),
            ":",
        ).toUpperCase(),
        raw: Buffer.from(parsed.raw),
    };
    if (result.subjectaltname === undefined) delete result.subjectaltname;
    try {
        const key = t.parseSubjectPublicKeyInfo(parsed.subjectPublicKeyInfo);
        if (key.type === "rsa") {
            result.bits = key.bits;
            result.modulus = toHex(key.n).toUpperCase();
            result.exponent = "0x" + toHex(key.e).replace(/^0+/, "");
            result.pubkey = Buffer.from(key.key);
        } else if (key.type === "ec") {
            result.bits =
                key.curve === "P-384" ? 384 : key.curve === "P-521" ? 521 : 256;
            result.asn1Curve = {
                "P-256": "prime256v1",
                "P-384": "secp384r1",
                "P-521": "secp521r1",
            }[key.curve];
            result.nistCurve = key.curve;
            result.pubkey = Buffer.from(key.key);
        }
    } catch {}
    if (parsed.extKeyUsage !== undefined)
        result.ext_key_usage = parsed.extKeyUsage;
    if (detailed) {
        seen.push(result);
        let issuerIndex = -1;
        if (equalBytes(parsed.issuerRaw, parsed.subjectRaw))
            result.issuerCertificate = result;
        else
            for (let j = 0; j < chain.length; j++)
                if (
                    j !== index &&
                    equalBytes(
                        parseCertificate(chain[j]).subjectRaw,
                        parsed.issuerRaw,
                    )
                )
                    issuerIndex = j;
        if (issuerIndex >= 0 && seen.length < chain.length)
            result.issuerCertificate = peerCertificate(
                chain,
                issuerIndex,
                true,
                seen,
            );
    }
    return result;
}

// ---- Certificate verification ------------------------------------------------
/** Certificates in the ca option (PEM text or DER, alone or in an array) as DER. */
function certificateList(value) {
    const out = [];
    const add = (item) => {
        if (item === undefined || item === null) return;
        if (Array.isArray(item)) {
            for (const entry of item) add(entry);
            return;
        }
        if (typeof item !== "string") {
            const bytes = new Uint8Array(
                item.buffer || item,
                item.byteOffset || 0,
                item.byteLength,
            );
            if (bytes[0] === 0x30) {
                out.push(bytes.slice());
                return;
            }
            item = Buffer.from(bytes).toString("latin1");
        }
        const pattern =
            /-----BEGIN (?:X509 |TRUSTED )?CERTIFICATE-----([\s\S]*?)-----END (?:X509 |TRUSTED )?CERTIFICATE-----/g;
        let match;
        while ((match = pattern.exec(item)) !== null)
            out.push(
                new Uint8Array(
                    Buffer.from(match[1].replace(/\s+/g, ""), "base64"),
                ),
            );
    };
    add(value);
    return out;
}
function verifyError(code, message) {
    return codedError(code, message);
}
const signatureHashes = {
    "1.2.840.10045.4.3.2": ["ecdsa", "sha256"],
    "1.2.840.10045.4.3.3": ["ecdsa", "sha384"],
    "1.2.840.10045.4.3.4": ["ecdsa", "sha512"],
    "1.2.840.113549.1.1.11": ["rsa", "sha256"],
    "1.2.840.113549.1.1.12": ["rsa", "sha384"],
    "1.2.840.113549.1.1.13": ["rsa", "sha512"],
};
/** Does issuer's key verify certificate's signature? */
function signedBy(certificate, issuer) {
    const algorithm = signatureHashes[certificate.signatureAlgorithm];
    if (!algorithm) return false;
    try {
        const key = t.parseSubjectPublicKeyInfo(issuer.subjectPublicKeyInfo);
        if (algorithm[0] === "ecdsa")
            return (
                key.type === "ec" &&
                (key.curve === "P-256" || key.curve === "P-384") &&
                t.verifyEcdsa(
                    key.curve,
                    key.key,
                    algorithm[1],
                    certificate.tbs,
                    certificate.signature,
                )
            );
        return (
            key.type === "rsa" &&
            t.verifyRsaPkcs1(
                key,
                algorithm[1],
                certificate.tbs,
                certificate.signature,
            )
        );
    } catch {
        return false;
    }
}
function checkValidity(certificate, now) {
    if (now < certificate.notBefore)
        return verifyError(
            "CERT_NOT_YET_VALID",
            "certificate is not yet valid",
        );
    if (now > certificate.notAfter)
        return verifyError("CERT_HAS_EXPIRED", "certificate has expired");
    return null;
}
/**
 * Build a path from the leaf through the presented certificates to a trusted
 * one. Placeholder for the full X.509 verification (issue #301, step 3): it
 * checks signatures, validity periods and the CA flag of intermediates, not
 * key usage, name constraints or policies.
 */
function verifyChain(chain, anchors, now) {
    let current = chain[0];
    for (let depth = 0; depth < 10; depth++) {
        const invalid = checkValidity(current, now);
        if (invalid) return invalid;
        if (anchors.some((anchor) => equalBytes(anchor.raw, current.raw)))
            return null;
        const anchor = anchors.find(
            (anchor) =>
                equalBytes(anchor.subjectRaw, current.issuerRaw) &&
                signedBy(current, anchor),
        );
        if (anchor) return checkValidity(anchor, now);
        const next = chain.find(
            (candidate) =>
                candidate !== current &&
                candidate.ca === true &&
                equalBytes(candidate.subjectRaw, current.issuerRaw) &&
                signedBy(current, candidate),
        );
        if (next === undefined) {
            if (
                equalBytes(current.issuerRaw, current.subjectRaw) &&
                signedBy(current, current)
            )
                return depth === 0
                    ? verifyError(
                          "DEPTH_ZERO_SELF_SIGNED_CERT",
                          "self-signed certificate",
                      )
                    : verifyError(
                          "SELF_SIGNED_CERT_IN_CHAIN",
                          "self-signed certificate in certificate chain",
                      );
            return verifyError(
                "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
                "unable to get local issuer certificate",
            );
        }
        current = next;
    }
    return verifyError("CERT_CHAIN_TOO_LONG", "certificate chain too long");
}
/**
 * The verification hook of the client: chain is the server's certificates
 * (DER, leaf first). Returns { authorized, error }. Without a ca option nothing is
 * trusted yet (the operating system's store is not read), so the result is
 * UNABLE_TO_GET_ISSUER_CERT_LOCALLY and a client with rejectUnauthorized
 * refuses the connection.
 */
export function verifyPeer(chain, options, hostname) {
    let certificates;
    try {
        certificates = chain.map(parseCertificate);
    } catch {
        return {
            authorized: false,
            error: verifyError(
                "UNABLE_TO_DECODE_ISSUER_PUBLIC_KEY",
                "unable to decode the certificate",
            ),
        };
    }
    let anchors;
    try {
        const ca =
            options.ca !== undefined
                ? options.ca
                : options.secureContext?.context?.ca;
        anchors = certificateList(ca).map(parseCertificate);
    } catch {
        anchors = [];
    }
    const error =
        anchors.length === 0
            ? verifyError(
                  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
                  "unable to get local issuer certificate",
              )
            : verifyChain(certificates, anchors, Date.now());
    if (error) return { authorized: false, error };
    const check =
        typeof options.checkServerIdentity === "function"
            ? options.checkServerIdentity
            : checkServerIdentity;
    const identityError = check(hostname, peerCertificate(chain, 0, false, []));
    if (identityError) return { authorized: false, error: identityError };
    return { authorized: true, error: null };
}

function expandIPv6(text) {
    if (net.isIPv4(text)) return text;
    const halves = text.split("::");
    const parse = (part) => (part === "" ? [] : part.split(":"));
    let head = parse(halves[0]),
        tail = halves.length > 1 ? parse(halves[1]) : [];
    if (tail.length > 0 && tail[tail.length - 1].includes(".")) {
        const v4 = tail.pop().split(".").map(Number);
        tail.push(
            ((v4[0] << 8) | v4[1]).toString(16),
            ((v4[2] << 8) | v4[3]).toString(16),
        );
    }
    const zeros = new Array(Math.max(0, 8 - head.length - tail.length)).fill(
        "0",
    );
    return head
        .concat(halves.length > 1 ? zeros : [], tail)
        .map((group) => parseInt(group, 16).toString(16).toUpperCase())
        .join(":");
}
function hostMatches(hostParts, pattern) {
    const patternParts = pattern.toLowerCase().replace(/\.$/, "").split(".");
    if (patternParts.length !== hostParts.length || patternParts.includes(""))
        return false;
    for (let i = 1; i < hostParts.length; i++)
        if (patternParts[i] !== hostParts[i]) return false;
    const first = patternParts[0],
        host = hostParts[0];
    if (first === host) return true;
    if (
        !first.includes("*") ||
        patternParts.length < 3 ||
        first.startsWith("xn--")
    )
        return false;
    const pieces = first.split("*");
    if (pieces.length > 2) return false;
    return (
        host.length >= pieces[0].length + pieces[1].length &&
        host.startsWith(pieces[0]) &&
        host.endsWith(pieces[1])
    );
}
/** Node's tls.checkServerIdentity: undefined when the certificate is for hostname. */
export function checkServerIdentity(hostname, cert) {
    hostname = String(hostname);
    const subject = cert.subject,
        altNames = cert.subjectaltname;
    const dnsNames = [],
        ips = [];
    if (altNames)
        for (const name of altNames.split(", ")) {
            if (name.startsWith("DNS:")) dnsNames.push(name.slice(4));
            else if (name.startsWith("IP Address:"))
                ips.push(expandIPv6(name.slice(11)));
        }
    let valid = false,
        reason = "Unknown reason";
    const bare = hostname.replace(/\.$/, "");
    if (net.isIP(bare)) {
        valid = ips.includes(expandIPv6(bare));
        if (!valid)
            reason =
                "IP: " +
                hostname +
                " is not in the cert's list: " +
                ips.join(", ");
    } else if (dnsNames.length > 0 || (subject && subject.CN)) {
        const hostParts = bare.toLowerCase().split(".");
        if (dnsNames.length > 0) {
            valid = dnsNames.some((pattern) => hostMatches(hostParts, pattern));
            if (!valid)
                reason =
                    "Host: " +
                    hostname +
                    ". is not in the cert's altnames: " +
                    altNames;
        } else {
            const cn = subject.CN;
            valid = Array.isArray(cn)
                ? cn.some((pattern) => hostMatches(hostParts, pattern))
                : hostMatches(hostParts, cn);
            if (!valid)
                reason = "Host: " + hostname + ". is not cert's CN: " + cn;
        }
    } else reason = "Cert does not contain a DNS name";
    if (valid) return undefined;
    const error = codedError(
        "ERR_TLS_CERT_ALTNAME_INVALID",
        "Hostname/IP does not match certificate's altnames: " + reason,
    );
    error.reason = reason;
    error.host = hostname;
    error.cert = cert;
    return error;
}

// ---- TLSSocket -----------------------------------------------------------------
/** Write callbacks are functions, or (from node:http) objects with a _sent method. */
function invoke(callback, error) {
    if (typeof callback === "function") callback(error);
    else if (callback) callback._sent(error);
}
function alpnList(protocols) {
    if (protocols === undefined || protocols === null) return [];
    const list = [];
    if (!Array.isArray(protocols)) {
        // Wire format: length-prefixed names.
        const bytes = new Uint8Array(
            protocols.buffer || protocols,
            protocols.byteOffset || 0,
            protocols.byteLength,
        );
        for (let at = 0; at < bytes.length; at += 1 + bytes[at])
            list.push(bytes.slice(at + 1, at + 1 + bytes[at]));
    } else
        for (const protocol of protocols)
            list.push(
                typeof protocol === "string"
                    ? new Uint8Array(Buffer.from(protocol, "utf8"))
                    : new Uint8Array(protocol),
            );
    for (const protocol of list)
        if (protocol.length === 0 || protocol.length > 255)
            throw codedError(
                "ERR_OUT_OF_RANGE",
                "The byte length of the protocol at index 0 exceeds the maximum length. It must be <= 255. Received " +
                    protocol.length,
                RangeError,
            );
    return list;
}
/** Receives the raw socket's bytes (the net.Socket consumer protocol node:http uses too). */
class RawReader {
    constructor(socket) {
        this.socket = socket;
    }
    onData(buffer, n) {
        this.socket._engine?.receive(buffer.subarray(0, n));
    }
    onEnd() {
        this.socket._onRawEnd();
    }
}
const notEstablished = () =>
    codedError(
        "ECONNRESET",
        "Client network socket disconnected before secure TLS connection was established",
    );

export class TLSSocket extends net.Socket {
    constructor(socket, options) {
        options = options || {};
        super({ allowHalfOpen: !!options.allowHalfOpen });
        this._tlsOptions = options;
        this.encrypted = true;
        this.authorized = false;
        this.authorizationError = null;
        this.alpnProtocol = null;
        this.servername = null;
        this._raw = null;
        this._engine = null;
        this._secure = false;
        this._pending = [];
        this._pendingLength = 0;
        this._hostname = options.host || "localhost";
        this._servername = "";
        if (socket) this._wrap(socket, false);
    }
    get bytesRead() {
        return this._raw === null ? 0 : this._raw.bytesRead;
    }
    get bytesWritten() {
        return this._raw === null ? 0 : this._raw.bytesWritten;
    }
    get writableLength() {
        return (
            this._pendingLength +
            (this._raw === null ? 0 : this._raw.writableLength)
        );
    }
    get bufferSize() {
        return this.writableLength;
    }
    get pending() {
        return this._raw === null || this._raw.pending;
    }
    get readyState() {
        if (this.connecting) return "opening";
        if (this._raw === null || this._destroyed) return "closed";
        const readable = !this._eof,
            writable = !this._writeEnded;
        return readable && writable
            ? "open"
            : readable
              ? "readOnly"
              : writable
                ? "writeOnly"
                : "closed";
    }
    _peer() {
        return this._raw === null ? {} : this._raw._peer();
    }
    _local() {
        return this._raw === null ? {} : this._raw._local();
    }
    _wrap(raw, created) {
        this._raw = raw;
        raw._consumer = new RawReader(this);
        raw.on("error", (error) => this.destroy(error));
        raw.on("close", () => this._onRawClose());
        raw.on("timeout", () => this.emit("timeout"));
        raw.on("drain", () => {
            if (this._needDrain && this._pendingLength === 0) {
                this._needDrain = false;
                this.emit("drain");
            }
        });
        raw.on("finish", () => {
            this._finished = true;
            this.emit("finish");
            this._maybeClose();
        });
        if (created)
            raw.on("lookup", (...args) => this.emit("lookup", ...args));
        if (raw.connecting) {
            this.connecting = true;
            raw.once("connect", () => {
                this.connecting = false;
                if (created) {
                    this.emit("connect");
                    this.emit("ready");
                }
                this._startHandshake();
            });
        } else queueMicrotask(() => this._startHandshake());
    }
    _startHandshake() {
        if (this._destroyed || this._engine !== null) return;
        const options = this._tlsOptions;
        const engine = new ClientEngine({
            servername: this._servername,
            ALPNProtocols: alpnList(options.ALPNProtocols),
        });
        this._engine = engine;
        engine.send = (bytes) => {
            if (!this._raw.destroyed) this._raw.write(bytes);
        };
        engine.onSecure = () => this._onSecure();
        engine.onData = (bytes) => this._onPlaintext(bytes);
        engine.onCloseNotify = () => this._onReadEnd();
        engine.onError = (error) => this.destroy(error);
        engine.verify = (chain) => {
            const result = verifyPeer(chain, options, this._hostname);
            this.authorized = result.authorized;
            this.authorizationError = result.error
                ? result.error.code || result.error.message
                : null;
            return result.authorized || options.rejectUnauthorized === false
                ? null
                : result.error;
        };
        try {
            engine.start();
        } catch (error) {
            this.destroy(error);
        }
    }
    _onSecure() {
        this._secure = true;
        this.alpnProtocol = this._engine.alpnProtocol || false;
        this.servername = this._servername || false;
        const pending = this._pending;
        this._pending = [];
        this._pendingLength = 0;
        for (const item of pending) this._sendPlain(item.bytes, item.callback);
        if (this._writeEnded) this._closeWrite();
        this.emit("secureConnect");
        if (this._needDrain && this._raw.writableLength < 16384) {
            this._needDrain = false;
            this.emit("drain");
        }
    }
    _onPlaintext(bytes) {
        if (this._consumer !== null) {
            this._consumer.onData(bytes, bytes.length);
            return;
        }
        if (
            !this.push(
                Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length),
            )
        )
            this._raw.pause();
    }
    _read() {
        const raw = this._raw;
        if (raw !== null && raw._flowing === false) {
            raw.resume();
            // The raw socket feeds a consumer: keep it out of flowing mode.
            raw._flowing = null;
        }
    }
    pause() {
        super.pause();
        if (this._raw !== null) this._raw.pause();
        return this;
    }
    resume() {
        super.resume();
        this._read();
        return this;
    }
    /** End of the peer's data: close_notify, or the TCP stream ended after the handshake. */
    _onReadEnd() {
        if (this._eof) return;
        this._eof = true;
        if (this._consumer !== null) this._consumer.onEnd();
        else this.push(null);
        if (!this.allowHalfOpen && !this._writeEnded) this.end();
        this._maybeClose();
    }
    _onRawEnd() {
        if (!this._secure) this.destroy(notEstablished());
        else this._onReadEnd();
    }
    _onRawClose() {
        if (this._destroyed) return;
        if (!this._secure) {
            this.destroy(notEstablished());
            return;
        }
        // Let a pending 'end' reach the program before 'close'.
        if (this._ended && !this._endEmitted && this._flowing === true)
            this._rawClosed = true;
        else this.destroy();
    }
    _ended_() {
        if (this._rawClosed) this.destroy();
        else this._maybeClose();
    }
    write(data, encoding, callback) {
        if (typeof encoding === "function") {
            callback = encoding;
            encoding = undefined;
        }
        if (this._writeEnded) {
            const error = codedError(
                "ERR_STREAM_WRITE_AFTER_END",
                "write after end",
            );
            queueMicrotask(() => {
                if (callback) callback(error);
                this.emit("error", error);
            });
            return false;
        }
        if (typeof data !== "string" && !(data instanceof Uint8Array)) {
            const error = new TypeError(
                'The "chunk" argument must be of type string or an instance of Buffer or Uint8Array. Received ' +
                    (data === null ? "null" : typeof data),
            );
            error.code = "ERR_INVALID_ARG_TYPE";
            throw error;
        }
        const bytes =
            typeof data === "string" ? Buffer.from(data, encoding) : data;
        if (this._destroyed) {
            const error = codedError(
                "ERR_STREAM_DESTROYED",
                "Cannot call write after a stream was destroyed",
            );
            if (callback) queueMicrotask(() => callback(error));
            return false;
        }
        if (!this._secure) {
            this._pending.push({ bytes, callback });
            this._pendingLength += bytes.length;
            const ok = this._pendingLength < 16384;
            if (!ok) this._needDrain = true;
            return ok;
        }
        return this._sendPlain(bytes, callback);
    }
    _sendPlain(bytes, callback) {
        let records;
        try {
            records = this._engine.seal(bytes);
        } catch (error) {
            if (callback) queueMicrotask(() => invoke(callback, error));
            return false;
        }
        const ok = this._raw.write(records, callback);
        if (!ok) this._needDrain = true;
        return ok;
    }
    /** Internal fast path of node:http (see net.Socket._sendNow). */
    _sendNow(bytes, length, callback) {
        const view =
            length === bytes.length ? bytes : bytes.subarray(0, length);
        if (!this._secure || this._destroyed) {
            const copy = new Uint8Array(view);
            if (this._destroyed || this._writeEnded)
                return this.write(copy, callback);
            this._pending.push({ bytes: copy, callback });
            this._pendingLength += copy.length;
            return this._pendingLength < 16384;
        }
        return this._sendPlain(view, callback);
    }
    end(data, encoding, callback) {
        if (typeof data === "function") {
            callback = data;
            data = undefined;
        } else if (typeof encoding === "function") {
            callback = encoding;
            encoding = undefined;
        }
        if (data !== undefined && data !== null) this.write(data, encoding);
        if (typeof callback === "function") this.once("finish", callback);
        if (this._writeEnded) return this;
        this._writeEnded = true;
        if (this._secure) this._closeWrite();
        else if (this._raw === null) queueMicrotask(() => this.destroy());
        return this;
    }
    /** close_notify, then the TCP half-close. */
    _closeWrite() {
        if (this._shutdown || this._destroyed) return;
        this._shutdown = true;
        const alert = this._engine.closeNotify();
        if (alert.length > 0) this._raw.write(alert);
        this._raw.end();
    }
    _destroy(error, callback) {
        if (error) this._hadError = true;
        this.connecting = false;
        if (this._engine !== null) this._engine.abort();
        for (const item of this._pending)
            if (item.callback) {
                const cb = item.callback;
                queueMicrotask(() =>
                    invoke(
                        cb,
                        error ||
                            codedError(
                                "ERR_STREAM_DESTROYED",
                                "Cannot call write after a stream was destroyed",
                            ),
                    ),
                );
            }
        this._pending = [];
        this._pendingLength = 0;
        if (this._raw !== null && !this._raw.destroyed) this._raw.destroy();
        callback(error);
    }
    setTimeout(timeout, callback) {
        this._timeout = timeout;
        if (typeof callback === "function") {
            if (timeout === 0) this.removeListener("timeout", callback);
            else this.once("timeout", callback);
        }
        if (this._raw !== null) this._raw.setTimeout(timeout);
        return this;
    }
    _touch() {}
    setNoDelay(noDelay) {
        if (this._raw !== null) this._raw.setNoDelay(noDelay);
        return this;
    }
    setKeepAlive(enable, delay) {
        if (this._raw !== null) this._raw.setKeepAlive(enable, delay);
        return this;
    }
    ref() {
        if (this._raw !== null) this._raw.ref();
        return this;
    }
    unref() {
        if (this._raw !== null) this._raw.unref();
        return this;
    }
    getProtocol() {
        return this._secure ? "TLSv1.3" : null;
    }
    getCipher() {
        if (!this._secure) return null;
        const name = this._engine.suite.name;
        return { name, standardName: name, version: "TLSv1.3" };
    }
    getEphemeralKeyInfo() {
        if (!this._secure) return null;
        const group = this._engine.group;
        return {
            type: "ECDH",
            name: groupNames[group],
            size: group === GROUP_X25519 ? 253 : 256,
        };
    }
    getPeerCertificate(detailed) {
        const engine = this._engine;
        if (engine === null || engine.peerCertificates === null) return {};
        return peerCertificate(engine.peerCertificates, 0, !!detailed, []);
    }
    getCertificate() {
        return {};
    }
    getSession() {
        return undefined;
    }
    isSessionReused() {
        return false;
    }
    exportKeyingMaterial(length, label, context) {
        if (!this._secure)
            throw codedError(
                "ERR_TLS_INVALID_STATE",
                "TLS socket connection must be securely established",
            );
        return Buffer.from(
            this._engine.exportKeyingMaterial(
                length,
                encoder.encode(String(label)),
                context,
            ),
        );
    }
}
defaults(TLSSocket.prototype, { _rawClosed: false });
function defaults(proto, values) {
    for (const key of Object.keys(values))
        Object.defineProperty(proto, key, {
            value: values[key],
            writable: true,
            configurable: true,
        });
}

// ---- Module API ------------------------------------------------------------------
/** tls.connect(options[, callback]) or tls.connect(port[, host][, options][, callback]). */
export function connect(...args) {
    let callback;
    if (typeof args[args.length - 1] === "function") callback = args.pop();
    let options;
    if (args[0] !== null && typeof args[0] === "object")
        options = Object.assign({}, args[0]);
    else {
        const extra =
            typeof args[1] === "string"
                ? args[2]
                : args[1] !== null && typeof args[1] === "object"
                  ? args[1]
                  : undefined;
        options = Object.assign({}, extra, { port: args[0] });
        if (typeof args[1] === "string") options.host = args[1];
    }
    if (options.maxVersion !== undefined && options.maxVersion !== "TLSv1.3")
        throw codedError(
            "ERR_SSL_UNSUPPORTED_PROTOCOL",
            "maxVersion " +
                options.maxVersion +
                " is not supported: the Nona TLS client implements only TLSv1.3",
        );
    const host = options.host || "localhost";
    const socket = new TLSSocket(null, options);
    socket._hostname = options.servername || host;
    const servername =
        options.servername !== undefined ? String(options.servername) : host;
    socket._servername = net.isIP(servername) ? "" : servername;
    if (typeof callback === "function") socket.once("secureConnect", callback);
    let raw = options.socket,
        created = false;
    if (!raw) {
        raw = new net.Socket({ allowHalfOpen: true });
        raw.connect({ port: options.port, host, noDelay: options.noDelay });
        created = true;
    }
    socket._wrap(raw, created);
    if (typeof options.timeout === "number") socket.setTimeout(options.timeout);
    return socket;
}
export function createSecureContext(options) {
    return { context: Object.assign({}, options) };
}
export function getCiphers() {
    return offeredSuites.map((id) => suites[id].name.toLowerCase());
}
export function convertALPNProtocols(protocols, out) {
    const list = alpnList(protocols),
        bytes = [];
    for (const protocol of list) bytes.push(protocol.length, ...protocol);
    out.ALPNProtocols = Buffer.from(bytes);
}
function serverNotImplemented() {
    throw codedError(
        "ERR_METHOD_NOT_IMPLEMENTED",
        "The tls.createServer() method is not implemented by Nona yet",
    );
}
export function createServer() {
    serverNotImplemented();
}
export class Server {
    constructor() {
        serverNotImplemented();
    }
}
export const rootCertificates = Object.freeze([]);
export const DEFAULT_ECDH_CURVE = "auto";
export const DEFAULT_MIN_VERSION = "TLSv1.3";
export const DEFAULT_MAX_VERSION = "TLSv1.3";
export const DEFAULT_CIPHERS =
    "TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256";
/** Internal hooks for tests and node:https. */
export const _internal = { ClientEngine, parseCertificate, verifyPeer };
export default {
    TLSSocket,
    Server,
    connect,
    createServer,
    createSecureContext,
    checkServerIdentity,
    getCiphers,
    convertALPNProtocols,
    rootCertificates,
    DEFAULT_ECDH_CURVE,
    DEFAULT_MIN_VERSION,
    DEFAULT_MAX_VERSION,
    DEFAULT_CIPHERS,
};
