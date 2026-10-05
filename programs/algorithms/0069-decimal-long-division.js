const denominator = 28; let remainder = 1;
const positions = new Map(), digits = [];
while (remainder && !positions.has(remainder)) {
  positions.set(remainder, digits.length);
  remainder *= 10; digits.push(Math.floor(remainder / denominator)); remainder %= denominator;
}
const split = remainder ? positions.get(remainder) : digits.length;
console.log('0.' + digits.slice(0, split).join('') + (remainder ? '(' + digits.slice(split).join('') + ')' : ''));
