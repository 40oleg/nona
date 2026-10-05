const groups = [[{id:'a',valid:true},{id:'b',valid:false}],[{id:'c',valid:true}],[{id:'d',valid:true},{id:'e',valid:true}]];
const accepted = [];
scan: for (const group of groups) {
  const ids = [];
  for (const {id,valid} of group) {
    if (!valid) continue scan;
    ids.push(id);
  }
  accepted.push(ids.join('+'));
}
console.log(JSON.stringify(accepted));
