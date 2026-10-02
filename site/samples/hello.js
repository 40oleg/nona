// hello.js — functions, template literals and the event loop.
function greet(name) {
  return `Hello, ${name}!`;
}

const start = performance.now();
console.log(greet('from Nona'));

queueMicrotask(() => console.log('a microtask runs before any timer'));

let ticks = 0;
const timer = setInterval(() => {
  ticks += 1;
  console.log(`tick ${ticks}`);
  if (ticks === 3) {
    clearInterval(timer);
    console.log('done; at least 30 ms passed:', performance.now() - start >= 30);
  }
}, 10);
