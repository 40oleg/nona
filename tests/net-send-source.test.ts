import { test } from "node:test";
import assert from "node:assert/strict";
import { socketBoundary } from "./helpers/net-source.js";

test("queued _sendNow retains an HTTP completion owner until its bytes flush", () => {
    const b = socketBoundary([-11, -11, 2, 3]);
    const events: string[] = [];
    const owner = {
        payload: "response",
        _sent(error: unknown) {
            assert.equal(this, owner);
            assert.equal(error, null);
            events.push(this.payload);
        },
    };
    b.socket.write(new Uint8Array([1, 2]), () => events.push("first"));
    b.socket._sendNow(new Uint8Array([3, 4, 5, 99]), 3, owner);
    assert.equal(b.socket.writableLength, 5);
    assert.deepEqual(events, []);
    b.socket._flushWrites();
    assert.equal(b.socket.writableLength, 0);
    assert.deepEqual(b.wire, [1, 2, 3, 4, 5]);
    assert.deepEqual(events, []);
    b.drainTasks();
    assert.deepEqual(events, ["first", "response"]);
    b.socket._flushWrites();
    b.drainTasks();
    assert.deepEqual(events, ["first", "response"]);
});

for (const kind of ["function", "message"] as const) {
    for (const first of [4, 2, -11, -4]) {
        test(`_sendNow ${kind} completion survives send=${first} with its identity and byte boundary`, () => {
            const remaining = first > 0 ? 4 - first : 4;
            const b = socketBoundary([
                first,
                ...(remaining ? [remaining] : []),
            ]);
            const calls: unknown[] = [];
            const owner = {
                _sent(error: unknown) {
                    assert.equal(this, owner);
                    calls.push(error);
                },
            };
            const callback =
                kind === "message"
                    ? owner
                    : function (this: unknown, error: unknown) {
                          assert.equal(this, undefined);
                          calls.push(error);
                      };
            const bytes = new Uint8Array([11, 22, 33, 44, 255]);
            assert.equal(b.socket._sendNow(bytes, 4, callback), true);
            assert.equal(b.socket.bytesWritten, first > 0 ? first : 0);
            assert.equal(b.socket.writableLength, remaining);
            assert.deepEqual(calls, first === 4 ? [null] : []);
            if (remaining) {
                assert.equal(b.socket._writeQueue[0].callback, callback);
                b.drainTasks();
                assert.deepEqual(calls, []);
                // HTTP reuses its send arena after _sendNow; unsent bytes must be owned.
                bytes.fill(99);
                b.socket._flushWrites();
                assert.deepEqual(calls, []);
            }
            b.drainTasks();
            b.socket._flushWrites();
            b.drainTasks();
            assert.deepEqual(calls, [null]);
            assert.deepEqual(b.wire, [11, 22, 33, 44]);
            assert.equal(b.socket.bytesWritten, 4);
            assert.equal(b.socket.writableLength, 0);
            assert.equal(b.results.length, 0);
        });
    }

    test(`queued ${kind} completion stays FIFO across partial writes and repeated EAGAIN/EINTR flushes`, () => {
        const b = socketBoundary([-11, -4, 1, -11, -4, 1, 1, 2]);
        const calls: string[] = [];
        const owner = {
            _sent(error: unknown) {
                assert.equal(this, owner);
                assert.equal(error, null);
                calls.push("second");
            },
        };
        const callback =
            kind === "message"
                ? owner
                : (error: unknown) => {
                      assert.equal(error, null);
                      calls.push("second");
                  };
        b.socket.write(new Uint8Array([1, 2]), () => calls.push("first"));
        const bytes = new Uint8Array([3, 4, 5, 99]);
        b.socket._sendNow(bytes, 3, callback);
        assert.equal(b.socket._writeQueue[1].callback, callback);
        bytes.fill(77);
        b.drainTasks();
        assert.deepEqual(calls, []);
        const steps: [number, string[]][] = [
            [4, []],
            [4, []],
            [4, []],
            [2, ["first"]],
            [0, ["first", "second"]],
        ];
        for (const [remaining, completed] of steps) {
            const before = calls.slice();
            b.socket._flushWrites();
            assert.equal(b.socket.writableLength, remaining);
            assert.deepEqual(
                calls,
                before,
                "queued completions must stay deferred",
            );
            b.drainTasks();
            assert.deepEqual(
                calls,
                completed,
                "no completion before the item's last byte",
            );
        }
        assert.deepEqual(b.wire, [1, 2, 3, 4, 5]);
        assert.deepEqual(
            b.sends.map((s) => [s.length, s.result]),
            [
                [2, -11],
                [2, -4],
                [2, 1],
                [1, -11],
                [1, -4],
                [1, 1],
                [3, 1],
                [2, 2],
            ],
        );
        b.drainTasks();
        b.socket._flushWrites();
        b.drainTasks();
        assert.deepEqual(calls, ["first", "second"]);
        assert.equal(b.socket.bytesWritten, 5);
    });

    for (const pending of ["connecting", "descriptor"] as const) {
        test(`_sendNow retains ${kind} completion while waiting for ${pending}`, () => {
            const b = socketBoundary([2]);
            const calls: unknown[] = [];
            const owner = {
                _sent(error: unknown) {
                    assert.equal(this, owner);
                    calls.push(error);
                },
            };
            const callback =
                kind === "message"
                    ? owner
                    : function (this: unknown, error: unknown) {
                          assert.equal(this, undefined);
                          calls.push(error);
                      };
            if (pending === "connecting") b.socket.connecting = true;
            else b.socket._fd = -1;
            b.socket._sendNow(new Uint8Array([8, 9, 99]), 2, callback);
            assert.equal(b.socket._writeQueue[0].callback, callback);
            assert.equal(b.socket.writableLength, 2);
            assert.deepEqual(b.wire, []);
            b.drainTasks();
            assert.deepEqual(calls, []);
            b.socket.connecting = false;
            b.socket._fd = 7;
            b.socket._flushWrites();
            assert.deepEqual(calls, []);
            b.drainTasks();
            b.socket._flushWrites();
            b.drainTasks();
            assert.deepEqual(calls, [null]);
            assert.deepEqual(b.wire, [8, 9]);
            assert.equal(b.socket.writableLength, 0);
        });
    }
}

