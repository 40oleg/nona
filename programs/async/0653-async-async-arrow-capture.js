async function main() {
  const tasks = [];
  for (let i = 0; i < 4; i++) {
    tasks.push((async () => {
      await Promise.resolve();
      return `slot-${i}:${i * i}`;
    })());
  }
  const values = await Promise.all(tasks);
  const unique = new Set(values).size;
  console.log(JSON.stringify([values, unique]));
}
main().catch(error => { throw error; });
