const derivative = y => -y; let value = 1;
const step = 0.25, history = [];
for (let i = 0; i < 4; i++) {
  const k1 = derivative(value), k2 = derivative(value + step * k1 / 2);
  const k3 = derivative(value + step * k2 / 2), k4 = derivative(value + step * k3);
  value += step * (k1 + 2 * k2 + 2 * k3 + k4) / 6;
  history.push(Math.round(value * 1000000));
}
if (Math.abs(value - Math.exp(-1)) > 0.00002) throw new Error('integration accuracy');
console.log(history.join(','));
