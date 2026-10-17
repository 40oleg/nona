// nona:internal/x509: X.509 certificates for the TLS client (issue #301).
// It parses certificates (RFC 5280), builds and verifies the server's chain
// up to a trust anchor, and checks the host name (Node's
// tls.checkServerIdentity, RFC 6125). The signatures are checked with the
// primitives of nona:internal/tls-crypto.
//
// Verification follows what Node.js reports through OpenSSL, so programs see
// the same error codes and messages: chain building (trusted certificates
// first, then the certificates the server sent in any order, then the
// operating system's intermediate CAs), then per certificate the critical
// extensions, the CA flag, the TLS server purpose (extKeyUsage, keyUsage,
// nsCertType) and pathLenConstraint, the key and digest strength, then
// signatures and validity periods from the anchor down, then name
// constraints. Node's verify callback lets OpenSSL continue after an error,
// and the error it reports is the last one; so does verifyChain.
//
// Trust anchors are the ca option or the operating system's store
// (nona:internal/x509-store: a PEM bundle on Linux, the ROOT and CA system
// stores through crypt32.dll on Windows), loaded once. Revocation (CRL,
// OCSP), AIA fetching of missing intermediates and certificate policies are
// not implemented.
import { Buffer } from "node:buffer";
import { isIP } from "node:net";
import * as t from "nona:internal/tls-crypto";
import { loadStore } from "nona:internal/x509-store";

function codedError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
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
function latin1(bytes) {
    let text = "";
    for (let i = 0; i < bytes.length; i++)
        text += String.fromCharCode(bytes[i]);
    return text;
}

// ---- Parsing -------------------------------------------------------------------
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
    "2.5.4.12": "title",
    "2.5.4.42": "GN",
    "2.5.4.97": "organizationIdentifier",
    "1.2.840.113549.1.9.1": "emailAddress",
    "0.9.2342.19200300.100.1.1": "UID",
    "0.9.2342.19200300.100.1.25": "DC",
};
const stringTags = [0x0c, 0x13, 0x14, 0x16, 0x1a, 0x1c, 0x1e];
/**
 * A Name as Node's subject/issuer object, its RDNs in canonical form (OpenSSL
 * compares names case-insensitively with whitespace folded) and its key, the
 * canonical text used to match issuers.
 */
function parseName(bytes, node) {
    if (node.tag !== 0x30) throw codedError("ERR_NONA_DER", "bad Name");
    const object = {},
        rdns = [];
    for (const rdn of t.derChildren(bytes, node)) {
        if (rdn.tag !== 0x31) throw codedError("ERR_NONA_DER", "bad RDN");
        const parts = [];
        for (const attribute of t.derChildren(bytes, rdn)) {
            const [type, value] = t.derChildren(bytes, attribute);
            const oid = t.derOid(bytes, type);
            const isString = stringTags.includes(value.tag);
            const text = isString
                ? t.derString(bytes, value)
                : toHex(t.derEncoding(bytes, value));
            const key = nameKeys[oid] || oid;
            if (object[key] === undefined) object[key] = text;
            else if (Array.isArray(object[key])) object[key].push(text);
            else object[key] = [object[key], text];
            parts.push(
                oid +
                    "=" +
                    (isString
                        ? text
                              .trim()
                              .replace(/\s+/g, " ")
                              .replace(/[A-Z]+/g, (s) => s.toLowerCase())
                        : text),
            );
        }
        rdns.push(parts.sort().join("+"));
    }
    return { object, rdns, key: rdns.join(",") };
}
function formatIP(bytes) {
    if (bytes.length === 4) return Array.from(bytes).join(".");
    if (bytes.length !== 16) return "<invalid length=" + bytes.length + ">";
    const groups = [];
    for (let i = 0; i + 1 < bytes.length; i += 2)
        groups.push(
            ((bytes[i] << 8) | bytes[i + 1]).toString(16).toUpperCase(),
        );
    return groups.join(":");
}
/** GeneralNames as [{ type, number, value, bytes }]. */
function parseGeneralNames(bytes, node) {
    const names = [];
    for (const name of t.derChildren(bytes, node)) {
        const data = t.derValue(bytes, name);
        const entry = { number: name.number, bytes: data };
        if (name.cls !== 2) throw codedError("ERR_NONA_DER", "bad GeneralName");
        const text = { 1: "email", 2: "DNS", 6: "URI" }[name.number];
        if (text !== undefined) {
            entry.type = text;
            entry.value = latin1(data);
        } else if (name.number === 7) {
            entry.type = "IP Address";
            entry.value = formatIP(data);
        } else if (name.number === 4) {
            entry.type = "DirName";
            entry.name = parseName(
                bytes,
                t.derRead(bytes, name.start, name.end),
            );
        } else entry.type = "other";
        names.push(entry);
    }
    return names;
}
/** A BIT STRING's first two bytes as a number (bit 0 of the ASN.1 value is 0x80 of the first byte). */
function bitFlags(bytes, node) {
    const bits = t.derBitString(bytes, node).bytes;
    return ((bits[0] || 0) << 8) | (bits[1] || 0);
}
const KU_DIGITAL_SIGNATURE = 0x8000,
    KU_KEY_ENCIPHERMENT = 0x2000,
    KU_KEY_AGREEMENT = 0x0800,
    KU_KEY_CERT_SIGN = 0x0400,
    KU_TLS = KU_DIGITAL_SIGNATURE | KU_KEY_ENCIPHERMENT | KU_KEY_AGREEMENT;
const keyUsageNames = [
    "digitalSignature",
    "nonRepudiation",
    "keyEncipherment",
    "dataEncipherment",
    "keyAgreement",
    "keyCertSign",
    "cRLSign",
    "encipherOnly",
    "decipherOnly",
];
const NS_SSL_SERVER = 0x40,
    NS_SSL_CA = 0x04,
    NS_ANY_CA = 0x07;
const EKU_SERVER_AUTH = "1.3.6.1.5.5.7.3.1",
    // Server gated cryptography (Netscape, Microsoft): OpenSSL accepts them as serverAuth.
    EKU_SGC = ["2.16.840.1.113730.4.1", "1.3.6.1.4.1.311.10.3.3"];
