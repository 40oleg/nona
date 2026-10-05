const partial = (fn,...bound) => (...later) => fn(...bound,...later);
function invoice(tax, discount, ...lines) {
  const subtotal = lines.reduce((sum,{quantity,price}) => sum+quantity*price,0);
  return {subtotal,total:(subtotal-discount)*(1+tax)};
}
const localInvoice = partial(invoice,0.1);
const promotion = partial(localInvoice,5);
const result = promotion({quantity:2,price:10},{quantity:1,price:5});
console.log(JSON.stringify(result));
console.log(localInvoice(0,{quantity:3,price:10}).total);
