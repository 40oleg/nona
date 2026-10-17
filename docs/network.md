# Networking (`node:http`, `node:net`, `node:tls`, `node:https`)

Nona compiles HTTP/1.1 servers and clients, plain TCP sockets and TLS 1.3
clients into the executable. The modules follow the Node.js APIs and wire behaviour closely
enough that the tests run the same programs under Node.js and compare the
output byte for byte. Like [`node:fs`](fs.md), they are JavaScript compiled
into programs that import them, over a small platform layer: raw system calls
on Linux, Winsock (`ws2_32.dll`) through [`nona:ffi`](ffi.md) on Windows.

```js
import http from "node:http";

const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "text/plain");
    res.end(`Hello from ${req.method} ${req.url}\n`);
});
server.listen(8080, () => console.log("listening on", server.address().port));
```

Each module is also available under the `nona:` scheme (`nona:http`,
`nona:net`, …). Import them from module code (`.mjs` or `--module`); `require`
is not available.

## `node:http`

| Export                                                                                                                              | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createServer([options][, listener])`, `Server`                                                                                     | Events `request`, `connection`, `listening`, `close`, `error`, `clientError`, `checkContinue`, `checkExpectation`, `upgrade`, `connect`, `timeout`, `dropRequest`. `listen`, `close` (also closes idle keep-alive connections), `closeAllConnections`, `closeIdleConnections`, `address`, `setTimeout`, `keepAliveTimeout` (5 s), `maxRequestsPerSocket`, `requireHostHeader`, `joinDuplicateHeaders`, `maxHeaderSize`, `IncomingMessage`/`ServerResponse` options.                                                                          |
| `IncomingMessage`                                                                                                                   | `method`, `url`, `httpVersion`, `headers` (merged with the Node.js rules for duplicates, `cookie` and `set-cookie`), `headersDistinct`, `rawHeaders`, `trailers`, `rawTrailers`, `statusCode`, `statusMessage`, `complete`, `aborted`, `socket`. Readable: `data`, `end`, `close`, `pause`, `resume`, `setEncoding`, `read`, `pipe`, `for await`.                                                                                                                                                                                            |
| `ServerResponse`                                                                                                                    | `statusCode`, `statusMessage`, `writeHead` (object or flat array headers), `setHeader`, `appendHeader`, `getHeader`, `getHeaders`, `getHeaderNames`, `hasHeader`, `removeHeader`, `setHeaders`, `headersSent`, `write`, `end`, `flushHeaders`, `addTrailers`, `writeContinue`, `writeProcessing`, `writeEarlyHints`, `sendDate`, `finish` and `close` events.                                                                                                                                                                                |
| `request(url[, options][, callback])`, `get(...)`, `ClientRequest`                                                                  | `url` is a string or an object with `href`/`hostname` (no global `URL` yet). Options: `host`, `hostname`, `port`, `path`, `method`, `headers` (object or array), `auth`, `agent`, `timeout`, `setHost`, `defaultPort`, `createConnection`, `joinDuplicateHeaders`, `maxHeaderSize`, `signal`. Events `response`, `socket`, `continue`, `information`, `timeout`, `finish`, `close`, `error`. `write`, `end`, `setHeader` and the other header methods, `destroy`, `abort`, `setTimeout`, `setNoDelay`, `setSocketKeepAlive`, `reusedSocket`. |
| `Agent`, `globalAgent`                                                                                                              | Keep-alive connection pooling as in Node.js: `keepAlive`, `maxSockets`, `maxFreeSockets`, `maxTotalSockets`, `scheduling`, `timeout`; free sockets do not keep the program alive. `globalAgent` keeps connections alive with a 5 s idle timeout. `agent: false` uses a new connection with `Connection: close`.                                                                                                                                                                                                                              |
| `METHODS`, `STATUS_CODES`, `maxHeaderSize`, `validateHeaderName`, `validateHeaderValue`, `OutgoingMessage`, `setMaxIdleHTTPParsers` |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

Wire format: requests and responses use `Content-Length` when the body is known
at `end()` and chunked transfer encoding otherwise; keep-alive, `Connection`,
`Keep-Alive: timeout=5`, `Date`, `HEAD`, `204`/`304`, HTTP/1.0 clients,
pipelined requests, `Expect: 100-continue`, chunked trailers and responses
delimited by the end of the connection behave as in Node.js. Malformed requests
are answered with `400 Bad Request` (`431` for headers over 16 KiB) unless the
server has a `clientError` listener; parse errors carry the llhttp codes
(`HPE_INVALID_METHOD`, `HPE_HEADER_OVERFLOW`, …).

`https:` requests are made with [`node:https`](#nodehttps), which runs this client over TLS.

Not supported: HTTP/2, `headersTimeout` and
`requestTimeout` (the values exist but are not enforced), `insecureHTTPParser`,
`maxHeadersCount`, Unix domain sockets (`socketPath`).

## `node:net`

| Export                                            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createServer([options][, listener])`, `Server`   | `listen(port[, host][, backlog][, callback])` or `listen({port, host, backlog, ipv6Only})`, `close`, `address`, `getConnections`, `ref`, `unref`, `maxConnections`, `listening`. Without a host the server listens on `::` in dual-stack mode, or `0.0.0.0` when IPv6 is unavailable, like Node.js.                                                                                                                                                                              |
| `connect(...)`, `createConnection(...)`, `Socket` | `connect(port[, host][, listener])` or `connect({port, host, timeout, noDelay})`. Events `connect`, `ready`, `lookup`, `data`, `end`, `drain`, `timeout`, `error`, `close(hadError)`. `write`, `end`, `destroy`, `destroySoon`, `pause`, `resume`, `setEncoding`, `setTimeout`, `setNoDelay`, `setKeepAlive`, `ref`, `unref`, `address`, `remoteAddress`, `remotePort`, `remoteFamily`, `localAddress`, `localPort`, `bytesRead`, `bytesWritten`, `readyState`, `allowHalfOpen`. |
| `isIP`, `isIPv4`, `isIPv6`                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Errors are `Error` objects with the Node.js `code`, `errno`, `syscall`,
`address` and `port`, and the same messages (`connect ECONNREFUSED
127.0.0.1:1`, `listen EADDRINUSE: address already in use 127.0.0.1:8080`).
Host names are resolved synchronously: `localhost` is `127.0.0.1`; on Linux the
module reads `/etc/hosts` and then asks the first `nameserver` of
`/etc/resolv.conf` (IPv4 `A` records over UDP); on Windows it calls
`getaddrinfo`. A failed lookup is `ENOTFOUND` with `syscall: 'getaddrinfo'`.
Not supported: IPC paths, `node:dns`, `autoSelectFamily` (a host name connects
to its first IPv4 address).

