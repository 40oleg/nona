const packages = [6,2,5,3,4,2];
const bins = [];
for (const weight of packages.slice().sort((a,b) => b-a)) {
  let bin = bins.find(candidate => candidate.load+weight<=8);
  if (!bin) { bin={load:0,items:[]}; bins.push(bin); }
  bin.items.push(weight);
  bin.load += weight;
}
const waste = bins.reduce((sum,bin) => sum+8-bin.load,0);
console.log(JSON.stringify({bins,waste}));
