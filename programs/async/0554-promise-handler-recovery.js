async function main() {
  const events = [];
  const parsed = await Promise.resolve('bad json')
    .then(raw => JSON.parse(raw))
    .catch(error => {
      events.push(error.name);
      return { count: 2 };
    })
    .then(record => ({ total: record.count * 5 }));
  events.push('resumed');
  console.log(JSON.stringify([parsed, events]));
}
main().catch(error => { throw error; });
