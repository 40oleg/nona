const sentences = ["red fox runs","red fox sleeps","blue fox runs"];
const pairs = new Map();
for (const sentence of sentences) {
  const words = sentence.split(" ");
  for (let i=1;i<words.length;i++) {
    const key = words[i-1]+"/"+words[i];
    pairs.set(key,(pairs.get(key)||0)+1);
  }
}
const common = Array.from(pairs).filter(([,count]) => count>1);
console.log(JSON.stringify(common));
