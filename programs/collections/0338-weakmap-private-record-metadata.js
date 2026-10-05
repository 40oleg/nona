const records = [{id:"a"},{id:"b"},{id:"c"}];
const reviews = new WeakMap();
reviews.set(records[0],{approved:true,score:8});
reviews.set(records[1],{approved:false,score:3});
const approved = records.filter(record=>reviews.get(record)?.approved===true);
const report = records.map(record=>{
  const review = reviews.get(record);
  return {id:record.id,score:review?.score??null,fields:Object.keys(record)};
});
console.log(JSON.stringify({report,approved:approved.map(record=>record.id)}));
