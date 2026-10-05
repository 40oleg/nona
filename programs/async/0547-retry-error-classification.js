async function main() {
  const failures = [{ code: 'BUSY' }, { code: 'INVALID' }, null];
  let attempts = 0;
  let outcome = '';
  for (let i = 0; i < failures.length; i++) {
    try {
      attempts++;
      const failure = await Promise.resolve(failures[i]);
      if (failure) throw failure;
      outcome = 'saved'; break;
    } catch (error) { if (error.code !== 'BUSY') { outcome = error.code; break; } }
  }
  console.log(outcome + ':' + attempts);
}
main().catch(error => { throw error; });
