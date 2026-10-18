// binary-trees from the Computer Language Benchmarks Game, written for this
// repository after the problem description (allocate and check binary trees,
// the standard algorithm; single-threaded). N from the environment
// (default 14; the game runs N = 21).
"use strict";
const n = Math.max(6, Number(process.env.N) || 14);
function bottomUp(depth) {
    return depth > 0
        ? { left: bottomUp(depth - 1), right: bottomUp(depth - 1) }
        : { left: null, right: null };
}
function check(tree) {
    return tree.left === null ? 1 : 1 + check(tree.left) + check(tree.right);
}
const minDepth = 4,
    maxDepth = Math.max(minDepth + 2, n),
    stretchDepth = maxDepth + 1;
console.log(
    `stretch tree of depth ${stretchDepth}\t check: ${check(bottomUp(stretchDepth))}`,
);
const longLived = bottomUp(maxDepth);
for (let depth = minDepth; depth <= maxDepth; depth += 2) {
    const iterations = 1 << (maxDepth - depth + minDepth);
    let sum = 0;
    for (let i = 0; i < iterations; i++) sum += check(bottomUp(depth));
    console.log(`${iterations}\t trees of depth ${depth}\t check: ${sum}`);
}
console.log(
    `long lived tree of depth ${maxDepth}\t check: ${check(longLived)}`,
);
