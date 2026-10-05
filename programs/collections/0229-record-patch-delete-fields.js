let record = {name:"Ada",city:"York",score:4};
const patches = [{score:8,city:null},{name:"Adele",active:true}];
const snapshots = [];
for (const patch of patches) {
  for (const [key,value] of Object.entries(patch)) {
    if (value===null) delete record[key];
    else record[key]=value;
  }
  snapshots.push({...record});
}
console.log(JSON.stringify(snapshots));
