import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createConnection } from "node:net";
import { httpModuleSource } from "../src/frontend/http-module.js";

// Run the actual Agent, including its helpers, with only the transport replaced.
// Public native/Node parity lives in http-agent.test.ts; pool state here is
// supporting evidence and deliberately is not compared with Node's internals.
function section(start: string, end: string): string {
    const from = httpModuleSource.indexOf(start);
    const to = httpModuleSource.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from, "HTTP extraction boundaries");
    assert.equal(httpModuleSource.indexOf(start, from + start.length), -1);
    assert.equal(httpModuleSource.indexOf(end, to + end.length), -1);
    return httpModuleSource.slice(from, to).replaceAll("export ", "");
}
const Agent = new Function(
    "EventEmitter",
    "net",
    "defer",
    section(
        "export class Agent extends EventEmitter {",
        "export let globalAgent =",
    ) + "\nreturn Agent;",
)(
    EventEmitter,
    {
        createConnection() {
            throw new Error("Tests must inject the transport");
        },
    },
    (target: any, method: string) => tasks.push(() => target[method]()),
);
const tasks: (() => void)[] = [];
function flush() {
    while (tasks.length > 0) tasks.shift()!();
}
const ClientRequest = new Function(
    "OutgoingMessage",
    "defer",
    "hangUp",
    "codedError",
    "ResponseReader",
    section(
        "export class ClientRequest extends OutgoingMessage {",
        "class ResponseReader {",
    ) + "\nreturn ClientRequest;",
)(
    EventEmitter,
    (target: any, method: string) => tasks.push(() => target[method]()),
    (message: string) =>
        Object.assign(new Error(message), { code: "ECONNRESET" }),
    (code: string, message: string) =>
        Object.assign(new Error(message), { code }),
    class {},
);
function client(agent: any): any {
    const req = Object.setPrototypeOf(
        new EventEmitter(),
        ClientRequest.prototype,
    );
    return Object.assign(req, {
        agent,
        socket: null,
        res: null,
        destroyed: false,
        aborted: false,
        _closed: false,
        _errorEmitted: false,
        shouldKeepAlive: true,
        _output: null,
        _chunks: null,
    });
}

class Socket extends EventEmitter {
    [key: string]: any;
    destroyed = false;
    writable = true;
    referenced = true;
    destroy(error?: Error) {
        if (!this.destroyed) {
            this.destroyed = true;
            this.writable = false;
            if (error) this.emit("error", error);
            this.emit("close");
        }
        return this;
    }
    ref() {
        this.referenced = true;
    }
    unref() {
        this.referenced = false;
    }
    setKeepAlive() {}
    setTimeout(timeout: number) {
        this.timeout = timeout;
    }
}
function pool(options: Record<string, unknown> = {}) {
    const agent = new Agent(options);
    const connections: { options: any; socket: Socket }[] = [];
    agent.createConnection = (options: any) => {
        const socket = new Socket();
        connections.push({ options, socket });
        return socket;
    };
    return { agent, connections };
}
function request(onSocket?: (socket: Socket) => void): any {
    return {
        destroyed: false,
        shouldKeepAlive: true,
        assigned: [] as Socket[],
        onSocket(socket: Socket) {
            this.assigned.push(socket);
            socket._httpMessage = this;
            onSocket?.(socket);
        },
    };
}
const origin = (port: number) => ({ host: "127.0.0.1", port });
function counts(agent: any) {
    let total = 0;
    for (const table of [agent.sockets, agent.freeSockets])
        for (const name of Object.keys(table)) total += table[name].length;
    assert.equal(agent.totalSocketCount, total);
    assert.ok(total >= 0 && total <= agent.maxTotalSockets);
    for (const name of Object.keys(agent.sockets))
        assert.ok(
            agent.sockets[name].length +
                (agent.freeSockets[name]?.length || 0) <=
                agent.maxSockets,
        );
}