// Extensions OpenSSL knows (X509_supported_extension); any other critical
// extension makes the certificate unusable. Policies are recognized but not
// processed.
const supportedExtensions = [
    "2.16.840.1.113730.1.1", // nsCertType
    "2.5.29.15", // keyUsage
    "2.5.29.17", // subjectAltName
    "2.5.29.19", // basicConstraints
    "2.5.29.32", // certificatePolicies
    "2.5.29.31", // cRLDistributionPoints
    "2.5.29.37", // extKeyUsage
    "1.3.6.1.5.5.7.48.1.5", // OCSP no check
    "2.5.29.36", // policyConstraints
    "2.5.29.30", // nameConstraints
    "2.5.29.33", // policyMappings
    "2.5.29.54", // inhibitAnyPolicy
];
const hashOids = {
    "1.3.14.3.2.26": "sha1",
    "2.16.840.1.101.3.4.2.1": "sha256",
    "2.16.840.1.101.3.4.2.2": "sha384",
    "2.16.840.1.101.3.4.2.3": "sha512",
};
// Signature algorithms: [key type, hash]. MD5 and SHA-1 are recognized so
// that they can be refused as too weak, as OpenSSL 3 does at its default
// security level.
const signatureAlgorithms = {
    "1.2.840.10045.4.1": ["ec", "sha1"],
    "1.2.840.10045.4.3.2": ["ec", "sha256"],
    "1.2.840.10045.4.3.3": ["ec", "sha384"],
    "1.2.840.10045.4.3.4": ["ec", "sha512"],
    "1.2.840.113549.1.1.4": ["rsa", "md5"],
    "1.2.840.113549.1.1.5": ["rsa", "sha1"],
    "1.2.840.113549.1.1.11": ["rsa", "sha256"],
    "1.2.840.113549.1.1.12": ["rsa", "sha384"],
    "1.2.840.113549.1.1.13": ["rsa", "sha512"],
    "1.2.840.113549.1.1.10": ["rsa-pss", null],
    "1.3.101.112": ["ed25519", null],
};
/** RSASSA-PSS-params (RFC 4055): { hash, saltLength }, or null when unsupported. */
function pssParameters(bytes, node) {
    let hash = "sha1",
        mgfHash = "sha1",
        saltLength = 20;
    if (node === undefined || node.tag !== 0x30) return null;
    for (const field of t.derChildren(bytes, node)) {
        const inner = t.derRead(bytes, field.start, field.end);
        if (field.tag === 0xa0)
            hash = hashOids[t.derOid(bytes, t.derChildren(bytes, inner)[0])];
        else if (field.tag === 0xa1) {
            const [oid, parameters] = t.derChildren(bytes, inner);
            if (t.derOid(bytes, oid) !== "1.2.840.113549.1.1.8") return null;
            mgfHash =
                hashOids[t.derOid(bytes, t.derChildren(bytes, parameters)[0])];
        } else if (field.tag === 0xa2)
            saltLength = Number(t.derInteger(bytes, inner));
        else if (field.tag === 0xa3) {
            if (t.derInteger(bytes, inner) !== 1n) return null;
        } else return null;
    }
    if (!hash || hash !== mgfHash || saltLength < 0) return null;
    return { hash, saltLength };
}

/**
 * Parse a DER certificate. The result has the raw parts (raw, tbs,
 * signature, subjectPublicKeyInfo, issuerRaw, subjectRaw), the decoded
 * fields (version, serialNumber, issuer, subject, notBefore, notAfter in
 * ms), the signature algorithm, and the extensions: altNames, ca, pathLen,
 * keyUsage, extKeyUsage, nsCertType, subjectKeyId, authorityKeyId,
 * nameConstraints, infoAccess, plus criticalUnknown and invalid.
 */
