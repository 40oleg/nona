let calls = 0;
const multiply = new Proxy(function (left, right) { return this.factor * left * right; }, {
  apply(target, receiver, argumentsList) {
    calls++;
    return Reflect.apply(target, receiver, argumentsList.map(n => Math.max(0, n)));
  }
});
const context = { factor: 2, multiply };
console.log(JSON.stringify([
  context.multiply(3, 4), multiply.call({ factor: 9 }, -1, 5), calls
]));
