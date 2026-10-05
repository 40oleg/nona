async function main() {
  let calls = 0;
  async function submit() {
    await Promise.resolve();
    if (++calls < 3) throw new Error('busy');
    return 'invoice accepted';
  }
  let result;
  while (!result) {
    try { result = await submit(); }
    catch (error) { if (error.message !== 'busy' || calls >= 4) throw error; }
  }
  console.log(result + ':' + calls);
}
main().catch(error => { throw error; });
