function update(object, path, transform) {
  if (!path.length) return transform(object);
  const [key,...tail] = path;
  const replacement = update(object[key],tail,transform);
  return Array.isArray(object) ? object.map((value,index) => index === key ? replacement : value) : {...object,[key]:replacement};
}
const before = {orders:[{quantity:2},{quantity:5}],owner:'Ada'};
const after = update(before,['orders',1,'quantity'],n => n+3);
console.log(JSON.stringify(after));
console.log(before.orders[1].quantity);
