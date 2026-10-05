const fields = [["view.theme","dark"],["view.width",4],["flags.safe",true]];
const root = {};
for (const [path,value] of fields) {
  const parts = path.split(".");
  let target = root;
  for (let i=0;i<parts.length-1;i++) {
    if (!(parts[i] in target)) target[parts[i]]={};
    target = target[parts[i]];
  }
  target[parts[parts.length-1]]=value;
}
console.log(JSON.stringify(root));
