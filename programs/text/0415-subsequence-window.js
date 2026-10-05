const text = 'abcdebdde', target = 'bde';
let best = '';
for (let start = 0; start < text.length; start++) {
  let cursor = 0;
  for (let end = start; end < text.length; end++) {
    if (text[end] === target[cursor]) cursor++;
    if (cursor === target.length) {
      const window = text.slice(start, end + 1);
      if (!best || window.length < best.length) best = window;
      break;
    }
  }
}
console.log(best);
