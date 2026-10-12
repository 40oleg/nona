import { ObjectLayout as O } from "./object-layout.js";

/** Date objects: an ordinary object followed by the time value. */
export const DateKind = 7;
export const DateLayout = { time: O.size, size: O.size + 8 } as const;
