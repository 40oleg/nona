class Envelope {
  #remaining;
  #expenses = [];
  constructor(limit) { this.#remaining = limit; }
  spend(category, amount) { if (amount > this.#remaining) return false; this.#remaining -= amount; this.#expenses.push({ category, amount }); return true; }
  get summary() { return { remaining: this.#remaining, categories: Object.fromEntries(this.#expenses.map(e => [e.category, e.amount])) }; }
}
const budget = new Envelope(50);
const accepted = [budget.spend("food", 18), budget.spend("travel", 40), budget.spend("books", 12)];
console.log(JSON.stringify([accepted, budget.summary]));
