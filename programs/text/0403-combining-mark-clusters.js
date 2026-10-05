const text = 'a\u0301o\u0308x\u0327\u0301';
const clusters = [];
for (const symbol of text) {
  if (/\p{Mark}/u.test(symbol) && clusters.length) clusters[clusters.length - 1] += symbol;
  else {
    clusters.push(symbol);
  }
}
const widths = clusters.map(cluster => Array.from(cluster).length);
const normalized = clusters.map(cluster => cluster.normalize('NFC'));
console.log(JSON.stringify({ clusters, widths, normalized }));
