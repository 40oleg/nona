import { test } from "node:test";
import assert from "node:assert/strict";
import { createContext, runInContext } from "node:vm";
import { EventEmitter, addAbortListener, getEventListeners } from "node:events";
import { StringDecoder } from "node:string_decoder";
import { encodingPreludeSource } from "../src/runtime/encoding-source.js";
import { bufferPreludeSource } from "../src/runtime/buffer-source.js";
import { streamPreludeForTarget } from "../src/runtime/stream-source.js";
import {
    modulesFetch,
    modulesNetworkStream,
} from "../src/lib/sources.generated.js";
import { builtinModuleRequests } from "../src/frontend/modules.js";
import { withBuiltinModules } from "../src/frontend/builtin-modules.js";
import { parse } from "../src/frontend/parser.js";
import { lex } from "../src/frontend/lexer.js";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
test("fetch discovery distinguishes globals from bindings and covers computed/optional/reflected reads", () => {
    const host = withBuiltinModules(
        { resolve: () => undefined, read: () => undefined },
        "win32-x64",
    );
    for (const [source, expected] of [
        ["typeof fetch", true],
        ["typeof globalThis.fetch", true],
        ["const key='fetch'; typeof globalThis[key]", true],
        [
            "const key='fetch'; function unrelated(key) {} console.log(typeof globalThis[key]);",
            true,
        ],
        [
            "const key='fetch'; { const key='other'; typeof globalThis[key]; } typeof globalThis[key];",
            true,
        ],
        [
            "const key='other'; { const key='fetch'; typeof globalThis[key]; }",
            true,
        ],
        [
            "const key='fet'; function unrelated(key) {} const name=key+'ch'; typeof globalThis[name];",
            true,
        ],
        [
            "const key='fetch'; { const key='other'; typeof globalThis[key]; }",
            false,
        ],
        [
            "const key='fetch'; function f() { const key='other'; return typeof globalThis[key]; }",
            false,
        ],
        [
            "const key='fetch'; function f(value=globalThis[key]) { var key; }",
            true,
        ],
        ["globalThis?.['fet' + 'ch']", true],
        ["Reflect.get(globalThis, 'fetch')", true],
        ["function f(fetch) { return fetch(); }", false],
        ["try {} catch (fetch) { fetch(); }", false],
        ["{ let fetch; fetch(); }", false],
        ["function f() { let fetch; } typeof fetch", true],
        ["function f(x=fetch) { var fetch; return x; }", true],
        ["const object = {fetch: 1}; object.fetch", false],
        ["const object = {fetch};", true],
        ["var fetch; typeof fetch;", true],
        ["var fetch = fetch; typeof fetch;", true],
        ["typeof fetch; var fetch = () => 7;", true],
        ["if (false) { var fetch = () => 7; } fetch();", true],
        ["const object = {}; object[fetch];", true],
        ["switch(1) { case 1: let fetch = () => 7; fetch(); }", false],
        ["switch(fetch) { case 1: let fetch; }", true],
    ] as const) {
        assert.equal(
            builtinModuleRequests(parse(lex(source)), host).includes(
                "nona:internal/fetch",
            ),
            expected,
            source,
        );
    }
    assert.ok(
        !builtinModuleRequests(
            parse(lex("var fetch; typeof fetch;"), { module: true }),
            host,
        ).includes("nona:internal/fetch"),
    );
    const scoped =
        "globalThis.key='crypto'; function unused(){const key='fetch';} console.log(globalThis[key]);";
    assert.ok(
        builtinModuleRequests(parse(lex(scoped)), host).includes("node:crypto"),
    );
    const switchScope =
        "globalThis.key='crypto'; switch(globalThis[key]) {case 'none': const key='fetch';}";
    assert.ok(
        builtinModuleRequests(parse(lex(switchScope)), host).includes(
            "node:crypto",
        ),
    );
});
const strip = (source: string) =>
    source
        .replace(/^import[\s\S]*?;\r?\n/gm, "")
        .replace(/\bexport default /g, "const defaultExport = ")
        .replace(/\bexport /g, "");

