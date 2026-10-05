const units = ['B', 'KiB', 'MiB', 'GiB'];
function size(bytes) {
  let unit = 0;
  let value = bytes;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  const digits = unit === 0 ? 0 : 2;
  return value.toFixed(digits) + ' ' + units[unit];
}
const samples = [9, 1024, 1536, 1048577, 1073741824];
console.log(JSON.stringify(samples.map(size)));
