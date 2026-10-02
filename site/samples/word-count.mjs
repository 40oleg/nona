// word-count.mjs — count words in text files and write a report.
// Usage: word-count <file>... (the first argument is process.argv[1]).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const files = process.argv.slice(1);
if (files.length === 0) {
  console.log('usage: word-count <file>...');
  process.exit(2);
}

const encoder = new TextEncoder();
const counts = new Map();
const report = [];
let total = 0;

for (const file of files) {
  if (!existsSync(file)) {
    console.log(`${file}: not found`);
    process.exitCode = 1;
    continue;
  }
  const text = readFileSync(file, 'utf8');
  const words = text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  total += words.length;
  report.push(`${file}: ${words.length} words, ${encoder.encode(text).length} bytes`);
}

const top = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 5);
report.push(`total: ${total} words, ${counts.size} distinct`);
for (const [word, count] of top) report.push(`  ${word}: ${count}`);

console.log(report.join('\n'));
writeFileSync('word-count.txt', report.join('\n') + '\n');
