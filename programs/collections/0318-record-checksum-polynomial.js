const rows = [{id:2,name:"Bo"},{id:1,name:"Ada"}];
const text = rows.slice().sort((a,b)=>a.id-b.id).map(row=>row.id+":"+row.name).join("|");
let checksum = 0;
for (const character of text) {
  checksum = (checksum*31+character.charCodeAt(0))%65521;
}
const length = text.length;
const report = {text,length,checksum};
const nonempty = checksum!==0;
console.log(JSON.stringify([report,nonempty]));
