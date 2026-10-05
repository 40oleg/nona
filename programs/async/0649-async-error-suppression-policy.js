async function main() {
  const allowed = new Set(['not found', 'denied']);
  const outcomes = await Promise.allSettled(['ok', 'not found', 'denied'].map(async result => {
    await Promise.resolve();
    if (result !== 'ok') throw new Error(result);
    return 'record';
  }));
  const accepted = [];
  for (const outcome of outcomes) {
    if (outcome.status === 'fulfilled') accepted.push(outcome.value);
    else if (allowed.has(outcome.reason.message)) accepted.push('expected:' + outcome.reason.message);
    else throw outcome.reason;
  }
  console.log(JSON.stringify(accepted));
}
main().catch(error => { throw error; });
