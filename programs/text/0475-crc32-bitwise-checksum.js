const source = '123456789';
let crc = 4294967295;
for (let i = 0; i < source.length; i++) {
  crc ^= source.charCodeAt(i);
  for (let bit = 0; bit < 8; bit++) {
    const low = crc & 1;
    crc = (crc >>> 1) ^ (low ? 3988292384 : 0);
  }
}
const final = (crc ^ 4294967295) >>> 0;
console.log(final.toString(16).padStart(8, '0'));
