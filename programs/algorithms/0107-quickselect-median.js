const values = [9, 1, 4, 8, 2, 7, 3], rank = 3; let low = 0, high = values.length - 1;
while (low < high) {
  const pivot = values[high]; let boundary = low;
  for (let i = low; i < high; i++) if (values[i] < pivot) { [values[i], values[boundary]] = [values[boundary], values[i]]; boundary++; }
  [values[boundary], values[high]] = [values[high], values[boundary]];
  if (boundary === rank) break;
  if (boundary < rank) low = boundary + 1; else high = boundary - 1;
}
console.log(values[rank] + ':' + values.filter(v => v < values[rank]).length);
