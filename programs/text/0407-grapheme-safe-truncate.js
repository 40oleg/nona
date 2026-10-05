const source = 'a\u0301b\u0308c\u0327def';
const budget = 4;
const clusters = [];
for (const character of source) {
  if (/\p{Mark}/u.test(character) && clusters.length) clusters[clusters.length - 1] += character;
  else {
    clusters.push(character);
  }
}
const shortened = clusters.length > budget ? clusters.slice(0, budget - 1).join('') + '…' : source;
console.log(JSON.stringify({ shortened, originalClusters: clusters.length }));