export function parseCertificate(raw) {
    raw = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    const certificate = t.derRead(raw);
    if (certificate.tag !== 0x30 || certificate.end !== raw.length)
        throw codedError("ERR_NONA_DER", "Invalid DER: not a certificate");
    const [tbsNode, algorithmNode, signatureNode] = t.derChildren(
        raw,
        certificate,
    );
    if (
        tbsNode?.tag !== 0x30 ||
        algorithmNode?.tag !== 0x30 ||
        signatureNode?.tag !== 0x03
    )
        throw codedError("ERR_NONA_DER", "Invalid DER: not a certificate");
    const fields = t.derChildren(raw, tbsNode);
    let i = 0,
        version = 1;
    if (fields[0].tag === 0xa0) {
        version =
            Number(
                t.derInteger(
                    raw,
                    t.derRead(raw, fields[0].start, fields[0].end),
                ),
            ) + 1;
        i = 1;
    }
    const serial = fields[i++],
        signatureInTbs = fields[i++],
        issuer = fields[i++],
        validity = fields[i++],
        subject = fields[i++],
        spki = fields[i++];
    if (serial?.tag !== 2 || validity?.tag !== 0x30 || spki?.tag !== 0x30)
        throw codedError("ERR_NONA_DER", "Invalid DER: bad TBSCertificate");
    const [notBefore, notAfter] = t.derChildren(raw, validity);
    const algorithm = t.derChildren(raw, algorithmNode);
    const issuerName = parseName(raw, issuer),
        subjectName = parseName(raw, subject);
    const result = {
        raw,
        tbs: t.derEncoding(raw, tbsNode),
        version,
        signatureAlgorithm: t.derOid(raw, algorithm[0]),
        signatureAlgorithmRaw: t.derEncoding(raw, algorithmNode),
        signatureAlgorithmInTbs: t.derEncoding(raw, signatureInTbs),
        pss: null,
        signature: t.derBitString(raw, signatureNode).bytes,
        serialNumber: toHex(t.derUnsigned(raw, serial)).toUpperCase(),
        serialRaw: t.derValue(raw, serial),
        issuer: issuerName.object,
        issuerRaw: t.derEncoding(raw, issuer),
        issuerName,
        subject: subjectName.object,
        subjectRaw: t.derEncoding(raw, subject),
        subjectName,
        notBefore: t.derTime(raw, notBefore),
        notAfter: t.derTime(raw, notAfter),
        subjectPublicKeyInfo: t.derEncoding(raw, spki),
        altNames: [],
        ca: undefined,
        pathLen: -1,
        keyUsage: undefined,
        extKeyUsage: undefined,
        nsCertType: undefined,
        subjectKeyId: undefined,
        authorityKeyId: undefined,
        nameConstraints: undefined,
        infoAccess: undefined,
        criticalUnknown: false,
        invalid: false,
        selfIssued: issuerName.key === subjectName.key,
    };
    if (result.signatureAlgorithm === "1.2.840.113549.1.1.10")
        try {
            result.pss = pssParameters(raw, algorithm[1]);
        } catch {}
    for (; i < fields.length; i++) {
        if (fields[i].tag !== 0xa3 || version !== 3) continue;
        const list = t.derRead(raw, fields[i].start, fields[i].end);
        const seen = new Set();
        for (const extension of t.derChildren(raw, list)) {
            const parts = t.derChildren(raw, extension);
            const oid = t.derOid(raw, parts[0]);
            const critical = parts.length === 3 && t.derBoolean(raw, parts[1]);
            const value = parts[parts.length - 1];
            if (seen.has(oid)) result.invalid = true;
            seen.add(oid);
            if (critical && !supportedExtensions.includes(oid))
                result.criticalUnknown = true;
            try {
                parseExtension(result, oid, raw, value);
            } catch {
                result.invalid = true;
            }
        }
    }
    return result;
}
function parseExtension(result, oid, raw, value) {
    if (value.tag !== 0x04) throw codedError("ERR_NONA_DER", "bad extension");
    const inner = t.derRead(raw, value.start, value.end);
    if (inner.end !== value.end)
        throw codedError("ERR_NONA_DER", "bad extension");
    switch (oid) {
        case "2.5.29.17":
            result.altNames = parseGeneralNames(raw, inner);
            break;
        case "2.5.29.19": {
            const items = t.derChildren(raw, inner);
            let at = 0;
            result.ca = false;
            if (items[at]?.tag === 0x01)
                result.ca = t.derBoolean(raw, items[at++]);
            if (items[at]?.tag === 0x02) {
                const pathLen = t.derInteger(raw, items[at]);
                if (pathLen < 0n || !result.ca) {
                    result.invalid = true;
                    result.pathLen = 0;
                } else result.pathLen = Number(pathLen);
            }
            break;
        }
        case "2.5.29.15":
            result.keyUsage = bitFlags(raw, inner);
            break;
        case "2.5.29.37":
            result.extKeyUsage = t
                .derChildren(raw, inner)
                .map((node) => t.derOid(raw, node));
            break;
        case "2.16.840.1.113730.1.1":
            result.nsCertType = bitFlags(raw, inner) >> 8;
            break;
        case "2.5.29.14":
            result.subjectKeyId = t.derValue(raw, inner);
            break;
        case "2.5.29.35": {
            const akid = {};
            for (const field of t.derChildren(raw, inner)) {
                if (field.tag === 0x80) akid.keyId = t.derValue(raw, field);
                else if (field.tag === 0xa1)
                    akid.issuer = parseGeneralNames(raw, field);
                else if (field.tag === 0x82)
                    akid.serial = t.derValue(raw, field);
            }
            result.authorityKeyId = akid;
            break;
        }
        case "2.5.29.30": {
            const constraints = { permitted: [], excluded: [] };
            for (const field of t.derChildren(raw, inner)) {
                const target =
                    field.tag === 0xa0
                        ? constraints.permitted
                        : field.tag === 0xa1
                          ? constraints.excluded
                          : null;
                if (target === null)
                    throw codedError("ERR_NONA_DER", "bad NameConstraints");
                for (const subtree of t.derChildren(raw, field)) {
                    const [base, ...rest] = t.derChildren(raw, subtree);
                    const wrapper = {
                        start: subtree.start,
                        end: base.end,
                    };
                    const name = parseGeneralNames(raw, wrapper)[0];
                    // minimum/maximum must be absent (RFC 5280 §4.2.1.10).
                    name.minMax = rest.length > 0;
                    target.push(name);
                }
            }
            result.nameConstraints = constraints;
            break;
        }
        case "1.3.6.1.5.5.7.1.1": {
            const access = {};
            for (const description of t.derChildren(raw, inner)) {
                const [method, location] = t.derChildren(raw, description);
                const methodOid = t.derOid(raw, method);
                const label =
                    methodOid === "1.3.6.1.5.5.7.48.1"
                        ? "OCSP - URI"
                        : methodOid === "1.3.6.1.5.5.7.48.2"
                          ? "CA Issuers - URI"
                          : null;
                if (label === null || location.number !== 6) continue;
                if (access[label] === undefined) access[label] = [];
                access[label].push(latin1(t.derValue(raw, location)));
            }
            result.infoAccess = access;
            break;
        }
    }
}

// ---- PEM -------------------------------------------------------------------------
const pemBegin = /-----BEGIN (?:X509 |TRUSTED )?CERTIFICATE-----/;
/** DER certificates in PEM text (no regular expressions over large bundles). */
function pemCertificates(text, out) {
    let at = 0;
    for (;;) {
        const begin = text.indexOf("-----BEGIN ", at);
        if (begin < 0) return out;
        const headerEnd = text.indexOf("-----", begin + 11);
        if (headerEnd < 0) return out;
        const label = text.slice(begin + 11, headerEnd);
        const end = text.indexOf("-----END " + label + "-----", headerEnd);
        if (end < 0) return out;
        if (pemBegin.test(text.slice(begin, headerEnd + 5)))
            out.push(
                new Uint8Array(
                    Buffer.from(
                        text.slice(headerEnd + 5, end).replace(/\s+/g, ""),
                        "base64",
                    ),
                ),
            );
        at = end + 14 + label.length;
    }
}
/** Certificates in a ca-style value (PEM text or DER, alone or in arrays) as DER. */
export function certificateList(value) {
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
            item = latin1(bytes);
        }
        pemCertificates(item, out);
    };
    add(value);
    return out;
}
/** A DER certificate as PEM text, in the format of tls.rootCertificates. */
export function toPem(der) {
    const base64 = Buffer.from(der).toString("base64");
    let text = "-----BEGIN CERTIFICATE-----\n";
    for (let i = 0; i < base64.length; i += 64)
        text += base64.slice(i, i + 64) + "\n";
    return text + "-----END CERTIFICATE-----";
}

