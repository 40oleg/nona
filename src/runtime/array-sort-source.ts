import {runtimeArraySort} from '../lib/sources.generated.js';
// Array.prototype.sort (ES2020 22.1.3.27) as a stable merge sort in the
// runtime prelude. It replaces the earlier native insertion sort, whose
// quadratic generic property traffic made 2048-element sorts time out.
// Scratch storage is kept in prototype-less objects written by plain
// assignment, which the indexed fast path serves in constant time.
// Intrinsics are captured while the prelude runs.
export const arraySortPreludeSource=runtimeArraySort;
