// fannkuch-redux from the Computer Language Benchmarks Game, written for this
// repository after the problem description (permutations of 1..N in the
// counting order of the game, flips, checksum). N from the environment
// (default 9; the game runs N = 12).
"use strict";
const n = Number(process.env.N) || 9;
function fannkuch(n) {
    const perm = new Array(n),
        perm1 = new Array(n),
        count = new Array(n);
    for (let i = 0; i < n; i++) perm1[i] = i;
    let maxFlips = 0,
        checksum = 0,
        permCount = 0,
        r = n;
    for (;;) {
        while (r !== 1) {
            count[r - 1] = r;
            r--;
        }
        for (let i = 0; i < n; i++) perm[i] = perm1[i];
        let flips = 0,
            k;
        while ((k = perm[0]) !== 0) {
            const k2 = (k + 1) >> 1;
            for (let i = 0; i < k2; i++) {
                const t = perm[i];
                perm[i] = perm[k - i];
                perm[k - i] = t;
            }
            flips++;
        }
        if (flips > maxFlips) maxFlips = flips;
        checksum += permCount % 2 === 0 ? flips : -flips;
        for (;;) {
            if (r === n) return [checksum, maxFlips];
            const perm0 = perm1[0];
            for (let i = 0; i < r; i++) perm1[i] = perm1[i + 1];
            perm1[r] = perm0;
            count[r]--;
            if (count[r] > 0) break;
            r++;
        }
        permCount++;
    }
}
const [checksum, flips] = fannkuch(n);
console.log(`${checksum}\nPfannkuchen(${n}) = ${flips}`);
