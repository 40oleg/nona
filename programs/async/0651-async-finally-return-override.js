async function main() {
  async function overridden() {
    try { return await Promise.resolve('body'); }
    finally { return await Promise.resolve('cleanup'); }
  }
  const preserved = Promise.resolve('body').finally(async () => 'cleanup');
  const values = await Promise.all([overridden(), preserved]);
  const difference = values[0] !== values[1];
  if (!difference) throw new Error('override missing');
  console.log(JSON.stringify(values));
}
main().catch(error => { throw error; });