test("HTTP Agent source: a connection creation throw removes the failed request before later work", () => {
    const { agent, connections } = pool();
    const connect = agent.createConnection;
    agent.createConnection = (options: any) =>
        options.port === 99999 ? createConnection(options) : connect(options);
    const failed = request();
    assert.throws(() => agent.addRequest(failed, origin(99999)), {
        name: "RangeError",
        code: "ERR_SOCKET_BAD_PORT",
    });
    const live = request();
    assert.doesNotThrow(() => agent.addRequest(live, origin(10001)));
    assert.equal(live.assigned.length, 1);
    assert.equal(failed.assigned.length, 0);
    assert.equal(failed._queuedAgentName, undefined);
    assert.equal(failed._queuedAgentOptions, undefined);
    assert.equal(failed._agentQueueOrder, undefined);
    assert.equal(Object.keys(agent.requests).length, 0);
    assert.equal(Object.keys(agent._queueNames).length, 0);
    assert.equal(connections.length, 1);
    counts(agent);
    agent.destroy();
    counts(agent);
});

test("HTTP Agent source: closing A wakes B at maxTotalSockets=1", () => {
    const { agent, connections } = pool({ maxTotalSockets: 1 });
    const a = request(),
        b = request();
    agent.addRequest(a, origin(10001));
    agent.addRequest(b, origin(10002));
    assert.equal(a.assigned.length, 1);
    assert.equal(b.assigned.length, 0);
    counts(agent);
    connections[0]!.socket.destroy();
    assert.equal(
        b.assigned.length,
        1,
        "B remains queued although global capacity is available",
    );
    assert.equal(connections[1]!.options.port, 10002);
    assert.equal(Object.keys(agent.requests).length, 0);
    counts(agent);
    agent.removeSocket(connections[0]!.socket);
    counts(agent);
    agent.destroy();
    counts(agent);
});

test("HTTP Agent source: maxTotalSockets=2 skips a saturated origin and keeps each request's effective options", () => {
    const { agent, connections } = pool({ maxTotalSockets: 2, maxSockets: 1 });
    // An override, like HTTPS's TLS pool key, cannot be parsed into options.
    agent.getName = (options: any) =>
        "key/" + options.port + "/" + options.servername;
    const a = request(),
        b = request(),
        c = request();
    agent.addRequest(a, {
        ...origin(10001),
        servername: "a",
        localAddress: "127.0.0.1",
    });
    agent.addRequest(b, origin(10002));
    const a3 = request();
    agent.addRequest(a3, { ...origin(10001), servername: "a" });
    const context = { tls: true };
    agent.addRequest(c, { ...origin(10003), servername: "c", context });
    connections[1]!.socket.destroy();
    assert.equal(a3.assigned.length, 0);
    assert.equal(c.assigned.length, 1);
    assert.equal(connections[2]!.options.port, 10003);
    assert.equal(connections[2]!.options.servername, "c");
    assert.equal(connections[2]!.options.context, context);
    counts(agent);
    agent.destroy();
});

test("HTTP Agent source: closing a socket prefers its own FIFO queue", () => {
    const { agent, connections } = pool({ maxTotalSockets: 1, maxSockets: 1 });
    const a = request(),
        b = request(),
        a2 = request(),
        a3 = request();
    agent.addRequest(a, origin(10001));
    agent.addRequest(b, origin(10002));
    agent.addRequest(a2, { ...origin(10001), marker: "second" });
    agent.addRequest(a3, origin(10001));
    connections[0]!.socket.destroy();
    assert.equal(a2.assigned.length, 1);
    assert.equal(connections[1]!.options.marker, "second");
    assert.equal(b.assigned.length, 0);
    connections[1]!.socket.destroy();
    assert.equal(a3.assigned.length, 1);
    connections[2]!.socket.destroy();
    assert.equal(b.assigned.length, 1);
    counts(agent);
    agent.destroy();
});

