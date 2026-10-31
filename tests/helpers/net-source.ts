import assert from "node:assert/strict";
import { AsyncResource } from "node:async_hooks";
import { Buffer } from "node:buffer";
import { StringDecoder } from "node:string_decoder";
import { eventsModuleSource } from "../../src/runtime/events-module-source.js";
import {
    modulesNetCommon,
    modulesNetworkStream,
} from "../../src/lib/sources.generated.js";

function body(source: string) {
    return source
        .replace(/^import .*$/gm, "")
        .replace(/export default /g, "const defaultExport = ")
        .replace(/\bexport /g, "");
}

/** The shared socket module with only its OS layer replaced (also for AOT fixtures). */
export function socketModuleWithSys(sysSource: string) {
    return sysSource + "\n" + modulesNetCommon;
}

/** Compose the real Events, network Readable and Socket implementations, as stream-source does.
 * Only syscalls, native byte operations and the job scheduler cross into Node here.
 */
export function socketBoundary(results: number[] = []) {
    const tasks: (() => void)[] = [];
    const queueMicrotask = (task: () => void) => tasks.push(task);
    const EventEmitter = new Function(
        "AsyncResource",
        "EventTarget",
        body(eventsModuleSource) + ";return EventEmitter;",
    )(AsyncResource, EventTarget);
    const stream = new Function(
        "EventEmitter",
        "StringDecoder",
        "Buffer",
        "queueMicrotask",
        body(modulesNetworkStream) + ";return {Readable, defaults, clock};",
    )(EventEmitter, StringDecoder, Buffer, queueMicrotask);
    const sends: { bytes: number[]; length: number; result: number }[] = [];
    const wire: number[] = [];
    const closed: number[] = [];
    const sys = {
        send(_fd: number, bytes: Uint8Array, length: number) {
            assert.ok(results.length, "unexpected send: script exhausted");
            const result = results.shift()!;
            assert.ok(
                result <= length,
                "scripted send exceeds requested length",
            );
            sends.push({ bytes: Array.from(bytes), length, result });
            if (result > 0) wire.push(...bytes.subarray(0, result));
            return result;
        },
        errno: (errno: number) => -errno,
        close: (fd: number) => closed.push(fd),
        watch() {},
    };
    const copyBytes = (
        src: Uint8Array,
        start: number,
        end: number,
        dst: Uint8Array,
        offset: number,
    ) => dst.set(src.subarray(start, end), offset);
    const sliceBytes = (src: Uint8Array, start: number, end: number) =>
        src.slice(start, end);
    const { Socket } = new Function(
        "EventEmitter",
        "Buffer",
        "Readable",
        "defaults",
        "clock",
        "copyBytes",
        "sliceBytes",
        "sys",
        "queueMicrotask",
        body(modulesNetCommon) + ";return {Socket};",
    )(
        EventEmitter,
        Buffer,
        stream.Readable,
        stream.defaults,
        stream.clock,
        copyBytes,
        sliceBytes,
        sys,
        queueMicrotask,
    );
    const socket = new Socket();
    socket._fd = 7;
    return {
        socket,
        sends,
        wire,
        closed,
        results,
        drainTasks() {
            for (let count = 0; tasks.length; count++) {
                assert.ok(count < 100, "job queue did not settle");
                tasks.shift()!();
            }
        },
    };
}
