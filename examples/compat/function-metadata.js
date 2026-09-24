function sum(a, b) { return a + b; }
let product = function(a, b, c) { return a * b * c; };
let key = "operation" + 3;
let operations = {
  [key]: function(value) { return value + 1; },
  explicit: function known() { return 42; }
};
console.log(sum.name, sum.length, sum(2, 3));
console.log(product.name, product.length, product(2, 3, 4));
console.log(operations[key].name, operations[key].length, operations[key](8));
console.log(operations.explicit.name, operations.explicit.length);
let prototype = sum.__proto__;
console.log(prototype === product.__proto__, typeof prototype, prototype());
console.log(prototype.name === "", prototype.length);