// ---- Trust store -------------------------------------------------------------------
/** An index of parsed certificates by subject. */
class CertificatePool {
    constructor(certificates) {
        this.bySubject = new Map();
        this.list = [];
        for (const der of certificates) {
            let certificate;
            try {
                certificate = parseCertificate(der);
            } catch {
                continue; // a store entry that cannot be parsed is skipped
            }
            if (
                this.list.some((other) =>
                    equalBytes(other.raw, certificate.raw),
                )
            )
                continue;
            this.list.push(certificate);
            const key = certificate.subjectName.key;
            const entries = this.bySubject.get(key);
            if (entries) entries.push(certificate);
            else this.bySubject.set(key, [certificate]);
        }
    }
    issuersOf(certificate) {
        return this.bySubject.get(certificate.issuerName.key) || [];
    }
    contains(certificate) {
        return (this.bySubject.get(certificate.subjectName.key) || []).some(
            (entry) => equalBytes(entry.raw, certificate.raw),
        );
    }
}
let systemStore = null;
/** The operating system's store, loaded on first use: { roots, intermediates, rootDer }. */
export function systemTrustStore() {
    if (systemStore === null) {
        let loaded;
        try {
            loaded = loadStore();
        } catch {
            loaded = { roots: [], intermediates: [] };
        }
        const rootDer = certificateList(loaded.roots);
        systemStore = {
            rootDer,
            roots: new CertificatePool(rootDer),
            intermediates: new CertificatePool(
                certificateList(loaded.intermediates),
            ),
        };
    }
    return systemStore;
}
let rootPems = null;
/** tls.rootCertificates: the system roots as PEM strings. */
export function rootCertificates() {
    if (rootPems === null)
        rootPems = Object.freeze(
            systemTrustStore().roots.list.map((certificate) =>
                toPem(certificate.raw),
            ),
        );
    return rootPems;
}
let lastCa = null,
    lastCaPool = null;
function caPool(ca) {
    if (ca !== lastCa) {
        lastCaPool = new CertificatePool(certificateList(ca));
        lastCa = ca;
    }
    return lastCaPool;
}

// ---- Verification ----------------------------------------------------------------------
const verifyMessages = {
    UNABLE_TO_GET_ISSUER_CERT: "unable to get issuer certificate",
    UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "unable to get local issuer certificate",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: "unable to verify the first certificate",
    UNABLE_TO_DECODE_ISSUER_PUBLIC_KEY: "unable to decode issuer public key",
    DEPTH_ZERO_SELF_SIGNED_CERT: "self-signed certificate",
    SELF_SIGNED_CERT_IN_CHAIN: "self-signed certificate in certificate chain",
    CERT_SIGNATURE_FAILURE: "certificate signature failure",
    CERT_NOT_YET_VALID: "certificate is not yet valid",
    CERT_HAS_EXPIRED: "certificate has expired",
    CERT_CHAIN_TOO_LONG: "certificate chain too long",
    INVALID_CA: "invalid CA certificate",
    INVALID_PURPOSE: "unsuitable certificate purpose",
    PATH_LENGTH_EXCEEDED: "path length constraint exceeded",
};
/** A verification error as Node reports it (OpenSSL's message; UNSPECIFIED for codes Node does not name). */
function verifyError(code, message) {
    return codedError(
        message === undefined ? code : "UNSPECIFIED",
        message === undefined ? verifyMessages[code] : message,
    );
}
const MAX_DEPTH = 100;

/** OpenSSL's X509_check_akid: may issuer be the certificate the authority key identifier names? */
function akidMatches(issuer, akid) {
    if (akid === undefined) return true;
    if (
        akid.keyId !== undefined &&
        issuer.subjectKeyId !== undefined &&
        !equalBytes(akid.keyId, issuer.subjectKeyId)
    )
        return false;
    if (akid.serial !== undefined && !equalBytes(akid.serial, issuer.serialRaw))
        return false;
    if (akid.issuer !== undefined) {
        const names = akid.issuer.filter((name) => name.type === "DirName");
        if (
            names.length > 0 &&
            !names.some((name) => name.name.key === issuer.issuerName.key)
        )
            return false;
    }
    return true;
}
function keyType(certificate) {
    if (certificate.keyType === undefined) {
        try {
            certificate.publicKey = t.parseSubjectPublicKeyInfo(
                certificate.subjectPublicKeyInfo,
            );
            certificate.keyType = certificate.publicKey.type;
        } catch {
            certificate.publicKey = null;
            certificate.keyType = null;
        }
    }
    return certificate.keyType;
}
/** Does the signature algorithm of certificate fit the key type of issuer? */
function algorithmFitsKey(certificate, issuer) {
    const algorithm = signatureAlgorithms[certificate.signatureAlgorithm];
    const type = keyType(issuer);
    if (!algorithm || type === null) return true; // fails later, with a clearer error
    if (algorithm[0] === "rsa-pss") return type === "rsa" || type === "rsa-pss";
    return algorithm[0] === type;
}
/** ossl_x509_likely_issued plus the keyCertSign check of X509_check_issued. */
export function issuedBy(certificate, issuer) {
    return (
        issuer.subjectName.key === certificate.issuerName.key &&
        akidMatches(issuer, certificate.authorityKeyId) &&
        algorithmFitsKey(certificate, issuer) &&
        (issuer.keyUsage === undefined ||
            (issuer.keyUsage & KU_KEY_CERT_SIGN) !== 0)
    );
}
function selfSigned(certificate) {
    return (
        certificate.selfIssued &&
        akidMatches(certificate, certificate.authorityKeyId) &&
        algorithmFitsKey(certificate, certificate)
    );
}
/** Does issuer's key verify certificate's signature? Cached per pair. */
export function signedBy(certificate, issuer) {
    if (certificate.verifiedBy === undefined)
        certificate.verifiedBy = new Map();
    const cache = certificate.verifiedBy;
    if (cache.has(issuer)) return cache.get(issuer);
    let valid = false;
    try {
        valid = checkSignature(certificate, issuer);
    } catch {}
    cache.set(issuer, valid);
    return valid;
}
function checkSignature(certificate, issuer) {
    if (
        !equalBytes(
            certificate.signatureAlgorithmRaw,
            certificate.signatureAlgorithmInTbs,
        )
    )
        return false;
    const algorithm = signatureAlgorithms[certificate.signatureAlgorithm];
    if (!algorithm || keyType(issuer) === null) return false;
    const key = issuer.publicKey;
    if (algorithm[0] === "ec")
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
    if (algorithm[0] === "rsa")
        return (
            key.type === "rsa" &&
            t.verifyRsaPkcs1(
                key,
                algorithm[1],
                certificate.tbs,
                certificate.signature,
            )
        );
    if (algorithm[0] === "rsa-pss") {
        const pss = certificate.pss;
        return (
            pss !== null &&
            pss.hash !== "sha1" &&
            (key.type === "rsa" || key.type === "rsa-pss") &&
            t.verifyRsaPss(
                key,
                pss.hash,
                certificate.tbs,
                certificate.signature,
                pss.saltLength,
            )
        );
    }
    return false; // Ed25519 and others are not implemented
}
function timeError(certificate, now) {
    if (now < certificate.notBefore) return verifyError("CERT_NOT_YET_VALID");
    if (now > certificate.notAfter) return verifyError("CERT_HAS_EXPIRED");
    return null;
}
/**
 * OpenSSL's find_issuer: among the certificates that may have issued
 * certificate (and are not in path yet), prefer one whose signature checks
 * out, then one that is currently valid, then the one that expires last.
 */
