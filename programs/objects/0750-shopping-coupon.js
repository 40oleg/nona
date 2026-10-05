class Coupon {
  constructor(code, minimum, discount) { Object.assign(this, { code, minimum, discount }); }
  apply(total) { return total >= this.minimum ? total - this.discount : total; }
}
class Basket {
  constructor() { this.items = new Map(); }
  add(name, price, quantity) { this.items.set(name, { price, quantity }); }
  total(coupon) { const sum = [...this.items.values()].reduce((n, item) => n + item.price * item.quantity, 0); return coupon?.apply(sum) ?? sum; }
}
const basket = new Basket(); basket.add("tea", 6, 3); basket.add("cup", 4, 2);
console.log(JSON.stringify([basket.total(), basket.total(new Coupon("SAVE", 25, 5))]));
