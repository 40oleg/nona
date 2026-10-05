const meetings = [["Ada","Bo","Cy"],["Bo","Ada"],["Cy","Dee"]];
const pairs = new Set();
for (const meeting of meetings) {
  const names = Array.from(new Set(meeting)).sort();
  for (let i=0;i<names.length;i++) for (let j=i+1;j<names.length;j++) {
    pairs.add(names[i]+"/"+names[j]);
  }
}
const collaborations = Array.from(pairs).sort();
console.log(JSON.stringify({collaborations,count:pairs.size}));
