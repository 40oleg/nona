# Networking (`node:http`, `node:net`)

Nona compiles HTTP/1.1 servers and clients and plain TCP sockets into the
executable. The modules follow the Node.js APIs and wire behaviour closely
enough that the tests run the same programs under Node.js and compare the
output byte for byte. Like [`node:fs`](fs.md), they are JavaScript compiled
into programs that import them, over a small platform layer: raw system calls
on Linux, Winsock (`ws2_32.dll`) through [`nona:ffi`](ffi.md) on Windows.

```js
import http from 'node:http';

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.end(`Hello from ${req.method} ${req.url}\n`);
});
server.listen(8080, () => console.log('listening on', server.address().port));
```

Each module is also available under the `nona:` scheme (`nona:http`,
`nona:net`, …). Import them from module code (`.mjs` or `--module`); `require`
is not available.

## `node:http`

| Export | Notes |
| --- | --- |
| `createServer([options][, listener])`, `Server` | Events `request`, `connection`, `listening`, `close`, `error`, `clientError`, `checkContinue`, `checkExpectation`, `upgrade`, `connect`, `timeout`, `dropRequest`. `listen`, `close` (also closes idle keep-alive connections), `closeAllConnections`, `closeIdleConnections`, `address`, `setTimeout`, `keepAliveTimeout` (5 s), `maxRequestsPerSocket`, `requireHostHeader`, `joinDuplicateHeaders`, `maxHeaderSize`, `IncomingMessage`/`ServerResponse` options. |
| `IncomingMessage` | `method`, `url`, `httpVersion`, `headers` (merged with the Node.js rules for duplicates, `cookie` and `set-cookie`), `headersDistinct`, `rawHeaders`, `trailers`, `rawTrailers`, `statusCode`, `statusMessage`, `complete`, `aborted`, `socket`. Readable: `data`, `end`, `close`, `pause`, `resume`, `setEncoding`, `read`, `pipe`, `for await`. |
| `ServerResponse` | `statusCode`, `statusMessage`, `writeHead` (object or flat array headers), `setHeader`, `appendHeader`, `getHeader`, `getHeaders`, `getHeaderNames`, `hasHeader`, `removeHeader`, `setHeaders`, `headersSent`, `write`, `end`, `flushHeaders`, `addTrailers`, `writeContinue`, `writeProcessing`, `writeEarlyHints`, `sendDate`, `finish` and `close` events. |
| `request(url[, options][, callback])`, `get(...)`, `ClientRequest` | `url` is a string or an object with `href`/`hostname` (no global `URL` yet). Options: `host`, `hostname`, `port`, `path`, `method`, `headers` (object or array), `auth`, `agent`, `timeout`, `setHost`, `defaultPort`, `createConnection`, `joinDuplicateHeaders`, `maxHeaderSize`, `signal`. Events `response`, `socket`, `continue`, `information`, `timeout`, `finish`, `close`, `error`. `write`, `end`, `setHeader` and the other header methods, `destroy`, `abort`, `setTimeout`, `setNoDelay`, `setSocketKeepAlive`, `reusedSocket`. |
| `Agent`, `globalAgent` | Keep-alive connection pooling as in Node.js: `keepAlive`, `maxSockets`, `maxFreeSockets`, `maxTotalSockets`, `scheduling`, `timeout`; free sockets do not keep the program alive. `globalAgent` keeps connections alive with a 5 s idle timeout. `agent: false` uses a new connection with `Connection: close`. |
| `METHODS`, `STATUS_CODES`, `maxHeaderSize`, `validateHeaderName`, `validateHeaderValue`, `OutgoingMessage`, `setMaxIdleHTTPParsers` | |

