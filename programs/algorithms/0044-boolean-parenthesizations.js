const values = [true, false, true], operators = ['^', '&'];
const yes = Array.from({length: 3}, () => Array(3).fill(0)), no = yes.map(row => row.slice());
values.forEach((v, i) => { yes[i][i] = v ? 1 : 0; no[i][i] = v ? 0 : 1; });
for (let width = 2; width <= 3; width++) for (let i = 0; i + width <= 3; i++) {
  const j = i + width - 1;
  for (let k = i; k < j; k++) for (const left of [false, true]) for (const right of [false, true]) {
    const ways = (left ? yes[i][k] : no[i][k]) * (right ? yes[k + 1][j] : no[k + 1][j]);
    const result = operators[k] === '^' ? left !== right : left && right;
    (result ? yes : no)[i][j] += ways;
  }
}
console.log(yes[0][2] + ':' + no[0][2]);
