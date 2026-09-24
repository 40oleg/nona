function add(a, b) { return this.base + a + b; }
console.log(add.call({base: 10}, 2, 3));
console.log(add.call.call(add, {base: 20}, 4, 5));
function receiver() { return this; }
let number = receiver.call(7), text = receiver.call("item" + 42);
console.log(typeof number, number + 1, number === receiver.call(7));
console.log(typeof text, text.length, text[0], text[4], "" + text);
let lookup = {};
lookup[number] = "seven";
console.log(lookup[7], "" + [number, receiver.call(true)]);
let child = {__proto__: text};
child[0] = "x";
console.log(child[0], child.length, 0 in child);
function count() { return arguments.length; }
console.log(count.call(null, 1, 2, 3));
let total = 0;
for (let i = 0; i < 5000; i++) { total += add.call({base: i}, 1, 2); }
console.log(total);
