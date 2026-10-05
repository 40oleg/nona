async function main() {
  const counter = { value: 0, version: 0 };
  let conflicts = 0;
  const rival = Promise.resolve().then(() => { counter.value += 5; counter.version++; });
  while (true) {
    const snapshot = { ...counter };
    await rival;
    if (snapshot.version !== counter.version) { conflicts++; continue; }
    counter.value = snapshot.value + 1; counter.version++; break;
  }
  console.log(JSON.stringify([counter, conflicts]));
}
main().catch(error => { throw error; });
