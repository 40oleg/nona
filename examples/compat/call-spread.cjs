function join(a, b, c) { return [a, b, c].join(':'); }
function Pair(a, b) { this.sum = a + b; }
const values = [2, 3];
console.log(join(1, ...values), new Pair(...values).sum);
