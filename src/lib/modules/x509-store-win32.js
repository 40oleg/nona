// nona:internal/x509-store for Windows: the certificates of the ROOT system
// store (trust anchors) and of the CA system store (intermediate CAs, used
// only to complete chains), read through crypt32.dll. The chain is then
// verified by nona:internal/x509 like on Linux; CertGetCertificateChain is
// not used, so Windows' automatic root update, AIA fetching and revocation
// checks do not take part.
import { define } from "nona:ffi";
const CertOpenSystemStoreW = define(
    "crypt32.dll",
    "CertOpenSystemStoreW",
    "ptr(ptr,wstr)",
);
const CertEnumCertificatesInStore = define(
    "crypt32.dll",
    "CertEnumCertificatesInStore",
    "ptr(ptr,ptr)",
);
const CertCloseStore = define("crypt32.dll", "CertCloseStore", "bool(ptr,u32)");
const RtlMoveMemory = define(
    "kernel32.dll",
    "RtlMoveMemory",
    "void(buf,ptr,u64)",
);
const X509_ASN_ENCODING = 1;

/** The DER certificates of a system store ("ROOT", "CA", ...). */
function storeCertificates(name) {
    const store = CertOpenSystemStoreW(null, name);
    if (!store) return [];
    const out = [];
    // CERT_CONTEXT: dwCertEncodingType (u32), pbCertEncoded (ptr at 8),
    // cbCertEncoded (u32 at 16), pCertInfo, hCertStore.
    const context = new Uint8Array(24),
        view = new DataView(context.buffer);
    try {
        // Passing the previous context to the next call frees it.
        for (
            let entry = CertEnumCertificatesInStore(store, null);
            entry;
            entry = CertEnumCertificatesInStore(store, entry)
        ) {
            RtlMoveMemory(context, entry, 24);
            if ((view.getUint32(0, true) & X509_ASN_ENCODING) === 0) continue;
            const pointer =
                view.getUint32(8, true) + view.getUint32(12, true) * 4294967296;
            const length = view.getUint32(16, true);
            if (!pointer || length === 0 || length > 1048576) continue;
            const der = new Uint8Array(length);
            RtlMoveMemory(der, pointer, length);
            out.push(der);
        }
    } finally {
        CertCloseStore(store, 0);
    }
    return out;
}

/** { roots: DER[], intermediates: DER[] } */
export function loadStore() {
    return {
        roots: storeCertificates("ROOT"),
        intermediates: storeCertificates("CA"),
    };
}
