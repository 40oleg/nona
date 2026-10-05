const votes = [{color:"red",size:"small"},{color:"blue",size:"large"},{color:"red",size:"large"},{color:"red",size:"small"}];
const colors = Array.from(new Set(votes.map(vote=>vote.color)));
const sizes = Array.from(new Set(votes.map(vote=>vote.size)));
const table = colors.map(color=>{
  return sizes.map(size=>votes.filter(vote=>vote.color===color&&vote.size===size).length);
});
const rowTotals = table.map(row=>row.reduce((a,b)=>a+b,0));
const count = rowTotals.reduce((a,b)=>a+b,0);
const report = {colors,sizes,table,count};
console.log(JSON.stringify(report));
