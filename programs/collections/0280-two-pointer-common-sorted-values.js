const left = [1,2,4,7,9];
const right = [2,3,4,8,9];
let a = 0;
let b = 0;
const common = [];
while (a<left.length && b<right.length) {
  if (left[a]===right[b]) { common.push(left[a]); a++; b++; }
  else if (left[a]<right[b]) a++;
  else b++;
}
console.log(JSON.stringify(common));
