const symbol = Symbol('key');
const source = {a: 1, b: 2};
source[symbol] = 3;
const result = {...source, b: 5, c: 6};
console.log(result.a, result.b, result.c, result[symbol]);
