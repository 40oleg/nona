// node:tls exists so that packages mentioning it load; Nona has no TLS, so
// every function that needs it throws ERR_NONA_UNSUPPORTED.
function unsupported(name) {
    return function () {
        const error = new Error(name + " is not supported by Nona");
        error.code = "ERR_NONA_UNSUPPORTED";
        throw error;
    };
}

export const CLIENT_RENEG_LIMIT = 3,
    CLIENT_RENEG_WINDOW = 600,
    DEFAULT_CIPHERS = "",
    DEFAULT_ECDH_CURVE = "auto",
    DEFAULT_MIN_VERSION = "TLSv1.2",
    DEFAULT_MAX_VERSION = "TLSv1.3",
    rootCertificates = Object.freeze([]);
export function getCiphers() {
    return [];
}
export function getCACertificates() {
    return [];
}
export const setDefaultCACertificates = unsupported(
        "tls.setDefaultCACertificates",
    ),
    convertALPNProtocols = unsupported("tls.convertALPNProtocols"),
    checkServerIdentity = unsupported("tls.checkServerIdentity"),
    createSecureContext = unsupported("tls.createSecureContext"),
    createServer = unsupported("tls.createServer"),
    connect = unsupported("tls.connect"),
    createSecurePair = unsupported("tls.createSecurePair");
export class SecureContext {
    constructor() {
        unsupported("tls.SecureContext")();
    }
}
export class TLSSocket {
    constructor() {
        unsupported("tls.TLSSocket")();
    }
}
export class Server {
    constructor() {
        unsupported("tls.Server")();
    }
}
export default {
    CLIENT_RENEG_LIMIT,
    CLIENT_RENEG_WINDOW,
    DEFAULT_CIPHERS,
    DEFAULT_ECDH_CURVE,
    DEFAULT_MIN_VERSION,
    DEFAULT_MAX_VERSION,
    getCiphers,
    rootCertificates,
    getCACertificates,
    setDefaultCACertificates,
    convertALPNProtocols,
    checkServerIdentity,
    createSecureContext,
    SecureContext,
    TLSSocket,
    Server,
    createServer,
    connect,
    createSecurePair,
};
