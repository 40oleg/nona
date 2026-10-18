import { runtimeIteratorHelpers } from "../lib/sources.generated.js";
// ES2025 iterator helpers (#322): the global Iterator constructor,
// Iterator.from with %WrapForValidIteratorPrototype%, the lazy helpers
// (map, filter, take, drop, flatMap) on %IteratorHelperPrototype% as a
// hand-written state machine, the eager methods (reduce, toArray, forEach,
// some, every, find) and the constructor/@@toStringTag accessors of
// %Iterator.prototype%. Intrinsics are captured while the prelude runs.
export const iteratorHelpersPreludeSource = runtimeIteratorHelpers;
