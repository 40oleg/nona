// Nested loops mark composite numbers, then collect and sum the primes.
const limit = 50;
const composite = [];
for (let p = 2; p * p <= limit; p++) {
  if (composite[p]) continue;
  for (let multiple = p * p; multiple <= limit; multiple += p) {
    composite[multiple] = true;
  }
}

const primes = [];
let sum = 0;
for (let n = 2; n <= limit; n++) {
  if (!composite[n]) {
    primes.push(n);
    sum += n;
  }
}
console.log(primes.join(','));
console.log(primes.length, sum);
