function parse(address) {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  let word = 0;
  for (const octet of octets) word = ((word << 8) | octet) >>> 0;
  const restored = [24, 16, 8, 0].map(shift => (word >>> shift) & 255).join('.');
  return { word, restored };
}
const addresses = ['192.168.1.5', '255.255.255.255', '300.1.2.3'];
console.log(JSON.stringify(addresses.map(parse)));
