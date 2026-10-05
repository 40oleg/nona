const packages = [{id:"a",status:"sent",weight:3},{id:"b",status:"held",weight:5},{id:"c",status:"sent",weight:2}];
const grouped = packages.reduce((groups,row)=>{
  if (!groups[row.status]) groups[row.status]=[];
  groups[row.status].push(row);
  return groups;
},{});
const summaries = Object.entries(grouped).map(([status,rows])=>{
  const weight = rows.reduce((sum,row)=>sum+row.weight,0);
  return {status,ids:rows.map(row=>row.id),weight};
});
console.log(JSON.stringify({summaries,sent:grouped.sent.length,held:grouped.held.length}));
