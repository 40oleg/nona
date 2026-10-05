const creditors = [{name:"a",left:7},{name:"b",left:4}];
const debtors = [{name:"c",left:5},{name:"d",left:6}];
const transfers = [];
let c = 0;
let d = 0;
while (c<creditors.length && d<debtors.length) {
  const amount = Math.min(creditors[c].left,debtors[d].left);
  transfers.push([debtors[d].name,creditors[c].name,amount]);
  creditors[c].left-=amount;
  debtors[d].left-=amount;
  if (creditors[c].left===0) c++;
  if (debtors[d].left===0) d++;
}
console.log(JSON.stringify(transfers));
