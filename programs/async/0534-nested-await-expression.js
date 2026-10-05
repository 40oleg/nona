async function main() {
  const quantity = Promise.resolve(4);
  const unitPrice = Promise.resolve(7);
  const member = Promise.resolve(true);
  const subtotal = (await quantity) * (await unitPrice);
  const discount = await member ? await Promise.resolve(3) : 0;
  const tax = await Promise.resolve((subtotal - discount) * 2 / 10);
  const total = subtotal - discount + tax;
  const receipt = `subtotal=${subtotal};discount=${discount};total=${total}`;
  console.log(receipt);
}
main().catch(error => { throw error; });
