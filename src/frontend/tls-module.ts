import { modulesTls } from "../lib/sources.generated.js";
/**
 * Source of the built-in `node:tls` (aliases `tls`, `nona:tls`) module: a
 * TLS 1.3 client (RFC 8446) over node:net, with the cryptography of
 * nona:internal/tls-crypto (issue #301). Like node:net it is only offered
 * for the targets with a socket layer (win32-x64 and linux-x64).
 */
export const tlsModuleSource = modulesTls;
