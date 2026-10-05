async function main() {
  const cart = { amount: 80, member: true };
  const standard = Promise.resolve(cart.amount + 6);
  const member = Promise.resolve(cart.amount * 9 / 10);
  const selection = await Promise.resolve(cart.member);
  const chosen = await (selection ? member : standard);
  const alternatives = await Promise.all([standard, member]);
  const saving = alternatives[0] - chosen;
  console.log(JSON.stringify([chosen, saving, alternatives]));
}
main().catch(error => { throw error; });