test("HTTP Agent source: destroyed queued requests never connect or recursively release", () => {
    const { agent, connections } = pool({ maxTotalSockets: 1, maxSockets: 1 });
    const a = request();
    agent.addRequest(a, origin(10001));
    for (let i = 0; i < 2048; i++) {
        const cancelled = request(() =>
            assert.fail("cancelled request received a socket"),
        );
        agent.addRequest(cancelled, origin(10001));
        cancelled.destroyed = true;
    }
    const b = request();
    agent.addRequest(b, origin(10002));
    connections[0]!.socket.destroy();
    assert.equal(b.assigned.length, 1);
    assert.equal(connections.length, 2);
    assert.equal(Object.keys(agent.requests).length, 0);
    counts(agent);
    agent.destroy();
});

for (const scheduling of ["fifo", "lifo"]) {
    test(`HTTP Agent source: ${scheduling} reuse, idle timeout and idempotent removal`, () => {
        const { agent, connections } = pool({
            keepAlive: true,
            maxSockets: 2,
            maxTotalSockets: 2,
            scheduling,
            timeout: 123,
        });
        const a = request(),
            b = request();
        agent.addRequest(a, origin(10001));
        agent.addRequest(b, origin(10001));
        const first = connections[0]!.socket,
            second = connections[1]!.socket;
        agent._release(first);
        agent._release(second);
        counts(agent);
        assert.equal(first.referenced, false);
        assert.equal(first.timeout, 123);
        const c = request();
        agent.addRequest(c, origin(10001));
        assert.equal(c.assigned[0], scheduling === "fifo" ? first : second);
        assert.equal(c.reusedSocket, true);
        assert.equal(c.assigned[0].referenced, true);
        counts(agent);
        const idle = scheduling === "fifo" ? second : first;
        idle.emit("timeout");
        assert.equal(idle.destroyed, true);
        agent.removeSocket(idle);
        counts(agent);
        agent.destroy();
        counts(agent);
        assert.equal(agent.totalSocketCount, 0);
    });
}

test("HTTP Agent source: cancellation drops options, payloads and callback contexts before capacity is offered", () => {
    const { agent, connections } = pool({ maxSockets: 1, maxTotalSockets: 1 });
    agent.addRequest(request(), origin(10001));
    const req = client(agent);
    const events: string[] = [];
    req.on("error", (error: Error) => events.push(error.message));
    req.on("close", () => events.push("close"));
    for (const event of ["response", "finish", "socket"])
        req.on(event, () => assert.fail("abandoned callback"));
    const context = { payload: Buffer.alloc(64), callback: () => {} };
    req._output = [context.payload, context];
    req._outputSize = 64;
    req._chunks = [context.payload, null, context.callback];
    req._chunkLength = 64;
    let detached = false;
    req._abortSignal = {
        removeEventListener() {
            detached = true;
        },
    };
    req._abortListener = context.callback;
    agent.addRequest(req, { ...origin(10002), context });
    req.destroy(new Error("cancel"));
    req.destroy(new Error("again"));
    assert.equal(Object.keys(agent.requests).length, 0);
    assert.equal(req._queuedAgentOptions, undefined);
    assert.equal(req._queuedAgentName, undefined);
    assert.equal(req._output, null);
    assert.equal(req._outputSize, 0);
    assert.equal(req._chunks, null);
    assert.equal(req._chunkLength, 0);
    assert.equal(req._connectListener, null);
    assert.equal(req._abortListener, null);
    assert.equal(detached, true);
    assert.equal(req.listenerCount("response"), 0);
    flush();
    assert.deepEqual(
        events,
        [],
        "Node defers queued terminal events until a capacity opportunity",
    );
    connections[0]!.socket.destroy();
    flush();
    assert.deepEqual(events, ["cancel", "close"]);
    assert.equal(req._destroyError, null);
    assert.equal(
        connections.length,
        1,
        "cancellation must not open a new connection",
    );
    assert.equal(Object.keys(agent._cancelledRequests).length, 0);
    counts(agent);
});

