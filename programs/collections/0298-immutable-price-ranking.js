const prices = [{id:"a",price:8},{id:"b",price:12},{id:"c",price:5}];
const ranked = prices.slice().sort((a,b)=>b.price-a.price);
const labels = ranked.map((item,index)=>({id:item.id,rank:index+1}));
const total = prices.reduce((sum,item)=>sum+item.price,0);
const report = {
  source:prices.map(item=>item.id),
  labels,
  total
};
console.log(JSON.stringify(report));
