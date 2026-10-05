const target = 7, history = []; let estimate = 3;
const residual = x => x * x - target;
while (Math.abs(residual(estimate)) > 1e-10 && history.length < 20) {
  estimate = (estimate + target / estimate) / 2;
  history.push(Math.round(estimate * 1000000));
}
if (history.length === 20) throw new Error('failed convergence');
console.log(history.length + ':' + history.join(','));
