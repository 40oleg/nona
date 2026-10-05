const text = 'One small step for a careful word wrapper.\n\nSecond paragraph stays separate.';
function wrap(paragraph) {
  const lines = [];
  let line = '';
  for (const word of paragraph.split(' ')) {
    if (line && line.length + word.length + 1 > 18) { lines.push(line); line = word; }
    else line += (line ? ' ' : '') + word;
  }
  if (line) lines.push(line);
  return lines.join('\n');
}
console.log(text.split('\n\n').map(wrap).join('\n\n'));
