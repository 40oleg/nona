import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { StringDecoder } from "node:string_decoder";
import {
    createHash,
    createHmac,
    randomBytes,
    createDecipheriv,
} from "node:crypto";
import {
    modulesNetCommon,
    modulesHttp,
    modulesNetworkStream,
    modulesTls,
    modulesTlsCrypto,
} from "../src/lib/sources.generated.js";

// Execute the production modules with scripted syscalls. Only the native byte
// helpers are adapted; Socket, Readable and HTTP methods are unchanged.
function boundary(results: number[] = [], secure?: boolean) {
    const strip = (source: string) =>
        source
            .replace(/^import\s[\s\S]*?;\r?\n/gm, "")
            .replace(/\bexport default /g, "const defaultExport = ")
            .replace(/\bexport /g, "");
    const { Readable, defaults, clock, defer } = new Function(
        "EventEmitter",
        "StringDecoder",
        "Buffer",
        strip(modulesNetworkStream) +
            ";return {Readable,defaults,clock,defer};",
    )(EventEmitter, StringDecoder, Buffer);
    const copy = (
        src: Uint8Array,
        start: number,
        end: number,
        dst: Uint8Array,
        at: number,
    ) => {
        dst.set(src.subarray(start, end), at);
        return end - start;
    };
    const slice = (src: Uint8Array, start: number, end: number) =>
        src.slice(start, end);
    const wire: number[] = [];
    const sys = {
        send: (_fd: number, bytes: Uint8Array, length: number) => {
            const n = results.shift() ?? length;
            if (n > 0) wire.push(...bytes.subarray(0, n));
            return n;
        },
        close() {},
        watch() {},
        shutdown() {},
        errno: (n: number) => -n,
    };
    const net = new Function(
        "EventEmitter",
        "Buffer",
        "Readable",
        "defaults",
        "clock",
        "copyBytes",
        "sliceBytes",
        "sys",
        strip(modulesNetCommon) + ";return defaultExport;",
    )(EventEmitter, Buffer, Readable, defaults, clock, copy, slice, sys);
    const http = new Function(
        "EventEmitter",
        "captureRejections",
        "Buffer",
        "net",
        "Readable",
        "defaults",
        "clock",
        "defer",
        "writeString",
        "copyBytes",
        "sliceBytes",
        "registerHttpJson",
        strip(modulesHttp) + ";return defaultExport;",
    )(
        EventEmitter,
        false,
        Buffer,
        net,
        Readable,
        defaults,
        clock,
        defer,
        (text: string, out?: Uint8Array, at = 0, latin = false) => {
            const bytes = Buffer.from(text, latin ? "latin1" : "utf8");
            if (out) out.set(bytes, at);
            return bytes.length;
        },
        copy,
        slice,
        undefined,
    );
    const raw = new net.Socket();
    raw._fd = 1;
    let socket = raw;
    if (secure !== undefined) {
        // Real record framing, HKDF and AES-GCM; fixed traffic secrets isolate
        // write scheduling from key exchange/certificate verification (hosted).
        const t = new Function(
            "createHash",
            "createHmac",
            "randomBytes",
            strip(modulesTlsCrypto) +
                ";return {hkdfExpandLabel,createAead,concatBytes};",
        )(createHash, createHmac, randomBytes);
        const tls = new Function(
            "Buffer",
            "net",
            "osRandomBytes",
            "t",
            "parseCertificate",
            "peerCertificate",
            "verifyPeer",
            "checkServerIdentity",
            "systemRootCertificates",
            strip(modulesTls) +
                ";return {TLSSocket,ClientEngine,TrafficKeys,suites};",
        )(Buffer, net, randomBytes, t);
        socket = new tls.TLSSocket(raw);
        socket._engine = new tls.ClientEngine();
        socket._engine.suite = tls.suites[0x1301];
        socket._engine.write = new tls.TrafficKeys(
            tls.suites[0x1301],
            new Uint8Array(32).fill(7),
        );
        socket._engine.state = "connected";
        socket._secure = secure;
    }
    const message = new http.OutgoingMessage();
    message._header = "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n";
    message.chunkedEncoding = true;
    message.socket = socket;
    socket._httpMessage = message;
    return { socket, raw, message, http, results, wire };
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

// Independent Node AEAD oracle checks the bytes emitted by the production TLS
// engine, including a 16 KiB record split and the final HTTP chunk framing.
function plaintext(wire: number[], key: Uint8Array, iv: Uint8Array) {
    const bytes = Buffer.from(wire),
        chunks: Buffer[] = [];
    let sequence = 0;
    for (let at = 0; at < bytes.length;) {
        const size = bytes.readUInt16BE(at + 3),
            nonce = Buffer.from(iv);
        nonce[11] = nonce[11]! ^ sequence++;
        const decipher = createDecipheriv("aes-128-gcm", key, nonce);
        decipher.setAAD(bytes.subarray(at, at + 5));
        decipher.setAuthTag(bytes.subarray(at + 5 + size - 16, at + 5 + size));
        const inner = Buffer.concat([
            decipher.update(bytes.subarray(at + 5, at + 5 + size - 16)),
            decipher.final(),
        ]);
        assert.equal(inner.at(-1), 23);
        chunks.push(inner.subarray(0, -1));
        at += 5 + size;
    }
    return Buffer.concat(chunks).toString();
}

test("TLS secure write legitimately returns true for a partial raw tail below HWM", async () => {
    const { socket, raw } = boundary([10000], true);
    const events: string[] = [];
    socket.on("drain", () => events.push("drain"));
    assert.equal(
        socket.write(new Uint8Array(20480), (e: unknown) => {
            assert.equal(e, null);
            events.push("callback");
        }),
        true,
    );
    assert.equal(raw.writableLength, 10524);
    assert.equal(raw.writableNeedDrain, false);
    assert.equal(socket.writableNeedDrain, false);
    assert.deepEqual(events, []);
    raw._flushWrites();
    await tick();
    assert.deepEqual(events, ["callback"]);
});

test("HTTPS partial-send tail below HWM fulfills the corked HTTP drain promise", async () => {
    const { socket, raw, message, wire } = boundary([10000], true);
    const events: string[] = [];
    const { key, iv } = socket._engine.write;
    message.on("drain", () => {
        assert.equal(message.writableNeedDrain, false);
        events.push("drain");
    });
    assert.equal(
        message.write("x".repeat(20480), (e: unknown) => {
            assert.equal(e, null);
            events.push("callback");
        }),
        false,
    );
    await tick();
    assert.ok(raw.writableLength > 0 && raw.writableLength < 16384);
    assert.equal(socket._pendingLength, 0);
    assert.equal(message.writableNeedDrain, true);
    assert.deepEqual(events, []);
    raw._flushWrites();
    await tick();
    assert.equal(raw.writableLength, 0);
    assert.equal(socket.writableLength, 0);
    assert.equal(message.writableLength, 0);
    assert.equal(
        plaintext(wire, key, iv),
        "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5000\r\n" +
            "x".repeat(20480) +
            "\r\n",
    );
    assert.deepEqual(
        events,
        ["callback", "drain"],
        `empty HTTPS queues; message needDrain=${message.writableNeedDrain}, TLS needDrain=${socket.writableNeedDrain}, raw needDrain=${raw.writableNeedDrain}`,
    );
    raw._flushWrites();
    await tick();
    assert.deepEqual(events, ["callback", "drain"]);
    assert.equal(message._drainSocket, null);
});

for (const secure of [false, true]) {
    for (const first of [10000, -11, -4, 20579]) {
        test(`HTTPS secure=${secure} send=${first}: completion and one empty-queue drain`, async () => {
            const { socket, raw, message } = boundary([first], secure);
            const events: string[] = [];
            message.on("drain", () => {
                assert.equal(message.writableLength, 0);
                assert.equal(message.writableNeedDrain, false);
                events.push("drain");
            });
            assert.equal(
                message.write("x".repeat(20480), (e: unknown) => {
                    assert.equal(e, null);
                    events.push("callback");
                }),
                false,
            );
            await tick();
            if (!secure) {
                assert.equal(socket._pendingLength, 20535);
                assert.deepEqual(events, []);
                socket._onSecure();
                await tick();
            }
            if (first !== 20579) {
                assert.ok(raw.writableLength > 0);
                assert.deepEqual(events, []);
                raw._flushWrites();
                // Raw Socket completions stay asynchronous, even for the last byte.
                assert.deepEqual(events, []);
            }
            await tick();
            assert.equal(socket._pendingLength, 0);
            assert.equal(message.writableLength, 0);
            const expected =
                secure && first === 20579
                    ? ["drain", "callback"]
                    : ["callback", "drain"];
            assert.deepEqual(events, expected);
            raw._flushWrites();
            await tick();
            assert.deepEqual(events, expected);
            assert.equal(socket.writableNeedDrain, false);
            assert.equal(message._drainSocket, null);
        });
    }
}

for (const fast of [false, true]) {
    test(`TLS pre-handshake ${fast ? "fast" : "public"} false write drains only after the raw tail`, async () => {
        const { socket, raw } = boundary([10000], false);
        const events: string[] = [];
        socket.on("drain", () => {
            assert.equal(socket.writableLength, 0);
            events.push("drain");
        });
        const bytes = new Uint8Array(20480);
        const callback = (e: unknown) => {
            assert.equal(e, null);
            events.push("callback");
        };
        assert.equal(
            fast
                ? socket._sendNow(bytes, bytes.length, callback)
                : socket.write(bytes, callback),
            false,
        );
        assert.equal(socket.writableNeedDrain, true);
        socket._onSecure();
        assert.ok(raw.writableLength > 0 && raw.writableLength < 16384);
        await tick();
        assert.deepEqual(events, []);
        raw._flushWrites();
        await tick();
        assert.deepEqual(events, ["callback", "drain"]);
    });
}

for (const secure of [false, true]) {
    for (const terminal of ["destroy", "error", "deferred destroy", "end"]) {
        test(`HTTPS secure=${secure} ${terminal}: terminal completions settle once without late drain`, async () => {
            const { socket, raw, message, results } = boundary([10000], secure);
            const events: string[] = [];
            socket.on("error", (e: any) => events.push(e.code));
            socket.on("close", () => events.push("close"));
            message.on("drain", () => events.push("drain"));
            message.on("finish", () => events.push("finish"));
            message.write("x".repeat(20480), (e: any) =>
                events.push(e?.code || "callback"),
            );
            await tick();
            if (terminal === "end") {
                results.push(-11, -11, -11);
                message.end();
                if (!secure) socket._onSecure();
                await tick();
                assert.deepEqual(events, []);
                results.length = 0;
                raw._flushWrites();
            } else if (terminal === "error") {
                if (!secure) socket._onSecure();
                results.push(-32);
                raw._flushWrites();
            } else {
                if (terminal === "deferred destroy") {
                    if (!secure) socket._onSecure();
                    raw._flushWrites();
                }
                message.destroy();
            }
            await tick();
            raw._flushWrites();
            await tick();
            assert.deepEqual(
                events,
                terminal === "end"
                    ? ["callback", "finish"]
                    : terminal === "error"
                      ? ["EPIPE", "EPIPE", "close"]
                      : [
                            terminal === "destroy"
                                ? "ERR_STREAM_DESTROYED"
                                : "callback",
                            "close",
                        ],
            );
            assert.equal(message.writableLength, 0);
            assert.equal(message.writableNeedDrain, false);
            assert.equal(socket.writableNeedDrain, false);
            assert.equal(socket._pendingLength, 0);
            assert.equal(message._drainSocket, null);
        });
    }
}

for (const terminal of ["destroy", "end", "seal error"]) {
    test(`TLS fast owner ${terminal} keeps its completion protocol`, async () => {
        const { socket } = boundary([], true);
        const events: string[] = [];
        socket.on("error", (e: any) => events.push("error:" + e.code));
        socket.on("close", () => events.push("close"));
        if (terminal === "destroy") socket.destroy();
        else if (terminal === "end") socket.end();
        else socket._engine.state = "closed";
        const owner = {
            _sent(e: any) {
                assert.equal(this, owner);
                events.push("callback:" + e?.code);
            },
        };
        assert.equal(socket._sendNow(new Uint8Array(1), 1, owner), false);
        await tick();
        assert.equal(events.filter((e) => e.startsWith("callback:")).length, 1);
        const code =
            terminal === "destroy"
                ? "ERR_STREAM_DESTROYED"
                : terminal === "end"
                  ? "ERR_STREAM_WRITE_AFTER_END"
                  : "ERR_SSL_PROTOCOL_ERROR";
        assert.ok(events.includes("callback:" + code));
        if (terminal === "seal error")
            assert.deepEqual(events, [
                "callback:" + code,
                "error:" + code,
                "close",
            ]);
    });
}

for (const first of [1, -11, -4]) {
    test(`fast HTTP send ${first}: false creates a drain obligation until flushing`, async () => {
        const { socket } = boundary([first]);
        let drains = 0;
        socket.on("drain", () => drains++);
        assert.equal(socket._sendNow(new Uint8Array(20000), 20000), false);
        const needDrain = socket.writableNeedDrain;
        socket._flushWrites();
        assert.equal(socket.writableLength, 0);
        await tick();
        assert.equal(drains, 1);
        assert.equal(needDrain, true);
        assert.equal(socket.writableNeedDrain, false);
    });
}

test("auto-cork bounds a synchronous producer and forwards drain after an immediate send", async () => {
    const { socket, message } = boundary();
    let writes = 0,
        drains = 0;
    message.on("drain", () => {
        drains++;
        assert.equal(message.writableNeedDrain, false);
    });
    while (writes < 64) {
        writes++;
        if (!message.write("x".repeat(4096))) break;
    }
    assert.ok(
        writes < 64,
        `producer appended ${message.writableLength} bytes without false`,
    );
    assert.equal(message.writableNeedDrain, true);
    assert.ok(
        message.writableLength < message.writableHighWaterMark + 4096 + 128,
    );
    await tick();
    assert.equal(message.writableLength, 0);
    assert.equal(drains, 1);
    assert.equal(socket.listenerCount("drain"), 0);
});

test("queued fast writes retain function and message completions exactly once (T04)", async () => {
    const { socket, results } = boundary([-11, -11]);
    const events: string[] = [];
    assert.equal(
        socket._sendNow(new Uint8Array(20000), 20000, (error: Error) => {
            assert.equal(error, null);
            events.push("function");
        }),
        false,
    );
    socket._sendNow(new Uint8Array(2), 2, {
        _sent(error: Error) {
            assert.equal(error, null);
            events.push("message");
        },
    });
    results.push(1, -11);
    socket._flushWrites();
    socket._flushWrites();
    socket._flushWrites();
    await tick();
    socket._flushWrites();
    await tick();
    assert.deepEqual(events, ["function", "message"]);
    assert.equal(socket.writableLength, 0);
    assert.equal(socket._writeQueue.length, 0);
});

for (const first of [20000, 1, -11, -4]) {
    test(`fast completion ${first} preserves both callback kinds`, async () => {
        for (const object of [false, true]) {
            const { socket } = boundary([first]);
            let completions = 0;
            const complete = (error: Error) => {
                assert.equal(error, null);
                completions++;
            };
            socket._sendNow(
                new Uint8Array(20000),
                20000,
                object ? { _sent: complete } : complete,
            );
            socket._flushWrites();
            await tick();
            socket._flushWrites();
            await tick();
            assert.equal(completions, 1);
        }
    });
}

test("drain stays pending if a new queue appears before its deferred notification", async () => {
    const { socket, results } = boundary([-11]);
    let drains = 0;
    socket.on("drain", () => drains++);
    socket._sendNow(new Uint8Array(20000), 20000);
    socket._flushWrites();
    results.push(-11);
    socket._sendNow(new Uint8Array(1), 1);
    await tick();
    assert.equal(drains, 0);
    assert.equal(socket.writableNeedDrain, true);
    socket._flushWrites();
    await tick();
    assert.equal(drains, 1);
});

for (const terminal of ["destroy", "error", "deferred destroy"]) {
    test(`socket ${terminal}: no late drain, queued callbacks complete once`, async () => {
        const { socket, results } = boundary([-11]);
        const events: string[] = [];
        const errors: string[] = [];
        socket.on("error", (e: any) => events.push(e.code));
        socket.on("close", () => events.push("close"));
        socket.on("drain", () => events.push("drain"));
        socket._sendNow(new Uint8Array(20000), 20000, (e: any) =>
            errors.push(e?.code || "ok"),
        );
        if (terminal === "error") {
            results.push(-32);
            socket._flushWrites();
        } else {
            if (terminal === "deferred destroy") socket._flushWrites();
            socket.destroy();
        }
        await tick();
        socket._flushWrites();
        await tick();
        assert.deepEqual(
            events,
            terminal === "error" ? ["EPIPE", "close"] : ["close"],
        );
        assert.deepEqual(errors, [
            terminal === "error"
                ? "EPIPE"
                : terminal === "destroy"
                  ? "ERR_STREAM_DESTROYED"
                  : "ok",
        ]);
        assert.equal(socket.writableLength, 0);
        assert.equal(socket.writableNeedDrain, false);
        assert.equal(socket._writeQueue, null);
    });
}

test("fast terminal send reports EPIPE to its completion before error and close", async () => {
    const { socket } = boundary([-32]);
    const events: string[] = [];
    socket.on("error", (e: any) => events.push("error:" + e.code));
    socket.on("close", () => events.push("close"));
    assert.equal(
        socket._sendNow(new Uint8Array(20000), 20000, {
            _sent(e: any) {
                events.push("callback:" + e.code);
            },
        }),
        false,
    );
    await tick();
    assert.deepEqual(events, ["callback:EPIPE", "error:EPIPE", "close"]);
});

test("nested cork and socket EAGAIN retain message needDrain until all bytes leave", async () => {
    const { socket, message, results } = boundary([-11, -11, -11, -11]);
    let drains = 0;
    message.on("drain", () => drains++);
    message.cork();
    message.cork();
    for (let i = 0; i < 4; i++) message.write("x".repeat(4096));
    message.uncork();
    await tick();
    assert.equal(message._chunkLength, 16384);
    assert.equal(drains, 0);
    message.uncork();
    await tick();
    assert.equal(message.writableNeedDrain, true);
    assert.equal(drains, 0);
    results.length = 0;
    socket._flushWrites();
    await tick();
    assert.equal(drains, 1);
    assert.equal(message.writableLength, 0);
    assert.equal(socket.listenerCount("drain"), 0);
});

test("pre-socket output forwards drain on assignment even when sends complete immediately", async () => {
    const { socket, message } = boundary();
    message.socket = null;
    let drains = 0;
    message.on("drain", () => drains++);
    assert.equal(message.write("x".repeat(20000)), false);
    assert.equal(message.writableNeedDrain, true);
    await tick();
    assert.equal(drains, 0);
    message.socket = socket;
    message._flushOutput();
    await tick();
    assert.equal(drains, 1);
    assert.equal(message._outputSize, 0);
    assert.equal(socket.listenerCount("drain"), 0);
});

test("a false corked write drains even when the partial socket tail is below its HWM", async () => {
    const { socket, message } = boundary([10000]);
    let drains = 0;
    message.on("drain", () => drains++);
    assert.equal(message.write("x".repeat(20000)), false);
    await tick();
    assert.ok(socket.writableLength > 0 && socket.writableLength < 16384);
    assert.equal(message.writableNeedDrain, true);
    socket._flushWrites();
    await tick();
    assert.equal(message.writableLength, 0);
    assert.equal(drains, 1);
});

test("corked UTF-8 data and an existing socket queue share the message high-water calculation", async () => {
    const { socket, message, results } = boundary([-11, -11]);
    let drains = 0;
    socket._sendNow(new Uint8Array(8000), 8000);
    message.on("drain", () => drains++);
    assert.equal(message.write("é".repeat(5000)), false);
    assert.equal(message._chunkLength, 10000);
    assert.ok(message.writableLength > 18000);
    await tick();
    results.length = 0;
    socket._flushWrites();
    await tick();
    assert.equal(drains, 1);
    assert.equal(message.writableLength, 0);
});

test("a waiting pipelined message drains only after its own output is activated", async () => {
    const { socket, http, message, results } = boundary([-11]);
    socket._sendNow(new Uint8Array(20000), 20000);
    const next = new http.OutgoingMessage();
    next._header = "HTTP/1.1 200 OK\r\n\r\n";
    next.socket = socket;
    let drains = 0;
    next.on("drain", () => drains++);
    assert.equal(next.write("x".repeat(20000)), false);
    assert.equal(socket._httpMessage, message);
    assert.equal(socket.listenerCount("drain"), 0);
    assert.ok(
        next.writableLength < 21000,
        "exclude the preceding response's socket queue",
    );
    results.length = 0;
    socket._flushWrites();
    await tick();
    assert.equal(drains, 0);
    socket._httpMessage = next;
    next._flushOutput();
    await tick();
    assert.equal(drains, 1);
    assert.equal(socket.listenerCount("drain"), 0);
});

test("destroy before socket assignment releases encoded output and callbacks", async () => {
    const { socket, message } = boundary();
    message.socket = null;
    const errors: string[] = [];
    assert.equal(
        message.write("x".repeat(20000), (error: any) =>
            errors.push(error.code),
        ),
        false,
    );
    message.destroy();
    await tick();
    assert.deepEqual(errors, ["ERR_STREAM_DESTROYED"]);
    assert.equal(message._output, null);
    assert.equal(message._outputSize, 0);
    assert.equal(message.writableNeedDrain, false);
    message.emit("socket", socket);
    await tick();
    assert.equal(socket.destroyed, true);
});

test("assignSocket and detachSocket move the drain subscription without retaining the old socket", async () => {
    const { socket, http } = boundary();
    socket._httpMessage = null;
    const message = new http.ServerResponse({
        method: "GET",
        httpVersionMajor: 1,
        httpVersionMinor: 1,
    });
    message._header = "HTTP/1.1 200 OK\r\n\r\n";
    message.chunkedEncoding = true;
    let drains = 0;
    message.on("drain", () => drains++);
    assert.equal(message.write("x".repeat(20000)), false);
    message.assignSocket(socket);
    message.detachSocket(socket);
    await tick();
    assert.equal(drains, 0);
    assert.equal(socket.listenerCount("drain"), 0);
    assert.equal(message.writableNeedDrain, true);
    const replacement = boundary().socket;
    replacement._httpMessage = null;
    message.assignSocket(replacement);
    await tick();
    assert.equal(drains, 1);
    assert.equal(message._drainSocket, null);
    assert.equal(replacement.listenerCount("drain"), 0);
});

for (const terminal of ["destroy", "error", "close", "end"]) {
    test(`corked message ${terminal} clears buffers and drain subscriptions`, async () => {
        const { socket, message } = boundary();
        const errors: string[] = [];
        let drains = 0,
            finishes = 0,
            closes = 0;
        socket.on("error", () => {});
        socket.on("close", () => closes++);
        message.on("drain", () => drains++);
        message.on("finish", () => finishes++);
        message.write("x".repeat(20000), (e: any) =>
            errors.push(e?.code || "ok"),
        );
        if (terminal === "end") message.end();
        else if (terminal === "destroy") message.destroy();
        else
            socket.destroy(
                terminal === "error"
                    ? Object.assign(new Error("broken"), { code: "EPIPE" })
                    : undefined,
            );
        await tick();
        assert.equal(drains, 0);
        assert.equal(finishes, terminal === "end" ? 1 : 0);
        assert.equal(closes, terminal === "end" ? 0 : 1);
        assert.deepEqual(errors, [
            terminal === "end"
                ? "ok"
                : terminal === "error"
                  ? "EPIPE"
                  : "ERR_STREAM_DESTROYED",
        ]);
        assert.equal(message._chunks, null);
        assert.equal(message._output, null);
        assert.equal(message.writableLength, 0);
        assert.equal(message.writableNeedDrain, false);
        assert.equal(socket.listenerCount("drain"), 0);
        assert.equal(message._drainSocket, null);
    });
}
