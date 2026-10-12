import { runtimeEs2021 } from "../lib/sources.generated.js";
// Small built-ins added after ES2020 (ES2021-ES2023): AggregateError,
// Object.hasOwn, the relative indexing method at() and findLast/findLastIndex
// on Array, String and %TypedArray% prototypes. Promise.any lives in the
// Promise prelude, which runs after this one. Intrinsics are captured while
// the prelude runs so later user mutation cannot change the algorithms.
export const es2021PreludeSource = runtimeEs2021;
