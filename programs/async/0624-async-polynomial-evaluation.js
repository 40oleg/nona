async function main() {
  async function* coefficients() {
    for (const coefficient of [2, -3, 4, 1]) yield await Promise.resolve(coefficient);
  }
  const x = 3;
  let value = 0;
  const partials = [];
  for await (const coefficient of coefficients()) {
    value = value * x + coefficient;
    partials.push(value);
  }
  console.log(JSON.stringify([value, partials]));
}
main().catch(error => { throw error; });
