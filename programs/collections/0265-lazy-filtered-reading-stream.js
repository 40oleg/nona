const readings = [2,7,4,9,1,8];
let inspected = 0;
function* above(limit) {
  for (const value of readings) {
    inspected++;
    if (value>limit) yield value;
  }
}
const selected = [];
for (const value of above(5)) selected.push(value);
console.log(JSON.stringify({selected,inspected}));