// Run the real provider, compact network stream and Node-to-Web adapter in a
// JS realm. Only socket scheduling is scripted. Expose private queue states in
// this test realm to count retained backing storage as well as logical bytes.
function boundary() {
    const signals = {
        isSignal: (signal: unknown) => signal instanceof AbortSignal,
        protect: (signal: AbortSignal, callback: () => void) => {
            const subscription = addAbortListener(signal, callback);
            return () => subscription[Symbol.dispose]();
        },
    };
    const vm: any = {
        eventEmitterModule: EventEmitter,
        events: signals,
        queues: [],
        enqueueNextTick: (callback: Function, args: unknown[] = []) =>
            process.nextTick(() => Reflect.apply(callback, undefined, args)),
    };
    const context = createContext({
        __nonaRegexpVm: vm,
        setImmediate,
        setTimeout,
        queueMicrotask,
        AbortController,
        AbortSignal,
    });
    const source = streamPreludeForTarget("win32-x64")
        .replace(
            "apply(weakSet, webStates, [web, s]);",
            "apply(weakSet, webStates, [web, s]); vm.queues.push(s);",
        )
        .replace(
            "vm.streamModule=Stream;",
            "vm.nodeState=readableState;vm.streamModule=Stream;",
        );
    runInContext(encodingPreludeSource + bufferPreludeSource + source, context);
    const streams = runInContext(
        "Buffer[Symbol.for('nona.stream.module')]",
        context,
    );
    const bytes = runInContext("Buffer", context);
    const u8 = runInContext("Uint8Array", context);
    const { Readable: NetworkReadable } = new Function(
        "EventEmitter",
        "StringDecoder",
        "Buffer",
        strip(modulesNetworkStream) + ";return {Readable};",
    )(EventEmitter, StringDecoder, bytes);
    const requests: any[] = [];
    let handler: ((request: any) => void) | null = null;
    const transport = {
        request(url: string, options: any) {
            const request: any = new EventEmitter();
            request.url = url;
            request.options = options;
            request.destroyCalls = 0;
            request.destroy = () => {
                if (!request.destroyed) {
                    request.destroyed = true;
                    request.destroyCalls++;
                }
            };
            request.end = (body: unknown) => {
                request.body = body;
                if (handler) queueMicrotask(() => handler!(request));
            };
            requests.push(request);
            return request;
        },
    };
    function Target() {}
    Object.defineProperty(Target, Symbol.for("nona.events.internal"), {
        value: signals,
    });
    const fetch = new Function(
        "http",
        "https",
        "Buffer",
        "Readable",
        "finished",
        "addAbortListener",
        "StringDecoder",
        "EventTarget",
        "Uint8Array",
        "ArrayBuffer",
        "URL",
        "DOMException",
        strip(modulesFetch) + ";return fetch;",
    )(
        transport,
        transport,
        bytes,
        streams.Readable,
        streams.finished,
        addAbortListener,
        StringDecoder,
        Target,
        u8,
        runInContext("ArrayBuffer", context),
        URL,
        DOMException,
    );
    function respond(
        request: any,
        total = 0,
        chunkSize = 4096,
        status = 200,
        headers: Record<string, string> = {},
    ) {
        const incoming: any = new NetworkReadable();
        incoming.statusCode = status;
        incoming.statusMessage = "OK";
        incoming.headers = headers;
        incoming.rawHeaders = Object.entries(headers).flat();
        incoming.sent = 0;
        incoming.complete = false;
        incoming._read = () => {
            if (incoming.scheduled || incoming.destroyed) return;
            incoming.scheduled = true;
            setImmediate(() => {
                incoming.scheduled = false;
                while (!incoming.destroyed && incoming.sent < total) {
                    const count = Math.min(chunkSize, total - incoming.sent);
                    incoming.sent += count;
                    if (!incoming.push(bytes.alloc(count, 120))) return;
                }
                if (!incoming.destroyed && incoming.sent === total) {
                    incoming.complete = true;
                    incoming.push(null);
                }
            });
        };
        request.incoming = incoming;
        request.emit("response", incoming);
        return incoming;
    }
    return {
        fetch,
        requests,
        respond,
        vm,
        bytes,
        u8,
        streams,
        setHandler(fn: (req: any) => void) {
            handler = fn;
        },
    };
}