test("HTTP Agent source: cancellation waits behind earlier same-origin work and a saturated origin", () => {
    const { agent, connections } = pool({ maxSockets: 1, maxTotalSockets: 2 });
    agent.addRequest(request(), origin(10001));
    agent.addRequest(request(), origin(10002));
    const live = request(),
        cancelled = client(agent);
    const events: string[] = [];
    cancelled.on("error", () => events.push("error"));
    cancelled.on("close", () => events.push("close"));
    agent.addRequest(live, origin(10002));
    agent.addRequest(cancelled, origin(10002));
    cancelled.destroy();
    connections[0]!.socket.destroy();
    flush();
    assert.deepEqual(events, []);
    connections[1]!.socket.destroy();
    flush();
    assert.equal(live.assigned.length, 1);
    assert.deepEqual(events, []);
    connections[2]!.socket.destroy();
    flush();
    assert.deepEqual(events, ["error", "close"]);
    assert.equal(connections.length, 3);
    counts(agent);
});

test("HTTP Agent source: cancellation between offer and use returns the socket once", () => {
    const { agent, connections } = pool({ maxSockets: 1, maxTotalSockets: 1 });
    const cancelled = client(agent),
        live = request();
    const events: string[] = [];
    cancelled.on("error", (error: Error) => events.push(error.message));
    cancelled.on("close", () => events.push("close"));
    agent.addRequest(cancelled, origin(10001));
    agent.addRequest(live, origin(10001));
    cancelled.destroy(new Error("cancel"));
    flush();
    assert.deepEqual(events, ["cancel", "close"]);
    assert.equal(cancelled._offeredSocket, null);
    assert.equal(live.assigned[0], connections[0]!.socket);
    assert.equal(connections.length, 1);
    counts(agent);
    agent.destroy();
});

for (const action of ["socket-destroy", "socket-error", "agent-destroy"]) {
    for (const reentrant of [false, true]) {
        test(`HTTP Agent source: ${action} completes assigned writes once (reentrant=${reentrant})`, () => {
            const { agent } = pool({ maxSockets: 1, maxTotalSockets: 1 });
            const req = client(agent);
            const events: string[] = [];
            const failure = Object.assign(new TypeError("cancel"), {
                code: "EWRITE",
            });
            req.on("error", (error: any) => {
                events.push("error:" + error.code);
                if (action === "socket-error") assert.equal(error, failure);
                if (reentrant) req.destroy();
            });
            req.on("close", () => events.push("close"));
            req.on("socket", (socket: Socket) => {
                req._chunks = [];
                for (const body of ["one", "two"])
                    req._chunks.push(body, null, (error: any) => {
                        events.push(body + ":" + error.code);
                        if (action === "socket-error")
                            assert.equal(error, failure);
                        if (reentrant) req.destroy();
                    });
                req._chunkLength = 6;
                if (action === "agent-destroy") agent.destroy();
                else
                    socket.destroy(
                        action === "socket-error" ? failure : undefined,
                    );
            });
            agent.addRequest(req, origin(10001));
            flush();
            assert.deepEqual(
                events,
                action === "socket-error"
                    ? ["error:EWRITE", "one:EWRITE", "two:EWRITE", "close"]
                    : [
                          "one:ERR_STREAM_DESTROYED",
                          "two:ERR_STREAM_DESTROYED",
                          "error:ECONNRESET",
                          "close",
                      ],
            );
            req.destroy();
            agent.destroy();
            flush();
            assert.equal(events.length, 4);
            assert.equal(req._chunks, null);
            assert.equal(req._destroyChunks, null);
            assert.equal(req._chunkLength, 0);
            assert.equal(req._destroyError, null);
            counts(agent);
        });
    }
}

