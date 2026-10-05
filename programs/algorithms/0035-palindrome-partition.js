const text = 'aabccb';
const palindrome = Array.from({length: text.length}, () => Array(text.length).fill(false));
const cuts = Array(text.length + 1).fill(Infinity); cuts[0] = -1;
for (let end = 0; end < text.length; end++) {
  for (let start = 0; start <= end; start++) {
    palindrome[start][end] = text[start] === text[end] && (end - start < 2 || palindrome[start + 1][end - 1]);
    if (palindrome[start][end]) cuts[end + 1] = Math.min(cuts[end + 1], cuts[start] + 1);
  }
}
console.log(cuts[text.length]);
