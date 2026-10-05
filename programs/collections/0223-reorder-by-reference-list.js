const reference = ["c","a","b"];
const records = [{id:"b",value:2},{id:"z",value:9},{id:"a",value:1},{id:"c",value:3}];
const rank = new Map(reference.map((id,index) => [id,index]));
const ordered = records.slice().sort((left,right) => {
  const a = rank.get(left.id) ?? reference.length;
  const b = rank.get(right.id) ?? reference.length;
  return a-b;
});
const labels = ordered.map(record => record.id+"="+record.value);
console.log(labels.join(";"));
