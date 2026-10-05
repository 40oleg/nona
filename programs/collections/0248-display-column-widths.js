const rows = [["Item","Qty"],["bolt","12"],["washers","3"]];
const widths = rows.reduce((sizes,row) => {
  row.forEach((cell,index) => sizes[index]=Math.max(sizes[index]||0,cell.length));
  return sizes;
},[]);
const lines = rows.map(row => {
  return row.map((cell,index) => cell.padEnd(widths[index]," ")).join(" | ");
});
const text = lines.join("\n");
console.log(text);
