async function main() {
  let cancel;
  const cancellation = new Promise((resolve, reject) => { cancel = () => reject(new Error('cancelled')); });
  const trace = [];
  const work = Promise.resolve().then(() => Promise.resolve()).then(() => { trace.push('work complete'); return 'value'; });
  const raced = Promise.race([work, cancellation]);
  cancel();
  let outcome;
  try { outcome = await raced; }
  catch (error) { outcome = error.message; }
  await work;
  console.log(JSON.stringify([outcome, trace]));
}
main().catch(error => { throw error; });