test("public write keeps its function overloads and does not accept a message as its second argument", () => {
    const b = socketBoundary([1, 1, 1]);
    const calls: string[] = [];
    b.socket.write("a", () => calls.push("second argument"));
    b.socket.write("b", "utf8", () => calls.push("third argument"));
    b.socket.write(new Uint8Array([99]), {
        _sent() {
            calls.push("message");
        },
    });
    assert.deepEqual(calls, []);
    b.drainTasks();
    assert.deepEqual(calls, ["second argument", "third argument"]);
    assert.deepEqual(b.wire, [97, 98, 99]);
    assert.throws(() => b.socket.write(null), { code: "ERR_INVALID_ARG_TYPE" });
});

test("queued completion preserves write backpressure, drain order and queue accounting", () => {
    const b = socketBoundary([-11, -11, 1, 16384]);
    const events: string[] = [];
    b.socket.on("drain", () => events.push("drain"));
    b.socket.write(new Uint8Array([1]), () => events.push("first"));
    const owner = {
        _sent() {
            events.push("message");
        },
    };
    assert.equal(b.socket._sendNow(new Uint8Array(16385), 16384, owner), false);
    assert.equal(b.socket.writableNeedDrain, true);
    assert.equal(b.socket.writableLength, 16385);
    assert.equal(b.socket._writeQueue[1].callback, owner);
    b.socket._flushWrites();
    assert.equal(b.socket.writableLength, 0);
    assert.equal(b.socket.writableNeedDrain, false);
    assert.deepEqual(events, []);
    b.drainTasks();
    b.socket._flushWrites();
    b.drainTasks();
    assert.deepEqual(events, ["first", "message", "drain"]);
});

