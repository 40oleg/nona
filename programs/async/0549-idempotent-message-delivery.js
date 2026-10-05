async function main() {
  const receipts = new Map();
  const sent = new Set();
  async function deliver(id, text) {
    if (receipts.has(id)) return receipts.get(id);
    await Promise.resolve();
    sent.add(text);
    const receipt = 'receipt-' + (receipts.size + 1);
    receipts.set(id, receipt);
    return receipt;
  }
  const a = await deliver('42', 'hello');
  const b = await deliver('42', 'changed');
  console.log(JSON.stringify([a, b, Array.from(sent)]));
}
main().catch(error => { throw error; });
