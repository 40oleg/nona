import { modulesTlsCrypto } from "../lib/sources.generated.js";
/**
 * Source of `nona:internal/tls-crypto`: the cryptographic primitives of the
 * TLS client (issue #301): HKDF and the TLS 1.3 key schedule helpers,
 * AES-GCM and ChaCha20-Poly1305, X25519 and P-256/P-384 ECDH, ECDSA and RSA
 * signature verification, and a DER reader with SubjectPublicKeyInfo
 * parsing. Hashes and HMAC come from node:crypto.
 */
export const tlsCryptoModuleSource = modulesTlsCrypto;
