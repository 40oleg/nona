const runs = [{item:"a",count:2},{item:"b",count:3},{item:"c",count:1}];
const decoded = runs.flatMap(run=>{
  return Array.from({length:run.count},()=>run.item);
});
const declared = runs.reduce((sum,run)=>sum+run.count,0);
const distinct = new Set(decoded).size;
const valid = decoded.length===declared;
const text = decoded.join("");
const report = {text,declared,distinct,valid};
console.log(JSON.stringify(report));
