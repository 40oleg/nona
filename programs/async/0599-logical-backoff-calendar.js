async function main() {
  let tick = 0;
  const calendar = [];
  let result = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    calendar.push(tick);
    try {
      await Promise.resolve();
      if (attempt < 2) throw new Error('retry');
      result = 'success'; break;
    } catch (error) { tick += 2 ** attempt; }
  }
  console.log(JSON.stringify([calendar, result]));
}
main().catch(error => { throw error; });