for (const destroy of [false, true]) {
    test(`queued function and message completions receive one error on ${destroy ? "destroy" : "send failure"}`, () => {
        const b = socketBoundary([-11, -11, ...(destroy ? [] : [-32])]);
        const events: string[] = [];
        const errors: any[] = [];
        const record = (name: string, error: any) => {
            events.push(name);
            errors.push(error);
        };
        b.socket.on("error", (error: unknown) => record("error", error));
        b.socket.on("close", (hadError: boolean) =>
            events.push("close:" + hadError),
        );
        b.socket.write(new Uint8Array([1]), (error: unknown) =>
            record("function", error),
        );
        const owner = {
            _sent(error: unknown) {
                assert.equal(this, owner);
                record("message", error);
            },
        };
        b.socket._sendNow(new Uint8Array([2]), 1, owner);
        if (destroy) b.socket.destroy();
        else b.socket._flushWrites();
        assert.deepEqual(events, []);
        b.drainTasks();
        b.socket.destroy();
        b.socket._flushWrites();
        b.drainTasks();
        assert.deepEqual(
            events,
            destroy
                ? ["function", "message", "close:false"]
                : ["function", "message", "error", "close:true"],
        );
        assert.equal(
            errors[0].code,
            destroy ? "ERR_STREAM_DESTROYED" : "EPIPE",
        );
        assert.equal(errors[0].name, "Error");
        assert.equal(errors[1].code, errors[0].code);
        if (!destroy) {
            assert.equal(errors[1], errors[0]);
            assert.equal(errors[2], errors[0]);
            assert.equal(errors[0].syscall, "write");
        }
        assert.equal(b.socket.writableLength, 0);
        assert.deepEqual(b.closed, [7]);
    });
}

test("terminal _sendNow preserves function error codes and event order", () => {
    for (const ended of [false, true]) {
        const b = socketBoundary();
        const events: string[] = [];
        b.socket.on("error", (error: any) =>
            events.push("error:" + error.code),
        );
        if (ended) {
            b.socket._writeEnded = true;
            b.socket.connecting = true;
        } else b.socket.destroy();
        b.drainTasks();
        const code = ended
            ? "ERR_STREAM_WRITE_AFTER_END"
            : "ERR_STREAM_DESTROYED";
        assert.equal(
            b.socket._sendNow(new Uint8Array([1]), 1, (error: any) =>
                events.push("callback:" + error.code),
            ),
            false,
        );
        assert.deepEqual(events, []);
        b.drainTasks();
        assert.deepEqual(
            events,
            ended
                ? ["callback:" + code, "error:" + code]
                : ["callback:" + code],
        );
    }
});

test("T06/B04 reproduction: an already terminal _sendNow still drops message completions", () => {
    // Retain this pre-existing limitation without expanding #601 into terminal-state hardening.
    for (const ended of [false, true]) {
        const b = socketBoundary();
        const errors: string[] = [];
        let calls = 0;
        b.socket.on("error", (error: any) => errors.push(error.code));
        if (ended) {
            b.socket._writeEnded = true;
            b.socket.connecting = true;
        } else b.socket.destroy();
        b.drainTasks();
        b.socket._sendNow(new Uint8Array([1]), 1, {
            _sent() {
                calls++;
            },
        });
        b.drainTasks();
        assert.equal(calls, 0);
        assert.deepEqual(errors, ended ? ["ERR_STREAM_WRITE_AFTER_END"] : []);
    }
});

test("T06/B04 reproduction: an immediate send error still omits the supplied completion", () => {
    for (const kind of ["function", "message"]) {
        const b = socketBoundary([-32]);
        const events: string[] = [];
        let calls = 0;
        b.socket.on("error", (error: any) =>
            events.push(error.name + ":" + error.code + ":" + error.syscall),
        );
        b.socket.on("close", (hadError: boolean) =>
            events.push("close:" + hadError),
        );
        const callback =
            kind === "message"
                ? {
                      _sent() {
                          calls++;
                      },
                  }
                : () => {
                      calls++;
                  };
        assert.equal(
            b.socket._sendNow(new Uint8Array([1]), 1, callback),
            false,
        );
        b.drainTasks();
        assert.deepEqual(events, ["Error:EPIPE:write", "close:true"]);
        assert.equal(calls, 0);
        assert.equal(b.socket.writableLength, 0);
        assert.deepEqual(b.wire, []);
        assert.deepEqual(b.closed, [7]);
    }
});
