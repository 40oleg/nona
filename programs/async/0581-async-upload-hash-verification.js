async function main() {
  async function* chunks() { yield 'ab'; yield await Promise.resolve('cd'); }
  let payload = '';
  let sum = 0;
  for await (const chunk of chunks()) {
    payload += chunk;
    for (const char of chunk) sum += char.charCodeAt(0);
  }
  let outcome;
  try { if (sum !== 395) throw new Error('checksum mismatch'); outcome = payload; }
  catch (error) { outcome = error.message; }
  console.log(outcome + ':' + sum);
}
main().catch(error => { throw error; });
