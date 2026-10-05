const words = new Set(['rain', 'bow', 'rainbow', 'fish']); const text = 'rainbowfish';
const previous = Array(text.length + 1).fill(-1); previous[0] = 0;
for (let end = 1; end <= text.length; end++) {
  for (let start = 0; start < end; start++) {
    if (previous[start] >= 0 && words.has(text.slice(start, end))) { previous[end] = start; break; }
  }
}
const parts = []; let cursor = text.length;
while (cursor > 0 && previous[cursor] >= 0) { parts.unshift(text.slice(previous[cursor], cursor)); cursor = previous[cursor]; }
console.log(cursor === 0 ? parts.join('/') : 'unsegmentable');
