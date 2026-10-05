const rules = [
  {test:cart => cart.count >= 4,apply:total => total-5,label:'bulk'},
  {test:cart => cart.member,apply:total => total*0.9,label:'member'}
];
function price(cart) {
  let total = cart.count*cart.unit; const applied = [];
  for (const {test,apply,label} of rules) {
    if (test(cart)) { total = apply(total); applied.push(label); }
  }
  return {...cart,total,applied};
}
console.log(JSON.stringify(price({count:5,unit:10,member:true})));
