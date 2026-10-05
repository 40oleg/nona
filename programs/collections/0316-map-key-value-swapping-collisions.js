const original = new Map([["a",1],["b",2],["c",1],["d",3],["e",2]]);
const inverted = new Map();
for (const [key,value] of original) {
  if (!inverted.has(value)) inverted.set(value,[]);
  inverted.get(value).push(key);
}
const collisions = Array.from(inverted).filter(([,keys])=>keys.length>1);
const distinctValues = inverted.size;
const report = {inverted:Array.from(inverted),collisions,distinctValues};
console.log(JSON.stringify(report));
