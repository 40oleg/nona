function* unique(source,key) {
  const seen = new Set();
  for (const item of source) {
    const value = key(item);
    if (!seen.has(value)) { seen.add(value); yield item; }
  }
}
const rows = [{kind:'a',value:1},{kind:'b',value:2},{kind:'a',value:3},{kind:'c',value:4}];
const selected = [...unique(rows,({kind}) => kind)];
console.log(JSON.stringify(selected));
console.log(selected.reduce((sum,{value}) => sum+value,0));
