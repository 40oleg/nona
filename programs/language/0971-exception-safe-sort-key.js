function sortValid(rows,key) {
  const entries = [], rejected = [];
  for (const row of rows) {
    try { entries.push({row,key:key(row)}); }
    catch(error) { rejected.push(error.message); }
  }
  entries.sort((a,b) => a.key-b.key);
  return {rows:entries.map(({row}) => row),rejected};
}
const result = sortValid([{name:'a',rank:3},{name:'b'},{name:'c',rank:1}],({name,rank}) => { if (rank === undefined) throw new Error(name); return rank; });
console.log(JSON.stringify(result));
