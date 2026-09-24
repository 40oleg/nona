function Counter(start) { this.value = start; }
Counter.prototype.add = function(step) { this.value += step; return this; };
Counter.prototype.read = function() { return this.value; };
let first = new Counter(2), second = new Counter(10);
console.log(first.add(3).read(), second.add(7).read());
console.log(first instanceof Counter, first.constructor === Counter);
let previous = Counter.prototype;
Counter.prototype = {kind: "replacement"};
let third = new Counter(20);
console.log(first instanceof Counter, third instanceof Counter, third.kind);
console.log(first.__proto__ === previous, first.read());
function Result(value) { return {answer: value}; }
function Primitive(value) { this.answer = value; return 0; }
console.log(new Result(42).answer, new Primitive(7).answer);
let total = 0;
for (let i = 0; i < 5000; i++) { total += new Primitive(i).answer; }
console.log(total);