test("HTTP Agent source: reverse cancellation retains request FIFO around live work", () => {
    const { agent, connections } = pool({ maxSockets: 1, maxTotalSockets: 1 });
    agent.addRequest(request(), origin(10001));
    const first = client(agent),
        last = client(agent),
        live = request();
    const events: string[] = [];
    for (const [req, name] of [
        [first, "first"],
        [last, "last"],
    ] as const) {
        req.on("error", () => {});
        req.on("close", () => events.push(name));
    }
    agent.addRequest(first, origin(10001));
    agent.addRequest(live, origin(10001));
    agent.addRequest(last, origin(10001));
    last.destroy();
    first.destroy();
    connections[0]!.socket.destroy();
    flush();
    assert.deepEqual(events, ["first"]);
    assert.equal(live.assigned.length, 1);
    connections[1]!.socket.destroy();
    flush();
    assert.deepEqual(events, ["first", "last"]);
    counts(agent);
});

test("HTTP Agent source: reentrant releases drain iteratively", () => {
    const { agent, connections } = pool({ maxSockets: 1, maxTotalSockets: 1 });
    agent.addRequest(request(), origin(10001));
    let completed = 0;
    for (let i = 0; i < 2048; i++)
        agent.addRequest(
            request((socket) => {
                completed++;
                agent._release(socket);
            }),
            origin(10001),
        );
    const live = request();
    agent.addRequest(live, origin(10001));
    agent._release(connections[0]!.socket);
    assert.equal(completed, 2048);
    assert.equal(live.assigned.length, 1);
    assert.equal(connections.length, 1);
    assert.equal(Object.keys(agent.requests).length, 0);
    counts(agent);
    agent.destroy();
});

test("HTTP Agent source: destroyed free entries and reentrant free listeners cannot leak counts", () => {
    const { agent, connections } = pool({
        keepAlive: true,
        maxSockets: 1,
        maxTotalSockets: 1,
    });
    agent.addRequest(request(), origin(10001));
    const stale = connections[0]!.socket;
    agent._release(stale);
    // net.Socket.destroy marks the socket before its deferred close event.
    stale.destroyed = true;
    stale.writable = false;
    const b = request();
    agent.addRequest(b, origin(10001));
    assert.equal(b.assigned.length, 1);
    stale.emit("close");
    counts(agent);
    const c = request();
    agent.addRequest(c, origin(10002));
    agent.once("free", (socket: Socket) => socket.destroy());
    agent._release(b.assigned[0]);
    assert.equal(c.assigned.length, 1);
    counts(agent);
    agent.destroy();
    counts(agent);
});

test("HTTP Agent source: idle keep-alive sockets still consume global capacity", () => {
    const { agent, connections } = pool({
        keepAlive: true,
        maxTotalSockets: 1,
    });
    agent.addRequest(request(), origin(10001));
    agent._release(connections[0]!.socket);
    const b = request();
    agent.addRequest(b, origin(10002));
    assert.equal(b.assigned.length, 0);
    counts(agent);
    connections[0]!.socket.destroy();
    assert.equal(b.assigned.length, 1);
    counts(agent);
    agent.destroy();
});

test("HTTP Agent source: an idle offer settles eligible cross-origin cancellation without a connection", () => {
    const { agent, connections } = pool({
        keepAlive: true,
        maxSockets: 1,
        maxTotalSockets: 1,
    });
    agent.addRequest(request(), origin(10001));
    const cancelled = client(agent);
    const events: string[] = [];
    cancelled.on("error", () => events.push("error"));
    cancelled.on("close", () => events.push("close"));
    agent.addRequest(cancelled, origin(10002));
    cancelled.destroy();
    flush();
    assert.deepEqual(events, []);
    agent._release(connections[0]!.socket);
    flush();
    assert.deepEqual(events, ["error", "close"]);
    assert.equal(connections.length, 1);
    assert.equal(agent.totalSocketCount, 1);
    counts(agent);
    agent.destroy();
});
