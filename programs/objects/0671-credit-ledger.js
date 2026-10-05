class Ledger {
  #balance = 0;
  #entries = [];
  post(amount) {
    if (this.#balance + amount < 0) return false;
    this.#balance += amount;
    this.#entries.push(amount);
    return true;
  }
  get summary() { return [this.#balance, this.#entries.length]; }
}
const account = new Ledger();
console.log(JSON.stringify([account.post(9), account.post(-12), account.post(-4), account.summary]));