Wire format: requests and responses use `Content-Length` when the body is known
at `end()` and chunked transfer encoding otherwise; keep-alive, `Connection`,
`Keep-Alive: timeout=5`, `Date`, `HEAD`, `204`/`304`, HTTP/1.0 clients,
pipelined requests, `Expect: 100-continue`, chunked trailers and responses
delimited by the end of the connection behave as in Node.js. Malformed requests
are answered with `400 Bad Request` (`431` for headers over 16 KiB) unless the
server has a `clientError` listener; parse errors carry the llhttp codes
(`HPE_INVALID_METHOD`, `HPE_HEADER_OVERFLOW`, …).

Not supported: HTTPS (`node:https`, TLS), HTTP/2, `headersTimeout` and
`requestTimeout` (the values exist but are not enforced), `insecureHTTPParser`,
`maxHeadersCount`, Unix domain sockets (`socketPath`).

## `node:net`

| Export | Notes |
| --- | --- |
| `createServer([options][, listener])`, `Server` | `listen(port[, host][, backlog][, callback])` or `listen({port, host, backlog, ipv6Only})`, `close`, `address`, `getConnections`, `ref`, `unref`, `maxConnections`, `listening`. Without a host the server listens on `::` in dual-stack mode, or `0.0.0.0` when IPv6 is unavailable, like Node.js. |
| `connect(...)`, `createConnection(...)`, `Socket` | `connect(port[, host][, listener])` or `connect({port, host, timeout, noDelay})`. Events `connect`, `ready`, `lookup`, `data`, `end`, `drain`, `timeout`, `error`, `close(hadError)`. `write`, `end`, `destroy`, `destroySoon`, `pause`, `resume`, `setEncoding`, `setTimeout`, `setNoDelay`, `setKeepAlive`, `ref`, `unref`, `address`, `remoteAddress`, `remotePort`, `remoteFamily`, `localAddress`, `localPort`, `bytesRead`, `bytesWritten`, `readyState`, `allowHalfOpen`. |
| `isIP`, `isIPv4`, `isIPv6` | |

Errors are `Error` objects with the Node.js `code`, `errno`, `syscall`,
`address` and `port`, and the same messages (`connect ECONNREFUSED
127.0.0.1:1`, `listen EADDRINUSE: address already in use 127.0.0.1:8080`).
Host names are resolved synchronously: `localhost` is `127.0.0.1`; on Linux the
module reads `/etc/hosts` and then asks the first `nameserver` of
`/etc/resolv.conf` (IPv4 `A` records over UDP); on Windows it calls
`getaddrinfo`. A failed lookup is `ENOTFOUND` with `syscall: 'getaddrinfo'`.
Not supported: IPC paths, `node:dns`, `node:tls`, `autoSelectFamily` (a host
name connects to its first IPv4 address).

## Event loop

Sockets are non-blocking. While any socket or server is open, the event loop
waits for readiness with `poll` (Linux) or `WSAPoll` (Windows) instead of
sleeping until the next timer, so socket callbacks and timers interleave as in
Node.js. Open servers and sockets keep the program running; `unref()` releases
them, and free keep-alive sockets of an agent are unreferenced. Socket
inactivity timeouts (`setTimeout`) do not keep the program alive. Events that
Node.js defers with `process.nextTick` are deferred with microtasks.

## Supporting modules

| Module | Contents |
| --- | --- |
| `node:events` | `EventEmitter` (`on`, `once`, `off`, `prependListener`, `prependOnceListener`, `emit`, `removeAllListeners`, `listeners`, `rawListeners`, `listenerCount`, `eventNames`, `setMaxListeners`, the `newListener`/`removeListener` events, `error` without listeners throws), `once(emitter, name)` returning a promise, `errorMonitor`, `defaultMaxListeners`. The default export is `EventEmitter`. |
| `node:buffer` | The global `Buffer`, `Blob` and `File`; see [binary data](host-apis.md#buffer-and-binary-data). |
| `node:string_decoder` | `StringDecoder` with `write` and `end`; multi-byte characters split across chunks are kept for the next chunk. |

Request and response bodies, and socket data, are `Buffer`s.
