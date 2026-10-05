function* quotients(a, b) {
  while (b !== 0n) { yield a / b; [a, b] = [b, a % b]; }
}
let pn = 1n, pp = 0n, qn = 0n, qp = 1n; const convergents = [];
for (const coefficient of quotients(355n, 113n)) {
  const p = coefficient * pn + pp, q = coefficient * qn + qp;
  convergents.push(String(p) + '/' + String(q)); [pp, pn, qp, qn] = [pn, p, qn, q];
}
console.log(convergents.join(','));
