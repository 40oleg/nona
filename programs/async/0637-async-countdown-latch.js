async function main() {
  let remaining = 3;
  let finish;
  const ready = new Promise(resolve => { finish = resolve; });
  const completed = [];
  const workers = ['database', 'cache', 'router'].map(async name => {
    await Promise.resolve();
    completed.push(name);
    if (--remaining === 0) finish('booted');
  });
  const status = await ready;
  await Promise.all(workers);
  console.log(JSON.stringify([status, completed, remaining]));
}
main().catch(error => { throw error; });
