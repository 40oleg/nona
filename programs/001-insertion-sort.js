// Sort a copy so duplicate values, negative numbers and the input are preserved.
function insertionSort(input) {
  const values = input.slice();
  for (let i = 1; i < values.length; i++) {
    const value = values[i];
    let j = i - 1;
    while (j >= 0 && values[j] > value) {
      values[j + 1] = values[j];
      j--;
    }
    values[j + 1] = value;
  }
  return values;
}

const input = [3, -1, 2, 2, 0, 8, -5];
console.log(insertionSort(input).join(','));
console.log(input.join(','));
