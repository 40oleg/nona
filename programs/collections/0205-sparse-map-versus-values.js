const source = [2,,5,,8];
let visits = 0;
const mapped = source.map(value => {
  visits++;
  return value*2;
});
const dense = Array.from(source,value => value===undefined ? "hole" : value);
const positions = Object.keys(mapped).map(Number);
const result = {visits,positions,dense,mapped};
console.log(JSON.stringify(result));
