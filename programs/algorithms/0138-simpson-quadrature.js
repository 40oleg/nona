const f = x => x * x * x + 2 * x;
const low = 0, high = 2, subdivisions = 8, step = (high - low) / subdivisions;
let weighted = f(low) + f(high);
for (let i = 1; i < subdivisions; i++) weighted += (i % 2 ? 4 : 2) * f(low + i * step);
const integral = weighted * step / 3;
if (Math.abs(integral - 8) > 1e-12) throw new Error('cubic exactness');
console.log(integral);
