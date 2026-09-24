function counter(start) {
  let value = start;
  return {
    next: function() { return ++value; },
    get: function() { return value; }
  };
}
const first = counter(10), second = counter(100);
console.log("counters", first.next(), first.next(), second.next(), first.get());
const callbacks = [];
for (let i = 0; i < 4; i++) {
  const square = i * i;
  callbacks[i] = function() { return i + ":" + square; };
}
console.log("iterations", callbacks[0](), callbacks[1](), callbacks[2](), callbacks[3]());
function level1(x) {
  return function() {
    return function(delta) { x += delta; return x; };
  };
}
const middle = level1(20), a = middle(), b = middle();
console.log("shared", a(2), b(3), a(4));
const factorial = function self(n) { return n < 2 ? 1 : n * self(n - 1); };
console.log("recursive expression", factorial(7));