function findIssuer(certificate, candidates, path, now) {
    let best = null,
        bestScore = -1;
    for (const candidate of candidates) {
        if (!issuedBy(certificate, candidate)) continue;
        if (path.some((entry) => equalBytes(entry.raw, candidate.raw)))
            continue;
        const score =
            (signedBy(certificate, candidate) ? 2 : 0) +
            (timeError(candidate, now) === null ? 1 : 0);
        if (
            score > bestScore ||
            (score === bestScore && candidate.notAfter > best.notAfter)
        ) {
            best = candidate;
            bestScore = score;
        }
    }
    return best;
}
/** OpenSSL's check_ca: 0 when the certificate cannot be a CA. */
function checkCa(certificate) {
    if (
        certificate.keyUsage !== undefined &&
        !(certificate.keyUsage & KU_KEY_CERT_SIGN)
    )
        return 0;
    if (certificate.ca !== undefined) return certificate.ca ? 1 : 0;
    if (certificate.version === 1 && selfSigned(certificate)) return 3;
    if (certificate.keyUsage !== undefined) return 4;
    if (
        certificate.nsCertType !== undefined &&
        certificate.nsCertType & NS_ANY_CA
    )
        return 5;
    return 0;
}
/** OpenSSL's check_purpose_ssl_server. */
function serverPurpose(certificate, nonLeaf) {
    const eku = certificate.extKeyUsage;
    if (
        eku !== undefined &&
        !eku.includes(EKU_SERVER_AUTH) &&
        !eku.some((oid) => EKU_SGC.includes(oid))
    )
        return false;
    const ns = certificate.nsCertType;
    if (nonLeaf)
        return (
            checkCa(certificate) !== 0 &&
            (ns === undefined || (ns & NS_SSL_CA) !== 0)
        );
    if (ns !== undefined && !(ns & NS_SSL_SERVER)) return false;
    if (certificate.keyUsage !== undefined && !(certificate.keyUsage & KU_TLS))
        return false;
    return true;
}
const weakHashes = ["md5", "sha1"];

/**
 * Verify a chain (parsed certificates, leaf first, in the order the server
 * sent them) against anchors (a CertificatePool). intermediates is an extra
 * pool of untrusted CA certificates. Returns { error, path }: error is null or
 * the last error OpenSSL would report; path is the chain that was built.
 */
export function verifyChain(chain, anchors, intermediates, now) {
    const errors = [];
    const report = (error) => errors.push(error);
    const leaf = chain[0];
    const path = [leaf];
    const untrusted = chain
        .slice(1)
        .concat(intermediates ? intermediates.list : []);
    let trustedFrom = -1; // index of the first certificate taken from anchors
    // 1. Build the chain: trusted certificates first.
    for (;;) {
        const current = path[path.length - 1];
        if (trustedFrom < 0 && selfSigned(current)) {
            if (anchors.contains(current)) trustedFrom = path.length - 1;
            else
                report(
                    verifyError(
                        path.length === 1
                            ? "DEPTH_ZERO_SELF_SIGNED_CERT"
                            : "SELF_SIGNED_CERT_IN_CHAIN",
                    ),
                );
            break;
        }
        if (trustedFrom >= 0 && selfSigned(current)) break;
        if (path.length > MAX_DEPTH) {
            report(verifyError("CERT_CHAIN_TOO_LONG"));
            break;
        }
        const trusted = findIssuer(
            current,
            anchors.issuersOf(current),
            path,
            now,
        );
        if (trusted) {
            if (trustedFrom < 0) trustedFrom = path.length;
            path.push(trusted);
            continue;
        }
        if (trustedFrom >= 0) {
            // A trusted certificate that is not self-signed: OpenSSL wants its issuer too.
            report(verifyError("UNABLE_TO_GET_ISSUER_CERT"));
            break;
        }
        const next = findIssuer(current, untrusted, path, now);
        if (next) {
            path.push(next);
            continue;
        }
        report(
            verifyError(
                path.length === 1
                    ? "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
                    : "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
            ),
        );
        break;
    }
    const count = path.length;
    // 2. Extensions, CA flags, purpose and path length (check_chain_extensions).
    let pathLength = 0;
    for (let i = 0; i < count; i++) {
        const certificate = path[i];
        if (certificate.invalid)
            report(
                verifyError(
                    "INVALID_EXTENSION",
                    "invalid or inconsistent certificate extension",
                ),
            );
        if (certificate.criticalUnknown)
            report(
                verifyError(
                    "UNHANDLED_CRITICAL_EXTENSION",
                    "unhandled critical extension",
                ),
            );
        if (i > 0) {
            const ca = checkCa(certificate);
            // Intermediates need basicConstraints CA:TRUE; the top may be a v1 root.
            if (ca === 0 || (i + 1 < count && ca !== 1))
                report(verifyError("INVALID_CA"));
        }
        if (!serverPurpose(certificate, i > 0))
            report(verifyError("INVALID_PURPOSE"));
        if (
            i > 1 &&
            certificate.pathLen !== -1 &&
            pathLength > certificate.pathLen
        )
            report(verifyError("PATH_LENGTH_EXCEEDED"));
        if (i > 0 && !certificate.selfIssued) pathLength++;
    }
    // 3. Key sizes and signature digests (check_auth_level, security level 1).
    for (let i = 0; i < count; i++) {
        const certificate = path[i];
        keyType(certificate);
        const key = certificate.publicKey;
        if (
            key &&
            (key.type === "rsa" || key.type === "rsa-pss") &&
            key.bits < 1024
        )
            report(
                i === 0
                    ? verifyError(
                          "EE_KEY_TOO_SMALL",
                          "EE certificate key too weak",
                      )
                    : verifyError(
                          "CA_KEY_TOO_SMALL",
                          "CA certificate key too weak",
                      ),
            );
        if (i < count - 1) {
            const algorithm =
                signatureAlgorithms[certificate.signatureAlgorithm];
            const hash =
                algorithm &&
                (algorithm[1] || (certificate.pss && certificate.pss.hash));
            if (weakHashes.includes(hash))
                report(
                    verifyError(
                        "CA_MD_TOO_WEAK",
                        "CA signature digest algorithm too weak",
                    ),
                );
        }
    }
    // 4. Signatures and validity periods, from the top down (internal_verify).
    let n = count - 1;
    let issuer = path[n],
        subject = issuer;
    let checkTimes = true;
    if (!selfSigned(issuer)) {
        if (n === 0) {
            report(verifyError("UNABLE_TO_VERIFY_LEAF_SIGNATURE"));
            checkTimes = false;
        } else subject = path[--n];
    }
    if (checkTimes)
        for (;;) {
            if (subject !== issuer) {
                if (keyType(issuer) === null)
                    report(verifyError("UNABLE_TO_DECODE_ISSUER_PUBLIC_KEY"));
                else if (!signedBy(subject, issuer))
                    report(verifyError("CERT_SIGNATURE_FAILURE"));
            }
            const invalid = timeError(subject, now);
            if (invalid) report(invalid);
            if (--n < 0) break;
            issuer = subject;
            subject = path[n];
        }
    // 5. Name constraints.
    for (let i = 0; i < count; i++) {
        const certificate = path[i];
        if (i > 0 && i < count - 1 && certificate.selfIssued) continue;
        for (let j = i + 1; j < count; j++) {
            const constraints = path[j].nameConstraints;
            if (constraints === undefined) continue;
            const failure = nameConstraintError(
                certificate,
                constraints,
                i === 0,
            );
            if (failure) {
                report(failure);
                break;
            }
        }
    }
    return {
        error: errors.length > 0 ? errors[errors.length - 1] : null,
        path,
        trusted: trustedFrom >= 0,
    };
}

