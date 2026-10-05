async function main() {
  let pending = null;
  let last = '';
  const flushed = [];
  function update(value) {
    last = value;
    if (!pending) pending = Promise.resolve().then(() => { flushed.push(last); pending = null; });
    return pending;
  }
  update('a'); update('b');
  await update('c');
  await update('d');
  console.log(JSON.stringify(flushed));
}
main().catch(error => { throw error; });
