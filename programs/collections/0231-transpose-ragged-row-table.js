const rows = [[1,2,3],[4],[5,6]];
const width = Math.max(...rows.map(row => row.length));
const columns = [];
for (let column=0;column<width;column++) {
  columns.push(rows.map(row => row[column] ?? null));
}
const columnTotals = columns.map(column => {
  return column.reduce((sum,value) => sum+(value ?? 0),0);
});
console.log(JSON.stringify({columns,columnTotals}));
