// Find the first occurrence, including duplicate values and absent targets.
function firstIndex(values, target) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low < values.length && values[low] === target ? low : -1;
}

const values = [-4, 0, 0, 3, 9];
console.log(firstIndex(values, -4), firstIndex(values, 0),
  firstIndex(values, 9), firstIndex(values, 2), firstIndex([], 0));
