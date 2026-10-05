const text = 'banana';
const suffixes = Array.from({ length: text.length }, (_, i) => i);
suffixes.sort((a, b) => text.slice(a) < text.slice(b) ? -1 : 1);
const lcp = [0];
for (let i = 1; i < suffixes.length; i++) {
  let common = 0;
  const a = suffixes[i - 1], b = suffixes[i];
  while (a + common < text.length && b + common < text.length && text[a + common] === text[b + common]) common++;
  lcp.push(common);
}
console.log(JSON.stringify({ suffixes, lcp }));
