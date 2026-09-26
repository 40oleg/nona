function total(a = 2, b = a + 3, ...rest) {
  return [a, b, rest.length, arguments.length].join(':');
}
const pick = (value = 7) => value;
console.log(total(), total(undefined, 9, 4), pick(), pick(3));
