import { ObjectLayout as O } from "./object-layout.js";

/** A promise (#44): an ordinary object whose internal slots follow the header.
 * The Promise prelude reads and writes them through
 * Function.prototype.__nonaPromiseGetInternal / __nonaPromiseSetInternal.
 *
 * The same object is also a reaction record: the promise that `then` returns
 * carries the reaction that settles it (onFulfilled ... source), so one
 * `then` is one allocation. Reactions without a derived promise (await,
 * foreign capabilities, jobs) are hidden promise objects that nothing else
 * sees. */
export const PromiseKind = 22;
/** state: PromiseState bits (a raw integer).
 * value: the fulfilment value or rejection reason (a Value).
 * first, last: the list of pending reactions, linked through their `next`.
 * next: the link of this reaction in a pending list, the job queue or one of
 * the report lists (async.ts).
 * onFulfilled, onRejected: the handlers; after the native job runner called
 * one with an object result (PromiseState.result), onFulfilled holds it.
 * context: the async context record captured by `then` (async_hooks).
 * capability: undefined for a reaction the runner may run natively; else a
 * target promise, a foreign capability record or the realm's job function.
 * source: the promise whose settlement the reaction delivers. */
export const PromiseLayout = {
    state: O.size,
    value: O.size + 8,
    first: O.size + 24,
    last: O.size + 40,
    next: O.size + 56,
    onFulfilled: O.size + 72,
    onRejected: O.size + 88,
    context: O.size + 104,
    capability: O.size + 120,
    source: O.size + 136,
    size: O.size + 152,
} as const;
/** The Value slots after state, in order: the slot numbers 1...9 of the intrinsics. */
export const promiseValueSlots = 9;
/** Bits 0..1 of PromiseLayout.state: 0 pending, 1 fulfilled, 2 rejected.
 * handled: a reaction was added (or the host marked it handled).
 * reported: its rejection was reported as unhandled.
 * target: the object is the derived promise of its own reaction.
 * result: the runner called the handler; the result waits in onFulfilled. */
export const PromiseState = {
    kindMask: 3,
    handled: 4,
    reported: 8,
    target: 16,
    result: 32,
} as const;
/** The agent-wide lists (rt.promiseLists, shared by every realm): head and
 * tail Values of the job queue, of the rejected promises not yet handled and
 * of the reported ones handled since; linked through PromiseLayout.next. */
export const PromiseLists = {
    queue: 0,
    unhandled: 32,
    handledLater: 64,
    size: 96,
} as const;
