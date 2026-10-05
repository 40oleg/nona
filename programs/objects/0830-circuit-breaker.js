class CircuitBreaker {
  #failures = 0;
  #open = false;
  constructor(limit) { this.limit = limit; }
  call(operation) {
    if (this.#open) return "blocked";
    try { const result = operation(); this.#failures = 0; return result; }
    catch { if (++this.#failures >= this.limit) this.#open = true; return "failed"; }
  }
  reset() { this.#open = false; this.#failures = 0; }
}
const breaker = new CircuitBreaker(2), fail = () => { throw new Error("offline"); };
const trace = [breaker.call(fail), breaker.call(fail), breaker.call(() => "ok")]; breaker.reset(); trace.push(breaker.call(() => "ok"));
console.log(JSON.stringify(trace));
