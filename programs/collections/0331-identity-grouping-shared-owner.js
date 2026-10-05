const ada = {name:"Ada"};
const bo = {name:"Bo"};
const documents = [{id:"a",owner:ada,size:3},{id:"b",owner:bo,size:7},{id:"c",owner:ada,size:5}];
const grouped = new Map();
for (const document of documents) {
  if (!grouped.has(document.owner)) grouped.set(document.owner,[]);
  grouped.get(document.owner).push(document);
}
const summaries = Array.from(grouped,([owner,rows])=>{
  return {owner:owner.name,ids:rows.map(row=>row.id),size:rows.reduce((sum,row)=>sum+row.size,0)};
});
console.log(JSON.stringify({summaries,adaCount:grouped.get(ada).length,ownerCount:grouped.size}));