// ---- Name constraints -------------------------------------------------------------------
function ipBytes(text) {
    if (isIP(text) === 4) return new Uint8Array(text.split(".").map(Number));
    const words = parseIPv6Words(text);
    if (words === null) return null;
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 8; i++) {
        bytes[2 * i] = words[i] >> 8;
        bytes[2 * i + 1] = words[i] & 255;
    }
    return bytes;
}
function lowerAscii(text) {
    return text.replace(/[A-Z]+/g, (s) => s.toLowerCase());
}
/** nc_dns, nc_email, nc_ip and nc_dn of OpenSSL: does name lie in base? */
function nameInSubtree(name, base) {
    switch (base.number) {
        case 2: {
            const dns = lowerAscii(name),
                pattern = lowerAscii(base.value);
            if (pattern === "") return true;
            if (dns.length < pattern.length) return false;
            if (
                dns.length > pattern.length &&
                pattern[0] !== "." &&
                dns[dns.length - pattern.length - 1] !== "."
            )
                return false;
            return dns.endsWith(pattern);
        }
        case 1: {
            const pattern = base.value;
            const at = name.lastIndexOf("@");
            if (pattern.includes("@"))
                return (
                    name.slice(0, at) ===
                        pattern.slice(0, pattern.lastIndexOf("@")) &&
                    lowerAscii(name.slice(at + 1)) ===
                        lowerAscii(pattern.slice(pattern.lastIndexOf("@") + 1))
                );
            const domain = lowerAscii(name.slice(at + 1)),
                wanted = lowerAscii(pattern);
            if (wanted[0] === ".") return domain.endsWith(wanted);
            return domain === wanted;
        }
        case 7: {
            const address = name,
                range = base.bytes;
            if (range.length !== address.length * 2) return false;
            for (let i = 0; i < address.length; i++)
                if (
                    (address[i] & range[address.length + i]) !==
                    (range[i] & range[address.length + i])
                )
                    return false;
            return true;
        }
        case 4: {
            const want = base.name.rdns;
            if (want.length > name.rdns.length) return false;
            for (let i = 0; i < want.length; i++)
                if (want[i] !== name.rdns[i]) return false;
            return true;
        }
    }
    return null; // a constraint type that is not implemented
}
/** nc_match: one name against the constraints. */
function matchConstraints(number, name, constraints) {
    let match = 0;
    for (const base of constraints.permitted) {
        if (base.number !== number) continue;
        if (base.minMax)
            return verifyError(
                "SUBTREE_MINMAX",
                "unsupported or invalid name constraint syntax",
            );
        if (match === 2) continue;
        match = 1;
        const inside = nameInSubtree(name, base);
        if (inside === null)
            return verifyError(
                "UNSUPPORTED_CONSTRAINT_TYPE",
                "unsupported name constraint type",
            );
        if (inside) match = 2;
    }
    if (match === 1)
        return verifyError(
            "PERMITTED_VIOLATION",
            "permitted subtree violation",
        );
    for (const base of constraints.excluded) {
        if (base.number !== number) continue;
        if (base.minMax)
            return verifyError(
                "SUBTREE_MINMAX",
                "unsupported or invalid name constraint syntax",
            );
        const inside = nameInSubtree(name, base);
        if (inside === null)
            return verifyError(
                "UNSUPPORTED_CONSTRAINT_TYPE",
                "unsupported name constraint type",
            );
        if (inside)
            return verifyError(
                "EXCLUDED_VIOLATION",
                "excluded subtree violation",
            );
    }
    return null;
}
/** NAME_CONSTRAINTS_check (and NAME_CONSTRAINTS_check_CN for the leaf). */
function nameConstraintError(certificate, constraints, leaf) {
    if (certificate.subjectName.rdns.length > 0) {
        const failure = matchConstraints(
            4,
            certificate.subjectName,
            constraints,
        );
        if (failure) return failure;
        let emails = certificate.subject.emailAddress;
        if (emails !== undefined)
            for (const email of [].concat(emails)) {
                const emailFailure = matchConstraints(1, email, constraints);
                if (emailFailure) return emailFailure;
            }
    }
    for (const name of certificate.altNames) {
        const value =
            name.number === 7
                ? name.bytes
                : name.number === 4
                  ? name.name
                  : name.value;
        const failure = matchConstraints(name.number, value, constraints);
        if (failure) return failure;
    }
    if (leaf && !certificate.altNames.some((name) => name.number === 2)) {
        const cn = certificate.subject.CN;
        if (cn !== undefined)
            for (const name of [].concat(cn)) {
                // A CN that looks like a host name is checked as one.
                if (!/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+\.?$/.test(name))
                    continue;
                const failure = matchConstraints(2, name, constraints);
                if (failure) return failure;
            }
    }
    return null;
}

