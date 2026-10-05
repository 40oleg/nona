async function main() {
  const candidate = { workers: 4, retries: -1, verbose: true };
  const checks = await Promise.allSettled(Object.entries(candidate).map(async ([key, value]) => {
    await Promise.resolve();
    if (typeof value === 'number' && value < 0) throw new Error(key);
    return [key, value];
  }));
  const valid = checks.every(check => check.status === 'fulfilled');
  const live = valid ? candidate : { workers: 1, retries: 0, verbose: false };
  const errors = checks.filter(check => check.status === 'rejected').map(check => check.reason.message);
  console.log(JSON.stringify([live, errors]));
}
main().catch(error => { throw error; });
