# Networking (`node:http`, `node:net`, `node:tls`, `node:https`)

Nona compiles HTTP/1.1 servers and clients, plain TCP sockets and TLS 1.3
clients into the executable. The modules follow the Node.js APIs and wire behaviour closely
enough that the tests run the same programs under Node.js and compare the
output byte for byte. Like [`node:fs`](fs.md), they are JavaScript compiled
into programs that import them, over a small platform layer: raw system calls
on Linux, Winsock (`ws2_32.dll`) through [`nona:ffi`](ffi.md) on Windows.

```js
import http from "nona:http";

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

Performance: the server parses request heads, copies bodies, folds header
names and writes responses with native helpers (`src/runtime/http-native.ts`);
a request creates its `IncomingMessage` and `ServerResponse` as base-class
objects (no `super()` chain), the `Date` header and keep-alive deadlines use
the event loop's time, and the response head of the common case is composed
from cached lines and sent with the body in one `write`. Measured against
Node.js 22.23 with `bench/http/run.sh` (Linux x64 in WSL2 on a 16-CPU
laptop-class machine, server and client pinned to different CPUs, five runs of
3 s per cell; the method and every table are in
[`PERFORMANCE.md`](../PERFORMANCE.md#http-server)): a keep-alive hello costs
about 30k instructions per request (88k before #403) and runs at ×1.3–1.6 of
Node's throughput with 32 or more connections (`wrk`: 63.6k against 46.5k
requests/s at 32, 67.6k against 42.7k at 256), JSON ×1.3–1.6, ten request
headers read and five set ×1.4–1.5, a new connection per request ×1.3–1.5, a
64 KiB response ×1.5–1.7, and a 16 KiB upload ×0.9–1.2. No case reaches the
×2 that #403 asks for on this machine; the kernel's `read`, `sendto` and
`epoll_wait` and the loopback are a share of every request that both runtimes
pay, and what remains in user space is spread over property reads and calls
with no routine above 15%. With a single connection every request is a round
trip between client and server CPUs and the two runtimes are within ×1.1–1.3.
The server's RSS is 18–26 MB against Node's 68–140 MB. The p99 latency at
saturation is 0.6–0.9 of Node's. Windows x64 has not been measured (no load
generator is available there). `bench/http/profile.sh CASE` counts a case's
instructions per request under QEMU.

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

## Soak test

The [`scripts/http-soak.mjs`](../scripts/http-soak.mjs) test runs a compiled
Nona HTTP server for hours under steady load and checks that it stays healthy
(#516). It compiles `bench/http/soak-server.mjs` (or runs it under Node.js if
set with `NONA_SOAK_SERVER`), applies steady load with 32 concurrent connections
(configurable with `NONA_SOAK_CONNECTIONS`), and samples memory, handles and
latency every minute (configurable). The routes exercise the server: small text
responses, JSON, 1 MB chunked bodies, echoed request bodies (POST), slow clients
that disconnect mid-response, keep-alive and close requests, and error routes:
a 404, and `/throw`, which throws from a queued microtask so that the process
`uncaughtException` listener answers with a 500. The load mix is: 35% text, 28% JSON, 5% big, 12% echo, 10% close,
4% slow, 3% missing (404), 3% throw (500); `NONA_SOAK_MIX=route=weight,...`
isolates a route.

The run completes when the load window expires, or crashes. A smoke mode
(`--smoke`, or `NONA_SOAK_MINUTES=5`) runs for 5 minutes; a full run is 180
minutes by default (configurable with `NONA_SOAK_MINUTES`). The warm-up is 10
minutes (1 with `--smoke`, customizable with `NONA_SOAK_WARMUP_MINUTES`); the
pass criteria compare the last 30 minutes of load against the first 30 minutes
after warm-up (or a quarter of the load window if shorter).

**Metrics sampled every minute:**

- RSS: resident set size (Linux `/proc`; from stats on other platforms) and
  the peak RSS from `process.resourceUsage()`
- Heap: used, total, external (from `process.memoryUsage()`). There are no GC
  statistics: Nona has no `node:v8` module and its `PerformanceObserver`
  records no `gc` entries, so collections are not counted.
- Open handles: sockets, file descriptors, active resources
- Throughput: requests per second
- Latency: p50, p99 (1%-wide histogram buckets from 1 µs to minutes)
- Errors: crashed, failed requests (other than deliberate 404/500), socket errors

**Pass criteria:**

- No crash or early exit
- No failed requests (deliberate 404/500 and aborted slow clients excluded)
- RSS growth after warm-up ≤ 10%
- Handles return to the baseline within slack (2 extra sockets, 4 fds, 2
  resources)
- p99 latency in the last 30 min ≤ first 30 min after warm-up + 20% (or +
  0.5 ms slack)

The test writes `soak-report/http-soak.{json,md}` (pass/fail, raw samples, all
failures and their reasons); the server executable is built into
`bench/results/`. When the server crashes, failed requests of the last 2
seconds before its exit are listed separately as consequences of the crash and
do not count as failed requests.

### Running locally

```sh
npm run build
npm run soak:http -- --smoke                              # 5 minutes
npm run soak:http                                          # 3 hours
NONA_SOAK_MINUTES=30 npm run soak:http                     # 30 minutes
NONA_SOAK_CONNECTIONS=256 npm run soak:http -- --smoke    # 256 connections
NONA_SOAK_MIX=json=1 npm run soak:http -- --smoke          # JSON only
```

The server is built for the host platform (win32-x64 or linux-x64).
`NONA_SOAK_SERVER` selects another server instead: a prebuilt executable, or a
`.mjs` file, which runs under Node.js as the reference (oracle) for the
figures:

```sh
NONA_SOAK_SERVER=bench/http/soak-server.mjs npm run soak:http -- --smoke
```

### Latest result

**The compiled Nona server has not passed the smoke run yet.** On win32-x64
(Windows 11, i7-13620H, commit 4d75a9d9, 2026-10-27) the test finds two
defects, both in the 1 MiB chunked `/big` route:

- [#601](https://github.com/40oleg/nona/issues/601): after a chunked response
  larger than about 320 KiB, the next request on the same keep-alive connection
  is never answered. With the default mix all 32 load connections stall within
  seconds and every later request on them times out.
- [#602](https://github.com/40oleg/nona/issues/602): with 32 connections on
  `/big` (`NONA_SOAK_MIX=big=1`) the server exits with an access violation
  (`0xc0000005`) about 5 seconds into the load.

Without `/big`
(`NONA_SOAK_MIX=text=1,json=1,echo=1,close=1,missing=1,throw=1`, and
separately `slow=1,text=3`) short runs with 32 connections have no crash, no
failed requests, and sockets back to the baseline; the first mix ran at about
11,000 req/s with a p99 of 7 ms and an RSS of 23 MB. These runs were 30
seconds long, so they say nothing yet about leaks or slowdown over hours.

Linux has not been run yet; the first full 3-hour run is planned in the
`http-soak` workflow once #601 and #602 are fixed.

**Oracle baseline (Node.js server, not Nona):** a 5-minute smoke run of
`NONA_SOAK_SERVER=bench/http/soak-server.mjs` on the same machine, 32
connections: 1,005,647 requests at 3,349.7 req/s, RSS 51.3 MB at the baseline
and 93.4 MB at the end (2.4% growth after warm-up), p99 latency 15.55 ms in the
first minute after warm-up and 14.65 ms in the last minute, handles back to the
baseline. All criteria passed.

### Workflow

A GitHub Actions workflow (`.github/workflows/http-soak.yml`) runs the soak test
on demand (`workflow_dispatch`):

```
gh workflow run http-soak.yml -f minutes=180 -f connections=32
```

Inputs: `minutes` (duration, default 180), `connections` (optional). The workflow
runs on `ubuntu-latest` with a job timeout of `minutes` + 30 (210 minutes by
default; GitHub-hosted runners stop any job at 360 minutes, so `minutes` can be
at most 330), uploads the report artifact (the two report files), and appends
the Markdown summary to the job summary.

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
