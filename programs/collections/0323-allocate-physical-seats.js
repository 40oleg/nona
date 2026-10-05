const seats = new Array(8).fill(null);
const parties = [{name:"a",size:3},{name:"b",size:2},{name:"c",size:4},{name:"d",size:1}];
let cursor = 0;
const rejected = [];
for (const party of parties) {
  if (cursor+party.size>seats.length) { rejected.push(party.name); continue; }
  for (let i=0;i<party.size;i++) seats[cursor++]=party.name;
}
const empty = seats.filter(seat=>seat===null).length;
console.log(JSON.stringify({seats,rejected,empty}));
