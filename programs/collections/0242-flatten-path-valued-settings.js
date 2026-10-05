const config = {view:{theme:"dark",layout:{columns:3}},flags:{safe:true},version:2};
const flat = [];
function flatten(value,path) {
  if (value!==null && typeof value==="object") {
    for (const [key,child] of Object.entries(value)) flatten(child,path?path+"."+key:key);
  } else {
    flat.push([path,value]);
  }
}
flatten(config,"");
console.log(JSON.stringify(flat));
