import { runtimeSetMethods } from "../lib/sources.generated.js";
// The ES2025 Set methods: union, intersection, difference,
// symmetricDifference, isSubsetOf, isSupersetOf and isDisjointFrom, which
// take set-like arguments (size, has, keys). Intrinsics are captured while
// the prelude runs so later user mutation cannot change the algorithms.
export const setMethodsPreludeSource = runtimeSetMethods;
