const records = ["a",null,"b",null,null,"c"];
let write = 0;
let removed = 0;
for (let read=0;read<records.length;read++) {
  if (records[read]===null) removed++;
  else { records[write]=records[read]; write++; }
}
records.length=write;
const letters = records.join("");
console.log(JSON.stringify({records,removed,letters}));
