const labels = ['item10', 'item2', 'item1', 'item02', 'item20a'];
function compare(a, b) {
  const x = a.match(/\d+|\D+/g), y = b.match(/\d+|\D+/g);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const numeric = /^\d+$/.test(x[i]) && /^\d+$/.test(y[i]);
    const difference = numeric ? Number(x[i]) - Number(y[i]) : x[i] < y[i] ? -1 : x[i] > y[i] ? 1 : 0;
    if (difference) return difference;
    if (numeric && x[i].length !== y[i].length) return x[i].length - y[i].length;
  }
  return x.length - y.length;
}
console.log(JSON.stringify(labels.sort(compare)));
