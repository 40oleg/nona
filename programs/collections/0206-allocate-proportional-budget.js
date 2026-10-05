const teams = [{name:"a",weight:3},{name:"b",weight:2},{name:"c",weight:2}];
const budget = 20;
const weight = teams.reduce((sum,team) => sum+team.weight,0);
const shares = teams.map(team => {
  const exact = budget*team.weight/weight;
  return {name:team.name,amount:Math.floor(exact),fraction:exact%1};
});
let left = budget-shares.reduce((sum,share) => sum+share.amount,0);
const order = shares.slice().sort((a,b) => b.fraction-a.fraction);
for (let i=0;i<left;i++) order[i].amount++;
console.log(JSON.stringify(shares.map(({name,amount}) => [name,amount])));