// ---- getPeerCertificate() ----------------------------------------------------------------
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
/** Node's IsSafeAltName: may the name appear unquoted in subjectaltname? */
function safeAltName(value) {
    for (let i = 0; i < value.length; i++) {
        const c = value.charCodeAt(i);
        if (c === 0x22 || c === 0x5c || c === 0x2c || c === 0x27) return false;
        if (c < 0x20 || c > 0x7e) return false;
    }
    return true;
}
function altNameText(name) {
    if (name.type === "IP Address") return name.type + ":" + name.value;
    if (name.type === "DirName" || name.type === "other") return null;
    return (
        name.type +
        ":" +
        (safeAltName(name.value) ? name.value : JSON.stringify(name.value))
    );
}
function nullPrototype(object) {
    return Object.assign(Object.create(null), object);
}
/** The object of getPeerCertificate() for chain[index] (DER certificates, leaf first). */
export function peerCertificate(chain, index, detailed, seen) {
    const parsed = parseCertificate(chain[index]);
    const names = parsed.altNames
        .map(altNameText)
        .filter((text) => text !== null);
    const result = {
        subject: nullPrototype(parsed.subject),
        issuer: nullPrototype(parsed.issuer),
        subjectaltname: names.length > 0 ? names.join(", ") : undefined,
        infoAccess: parsed.infoAccess
            ? nullPrototype(parsed.infoAccess)
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
        fingerprint512: toHex(
            t.digest("sha512", parsed.raw),
            ":",
        ).toUpperCase(),
        raw: Buffer.from(parsed.raw),
    };
    if (result.subjectaltname === undefined) delete result.subjectaltname;
    if (result.infoAccess === undefined) delete result.infoAccess;
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
        if (selfSigned(parsed)) result.issuerCertificate = result;
        else
            for (let j = 0; j < chain.length && issuerIndex < 0; j++)
                if (j !== index && issuedBy(parsed, parseCertificate(chain[j])))
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
/** The key usage names of a parsed certificate (for tests and diagnostics). */
export function keyUsageList(certificate) {
    if (certificate.keyUsage === undefined) return undefined;
    return keyUsageNames.filter(
        (_, bit) => certificate.keyUsage & (0x8000 >> bit),
    );
}

// ---- Host names ----------------------------------------------------------------------
function parseIPv6Words(text) {
    if (typeof text !== "string" || text.indexOf("%") >= 0) return null;
    const lastColon = text.lastIndexOf(":");
    if (lastColon < 0) return null;
    if (text.indexOf(".") > lastColon) {
        const four = text.slice(lastColon + 1);
        if (isIP(four) !== 4) return null;
        const parts = four.split(".").map(Number);
        text =
            text.slice(0, lastColon + 1) +
            ((parts[0] << 8) | parts[1]).toString(16) +
            ":" +
            ((parts[2] << 8) | parts[3]).toString(16);
    }
    const halves = text.split("::");
    if (halves.length > 2) return null;
    const parse = (part) =>
        part === ""
            ? []
            : part
                  .split(":")
                  .map((g) =>
                      /^[0-9a-fA-F]{1,4}$/.test(g) ? parseInt(g, 16) : NaN,
                  );
    const head = parse(halves[0]),
        rest = halves.length === 2 ? parse(halves[1]) : [];
    if (head.some((n) => n !== n) || rest.some((n) => n !== n)) return null;
    const total = head.length + rest.length;
    if (halves.length === 1 ? total !== 8 : total > 7) return null;
    return head.concat(new Array(8 - total).fill(0), rest);
}
/** Node's canonicalizeIP (inet_pton then libuv's inet_ntop). */
function canonicalizeIP(text) {
    if (isIP(text) === 4) return text;
    const words = parseIPv6Words(text);
    if (words === null) return undefined;
    let best = { base: -1, len: 0 },
        current = { base: -1, len: 0 };
    for (let i = 0; i < 8; i++) {
        if (words[i] === 0) {
            if (current.base === -1) current = { base: i, len: 1 };
            else current.len++;
        } else if (current.base !== -1) {
            if (best.base === -1 || current.len > best.len) best = current;
            current = { base: -1, len: 0 };
        }
    }
    if (current.base !== -1 && (best.base === -1 || current.len > best.len))
        best = current;
    if (best.base !== -1 && best.len < 2) best = { base: -1, len: 0 };
    let out = "";
    for (let i = 0; i < 8; i++) {
        if (best.base !== -1 && i >= best.base && i < best.base + best.len) {
            if (i === best.base) out += ":";
            continue;
        }
        if (i !== 0) out += ":";
        if (
            i === 6 &&
            best.base === 0 &&
            (best.len === 6 ||
                (best.len === 7 && words[7] !== 0x0001) ||
                (best.len === 5 && words[5] === 0xffff))
        ) {
            out +=
                (words[6] >> 8) +
                "." +
                (words[6] & 255) +
                "." +
                (words[7] >> 8) +
                "." +
                (words[7] & 255);
            break;
        }
        out += words[i].toString(16);
    }
    if (best.base !== -1 && best.base + best.len === 8) out += ":";
    return out;
}
function splitHost(host) {
    return lowerAscii(host.replace(/[.]$/, "")).split(".");
}
/** Node's check(): does the DNS pattern (at most one wildcard, in the left-most label) match? */
function hostMatches(hostParts, pattern) {
    if (!pattern) return false;
    const patternParts = splitHost(pattern);
    if (hostParts.length !== patternParts.length) return false;
    if (patternParts.includes("")) return false;
    // IDNA U-labels, blanks and control characters never match.
    if (patternParts.some((part) => /[^!-\u007F]/.test(part))) return false;
    for (let i = hostParts.length - 1; i > 0; i--)
        if (hostParts[i] !== patternParts[i]) return false;
    const host = hostParts[0],
        first = patternParts[0];
    const pieces = first.split("*", 3);
    if (pieces.length === 1 || first.includes("xn--")) return host === first;
    if (pieces.length > 2) return false;
    // *.tld wildcards are not allowed.
    if (patternParts.length <= 2) return false;
    const [prefix, suffix] = pieces;
    if (prefix.length + suffix.length > host.length) return false;
    return host.startsWith(prefix) && host.endsWith(suffix);
}
/** Node's splitEscapedAltNames: subjectaltname with JSON-quoted entries. */
function splitAltNames(altNames) {
    if (!altNames.includes('"')) return altNames.split(", ");
    const result = [];
    let current = "";
    for (let at = 0; at < altNames.length;) {
        const quote = altNames.indexOf('"', at),
            comma = altNames.indexOf(",", at);
        if (comma !== -1 && (quote === -1 || comma < quote)) {
            current += altNames.slice(at, comma);
            result.push(current);
            current = "";
            at = comma + 2;
        } else if (quote !== -1) {
            current += altNames.slice(at, quote);
            const match =
                /^"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/.exec(
                    altNames.slice(quote),
                );
            if (!match)
                throw codedError(
                    "ERR_TLS_CERT_ALTNAME_FORMAT",
                    "Invalid subject alternative name string",
                );
            current += JSON.parse(match[0]);
            at = quote + match[0].length;
        } else {
            current += altNames.slice(at);
            at = altNames.length;
        }
    }
    result.push(current);
    return result;
}
/** Punycode (RFC 3492) of one label. */
function punycode(input) {
    const codes = Array.from(input, (c) => c.codePointAt(0));
    const digit = (d) => String.fromCharCode(d + 22 + (d < 26 ? 75 : 0));
    const adapt = (delta, points, first) => {
        delta = first ? Math.floor(delta / 700) : delta >> 1;
        delta += Math.floor(delta / points);
        let k = 0;
        for (; delta > 455; k += 36) delta = Math.floor(delta / 35);
        return k + Math.floor((36 * delta) / (delta + 38));
    };
    let output = "";
    for (const c of codes) if (c < 128) output += String.fromCharCode(c);
    const basic = output.length;
    let handled = basic;
    if (basic > 0) output += "-";
    let n = 128,
        delta = 0,
        bias = 72;
    while (handled < codes.length) {
        let m = Infinity;
        for (const c of codes) if (c >= n && c < m) m = c;
        delta += (m - n) * (handled + 1);
        n = m;
        for (const c of codes) {
            if (c < n) delta++;
            if (c !== n) continue;
            let q = delta;
            for (let k = 36; ; k += 36) {
                const t = k <= bias ? 1 : k >= bias + 26 ? 26 : k - bias;
                if (q < t) break;
                output += digit(t + ((q - t) % (36 - t)));
                q = Math.floor((q - t) / (36 - t));
            }
            output += digit(q);
            bias = adapt(delta, handled + 1, handled === basic);
            delta = 0;
            handled++;
        }
        delta++;
        n++;
    }
    return output;
}
/**
 * The host name in ASCII, as Node maps it with url.domainToASCII before the
 * match: labels with other characters are lower-cased and Punycode-encoded
 * (without the full UTS #46 mapping). IP literals stay as they are.
 */
