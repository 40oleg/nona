async function main() {
  async function* source() {
    yield await Promise.resolve('first');
    yield 'second';
    throw new Error('source corrupt');
  }
  const records = [];
  let failure = '';
  try { for await (const record of source()) records.push(record); }
  catch (error) { failure = error.message; }
  console.log(JSON.stringify([records, failure]));
}
main().catch(error => { throw error; });
