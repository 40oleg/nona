const stock = {bread:3,soup:1,salad:2}, prices = {bread:2,soup:5,salad:4};
function order(customer,...items) {
  const accepted = [], unavailable = []; let total = 0;
  for (const item of items) {
    if ((stock[item] ?? 0) === 0) { unavailable.push(item); continue; }
    stock[item]--; total += prices[item]; accepted.push(item);
  }
  return {customer,accepted,unavailable,total};
}
const lunch = ['soup','bread'], extras = ['salad','bread'];
const first = order('Ada',...lunch,...extras);
const second = order('Bo','soup',...extras);
const {total:firstTotal} = first, {total:secondTotal} = second;
console.log(JSON.stringify({orders:[first,second],stock,bill:firstTotal+secondTotal}));
