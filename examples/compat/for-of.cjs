var values = [2, 4, 6];
var total = 0;
for (var value of values) total += value;
console.log(total);

var result = '';
for (var value of values) {
  if (value === 4) continue;
  result += value;
}
console.log(result);

var text = '';
for (var character of 'A😀B') text += character + '|';
console.log(text);

var closed = '';
var custom = {
  [Symbol.iterator]: function () {
    var index = 0;
    return {
      next: function () { return {value: ++index, done: index > 3}; },
      return: function () { closed = 'yes'; return {}; }
    };
  }
};
var customTotal = 0;
for (var item of custom) {
  customTotal += item;
  if (item === 2) break;
}
console.log(customTotal, closed);
