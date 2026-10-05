const names = new Set(["Ada","Bo","Cy"]).values();
const scores = [8,6][Symbol.iterator]();
const pairs = [];
while (true) {
  const name = names.next();
  const score = scores.next();
  if (name.done || score.done) break;
  pairs.push([name.value,score.value]);
}
const total = pairs.reduce((sum,[,score]) => sum+score,0);
console.log(JSON.stringify({pairs,total}));
