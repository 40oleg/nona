const weights = new Map([["red",2],["blue",3],["green",1]]);
function choose(offset) {
  for (const [name,weight] of weights) {
    if (offset<weight) return name;
    offset-=weight;
  }
  return "outside";
}
const choices = [0,1,2,4,5,6].map(choose);
console.log(JSON.stringify(choices));
