class Money {
  constructor(amount,unit) { this.amount = amount; this.unit = unit; }
  plus({amount,unit}) {
    if (unit !== this.unit) throw new Error('unit mismatch');
    return new Money(this.amount+amount,unit);
  }
}
const bill = new Money(12,'USD');
const sum = bill.plus(new Money(5,'USD'));
try { sum.plus(new Money(2,'EUR')); }
catch (error) { console.log(error.message); }
console.log(JSON.stringify(sum));