test("fetch provider rejects unsupported bodies, schemes, headers and framing before transport", async () => {
    const b = boundary();
    for (const init of [
        { method: "GET", body: "x" },
        { method: "TRACE" },
        { method: "bad method" },
        { method: "POST", body: {} },
        { method: "POST", body: new ArrayBuffer(1) },
        { headers: { "bad name": "x" } },
        { headers: { good: "a\r\nb" } },
        { headers: { good: "Я" } },
        { method: "POST", body: "я", headers: { "content-length": "1" } },
        { redirect: "unknown" },
        { signal: {} },
    ])
        await assert.rejects(b.fetch("http://local/", init), {
            name: "TypeError",
        });
    for (const url of ["file:///tmp/a", "http://user:pass@local/"])
        await assert.rejects(b.fetch(url), { name: "TypeError" });
    assert.equal(b.requests.length, 0);
});

test("fetch queue cancellation is prompt and protected before a socket/headers exist", async () => {
    const b = boundary();
    for (let i = 0; i < 12; i++) {
        const controller = new AbortController();
        controller.signal.addEventListener(
            "abort",
            (event) => event.stopImmediatePropagation(),
            { once: true },
        );
        const reason = new Error("queued abort");
        const pending = b.fetch("http://local/", { signal: controller.signal });
        const request = b.requests.at(-1);
        assert.equal(getEventListeners(controller.signal, "abort").length, 2);
        controller.abort(reason);
        await assert.rejects(pending, (error: unknown) => error === reason);
        request.emit("error", new Error("late socket error"));
        assert.equal(request.destroyCalls, 1);
        assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    }
});

test("fetch rejects upgrades, closes the detached socket and releases abort protection", async () => {
    const b = boundary();
    const controller = new AbortController();
    const pending = b.fetch("http://local/upgrade", {
        signal: controller.signal,
    });
    let rejection: unknown;
    void pending.catch((error: unknown) => {
        rejection = error;
    });
    const request = b.requests.at(-1);
    let socketCloses = 0;
    const socket = { destroy: () => socketCloses++ };
    request.emit("upgrade", { statusCode: 101 }, socket, b.bytes.alloc(0));
    await tick();
    assert.ok(rejection instanceof TypeError, "fetch must reject the upgrade");
    assert.equal(socketCloses, 1);
    assert.equal(request.destroyCalls, 1);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    controller.abort();
    request.emit("error", new Error("late upgrade error"));
    assert.equal(socketCloses, 1);
    assert.equal(request.destroyCalls, 1);
    b.setHandler((req) => b.respond(req, 8));
    assert.equal(
        (await (await b.fetch("http://local/metrics")).text()).length,
        8,
    );
});

