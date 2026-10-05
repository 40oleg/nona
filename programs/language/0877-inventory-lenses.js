const field = key => ({get:obj => obj?.[key],set:(obj,value) => ({...obj,[key]:value})});
function compose(outer,inner) {
  return {get:obj => inner.get(outer.get(obj)),set:(obj,value) => outer.set(obj,inner.set(outer.get(obj),value))};
}
const quantity = compose(field('item'),field('quantity'));
const original = {item:{name:'bolt',quantity:3},bin:'A'};
const updated = quantity.set(original,quantity.get(original)+5);
console.log(JSON.stringify(updated));
console.log(original.item.quantity);
console.log(quantity.get({}) ?? 'missing');
