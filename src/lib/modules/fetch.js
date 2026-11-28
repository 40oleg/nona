import * as http from "node:http";
import * as https from "node:https";
import { Buffer } from "node:buffer";
import { Readable, finished } from "node:stream";
import { StringDecoder } from "node:string_decoder";

// The fetch subset shares the native HTTP/TLS transports. No request signal is
// passed to ClientRequest: its subscription ends at HTTP EOF, while fetch owns
// cancellation until the exposed web body's queue has also been consumed.
const signals = EventTarget[Symbol.for("nona.events.internal")];
const webAdapter = Readable[Symbol.for("nona.stream.web.internal")];
const bodyHighWaterMark = 16384;
const token = /^[!#$%&'*+.^_\x60|~0-9A-Za-z-]+$/;
function headerName(value) {
    const name = String(value);
    if (!token.test(name)) throw new TypeError("Invalid header name");
    return name.toLowerCase();
}
function headerValue(value) {
    const text = String(value).replace(/^[\t ]+|[\t ]+$/g, "");
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        if (c > 255 || (c < 32 && c !== 9) || c === 127)
            throw new TypeError("Invalid header value");
    }
    return text;
}
// Kept provider-local: this issue does not introduce browser Request/Response
// constructors. Request headers accept records, pair iterables and Headers-like
// objects (through their iterator), and response headers are immutable.
class FetchHeaders {
    constructor(input) {
        this.fields = Object.create(null);
        if (input === undefined || input === null) return;
        if (typeof input[Symbol.iterator] === "function") {
            for (const pair of input) {
                const entry = Array.from(pair);
                if (entry.length !== 2)
                    throw new TypeError("Expected a header pair");
                this.append(entry[0], entry[1]);
            }
        } else {
            for (const key of Object.keys(input)) this.append(key, input[key]);
        }
    }
    append(name, value) {
        name = headerName(name);
        value = headerValue(value);
        const previous = this.fields[name];
        this.fields[name] =
            previous === undefined ? value : previous + ", " + value;
    }
    get(name) {
        const value = this.fields[headerName(name)];
        return value === undefined ? null : value;
    }
    has(name) {
        return this.get(name) !== null;
    }
    entries() {
        const pairs = [];
        for (const key of Object.keys(this.fields).sort())
            pairs.push([key, this.fields[key]]);
        return pairs[Symbol.iterator]();
    }
    keys() {
        return Object.keys(this.fields).sort()[Symbol.iterator]();
    }
    values() {
        return Array.from(this.entries(), (entry) => entry[1])[
            Symbol.iterator
        ]();
    }
    forEach(callback, receiver) {
        for (const entry of this.entries())
            callback.call(receiver, entry[1], entry[0], this);
    }
    [Symbol.iterator]() {
        return this.entries();
    }
}
function responseHeaders(raw) {
    const headers = new FetchHeaders();
    for (let i = 0; i < raw.length; i += 2) headers.append(raw[i], raw[i + 1]);
    // Hide the mutable builder behind a read-only view.
    const result = {};
    for (const key of ["get", "has", "entries", "keys", "values"])
        result[key] = headers[key].bind(headers);
    result.forEach = function (callback, receiver) {
        headers.forEach((value, name) =>
            callback.call(receiver, value, name, result),
        );
    };
    result[Symbol.iterator] = headers[Symbol.iterator].bind(headers);
    for (const key of ["append", "set", "delete"])
        result[key] = function () {
            throw new TypeError("Response headers are immutable");
        };
    return result;
}
function checkedURL(input, base) {
    const url = base === undefined ? new URL(input) : new URL(input, base);
    if (url.protocol !== "http:" && url.protocol !== "https:")
        throw new TypeError("fetch supports only HTTP and HTTPS URLs");
    if (url.username || url.password)
        throw new TypeError("fetch URLs must not contain credentials");
    url.hash = "";
    return url;
}
function transportError(reason) {
    const error = new TypeError("fetch failed");
    error.cause = reason;
    return error;
}
function makeResponse(incoming, url, redirected, body) {
    let used = false;
    const response = {
        status: incoming.statusCode,
        statusText: incoming.statusMessage,
        ok: incoming.statusCode >= 200 && incoming.statusCode <= 299,
        headers: responseHeaders(incoming.rawHeaders),
        url: url.href,
        redirected,
        body,
        get bodyUsed() {
            return used || (body !== null && Readable.isDisturbed(body));
        },
        async text() {
            return consume(false);
        },
        async json() {
            return JSON.parse(await consume(false));
        },
        async arrayBuffer() {
            return consume(true);
        },
    };
    async function consume(binary) {
        if (response.bodyUsed || (body !== null && body.locked))
            throw new TypeError("Response body is used or locked");
        if (body === null) return binary ? new ArrayBuffer(0) : "";
        used = true;
        const reader = body.getReader();
        const decoder = binary ? null : new StringDecoder("utf8");
        let text = "";
        const chunks = [];
        let length = 0;
        try {
            for (;;) {
                const step = await reader.read();
                if (step.done) break;
                if (binary) {
                    chunks.push(step.value);
                    length += step.value.byteLength;
                } else text += decoder.write(step.value);
            }
            if (!binary) {
                text += decoder.end();
                return text.charCodeAt(0) === 65279 ? text.slice(1) : text;
            }
            const result = new Uint8Array(length);
            let at = 0;
            for (const chunk of chunks) {
                result.set(chunk, at);
                at += chunk.byteLength;
            }
            return result.buffer;
        } finally {
            chunks.length = 0;
            reader.releaseLock();
        }
    }
    return response;
}