function hostToASCII(host) {
    if (isIP(host.replace(/[.]$/, ""))) return host;
    return host
        .split(".")
        .map((label) =>
            /^[\x00-\x7f]*$/.test(label)
                ? lowerAscii(label)
                : "xn--" + punycode(label.toLowerCase()),
        )
        .join(".");
}
/** Node's tls.checkServerIdentity: undefined when cert is for hostname, else the error. */
export function checkServerIdentity(hostname, cert) {
    const subject = cert.subject,
        altNames = cert.subjectaltname;
    const dnsNames = [],
        ips = [];
    hostname = "" + hostname;
    if (altNames)
        for (const name of splitAltNames(altNames)) {
            if (name.startsWith("DNS:")) dnsNames.push(name.slice(4));
            else if (name.startsWith("IP Address:"))
                ips.push(canonicalizeIP(name.slice(11)));
        }
    let valid = false,
        reason = "Unknown reason";
    const ascii = hostToASCII(hostname).replace(/[.]$/, "");
    hostname = hostname.replace(/[.]$/, "");
    if (isIP(ascii)) {
        valid = ips.includes(canonicalizeIP(ascii));
        if (!valid)
            reason =
                "IP: " +
                hostname +
                " is not in the cert's list: " +
                ips.join(", ");
    } else if (dnsNames.length > 0 || (subject && subject.CN)) {
        const hostParts = splitHost(ascii);
        const wildcard = (pattern) => hostMatches(hostParts, pattern);
        if (dnsNames.length > 0) {
            valid = dnsNames.some(wildcard);
            if (!valid)
                reason =
                    "Host: " +
                    hostname +
                    ". is not in the cert's altnames: " +
                    altNames;
        } else {
            const cn = subject.CN;
            if (Array.isArray(cn)) valid = cn.some(wildcard);
            else if (cn) valid = wildcard(cn);
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

// ---- The TLS client's hook ------------------------------------------------------------
/**
 * Verify the server's certificates (DER, leaf first) for a TLS client with
 * options (ca, secureContext, checkServerIdentity) connecting to hostname.
 * Returns { authorized, error, path } where path holds the DER certificates
 * of the verified chain, anchor included.
 */
export function verifyPeer(chain, options, hostname, now = Date.now()) {
    let certificates;
    try {
        certificates = chain.map(parseCertificate);
    } catch {
        return {
            authorized: false,
            error: codedError(
                "UNSPECIFIED",
                "unable to decode the certificate",
            ),
            path: chain,
        };
    }
    const ca =
        options.ca !== undefined
            ? options.ca
            : options.secureContext?.context?.ca;
    let anchors, intermediates;
    if (ca !== undefined && ca !== null) anchors = caPool(ca);
    else {
        const store = systemTrustStore();
        anchors = store.roots;
        intermediates = store.intermediates;
    }
    const result = verifyChain(certificates, anchors, intermediates, now);
    const path = result.path.map((certificate) => certificate.raw);
    if (result.error) return { authorized: false, error: result.error, path };
    const check =
        typeof options.checkServerIdentity === "function"
            ? options.checkServerIdentity
            : checkServerIdentity;
    const identityError = check(hostname, peerCertificate(path, 0, true, []));
    if (identityError) return { authorized: false, error: identityError, path };
    return { authorized: true, error: null, path };
}
