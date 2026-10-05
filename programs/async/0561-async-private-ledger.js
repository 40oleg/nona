async function main() {
  class Ledger {
    #balance = 20;
    async debit(amount) {
      await Promise.resolve();
      if (amount > this.#balance) return false;
      this.#balance -= amount;
      return true;
    }
    get balance() { return this.#balance; }
  }
  const ledger = new Ledger();
  const approvals = [await ledger.debit(8), await ledger.debit(15)];
  console.log(JSON.stringify([approvals, ledger.balance]));
}
main().catch(error => { throw error; });
