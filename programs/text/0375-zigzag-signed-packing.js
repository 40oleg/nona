const signed = [-32, -1, 0, 1, 31];
function encode(value) {
  return (value << 1) ^ (value >> 31);
}
function decode(value) {
  return (value >>> 1) ^ -(value & 1);
}
const encoded = signed.map(encode);
const restored = encoded.map(decode);
console.log(JSON.stringify({ encoded, restored }));
