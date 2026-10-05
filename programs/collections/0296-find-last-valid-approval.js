const approvals = [{who:"Ada",valid:true},{who:"Bo",valid:false},{who:"Cy",valid:true},{who:"Dee",valid:false}];
function valid(record) {
  return record.valid && record.who.length>1;
}
let index = -1;
for (let i=approvals.length-1;i>=0;i--) {
  if (valid(approvals[i])) { index=i; break; }
}
const last = approvals[index];
const rejected = approvals.filter(record=>!valid(record)).map(record=>record.who);
const label = last ? last.who : "none";
console.log(JSON.stringify({label,index,rejected}));
