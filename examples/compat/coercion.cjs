let order = "";
let price = {
  valueOf: function () { order += "v"; return 21; },
  toString: function () { order += "s"; return "price"; }
};
let record = {price: 42};
console.log(price + 1, record[price], price < 30, order);
console.log([price, null, 3].join(" / "), order);

let count = 0, list = [1, 2, 3];
list.length = {valueOf: function () { count++; return 1; }};
console.log(count, list.length, list[0], 1 in list);

function sum(a, b) { return a + b; }
let pair = {0: 7, 1: 8, length: {valueOf: function () { return 2; }}};
console.log(sum.apply(null, pair));
console.log((255).toString({valueOf: function () { return 16; }}));

let changing = {valueOf: function () {
  this.toString = function () { return "new method"; };
  return this;
}};
console.log("result: " + changing);
