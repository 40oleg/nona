function ledger(start) {
  let balance = start, attempts = 0;
  return {
    change(amount) {
      const before = balance;
      try { balance += amount; if (balance < 0) throw new Error('overdraw'); }
      catch (e) { balance = before; return e.message; }
      finally { attempts++; }
      return balance;
    }, report() { return {balance,attempts}; }
  };
}
const book = ledger(20);
console.log(JSON.stringify([book.change(-7),book.change(-30),book.change(5),book.report()]));
