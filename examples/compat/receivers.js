function account(balance) {
  return {
    balance: balance,
    deposit: function(amount) {
      this.balance += amount;
      return this;
    },
    read: function() { return this.balance; }
  };
}
let first = account(10), second = account(100);
second.deposit = first.deposit;
console.log(first.deposit(5).read(), second.deposit(7).read());
let child = {__proto__: first, balance: 30};
console.log(child.deposit(2) === child, child.read(), first.read());

let calls = 0;
function receiver() { calls++; return child; }
console.log(receiver()["deposit"](8).read(), calls);
for (let i = 0; i < 5000; i++) {
  account(i).deposit(1);
}
console.log(first.read(), second.read(), child.read());
