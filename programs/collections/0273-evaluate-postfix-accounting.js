const operators = new Map([["+",(a,b)=>a+b],["-",(a,b)=>a-b],["*",(a,b)=>a*b]]);
const tokens = "12 3 - 2 * 4 +".split(" ");
const stack = [];
for (const token of tokens) {
  if (operators.has(token)) {
    const right = stack.pop();
    const left = stack.pop();
    stack.push(operators.get(token)(left,right));
  } else stack.push(Number(token));
}
console.log(JSON.stringify([stack[0],stack.length]));
