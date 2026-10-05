const records = [{name:"Ada",secret:"x",tags:["admin","editor"]},{name:"Bo",secret:"y",tags:["reader"]}];
const visits = [];
const encoded = JSON.stringify(records,(key,value)=>{
  if (key==="secret") return undefined;
  if (key==="tags" && Array.isArray(value)) return value.join("+");
  if (key==="name") visits.push(value);
  return value;
});
const decoded = JSON.parse(encoded);
console.log(JSON.stringify({decoded,visits}));
