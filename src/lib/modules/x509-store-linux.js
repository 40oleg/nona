// nona:internal/x509-store for Linux: the trust anchors are the first PEM
// bundle that exists among the usual distribution paths (Debian/Ubuntu,
// Fedora/RHEL, openSUSE, Alpine), or the file named by SSL_CERT_FILE, as
// OpenSSL reads it. Certificate directories (SSL_CERT_DIR) are not read.
import { readFileSync } from "node:fs";

const bundles = [
    "/etc/ssl/certs/ca-certificates.crt",
    "/etc/pki/tls/certs/ca-bundle.crt",
    "/etc/ssl/ca-bundle.pem",
    "/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem",
    "/etc/ssl/cert.pem",
];

/** { roots: PEM text, intermediates: [] } */
export function loadStore() {
    const override = process.env.SSL_CERT_FILE;
    for (const file of override ? [override] : bundles) {
        try {
            return { roots: readFileSync(file, "utf8"), intermediates: [] };
        } catch {}
    }
    return { roots: [], intermediates: [] };
}
