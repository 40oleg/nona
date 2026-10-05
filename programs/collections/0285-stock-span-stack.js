const prices = [10,7,8,6,9,12];
const stack = [];
const spans = [];
for (let i=0;i<prices.length;i++) {
  while (stack.length && prices[stack[stack.length-1]]<=prices[i]) stack.pop();
  const previous = stack.length ? stack[stack.length-1] : -1;
  spans.push(i-previous);
  stack.push(i);
}
console.log(JSON.stringify(spans));
