function sum() {
  let total = 0;
  for (let i = 0; i < arguments.length; i++) { total += arguments[i]; }
  return total;
}
function retain() { return arguments; }
function mapped(value) {
  let saved = arguments;
  return {args: saved, set: function(n) { value = n; }, get: function() { return value; }};
}
console.log(sum(), sum(1, 2, 3), sum(7, 8, 9, 10));
let saved = retain("hello", 42, {value: 9});
for (let i = 0; i < 5000; i++) { retain(i, {value: i}); }
console.log(saved.length, saved[0], saved[1], saved[2].value);
delete saved[1];
console.log(1 in saved, saved.length, saved[1]);
let pair = mapped(3);
pair.set(8);
console.log(pair.args[0]);
pair.args[0] = 9;
console.log(pair.get());
delete pair.args[0];
pair.args[0] = 100;
console.log(pair.get(), pair.args[0]);
function duplicate(value, value) {
  value = 7;
  return [arguments[0], arguments[1], value];
}
let both = duplicate(1, 2), missing = duplicate(1);
console.log(both[0], both[1], both[2]);
console.log(missing[0], missing[1], missing[2]);
