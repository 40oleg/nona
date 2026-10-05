async function main() {
  const plugins = [{ name: 'a', start: async () => 'started' }, { name: 'b' }];
  const outcomes = [];
  for (const plugin of plugins) {
    const pending = plugin.start?.();
    const outcome = (await pending) ?? 'skipped';
    outcomes.push(plugin.name + ':' + outcome);
  }
  const started = outcomes.filter(outcome => outcome.endsWith('started')).length;
  console.log(JSON.stringify([outcomes, started]));
}
main().catch(error => { throw error; });
