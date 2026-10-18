// mandelbrot from the Computer Language Benchmarks Game, written for this
// repository after the problem description (N×N bitmap of the set, 50
// iterations, limit 2, written as a portable bitmap). N from the environment
// (default 1000; the game runs N = 16 000).
"use strict";
const n = Number(process.env.N) || 1000;
const bytesPerRow = (n + 7) >> 3;
const bitmap = Buffer.alloc(bytesPerRow * n);
for (let y = 0; y < n; y++) {
    const ci = (2 * y) / n - 1;
    for (let xb = 0; xb < bytesPerRow; xb++) {
        let bits = 0;
        for (let bit = 0; bit < 8; bit++) {
            const x = xb * 8 + bit;
            bits <<= 1;
            if (x >= n) continue;
            const cr = (2 * x) / n - 1.5;
            let zr = 0,
                zi = 0,
                inside = 1;
            for (let i = 0; i < 50; i++) {
                const t = zr * zr - zi * zi + cr;
                zi = 2 * zr * zi + ci;
                zr = t;
                if (zr * zr + zi * zi > 4) {
                    inside = 0;
                    break;
                }
            }
            bits |= inside;
        }
        bitmap[y * bytesPerRow + xb] = bits;
    }
}
process.stdout.write(`P4\n${n} ${n}\n`);
process.stdout.write(bitmap);
