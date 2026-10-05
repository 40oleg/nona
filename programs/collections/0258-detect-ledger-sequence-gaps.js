const events = [["a",1],["b",2],["a",4],["a",2],["b",4]];
const groups = new Map();
for (const [account,seq] of events) {
  if (!groups.has(account)) groups.set(account,[]);
  groups.get(account).push(seq);
}
const gaps = [];
for (const [account,seqs] of groups) {
  seqs.sort((a,b)=>a-b);
  for (let i=1;i<seqs.length;i++) for (let seq=seqs[i-1]+1;seq<seqs[i];seq++) gaps.push([account,seq]);
}
console.log(JSON.stringify(gaps));
