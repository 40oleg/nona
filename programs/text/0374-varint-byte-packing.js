function pack(number) {
  const bytes = [];
  do {
    let byte = number & 127;
    number = Math.floor(number / 128);
    if (number) byte |= 128;
    bytes.push(byte);
  } while (number);
  return bytes;
}
const values = [0, 127, 128, 300, 16384];
console.log(JSON.stringify(values.map(value => [value, pack(value)])));
