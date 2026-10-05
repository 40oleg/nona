async function main() {
  const log = [];
  const kept = Promise.resolve('payload').finally(async () => {
    await Promise.resolve();
    log.push('cleaned');
    return 'discarded';
  });
  const replaced = Promise.resolve('other').finally(() => { throw new Error('cleanup failed'); });
  const states = await Promise.allSettled([kept, replaced]);
  const values = states.map(state => state.status === 'fulfilled' ? state.value : state.reason.message);
  console.log(JSON.stringify([values, log]));
}
main().catch(error => { throw error; });
