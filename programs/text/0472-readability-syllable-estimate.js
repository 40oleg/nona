const text = 'Simple words make a clear sentence. Complex language needs attention.';
const words = text.toLowerCase().match(/[a-z]+/g);
function syllables(word) {
  const stripped = word.length > 3 ? word.replace(/e$/, '') : word;
  const groups = stripped.match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 0);
}
const total = words.reduce((sum, word) => sum + syllables(word), 0);
const sentences = (text.match(/[.!?]/g) || []).length;
const score = 206.835 - 1.015 * words.length / sentences - 84.6 * total / words.length;
console.log(JSON.stringify({ words: words.length, syllables: total, sentences, score: Number(score.toFixed(2)) }));
