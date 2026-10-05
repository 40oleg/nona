class RetryPolicy {
  constructor(limit, retryable) { this.limit = limit; this.retryable = new Set(retryable); }
  execute(operation) {
    const trace = [];
    for (let attempt = 1; attempt <= this.limit; attempt++) {
      const result = operation(attempt); trace.push(result);
      if (result === "ok" || !this.retryable.has(result)) break;
    }
    return trace;
  }
}
const policy = new RetryPolicy(3, ["busy"]);
console.log(JSON.stringify([policy.execute(n => n < 3 ? "busy" : "ok"), policy.execute(() => "invalid")]));
