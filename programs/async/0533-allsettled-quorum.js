async function main() {
  async function write(replica) {
    await Promise.resolve();
    if (replica === 'west') throw new Error('offline');
    return replica;
  }
  const outcomes = await Promise.allSettled(['east', 'west', 'north'].map(write));
  const acknowledgements = outcomes.filter(outcome => outcome.status === 'fulfilled').map(outcome => outcome.value);
  const committed = acknowledgements.length >= 2;
  if (!committed) throw new Error('no quorum');
  console.log(JSON.stringify([committed, acknowledgements]));
}
main().catch(error => { throw error; });
