const supplies = [[2, 2], [3, 1], [5, 1]], solutions = [];
function select(index, remaining, picked) {
  if (index === supplies.length) { if (!remaining) solutions.push(picked); return; }
  const [weight, limit] = supplies[index];
  for (let amount = 0; amount <= limit && amount * weight <= remaining; amount++) select(index + 1, remaining - amount * weight, [...picked, amount]);
}
select(0, 7, []);
if (solutions.some(parts => parts.reduce((sum, n, i) => sum + n * supplies[i][0], 0) !== 7)) throw new Error('weight');
console.log(JSON.stringify(solutions));
