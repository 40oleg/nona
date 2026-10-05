const serials = ["a7","b2","a7","c4","b2","b2"];
const positions = new Map();
serials.forEach((serial,index) => {
  if (!positions.has(serial)) positions.set(serial,[]);
  positions.get(serial).push(index);
});
const duplicates = Array.from(positions).filter(([,indices]) => indices.length>1);
const extras = duplicates.reduce((sum,[,indices]) => sum+indices.length-1,0);
const report = {duplicates,extras};
console.log(JSON.stringify(report));
