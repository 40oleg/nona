import { ObjectLayout as O } from "./object-layout.js";

/** A promise (#44): an ordinary object whose internal slots follow the header.
 * The Promise prelude reads and writes them through
 * Function.prototype.__nonaPromiseGetInternal / __nonaPromiseSetInternal. */
export const PromiseKind = 22;
/** state: PromiseState bits (a raw integer).
 * value: the fulfilment value or rejection reason (a Value).
 * first, last: the list of pending reactions, linked through their `next`. */
export const PromiseLayout = {
    state: O.size,
    value: O.size + 8,
    first: O.size + 24,
    last: O.size + 40,
    size: O.size + 56,
} as const;
/** Bits 0..1 of PromiseLayout.state: 0 pending, 1 fulfilled, 2 rejected.
 * handled: a reaction was added (or the host marked it handled).
 * reported: its rejection was reported as unhandled. */
export const PromiseState = {
    kindMask: 3,
    handled: 4,
    reported: 8,
} as const;
/** The slot numbers of the intrinsics, in the order of PromiseLayout. */
export const promiseSlots = [
    PromiseLayout.state,
    PromiseLayout.value,
    PromiseLayout.first,
    PromiseLayout.last,
] as const;