export function fetch(input, init) {
    return new Promise((resolve, reject) => {
        init = init || {};
        let url = checkedURL(input);
        let method = init.method === undefined ? "GET" : String(init.method);
        if (!token.test(method) || /^(CONNECT|TRACE|TRACK)$/i.test(method))
            throw new TypeError("Invalid fetch method");
        // ClientRequest currently normalizes all methods to uppercase.
        method = method.toUpperCase();
        const redirect = init.redirect === undefined ? "follow" : init.redirect;
        if (!["follow", "manual", "error"].includes(redirect))
            throw new TypeError("Invalid redirect mode");
        const headers = new FetchHeaders(init.headers).fields;
        let bytes = null;
        if (init.body !== undefined && init.body !== null) {
            if (method === "GET" || method === "HEAD")
                throw new TypeError("GET and HEAD cannot have a body");
            if (typeof init.body === "string") {
                bytes = Buffer.from(init.body, "utf8");
                if (headers["content-type"] === undefined)
                    headers["content-type"] = "text/plain;charset=UTF-8";
            } else if (init.body instanceof Uint8Array)
                bytes = Buffer.from(init.body);
            else
                throw new TypeError(
                    "fetch body must be a string or Uint8Array",
                );
        }
        // Framing belongs to the transport, including on replay after redirect.
        delete headers["transfer-encoding"];
        if (
            headers["content-length"] !== undefined &&
            headers["content-length"] !==
                String(bytes === null ? 0 : bytes.length)
        )
            throw new TypeError("Content-Length does not match fetch body");
        if (headers.accept === undefined) headers.accept = "*/*";
        if (headers["accept-encoding"] === undefined)
            headers["accept-encoding"] = "identity";
        const signal = init.signal;
        if (
            signal !== undefined &&
            signal !== null &&
            !signals.isSignal(signal)
        )
            throw new TypeError("signal must be an AbortSignal");
        let unsubscribe = null;
        let active = null;
        let ended = false;
        let exposed = false;
        let redirects = 0;
        function finish(reason) {
            if (ended) return;
            ended = true;
            if (unsubscribe) {
                unsubscribe();
                unsubscribe = null;
            }
            if (active) active.release(reason);
            active = null;
            bytes = null;
            if (!exposed && reason !== undefined) reject(reason);
        }
        function abort() {
            finish(
                signal.reason === undefined
                    ? new DOMException(
                          "The operation was aborted",
                          "AbortError",
                      )
                    : signal.reason,
            );
        }
        if (signal) {
            if (signal.aborted) {
                abort();
                return;
            }
            unsubscribe = signals.protect(signal, abort);
        }
        function send() {
            if (ended) return;
            let request = null;
            let incoming = null;
            let bridge = null;
            let body = null;
            let unfinish = null;
            let released = false;
            let inputEnded = false;
            function onData(chunk) {
                if (!bridge.push(chunk)) incoming.pause();
            }
            function onEnd() {
                inputEnded = true;
                bridge.push(null);
            }
            function onClose() {
                if (!inputEnded && !released) {
                    const error = new TypeError(
                        "Response body closed prematurely",
                    );
                    finish(error);
                }
            }
            function onError(reason) {
                if (!released)
                    finish(exposed ? reason : transportError(reason));
            }
            function release(reason) {
                if (released) return;
                released = true;
                if (unfinish) unfinish();
                // Fail the web queue even if the Node bridge has already ended.
                if (body && reason !== undefined)
                    webAdapter.destroy(body, reason);
                if (bridge && !bridge.destroyed) bridge.destroy();
                if (incoming) {
                    incoming.removeListener("data", onData);
                    incoming.removeListener("end", onEnd);
                    incoming.removeListener("close", onClose);
                    incoming.destroy();
                }
                // A consumed response has already returned its connection to the
                // HTTP agent. Unread/intermediate/failed responses close it.
                // ClientRequest keeps its socket reference after Agent handoff.
                // An after-EOF abort must not destroy a later user's socket.
                if (
                    request &&
                    !request._released &&
                    (!inputEnded || reason !== undefined)
                )
                    request.destroy();
                request = null;
                incoming = null;
                bridge = null;
                body = null;
                unfinish = null;
            }
            active = { release };
            try {
                const options = { method, headers: Object.assign({}, headers) };
                if (bytes !== null)
                    options.headers["content-length"] = String(bytes.length);
                request = (url.protocol === "https:" ? https : http).request(
                    url.href,
                    options,
                );
                request.on("error", onError);
                request.on("response", (res) => {
                    if (released || ended) {
                        res.on("error", () => {});
                        res.destroy();
                        return;
                    }
                    incoming = res;
                    incoming.on("error", onError);
                    const code = res.statusCode;
                    const location = res.headers.location;
                    const isRedirect = [301, 302, 303, 307, 308].includes(code);
                    try {
                        if (isRedirect && redirect === "error")
                            throw new TypeError("Redirect is forbidden");
                        if (
                            isRedirect &&
                            location !== undefined &&
                            redirect === "follow"
                        ) {
                            if (redirects === 20)
                                throw new TypeError("Too many redirects");
                            const next = checkedURL(location, url.href);
                            if (next.origin !== url.origin) {
                                delete headers.authorization;
                                delete headers.cookie;
                                delete headers["proxy-authorization"];
                                delete headers.host;
                            }
                            if (
                                ((code === 301 || code === 302) &&
                                    method === "POST") ||
                                (code === 303 &&
                                    method !== "GET" &&
                                    method !== "HEAD")
                            ) {
                                method = "GET";
                                bytes = null;
                                for (const key of [
                                    "content-type",
                                    "content-length",
                                    "content-encoding",
                                    "content-language",
                                    "content-location",
                                    "transfer-encoding",
                                ])
                                    delete headers[key];
                            }
                            release();
                            url = next;
                            redirects++;
                            queueMicrotask(send);
                            return;
                        }
                        incoming.pause();
                        bridge = new Readable({
                            highWaterMark: bodyHighWaterMark,
                            read() {
                                if (incoming) incoming.resume();
                            },
                            destroy(reason, callback) {
                                // Successful bridge EOF can precede draining the
                                // web queue; keep its abort subscription alive.
                                if (reason || !inputEnded)
                                    finish(
                                        reason === null ? undefined : reason,
                                    );
                                callback(reason);
                            },
                        });
                        body = Readable.toWeb(bridge, {
                            strategy: {
                                highWaterMark: bodyHighWaterMark,
                                size: (chunk) => chunk.byteLength,
                            },
                        });
                        incoming.on("data", onData);
                        incoming.on("end", onEnd);
                        incoming.on("close", onClose);
                        unfinish = finished(body, (reason) =>
                            finish(reason === null ? undefined : reason),
                        );
                        const noBody =
                            method === "HEAD" || [204, 205, 304].includes(code);
                        const response = makeResponse(
                            res,
                            url,
                            redirects !== 0,
                            noBody ? null : body,
                        );
                        exposed = true;
                        resolve(response);
                        if (noBody) body.cancel();
                    } catch (reason) {
                        finish(reason);
                    }
                });
                request.end(bytes === null ? undefined : bytes);
            } catch (reason) {
                finish(transportError(reason));
            }
        }
        send();
    });
}
export default fetch;
