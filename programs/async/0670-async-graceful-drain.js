async function main() {
  let accepting = true;
  const active = new Set();
  const finished = [];
  function submit(name) {
    if (!accepting) return false;
    const job = Promise.resolve().then(() => finished.push(name));
    active.add(job);
    job.finally(() => active.delete(job));
    return true;
  }
  submit('a'); submit('b'); accepting = false;
  const late = submit('c');
  await Promise.all(Array.from(active));
  console.log(JSON.stringify([finished, late, active.size]));
}
main().catch(error => { throw error; });
