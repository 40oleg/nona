const bins = {east:7,west:4,north:2};
const transfers = [["east","west",3],["west","north",2],["north","east",1]];
const audit = [];
for (const [from,to,quantity] of transfers) {
  const moved = Math.min(bins[from],quantity);
  bins[from] -= moved;
  bins[to] += moved;
  audit.push(moved);
}
const total = Object.values(bins).reduce((a,b) => a+b,0);
console.log(JSON.stringify({bins,audit,total}));
