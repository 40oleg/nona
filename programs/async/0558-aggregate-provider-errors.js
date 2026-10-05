async function main() {
  const providers = ['local', 'remote'];
  const requests = providers.map(async name => {
    await Promise.resolve();
    throw new Error(name + ' unavailable');
  });
  let errors = [];
  try { await Promise.any(requests); }
  catch (error) {
    if (!(error instanceof AggregateError)) throw error;
    errors = error.errors.map(reason => reason.message);
  }
  console.log(JSON.stringify(errors));
}
main().catch(error => { throw error; });
