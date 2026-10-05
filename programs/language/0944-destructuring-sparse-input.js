function parse(row) {
  const [name='anonymous',level=1,...flags] = row;
  return {name,level,flags};
}
const sparse = []; sparse[2] = 'active';
const rows = [sparse,['Ada',0,'staff','verified'],[null,undefined]];
const records = rows.map(parse);
console.log(JSON.stringify(records));
console.log(records[0].name);
console.log(records[1].level);
