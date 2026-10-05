const text = 'abracadabra', pattern = 'abra';
const base = 31, modulus = 101;
let target = 0, hash = 0, power = 1;
for (let i = 0; i < pattern.length; i++) {
  target = (target * base + pattern.charCodeAt(i)) % modulus;
  hash = (hash * base + text.charCodeAt(i)) % modulus;
  if (i) power = power * base % modulus;
}
const matches = [];
for (let at = 0; at <= text.length - pattern.length; at++) {
  if (hash === target && text.slice(at, at + pattern.length) === pattern) matches.push(at);
  if (at + pattern.length < text.length) hash = ((hash - text.charCodeAt(at) * power) * base + text.charCodeAt(at + pattern.length)) % modulus;
  if (hash < 0) hash += modulus;
}
console.log(JSON.stringify(matches));
