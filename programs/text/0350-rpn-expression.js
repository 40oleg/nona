const operations = { '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b };
const expression = '8 3 - 2 4 + *';
const stack = [];
for (const token of expression.split(' ')) {
  if (token in operations) {
    if (stack.length < 2) throw new Error('underflow');
    const right = stack.pop();
    stack.push(operations[token](stack.pop(), right));
  } else stack.push(Number(token));
}
if (stack.length !== 1) throw new Error('unbalanced');
console.log(stack[0]);
