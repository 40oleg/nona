async function main() {
  const acknowledged = new Set([0, 2]);
  const transmitted = [];
  const chunks = ['aa', 'bb', 'cc', 'dd'];
  for (let index = 0; index < chunks.length; index++) {
    if (acknowledged.has(index)) continue;
    const receipt = await Promise.resolve(index + ':' + chunks[index].length);
    transmitted.push(receipt);
    acknowledged.add(index);
  }
  const complete = acknowledged.size === chunks.length;
  console.log(JSON.stringify([transmitted, complete]));
}
main().catch(error => { throw error; });
