const records = [{name:"Ada",age:30},{city:"York",name:"Bo"},{age:22,city:"Lima"}];
const columns = new Set();
for (const record of records) {
  for (const key of Object.keys(record)) columns.add(key);
}
const names = Array.from(columns);
const matrix = records.map(record => names.map(key => record[key] ?? null));
const present = records.map(record => Object.keys(record).length);
const result = {columns:names,matrix,present};
console.log(JSON.stringify(result));
