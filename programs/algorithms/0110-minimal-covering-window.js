const text = 'ADOBECODEBANC', required = new Map([['A', 1], ['B', 1], ['C', 1]]);
let missing = 3, left = 0, best = '';
for (let right = 0; right < text.length; right++) {
  const char = text[right]; if (required.has(char)) { if (required.get(char) > 0) missing--; required.set(char, required.get(char) - 1); }
  while (!missing) {
    const candidate = text.slice(left, right + 1); if (!best || candidate.length < best.length) best = candidate;
    const first = text[left++]; if (required.has(first)) { required.set(first, required.get(first) + 1); if (required.get(first) > 0) missing++; }
  }
}
console.log(best);
