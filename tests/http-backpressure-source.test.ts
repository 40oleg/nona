import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { StringDecoder } from "node:string_decoder";
import {
    modulesNetCommon,
    modulesHttp,
    modulesNetworkStream,
} from "../src/lib/sources.generated.js";

// Execute the production modules with scripted syscalls. Only the native byte
// helpers are adapted; Socket, Readable and HTTP methods are unchanged.
function boundary(results: number[] = []) {
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
    const sys = {
        send: (_fd: number, _bytes: Uint8Array, length: number) =>
            results.shift() ?? length,
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
    const socket = new net.Socket();
    socket._fd = 1;
    const message = new http.OutgoingMessage();
    message._header = "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n";
    message.chunkedEncoding = true;
    message.socket = socket;
    socket._httpMessage = message;
    return { socket, message, http, results };
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

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
