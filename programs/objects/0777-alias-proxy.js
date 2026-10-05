const aliases = { qty: "quantity", cost: "price" };
const item = new Proxy({ quantity: 2, price: 7 }, {
  get(target, key, receiver) { return Reflect.get(target, aliases[key] ?? key, receiver); },
  set(target, key, value, receiver) { return Reflect.set(target, aliases[key] ?? key, value, receiver); }
});
item.qty += 3;
item.cost = 6;
console.log(JSON.stringify({
  total: item.qty * item.cost,
  item
}));
