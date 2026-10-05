async function main() {
  async function decode(raw) {
    await Promise.resolve();
    try { return JSON.parse(raw); }
    catch (error) { throw new Error('decode stage', { cause: error }); }
  }
  let report;
  try { await decode('{broken'); }
  catch (error) {
    if (!(error.cause instanceof SyntaxError)) throw error;
    report = error.message + ':' + error.cause.name;
  }
  console.log(report);
}
main().catch(error => { throw error; });
