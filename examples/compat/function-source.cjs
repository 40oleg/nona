function /* keep comments */ sum (a, b) {
  return a + b;
}
console.log(sum.toString());
let anonymous = (function (x) { return "🦊" + x; });
console.log(anonymous.toString(), anonymous.name);
function factory(x) {
  return function inner(y) { return x + y; };
}
let first = factory(1), second = factory(2);
console.log(first.toString() === second.toString());
console.log(sum.bind(null, 1).toString());
console.log(sum.call.toString(), sum.apply.toString(), sum.bind.toString());
console.log(sum.toString.toString(), sum.__proto__.toString());
delete sum.name;
console.log(sum.toString());
console.log("" + [anonymous]);
