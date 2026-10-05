const rates = [{region:'north',base:2},{region:'south',base:3}];
const calculators = [];
for (const {region,base} of rates) {
  for (let tier = 1; tier <= 2; tier++) {
    const fixed = base*tier;
    calculators.push(quantity => ({region,tier,cost:fixed*quantity}));
  }
}
const quotes = calculators.map(calculate => calculate(4));
console.log(JSON.stringify(quotes));
console.log(quotes.reduce((sum,{cost}) => sum+cost,0));
