class Quota {
  #tokens;
  constructor(capacity) { this.capacity = capacity; this.#tokens = capacity; }
  consume(amount) { if (amount > this.#tokens) return false; this.#tokens -= amount; return true; }
  refill(amount) { this.#tokens = Math.min(this.capacity, this.#tokens + amount); }
  get tokens() { return this.#tokens; }
}
const quota = new Quota(5);
const answers = [quota.consume(3), quota.consume(3)]; quota.refill(2);
answers.push(quota.consume(3), quota.tokens);
console.log(JSON.stringify(answers));