test("fetch redirects release stalled intermediates, enforce 20 hops and preserve cancellation", async () => {
    const b = boundary();
    b.setHandler((request) => {
        if (b.requests.length <= 20)
            b.respond(request, 524288, 4096, 307, { location: "/next" });
        else b.respond(request, 8);
    });
    const response = await b.fetch("http://local/", {
        method: "POST",
        body: "replay",
    });
    assert.equal((await response.arrayBuffer()).byteLength, 8);
    assert.equal(b.requests.length, 21);
    assert.equal(response.redirected, true);
    for (const request of b.requests.slice(0, 20)) {
        assert.equal(request.destroyCalls, 1);
        assert.equal(request.incoming.sent, 0);
        assert.equal(request.incoming.destroyed, true);
        assert.equal(String(request.body), "replay");
    }
    const loop = boundary();
    loop.setHandler((request) =>
        loop.respond(request, 524288, 4096, 302, { location: "/loop" }),
    );
    await assert.rejects(loop.fetch("http://local/"), { name: "TypeError" });
    assert.equal(loop.requests.length, 21);
    assert.ok(loop.requests.every((request) => request.destroyCalls === 1));
    const aborting = boundary();
    const controller = new AbortController();
    aborting.setHandler((request) => {
        aborting.respond(request, 524288, 4096, 303, { location: "/later" });
        controller.abort();
    });
    await assert.rejects(
        aborting.fetch("http://local/", { signal: controller.signal }),
        { name: "AbortError" },
    );
    await tick();
    assert.equal(aborting.requests.length, 1);
    assert.equal(aborting.requests[0].destroyCalls, 1);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("fetch response headers stay immutable through forEach and byte bodies are replay snapshots", async () => {
    const b = boundary();
    const input = new b.u8([255, 216, 255, 217]);
    const pending = b.fetch("http://local/", { method: "POST", body: input });
    input[0] = 0;
    assert.equal(b.requests[0].body[0], 255);
    b.respond(b.requests[0], 8, 4096, 200, { "X-Value": "value" });
    const response = await pending;
    let seen = 0;
    response.headers.forEach((value: string, key: string, headers: any) => {
        assert.equal(headers, response.headers);
        assert.equal(key, "x-value");
        assert.equal(value, "value");
        assert.throws(() => headers.set(key, "other"), { name: "TypeError" });
        seen++;
    });
    assert.equal(seen, 1);
    const reader = response.body.getReader();
    assert.equal(response.bodyUsed, false);
    await assert.rejects(response.text(), { name: "TypeError" });
    reader.releaseLock();
    assert.equal((await response.text()).length, 8);
    await assert.rejects(response.arrayBuffer(), { name: "TypeError" });
});

test("fetch retains abort protection after HTTP EOF and errors queued web bytes", async () => {
    const b = boundary();
    b.setHandler((request) => b.respond(request, 128));
    const controller = new AbortController();
    const response = await b.fetch("http://local/", {
        signal: controller.signal,
    });
    await tick();
    await tick();
    assert.equal(b.requests[0].incoming.complete, true);
    assert.equal(getEventListeners(controller.signal, "abort").length, 1);
    const reason = new DOMException("aborted after EOF", "AbortError");
    controller.abort(reason);
    await assert.rejects(response.text(), (error: unknown) => error === reason);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    assert.equal(b.vm.queues[0].length, 0);
    assert.equal(b.vm.queues[0].queue.length, 0);
});

test("fetch after-EOF abort cannot destroy a request whose socket was released", async () => {
    const b = boundary();
    b.setHandler((request) => b.respond(request, 128));
    const controller = new AbortController();
    const response = await b.fetch("http://local/", {
        signal: controller.signal,
    });
    await tick();
    await tick();
    b.requests[0]._released = true;
    controller.abort();
    await assert.rejects(response.text(), { name: "AbortError" });
    assert.equal(b.requests[0].destroyCalls, 0);
});

test("fetch body readers preserve falsy abort reasons before and after acquiring a reader", async () => {
    for (const reason of [null, false, 0, ""]) {
        for (const acquireBeforeAbort of [false, true]) {
            const b = boundary();
            b.setHandler((request) =>
                b.respond(
                    request,
                    request.url.endsWith("/metrics") ? 32 : 524288,
                ),
            );
            const controller = new AbortController();
            const response = await b.fetch("http://local/", {
                signal: controller.signal,
            });
            let reader = acquireBeforeAbort ? response.body.getReader() : null;
            controller.abort(reason);
            if (!reader) reader = response.body.getReader();
            let closed = false;
            const closure = reader.closed.catch((failure: unknown) => {
                assert.equal(failure, reason);
                closed = true;
            });
            await tick();
            assert.equal(closed, true, "reader.closed must reject on abort");
            await closure;
            assert.equal(response.bodyUsed, false);
            await assert.rejects(
                reader.cancel(),
                (failure: unknown) => failure === reason,
            );
            assert.equal(response.bodyUsed, true);
            await assert.rejects(
                reader.read(),
                (failure: unknown) => failure === reason,
            );
            reader.releaseLock();
            await assert.rejects(
                response.body.cancel(),
                (failure: unknown) => failure === reason,
            );
            assert.equal(b.requests[0].destroyCalls, 1);
            assert.equal(
                getEventListeners(controller.signal, "abort").length,
                0,
            );
            assert.equal(
                (await (await b.fetch("http://local/metrics")).text()).length,
                32,
            );
        }
    }
});

function storage(b: ReturnType<typeof boundary>, incoming: any) {
    const web = b.vm.queues.at(-1);
    const node = b.vm.nodeState(web.source);
    const chunks = [
        ...web.queue.map((entry: any) => entry.value),
        ...node.queue,
        ...(incoming._queue || []),
    ];
    const buffers = new Set<any>();
    let retained = 0;
    for (const chunk of chunks) {
        if (!buffers.has(chunk.buffer)) {
            buffers.add(chunk.buffer);
            retained += chunk.buffer.byteLength;
        }
    }
    return {
        web: web.length,
        node: node.length,
        network: incoming.readableLength,
        retained,
    };
}
test("fetch byte queues and retained storage stay bounded with a stalled/slow reader as totals grow", async () => {
    // No RSS threshold: deterministic ownership checks, including backing buffers.
    // C is the largest producer chunk. Each of the three queues has a 16 KiB
    // byte HWM and can overshoot by at most C; the web adapter copies a chunk.
    for (const chunk of [1024, 32768]) {
        const bound = 3 * (16384 + chunk) + chunk;
        const peaks: number[] = [];
        for (const total of [131072, 524288]) {
            const b = boundary();
            b.setHandler((request) => b.respond(request, total, chunk));
            const response = await b.fetch("http://local/");
            await tick();
            await tick();
            await tick();
            const incoming = b.requests[0].incoming;
            assert.ok(
                incoming.sent < total,
                "producer must stop for stalled demand",
            );
            const first = incoming.sent;
            await tick();
            await tick();
            assert.equal(
                incoming.sent,
                first,
                "stalled reader must stop the producer",
            );
            let peak = 0;
            const reader = response.body.getReader();
            let received = 0;
            for (;;) {
                const measure = storage(b, incoming);
                assert.ok(measure.web < 16384 + chunk, JSON.stringify(measure));
                assert.ok(
                    measure.node <= 16384 + chunk,
                    JSON.stringify(measure),
                );
                assert.ok(
                    measure.network <= 16384 + chunk,
                    JSON.stringify(measure),
                );
                assert.ok(measure.retained <= bound, JSON.stringify(measure));
                peak = Math.max(peak, measure.retained);
                const step = await reader.read();
                if (step.done) break;
                received += step.value.byteLength;
                await tick();
            }
            reader.releaseLock();
            await tick();
            assert.equal(received, total);
            assert.equal(storage(b, incoming).retained, 0);
            peaks.push(peak);
        }
        assert.ok(peaks[1]! <= bound);
    }
});

test("fetch cancellation and metrics cycles release listeners, queues and connections once", async () => {
    const b = boundary();
    let sequence = 0;
    b.setHandler((request) => b.respond(request, ++sequence % 2 ? 524288 : 32));
    for (let i = 0; i < 12; i++) {
        const controller = new AbortController();
        const response = await b.fetch("http://local/", {
            signal: controller.signal,
        });
        const req = b.requests.at(-1);
        const reader = response.body.getReader();
        await reader.read();
        if (i % 2) controller.abort();
        else await reader.cancel();
        reader.releaseLock();
        await tick();
        assert.equal(getEventListeners(controller.signal, "abort").length, 0);
        assert.equal(storage(b, req.incoming).retained, 0);
        assert.equal(req.destroyCalls, 1);
        assert.equal(req.incoming.listenerCount("data"), 0);
        const metricsController = new AbortController();
        const metrics = await b.fetch("http://local/", {
            signal: metricsController.signal,
        });
        assert.equal((await metrics.arrayBuffer()).byteLength, 32);
        await tick();
        assert.equal(
            getEventListeners(metricsController.signal, "abort").length,
            0,
        );
    }
});
