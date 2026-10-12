import { modulesNetworkStream } from "../lib/sources.generated.js";
/**
 * Source of `nona:internal/stream`: the readable side shared by net.Socket
 * and http.IncomingMessage. It follows the observable behaviour of Node.js
 * Readable streams in flowing mode (`data`/`end`/`close`, pause/resume,
 * setEncoding, pipe, async iteration) without the full node:stream API.
 *
 * Every HTTP request is one of these, so the state lives in a few fields of
 * the object itself (no state record, no queue until a chunk has to wait),
 * and deferred work is only scheduled when there is something to deliver.
 * Deferred events use queueMicrotask where Node.js uses process.nextTick.
 */
export const networkStreamModuleSource = modulesNetworkStream;
