class Context {
  constructor() { this.stack = ['root']; }
  current() { return this.stack[this.stack.length-1]; }
  within(value,fn) {
    this.stack.push(value);
    try { return fn(); } finally { this.stack.pop(); }
  }
}
const ctx = new Context(), trace = [];
ctx.within('outer',() => { trace.push(ctx.current()); ctx.within('inner',() => trace.push(ctx.current())); trace.push(ctx.current()); });
trace.push(ctx.current());
console.log(JSON.stringify(trace));
