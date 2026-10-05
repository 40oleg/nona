const f = x => x * x * x - x - 2;
let left = 1, right = 2;
if (f(left) * f(right) >= 0) throw new Error('missing bracket');
for (let step = 0; step < 25; step++) {
  const middle = (left + right) / 2;
  if (f(left) * f(middle) <= 0) right = middle; else left = middle;
}
if (!(f(left) <= 0 && f(right) >= 0)) throw new Error('lost bracket');
console.log(Math.round((left + right) * 500000));
