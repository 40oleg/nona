const high = ["h1","h2","h3","h4"];
const low = ["l1","l2"];
const schedule = [];
let index = 0;
while (index<high.length || index<low.length) {
  if (index<high.length) schedule.push(high[index]);
  if (index<low.length) schedule.push(low[index]);
  index++;
}
const joined = schedule.join(">");
console.log(JSON.stringify([joined,schedule.length]));
