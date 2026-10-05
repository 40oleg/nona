const prefixes = { '-6': 'µ', '-3': 'm', '0': '', '3': 'k', '6': 'M' };
function engineering(value) {
  if (value === 0) return '0';
  let exponent = Math.floor(Math.log10(Math.abs(value)) / 3) * 3;
  exponent = Math.max(-6, Math.min(6, exponent));
  const scaled = value / Math.pow(10, exponent);
  return scaled.toFixed(2) + ' ' + prefixes[String(exponent)];
}
const values = [0, 0.000023, 0.48, 12345, -2000000];
console.log(JSON.stringify(values.map(engineering)));
