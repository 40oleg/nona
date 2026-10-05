const fragments = ['Wiki', 'pedia'];
let a = 1, b = 0;
const checkpoints = [];
for (const fragment of fragments) {
  for (let i = 0; i < fragment.length; i++) {
    a = (a + fragment.charCodeAt(i)) % 65521;
    b = (b + a) % 65521;
  }
  checkpoints.push(((b << 16) | a) >>> 0);
}
const checksum = checkpoints[checkpoints.length - 1].toString(16).padStart(8, '0');
console.log(JSON.stringify({ checkpoints, checksum }));
