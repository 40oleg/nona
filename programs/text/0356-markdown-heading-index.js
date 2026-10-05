const lines = ['# Intro', '```js', '# ignored', '```', '## Details', 'plain', '### Leaf'];
let fenced = false;
const headings = [];
for (let line = 0; line < lines.length; line++) {
  const text = lines[line];
  if (text.startsWith('```')) { fenced = !fenced; continue; }
  if (fenced) continue;
  let depth = 0;
  while (text[depth] === '#') depth++;
  if (depth > 0 && text[depth] === ' ') headings.push({ line: line + 1, depth, title: text.slice(depth + 1) });
}
console.log(JSON.stringify(headings));
