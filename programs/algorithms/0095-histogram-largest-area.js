const bars = [2, 1, 5, 6, 2, 3], stack = []; let best = 0;
for (let i = 0; i <= bars.length; i++) {
  const height = i === bars.length ? 0 : bars[i];
  while (stack.length && bars[stack[stack.length - 1]] > height) {
    const top = stack.pop(), left = stack.length ? stack[stack.length - 1] + 1 : 0;
    best = Math.max(best, bars[top] * (i - left));
  }
  stack.push(i);
}
console.log(best);
