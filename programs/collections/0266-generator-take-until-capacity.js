function* deliveries() {
  for (const weight of [2,3,4,1]) yield {weight,label:"box"+weight};
}
let loaded = 0;
const labels = [];
for (const delivery of deliveries()) {
  if (loaded+delivery.weight>7) break;
  loaded+=delivery.weight;
  labels.push(delivery.label);
}
console.log(JSON.stringify({labels,loaded,remaining:7-loaded}));