## `node:tls`

A TLS 1.3 client ([RFC 8446](https://www.rfc-editor.org/rfc/rfc8446)) written
for Nona in JavaScript over `node:net`, with the cryptography of
`nona:internal/tls-crypto`; no TLS library is linked into the executable
([#301](https://github.com/40oleg/nona/issues/301)). The module is built for
win32-x64 and linux-x64 only; macOS, the BSDs and arm64 are not supported yet.

| Export                                                                                                                       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connect(options[, callback])`, `connect(port[, host][, options][, callback])`                                               | Options: `host`, `port`, `servername` (SNI; none for IP addresses), `socket` (an existing `net.Socket` to secure), `ALPNProtocols`, `ca`, `rejectUnauthorized` (default `true`), `checkServerIdentity`, `timeout`, `allowHalfOpen`. Returns a `TLSSocket`.                                                                                                                                                                                                                            |
| `TLSSocket`                                                                                                                  | A `net.Socket`: events `connect`, `secureConnect`, `data`, `end`, `drain`, `timeout`, `error`, `close`; `write`, `end` (sends `close_notify`, then half-closes), `destroy`, `setTimeout`, `setNoDelay`, `setKeepAlive`, `ref`, `unref`, `address`, `remoteAddress`, `remotePort`. `authorized`, `authorizationError`, `alpnProtocol`, `encrypted`, `getPeerCertificate([detailed])`, `getProtocol()` (`'TLSv1.3'`), `getCipher()`, `getEphemeralKeyInfo()`, `exportKeyingMaterial()`. |
| `checkServerIdentity`, `getCiphers`, `createSecureContext`, `DEFAULT_MIN_VERSION`, `DEFAULT_MAX_VERSION`, `rootCertificates` | `rootCertificates` (on the default export, read on first use) lists the operating system's root certificates as PEM strings. `createServer` throws `ERR_METHOD_NOT_IMPLEMENTED`.                                                                                                                                                                                                                                                                                                      |

The client offers the cipher suites TLS_AES_128_GCM_SHA256,
TLS_AES_256_GCM_SHA384 and TLS_CHACHA20_POLY1305_SHA256, an X25519 key share
(P-256 after a HelloRetryRequest), and accepts ECDSA (P-256, P-384) and
RSA-PSS handshake signatures. It handles HelloRetryRequest, KeyUpdate and
`close_notify`, splits application data into 16 KiB records and ignores
session tickets. Failures are errors with Node-style codes (`ERR_SSL_…`,
`ERR_TLS_CERT_ALTNAME_INVALID`, `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, …), and
the client sends the matching alert.

The limitations of the client, and of the `https` module built on it, are
listed in [Security limitations](#security-limitations).

### Certificate verification

`nona:internal/x509` parses the server's X.509 certificates and verifies the
chain the way Node.js does through OpenSSL, with the same error codes and
messages:

- **Chain building**: issuers are looked up among the trust anchors first,
  then among the certificates the server sent (in any order; extra
  certificates are ignored), then among the operating system's intermediate
  CAs (Windows). Issuers are matched by name (case-insensitive, whitespace
  folded) and authority/subject key identifier. As in OpenSSL, the chain must
  end in a self-signed trust anchor.
- **Checks**, per certificate: unknown critical extensions; `basicConstraints`
  CA:TRUE for intermediate CAs and `pathLenConstraint`; the TLS server purpose
  (`extKeyUsage` must allow `serverAuth` when present, on CAs too; the leaf's
  `keyUsage` must allow `digitalSignature`, `keyEncipherment` or
  `keyAgreement`); RSA keys of at least 1024 bits; no MD5 or SHA-1 signatures
  below the anchor; signatures (RSA PKCS#1 v1.5 and RSA-PSS with SHA-256/384/512,
  ECDSA P-256/P-384); validity periods against the current time, anchor
  included; name constraints (DNS, IP, directory name and email subtrees).
  Like Node.js, the reported error is the last one OpenSSL would report.
- **Host name** (`tls.checkServerIdentity`, as in Node.js, RFC 6125): DNS
  subject alternative names with at most one wildcard in the left-most label
  (never `*.tld`, never in a Punycode label), IP address names for IP
  literals, and the subject CN only when the certificate has no DNS name.
  Non-ASCII host names are compared in Punycode. `options.checkServerIdentity`
  replaces the check.
- Error codes: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `UNABLE_TO_GET_ISSUER_CERT`,
  `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `DEPTH_ZERO_SELF_SIGNED_CERT`,
  `SELF_SIGNED_CERT_IN_CHAIN`, `CERT_HAS_EXPIRED`, `CERT_NOT_YET_VALID`,
  `CERT_SIGNATURE_FAILURE`, `INVALID_CA`, `INVALID_PURPOSE`,
  `PATH_LENGTH_EXCEEDED`, `ERR_TLS_CERT_ALTNAME_INVALID`, and `UNSPECIFIED`
  (for example "unhandled critical extension") where Node.js has no name
  either. With `rejectUnauthorized: false` the connection proceeds and
  `authorized`/`authorizationError` report the result.

**Trust anchors.** The `ca` option (PEM text or DER, alone or in an array)
replaces the defaults, as in Node.js. Otherwise the operating system's store
is read once, on first use:

- **Linux**: the first PEM bundle that exists among
  `/etc/ssl/certs/ca-certificates.crt`, `/etc/pki/tls/certs/ca-bundle.crt`,
  `/etc/ssl/ca-bundle.pem`,
  `/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem` and `/etc/ssl/cert.pem`,
  or the file named by `SSL_CERT_FILE`. Certificate directories
  (`SSL_CERT_DIR`) are not read.
- **Windows**: the certificates of the `ROOT` system store are the anchors,
  and those of the `CA` store help complete chains; they are enumerated
  through `crypt32.dll` (`CertOpenSystemStoreW`, `CertEnumCertificatesInStore`)
  with `nona:ffi` and verified by the same JavaScript code as on Linux.
  `CertGetCertificateChain` is not used, so Windows' automatic root update
  does not run: a root that Windows would download on demand is unknown
  until the store holds it. Distrusted certificates (the `Disallowed` store)
  are not consulted.

Node.js verifies against its bundled Mozilla roots by default, so a
certificate that chains to a root only one of the two stores holds is
accepted by one and refused by the other.

## `node:https`

`https`, `node:https` and `nona:https` run the HTTP/1.1 client of
[`node:http`](#nodehttp) over TLS sockets of [`node:tls`](#nodetls), with the
same requests, responses, keep-alive and errors. Only the client is
implemented, and there is no global `fetch` yet, so `https:` URLs are requested
with `https.request` and `https.get`.

| Export                                            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `request(url[, options][, callback])`, `get(...)` | `url` is a string or an object with `href`/`hostname`. The default port is 443 and the default agent is `globalAgent`. The options are those of `http.request` plus the TLS options `ca`, `rejectUnauthorized`, `servername`, `checkServerIdentity`, `ALPNProtocols` and `maxVersion` (only `'TLSv1.3'`). `ciphers` and `minVersion` are accepted but have no effect; client certificates (`cert`, `key`, `pfx`) are not supported. |
| `Agent`, `globalAgent`                            | Pools TLS connections as `http.Agent` pools TCP ones: `keepAlive`, `maxSockets`, `maxFreeSockets`, `timeout`, `scheduling`. `globalAgent` keeps connections alive with a 5 s idle timeout. Pool keys include the TLS options, so requests with different `ca` or `rejectUnauthorized` never share a connection. `maxCachedSessions` is accepted; sessions are not resumed.                                                          |
| `createServer`, `Server`                          | Throw `ERR_FEATURE_UNAVAILABLE_ON_PLATFORM`: an https server is not implemented yet.                                                                                                                                                                                                                                                                                                                                                |

Certificate checks, trust anchors and host name checks are those of `node:tls`
(see [Certificate verification](#certificate-verification)). A failed check is
an `error` event on the request with the Node.js code, for example
`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`.

## Security limitations

Stated plainly, for the TLS client and the `https` module:

- **Only TLS 1.3.** There is no TLS 1.2 fallback: a server that supports only
  TLS 1.2 or older fails the connection with `ERR_SSL_UNSUPPORTED_PROTOCOL`, and
  `maxVersion` below `'TLSv1.3'` throws.
- **No revocation checks** (CRL, OCSP), no fetching of missing intermediate
  certificates (AIA), and certificate policies are not processed.
- **No session resumption and no 0-RTT data.** Client certificates are not
  supported: a `CertificateRequest` is answered with an empty certificate.
- **Not audited and not constant-time.** The cryptography is written in
  JavaScript and has not been audited. The AES, P-256/P-384 and RSA code does
  not run in constant time (X25519, Poly1305 and the tag checks do), so do not
  rely on it where local timing attacks matter.
- **Trust comes from the operating system**: the Linux bundle or the Windows
  ROOT store, not the Mozilla roots bundled with Node.js. `rejectUnauthorized: false` and a replaced `checkServerIdentity` turn checks off; that choice is the caller's responsibility.
- **Client only.** `tls.createServer` and `https.createServer` throw, and there
  is no `fetch` over `https:` yet.
- **Platforms.** win32-x64 and linux-x64 only.

## Event loop

Sockets are non-blocking. While any socket or server is open, the event loop
waits for readiness with `poll` (Linux) or `WSAPoll` (Windows) instead of
sleeping until the next timer, so socket callbacks and timers interleave as in
Node.js. Open servers and sockets keep the program running; `unref()` releases
them, and free keep-alive sockets of an agent are unreferenced. Socket
inactivity timeouts (`setTimeout`) do not keep the program alive, and they
fire in timer order: a timer set before `socket.setTimeout` with the same
delay runs first, as in Node.js. Events that
Node.js defers with `process.nextTick` are deferred with microtasks.

## Supporting modules

| Module                | Contents                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node:events`         | `EventEmitter` (`on`, `once`, `off`, `prependListener`, `prependOnceListener`, `emit`, `removeAllListeners`, `listeners`, `rawListeners`, `listenerCount`, `eventNames`, `setMaxListeners`, the `newListener`/`removeListener` events, `error` without listeners throws), `once(emitter, name)` returning a promise, `errorMonitor`, `defaultMaxListeners`. The default export is `EventEmitter`. |
| `node:buffer`         | The global `Buffer`, `Blob` and `File`; see [binary data](host-apis.md#buffer-and-binary-data).                                                                                                                                                                                                                                                                                                   |
| `node:string_decoder` | `StringDecoder` with `write` and `end`; multi-byte characters split across chunks are kept for the next chunk.                                                                                                                                                                                                                                                                                    |

Request and response bodies, and socket data, are `Buffer`s.
