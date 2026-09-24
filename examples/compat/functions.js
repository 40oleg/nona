function plusOne(x) { return x + 1; }
function double(x) { return x * 2; }
function applyMany(fn, value, count) {
  for (let i = 0; i < count; i++) value = fn(value);
  return value;
}
function choose(flag) { return flag ? plusOne : double; }
const actions = {step: plusOne, grow: double};
const pipeline = [actions.step, actions.grow, choose(true)];
let result = 4;
for (let i = 0; i < pipeline.length; i++) result = pipeline[i](result);
console.log("pipeline", result, applyMany(double, 1, 10));
let alias = plusOne;
plusOne = double;
console.log("replacement", alias(7), plusOne(7), typeof alias, alias === actions.step);
alias.label = "increment";
console.log("property", actions.step.label, choose(false)(6));
